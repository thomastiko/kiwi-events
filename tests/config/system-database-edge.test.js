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

async function loadSystemDatabaseEdgeModules({
  initialProvider = "",
  storedDatabaseUris = {},
  currentDatabase = null,
} = {}) {
  vi.resetModules();

  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "kiwi-events-system-db-edge-test-"),
  );

  const configPath = path.join(tempDir, "kiwi-events.config.json");

  const dataDirectory = path.join(tempDir, "data");

  process.env = buildIsolatedEnvironment(configPath, dataDirectory);

  testDatabaseConnectionMock = vi.fn().mockResolvedValue({
    success: true,
    provider: "mariadb",

    message: "MariaDB connection successful.",
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
    batchNo: 1,

    migrations: ["001_create_event_users.js", "003_create_events.js"],
  });

  ensureDefaultKiwiEventsAdminUserMock = vi.fn().mockResolvedValue({
    created: false,
    passwordUpdated: true,

    email: "owner@example.com",
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

describe("System database edge cases", () => {
  it("validates MariaDB as a supported database provider", async () => {
    const { switchDatabaseConfigSchema, testDatabaseConfigSchema } =
      await loadSystemDatabaseEdgeModules();

    const validTestPayload = testDatabaseConfigSchema.safeParse({
      body: {
        provider: "mariadb",

        uri: "mariadb://kiwi-events:kiwi-events@127.0.0.1:3306/KIWI_EVENTS_test",
      },

      params: {},
      query: {},
    });

    expect(validTestPayload.success).toBe(true);

    const validSwitchPayload = switchDatabaseConfigSchema.safeParse({
      body: {
        provider: "mariadb",

        uri: "mariadb://kiwi-events:kiwi-events@127.0.0.1:3306/KIWI_EVENTS_test",

        confirmation: "SWITCH DATABASE",

        setupAdmin: {
          email: "owner@example.com",

          password: "secret123",
        },
      },

      params: {},
      query: {},
    });

    expect(validSwitchPayload.success).toBe(true);

    const invalidProviderPayload = switchDatabaseConfigSchema.safeParse({
      body: {
        provider: "postgres",

        uri: "postgres://localhost/kiwi-events",

        confirmation: "SWITCH DATABASE",
      },

      params: {},
      query: {},
    });

    expect(invalidProviderPayload.success).toBe(false);
  });

  it("returns MariaDB status without exposing its URI", async () => {
    const { getSystemDatabaseStatusService } =
      await loadSystemDatabaseEdgeModules({
        initialProvider: "mariadb",

        storedDatabaseUris: {
          mariadb: "mariadb://user:password@localhost:3306/kiwi-events",
        },
      });

    const status = await getSystemDatabaseStatusService();

    expect(getDatabaseStatusMock).toHaveBeenCalledOnce();

    expect(status).toEqual({
      provider: "mariadb",
      configured: true,

      source: "encrypted_store",

      providerSource: "config",

      managedByEnvironment: false,

      state: "connected",
      lastError: null,
    });

    expect(status).not.toHaveProperty("uri");

    expect(JSON.stringify(status)).not.toContain("mariadb://");
  });

  it("switches to MariaDB, runs migrations and stores only its URI", async () => {
    const targetUri = "mariadb://user:pass@localhost:3306/kiwi-events";

    const previousDatabase = createRuntimeDatabase({
      provider: "mongodb",
      uri: "mongodb://original-db",
    });

    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      switchSystemDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemDatabaseEdgeModules({
      initialProvider: "mongodb",

      storedDatabaseUris: {
        mongodb: "mongodb://original-db",

        mysql: "mysql://old-mysql-db",
      },

      currentDatabase: previousDatabase,
    });

    const result = await switchSystemDatabaseService({
      provider: "mariadb",
      uri: targetUri,

      confirmation: "SWITCH DATABASE",

      setupAdmin: {
        email: "owner@example.com",

        password: "new-admin-password",
      },
    });

    expect(testDatabaseConnectionMock).toHaveBeenCalledWith({
      provider: "mariadb",
      uri: targetUri,
    });

    expect(disconnectDatabaseMock).toHaveBeenCalledOnce();

    expect(disconnectDatabaseMock).toHaveBeenCalledWith(previousDatabase);

    expect(connectDatabaseMock).toHaveBeenCalledOnce();

    expect(connectDatabaseMock).toHaveBeenCalledWith({
      provider: "mariadb",
      uri: targetUri,
    });

    expect(runLatestMigrationsMock).toHaveBeenCalledOnce();

    expect(ensureDefaultEventRolesMock).toHaveBeenCalledOnce();

    expect(ensureDefaultKiwiEventsAdminUserMock).toHaveBeenCalledWith({
      email: "admin@admin",

      password: "new-admin-password",
    });

    expect(result).toEqual({
      success: true,
      provider: "mariadb",

      message:
        "Database switched successfully. No data was migrated; the selected database is now active.",

      data: {
        migrations: {
          skipped: false,
          batchNo: 1,

          migrations: ["001_create_event_users.js", "003_create_events.js"],
        },

        roles: DEFAULT_ROLE_SEED_RESULT,

        admin: {
          created: false,
          passwordUpdated: true,

          email: "owner@example.com",
        },
      },
    });

    expect(result).not.toHaveProperty("uri");

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.database.provider).toBe("mariadb");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MARIADB_URI),
    ).toBe(targetUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe("");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe("");
  });

  it("does not persist changes when the MariaDB connection test fails", async () => {
    const originalMySqlUri = "mysql://original-db";

    const oldMariaDbUri = "mariadb://old-mariadb-db";

    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      switchSystemDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemDatabaseEdgeModules({
      initialProvider: "mysql",

      storedDatabaseUris: {
        mysql: originalMySqlUri,

        mariadb: oldMariaDbUri,
      },
    });

    testDatabaseConnectionMock.mockResolvedValueOnce({
      success: false,
      provider: "mariadb",

      message: "Driver exposed mariadb://user:password@host/database",
    });

    await expect(
      switchSystemDatabaseService({
        provider: "mariadb",

        uri: "mariadb://bad-user:bad-password@host/database",

        confirmation: "SWITCH DATABASE",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,

      message: "The database connection could not be established.",

      code: "DATABASE_CONNECTION_FAILED",

      title: "Database connection failed",

      details: {
        provider: "mariadb",
      },
    });

    expect(disconnectDatabaseMock).not.toHaveBeenCalled();

    expect(connectDatabaseMock).not.toHaveBeenCalled();

    expect(runLatestMigrationsMock).not.toHaveBeenCalled();

    expect(ensureDefaultKiwiEventsAdminUserMock).not.toHaveBeenCalled();

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.database.provider).toBe("mysql");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe(originalMySqlUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MARIADB_URI),
    ).toBe(oldMariaDbUri);
  });

  it("restores all database secrets when MariaDB migrations fail", async () => {
    const originalMongoUri = "mongodb://original-db";

    const oldMariaDbUri = "mariadb://old-mariadb-db";

    const targetUri = "mariadb://new-mariadb-db";

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
    } = await loadSystemDatabaseEdgeModules({
      initialProvider: "mongodb",

      storedDatabaseUris: {
        mongodb: originalMongoUri,

        mariadb: oldMariaDbUri,
      },

      currentDatabase: previousDatabase,
    });

    runLatestMigrationsMock.mockRejectedValueOnce(
      new Error("Migration failed on image_asset_ids"),
    );

    await expect(
      switchSystemDatabaseService({
        provider: "mariadb",
        uri: targetUri,

        confirmation: "SWITCH DATABASE",

        setupAdmin: {
          email: "owner@example.com",

          password: "secret123",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 500,

      code: "DATABASE_SWITCH_FAILED",

      message:
        "The database switch failed. The previous database configuration was restored.",
    });

    expect(testDatabaseConnectionMock).toHaveBeenCalledOnce();

    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(2);

    expect(disconnectDatabaseMock).toHaveBeenNthCalledWith(1, previousDatabase);

    expect(disconnectDatabaseMock).toHaveBeenNthCalledWith(2, {
      provider: "mariadb",
      uri: targetUri,
    });

    expect(connectDatabaseMock).toHaveBeenCalledTimes(2);

    expect(connectDatabaseMock).toHaveBeenNthCalledWith(1, {
      provider: "mariadb",
      uri: targetUri,
    });

    expect(connectDatabaseMock).toHaveBeenNthCalledWith(2, previousDatabase);

    expect(runLatestMigrationsMock).toHaveBeenCalledOnce();

    expect(ensureDefaultKiwiEventsAdminUserMock).not.toHaveBeenCalled();

    expect(loggerErrorMock).toHaveBeenCalledWith("database.switch_failed", {
      provider: "mariadb",
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
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MARIADB_URI),
    ).toBe(oldMariaDbUri);
  });
});
