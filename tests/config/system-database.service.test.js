import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  ...process.env,
};

const DATABASE_ENVIRONMENT_VARIABLES = [
  "KIWI_EVENTS_DATABASE_PROVIDER",
  "KIWI_EVENTS_DATABASE_URI",
  "DATABASE_URL",
  "MONGODB_URI",
];

const DEFAULT_ROLE_SEED_RESULT = [
  {
    key: "admin",
    created: true,
  },
  {
    key: "event_admin",
    created: true,
  },
  {
    key: "event_manager",
    created: true,
  },
];

let tempDir;

let testDatabaseConnectionMock;
let connectDatabaseMock;
let disconnectDatabaseMock;
let getConfiguredDatabaseMock;
let getDatabaseStatusMock;

let runLatestMigrationsMock;
let ensureDefaultKiwiEventsAdminUserMock;
let ensureDefaultEventRolesMock;

let loggerInfoMock;
let loggerErrorMock;

function buildIsolatedEnvironment(configPath, dataDirectory) {
  const environment = {
    ...ORIGINAL_ENV,

    KIWI_EVENTS_CONFIG_FILE: configPath,

    KIWI_EVENTS_DATA_DIR: dataDirectory,
  };

  for (const variableName of DATABASE_ENVIRONMENT_VARIABLES) {
    delete environment[variableName];
  }

  return environment;
}

function createRuntimeDatabase({
  provider = "",
  uri = "",
  source = uri ? "encrypted_store" : "none",
  providerSource = provider ? "config" : "none",
} = {}) {
  return {
    provider,
    uri,
    source,
    providerSource,
    deletable: source === "encrypted_store",
  };
}

async function loadSystemDatabaseModules({
  initialProvider = "",
  storedDatabaseUris = {},
  currentDatabase = null,
} = {}) {
  vi.resetModules();

  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "kiwi-events-system-db-test-"),
  );

  const configPath = path.join(tempDir, "kiwi-events.config.json");

  const dataDirectory = path.join(tempDir, "data");

  process.env = buildIsolatedEnvironment(configPath, dataDirectory);

  testDatabaseConnectionMock = vi.fn().mockResolvedValue({
    success: true,
    provider: "mongodb",
    message: "Database connection successful.",
  });

  connectDatabaseMock = vi.fn().mockResolvedValue({
    success: true,
  });

  disconnectDatabaseMock = vi.fn().mockResolvedValue({
    success: true,
  });

  getDatabaseStatusMock = vi.fn().mockReturnValue({
    provider: initialProvider,
    configured: Boolean(initialProvider && storedDatabaseUris[initialProvider]),

    source:
      initialProvider && storedDatabaseUris[initialProvider]
        ? "encrypted_store"
        : "none",

    providerSource: initialProvider ? "config" : "none",

    managedByEnvironment: false,
    state: initialProvider ? "connected" : "not_configured",

    lastError: null,
  });

  runLatestMigrationsMock = vi.fn().mockResolvedValue({
    skipped: false,
    executed: ["001_create_event_users"],
  });

  ensureDefaultKiwiEventsAdminUserMock = vi.fn().mockResolvedValue({
    created: true,
    passwordUpdated: false,
    email: "admin@admin",
  });

  ensureDefaultEventRolesMock = vi
    .fn()
    .mockResolvedValue(DEFAULT_ROLE_SEED_RESULT);

  loggerInfoMock = vi.fn();
  loggerErrorMock = vi.fn();

  vi.doMock("../../src/config/logger.js", () => ({
    logger: {
      info: loggerInfoMock,
      warn: vi.fn(),
      error: loggerErrorMock,
      debug: vi.fn(),
    },
  }));

  vi.doMock("../../src/modules/database/database.service.js", () => ({
    testDatabaseConnection: testDatabaseConnectionMock,

    connectDatabase: connectDatabaseMock,

    disconnectDatabase: disconnectDatabaseMock,

    getConfiguredDatabase: () => getConfiguredDatabaseMock(),

    getDatabaseStatus: getDatabaseStatusMock,
  }));

  vi.doMock("../../src/modules/database/migration.service.js", () => ({
    runLatestMigrations: runLatestMigrationsMock,
  }));

  vi.doMock("../../src/modules/eventUsers/eventUser.seed.service.js", () => ({
    ensureDefaultKiwiEventsAdminUser: ensureDefaultKiwiEventsAdminUserMock,
  }));

  vi.doMock("../../src/modules/eventRoles/eventRole.service.js", () => ({
    ensureDefaultEventRoles: ensureDefaultEventRolesMock,
  }));

  const configStoreModule =
    await import("../../src/config/kiwi-events/kiwi-events.config.store.js");
  const secretConstantsModule =
    await import("../../src/config/kiwi-events/kiwi-events.secret.constants.js");
  const databaseConfigModule =
    await import("../../src/config/kiwi-events/kiwi-events.database.config.js");

  const secretStoreModule =
    await import("../../src/config/kiwi-events/kiwi-events.secret.store.js");

  configStoreModule.saveKiwiEventsConfig({
    database: {
      provider: initialProvider,
    },
  });

  for (const [provider, uri] of Object.entries(storedDatabaseUris)) {
    if (!uri) {
      continue;
    }

    const secretConfig =
      databaseConfigModule.getKiwiEventsDatabaseSecretConfig(provider);

    secretStoreModule.setKiwiEventsSecret(secretConfig.secretPath, uri);
  }

  const resolvedCurrentDatabase =
    currentDatabase ||
    createRuntimeDatabase({
      provider: initialProvider,

      uri: storedDatabaseUris[initialProvider] || "",
    });

  getConfiguredDatabaseMock = vi.fn().mockReturnValue(resolvedCurrentDatabase);

  const systemDatabaseServiceModule =
    await import("../../src/modules/system/system.database.service.js");

  const systemValidationModule =
    await import("../../src/modules/system/system.validation.js");

  const maintenanceModule =
    await import("../../src/modules/system/system.maintenance.js");

  return {
    configPath,

    ...configStoreModule,
    ...secretConstantsModule,
    ...databaseConfigModule,
    ...secretStoreModule,
    ...systemDatabaseServiceModule,
    ...systemValidationModule,
    ...maintenanceModule,
  };
}

function cleanupTempDirectory() {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }

  tempDir = null;
}

afterEach(() => {
  cleanupTempDirectory();

  process.env = {
    ...ORIGINAL_ENV,
  };

  vi.restoreAllMocks();
  vi.resetModules();
});

describe("System database service", () => {
  it("returns database status without exposing the URI", async () => {
    const { getSystemDatabaseStatusService } = await loadSystemDatabaseModules({
      initialProvider: "mongodb",

      storedDatabaseUris: {
        mongodb: "mongodb://user:password@localhost:27017/kiwi-events",
      },
    });

    const status = await getSystemDatabaseStatusService();

    expect(getDatabaseStatusMock).toHaveBeenCalledOnce();

    expect(status).toEqual({
      provider: "mongodb",
      configured: true,
      source: "encrypted_store",

      providerSource: "config",

      managedByEnvironment: false,

      state: "connected",
      lastError: null,
    });

    expect(status).not.toHaveProperty("uri");

    expect(JSON.stringify(status)).not.toContain("mongodb://");
  });

  it("requires provider and URI before testing a database", async () => {
    const { testSystemDatabaseConfigService } =
      await loadSystemDatabaseModules();

    await expect(
      testSystemDatabaseConfigService({
        provider: "",
        uri: "",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,

      message: "Provider and database URI are required.",

      code: "DATABASE_CONFIG_INCOMPLETE",

      title: "Database configuration incomplete",

      fields: expect.arrayContaining([
        expect.objectContaining({
          path: "body.provider",
        }),

        expect.objectContaining({
          path: "body.uri",
        }),
      ]),
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();
  });

  it("tests a database connection without returning its URI", async () => {
    const { testSystemDatabaseConfigService } =
      await loadSystemDatabaseModules();

    const uri = "mongodb://user:password@localhost:27017/kiwi-events";

    const result = await testSystemDatabaseConfigService({
      provider: "mongodb",
      uri,
    });

    expect(testDatabaseConnectionMock).toHaveBeenCalledWith({
      provider: "mongodb",
      uri,
    });

    expect(result).toEqual({
      success: true,
      provider: "mongodb",

      message: "Database connection successful.",
    });

    expect(result).not.toHaveProperty("uri");

    expect(JSON.stringify(result)).not.toContain(uri);
  });

  it("returns a safe error when the connection test fails", async () => {
    const { testSystemDatabaseConfigService } =
      await loadSystemDatabaseModules();

    testDatabaseConnectionMock.mockResolvedValueOnce({
      success: false,
      provider: "mongodb",

      message: "Driver exposed mongodb://user:password@host/database",
    });

    await expect(
      testSystemDatabaseConfigService({
        provider: "mongodb",

        uri: "mongodb://bad-user:bad-password@host/database",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,

      message: "The database connection could not be established.",

      code: "DATABASE_CONNECTION_FAILED",

      title: "Database connection failed",

      details: {
        provider: "mongodb",
      },
    });
  });

  it("requires provider and URI before switching the database", async () => {
    const { switchSystemDatabaseService } = await loadSystemDatabaseModules();

    await expect(
      switchSystemDatabaseService({
        provider: "",
        uri: "",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,

      message:
        "Provider and database URI are required before switching the database.",

      code: "DATABASE_CONFIG_INCOMPLETE",

      title: "Database configuration incomplete",
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();

    expect(disconnectDatabaseMock).not.toHaveBeenCalled();

    expect(connectDatabaseMock).not.toHaveBeenCalled();
  });

  it("does not persist changes when the connection test fails", async () => {
    const originalUri = "mongodb://original-db";

    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      switchSystemDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemDatabaseModules({
      initialProvider: "mongodb",

      storedDatabaseUris: {
        mongodb: originalUri,
      },
    });

    testDatabaseConnectionMock.mockResolvedValueOnce({
      success: false,
      provider: "mysql",
      message: "MySQL unavailable.",
    });

    await expect(
      switchSystemDatabaseService({
        provider: "mysql",
        uri: "mysql://bad-uri",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,

      message: "The database connection could not be established.",

      code: "DATABASE_CONNECTION_FAILED",
    });

    expect(disconnectDatabaseMock).not.toHaveBeenCalled();

    expect(connectDatabaseMock).not.toHaveBeenCalled();

    expect(ensureDefaultKiwiEventsAdminUserMock).not.toHaveBeenCalled();

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.database.provider).toBe("mongodb");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe(originalUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe("");
  });

  it("switches to MongoDB and stores only the active database URI", async () => {
    const targetUri = "mongodb://user:password@localhost:27017/kiwi-events";

    const previousDatabase = createRuntimeDatabase({
      provider: "mysql",
      uri: "mysql://original-db",
    });

    const {
      getMaintenanceState,
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      switchSystemDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemDatabaseModules({
      initialProvider: "mysql",

      storedDatabaseUris: {
        mysql: "mysql://original-db",
      },

      currentDatabase: previousDatabase,
    });

    let maintenanceDuringConnect = null;

    connectDatabaseMock.mockImplementationOnce(async () => {
      maintenanceDuringConnect = getMaintenanceState();

      return {
        success: true,
      };
    });

    const result = await switchSystemDatabaseService({
      provider: "mongodb",
      uri: targetUri,

      setupAdmin: {
        password: "secret123",
      },
    });

    expect(testDatabaseConnectionMock).toHaveBeenCalledWith({
      provider: "mongodb",
      uri: targetUri,
    });

    expect(disconnectDatabaseMock).toHaveBeenCalledOnce();

    expect(disconnectDatabaseMock).toHaveBeenCalledWith(previousDatabase);

    expect(connectDatabaseMock).toHaveBeenCalledOnce();

    expect(connectDatabaseMock).toHaveBeenCalledWith({
      provider: "mongodb",
      uri: targetUri,
    });

    expect(runLatestMigrationsMock).not.toHaveBeenCalled();

    expect(ensureDefaultEventRolesMock).toHaveBeenCalledOnce();

    expect(ensureDefaultKiwiEventsAdminUserMock).toHaveBeenCalledWith({
      email: "admin@admin",
      password: "secret123",
    });

    expect(maintenanceDuringConnect).toEqual({
      enabled: true,
      reason: "database_switch",
    });

    expect(getMaintenanceState()).toEqual({
      enabled: false,
      reason: null,
    });

    expect(result).toEqual({
      success: true,
      provider: "mongodb",

      message:
        "Database switched successfully. No data was migrated; the selected database is now active.",

      data: {
        migrations: {
          skipped: true,

          reason: "Current database provider is not SQL",
        },

        roles: DEFAULT_ROLE_SEED_RESULT,

        admin: {
          created: true,
          passwordUpdated: false,
          email: "admin@admin",
        },
      },
    });

    expect(result).not.toHaveProperty("uri");

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.database.provider).toBe("mongodb");

    expect(storedConfig.database.mongodb).not.toHaveProperty("uri");

    expect(storedConfig.database.mysql).not.toHaveProperty("uri");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe(targetUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe("");
  });

  it("switches to MySQL and runs SQL migrations", async () => {
    const targetUri = "mysql://user:pass@localhost:3306/kiwi-events";

    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      switchSystemDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemDatabaseModules({
      initialProvider: "mongodb",

      storedDatabaseUris: {
        mongodb: "mongodb://original-db",
      },
    });

    ensureDefaultKiwiEventsAdminUserMock.mockResolvedValueOnce({
      created: false,
      passwordUpdated: true,

      email: "admin@example.com",
    });

    const result = await switchSystemDatabaseService({
      provider: "mysql",
      uri: targetUri,

      setupAdmin: {
        password: "new-admin-password",
      },
    });

    expect(runLatestMigrationsMock).toHaveBeenCalledOnce();

    expect(ensureDefaultKiwiEventsAdminUserMock).toHaveBeenCalledWith({
      email: "admin@admin",

      password: "new-admin-password",
    });

    expect(result.success).toBe(true);

    expect(result.provider).toBe("mysql");

    expect(result).not.toHaveProperty("uri");

    expect(result.data.migrations).toEqual({
      skipped: false,

      executed: ["001_create_event_users"],
    });

    expect(result.data.roles).toEqual(DEFAULT_ROLE_SEED_RESULT);

    expect(result.data.admin).toEqual({
      created: false,
      passwordUpdated: true,

      email: "admin@example.com",
    });

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.database.provider).toBe("mysql");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe(targetUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe("");
  });

  it("restores config and database secrets when target activation fails", async () => {
    const originalMongoUri = "mongodb://original-db";

    const oldMySqlUri = "mysql://old-mysql-db";

    const targetUri = "mysql://new-db";

    const previousDatabase = createRuntimeDatabase({
      provider: "mongodb",
      uri: originalMongoUri,
    });

    const {
      getMaintenanceState,
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      switchSystemDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemDatabaseModules({
      initialProvider: "mongodb",

      storedDatabaseUris: {
        mongodb: originalMongoUri,

        mysql: oldMySqlUri,
      },

      currentDatabase: previousDatabase,
    });

    connectDatabaseMock
      .mockRejectedValueOnce(new Error("New database connect failed"))
      .mockResolvedValueOnce({
        success: true,
      });

    await expect(
      switchSystemDatabaseService({
        provider: "mysql",
        uri: targetUri,

        setupAdmin: {
          password: "secret123",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 500,

      code: "DATABASE_SWITCH_FAILED",

      message:
        "The database switch failed. The previous database configuration was restored.",
    });

    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(2);

    expect(disconnectDatabaseMock).toHaveBeenNthCalledWith(1, previousDatabase);

    expect(disconnectDatabaseMock).toHaveBeenNthCalledWith(2, {
      provider: "mysql",
      uri: targetUri,
    });

    expect(connectDatabaseMock).toHaveBeenCalledTimes(2);

    expect(connectDatabaseMock).toHaveBeenNthCalledWith(1, {
      provider: "mysql",
      uri: targetUri,
    });

    expect(connectDatabaseMock).toHaveBeenNthCalledWith(2, previousDatabase);

    expect(runLatestMigrationsMock).not.toHaveBeenCalled();

    expect(ensureDefaultKiwiEventsAdminUserMock).not.toHaveBeenCalled();

    expect(loggerErrorMock).toHaveBeenCalledWith("database.switch_failed", {
      provider: "mysql",
      errorName: "Error",
      errorCode: null,
    });

    expect(loggerInfoMock).toHaveBeenCalledWith(
      "database.switch_rollback_succeeded",
      {
        provider: "mongodb",
      },
    );

    expect(getMaintenanceState()).toEqual({
      enabled: false,
      reason: null,
    });

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.database.provider).toBe("mongodb");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe(originalMongoUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe(oldMySqlUri);
  });

  it("rejects changes when the database is environment-managed", async () => {
    const { switchSystemDatabaseService } = await loadSystemDatabaseModules({
      currentDatabase: createRuntimeDatabase({
        provider: "mongodb",

        uri: "mongodb://environment-db",

        source: "environment",

        providerSource: "config",
      }),
    });

    await expect(
      switchSystemDatabaseService({
        provider: "mysql",
        uri: "mysql://new-db",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "DATABASE_MANAGED_BY_ENVIRONMENT",

      message: "The active database is controlled by environment variables.",
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();

    expect(disconnectDatabaseMock).not.toHaveBeenCalled();
  });

  it("validates database test and switch payloads", async () => {
    const { switchDatabaseConfigSchema, testDatabaseConfigSchema } =
      await loadSystemDatabaseModules();

    const validTestPayload = testDatabaseConfigSchema.safeParse({
      body: {
        provider: "mongodb",

        uri: "mongodb://127.0.0.1:27017/kiwi-events",
      },

      params: {},
      query: {},
    });

    expect(validTestPayload.success).toBe(true);

    const invalidProviderPayload = testDatabaseConfigSchema.safeParse({
      body: {
        provider: "postgres",

        uri: "postgres://localhost/kiwi-events",
      },

      params: {},
      query: {},
    });

    expect(invalidProviderPayload.success).toBe(false);

    const validSwitchPayload = switchDatabaseConfigSchema.safeParse({
      body: {
        provider: "mysql",

        uri: "mysql://user:pass@localhost:3306/kiwi-events",

        confirmation: "SWITCH DATABASE",

        setupAdmin: {
          email: "admin@example.com",

          password: "secret123",
        },
      },

      params: {},
      query: {},
    });

    expect(validSwitchPayload.success).toBe(true);

    const missingConfirmationPayload = switchDatabaseConfigSchema.safeParse({
      body: {
        provider: "mysql",

        uri: "mysql://user:pass@localhost:3306/kiwi-events",
      },

      params: {},
      query: {},
    });

    expect(missingConfirmationPayload.success).toBe(false);
  });
});
