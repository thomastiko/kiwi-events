import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  ...process.env,
};

const SECRET_ENVIRONMENT_VARIABLES = [
  "KIWI_EVENTS_DATABASE_PROVIDER",
  "KIWI_EVENTS_DATABASE_URI",
  "DATABASE_URL",
  "MONGODB_URI",

  "KIWI_EVENTS_LOCAL_JWT_SECRET",
  "KIWI_EVENTS_EXTERNAL_JWT_SECRET",
  "KIWI_EVENTS_TICKET_QR_SECRET",

  "KIWI_EVENTS_MOLLIE_API_KEY",
  "MOLLIE_API_KEY",

  "KIWI_EVENTS_STRIPE_SECRET_KEY",
  "STRIPE_SECRET_KEY",

  "KIWI_EVENTS_STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET",

  "KIWI_EVENTS_MAIL_SMTP_PASS",
  "KIWI_EVENTS_MAIL_RESEND_API_KEY",

  "KIWI_EVENTS_STORAGE_PUBLIC_ACCESS_KEY_ID",
  "KIWI_EVENTS_STORAGE_PUBLIC_SECRET_ACCESS_KEY",
  "KIWI_EVENTS_STORAGE_PRIVATE_ACCESS_KEY_ID",
  "KIWI_EVENTS_STORAGE_PRIVATE_SECRET_ACCESS_KEY",
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
let runLatestMigrationsMock;
let ensureDefaultKiwiEventsAdminUserMock;
let ensureDefaultEventRolesMock;

function buildIsolatedEnvironment({
  configPath,
  dataDirectory,
  environment = {},
}) {
  const nextEnvironment = {
    ...ORIGINAL_ENV,

    KIWI_EVENTS_CONFIG_FILE: configPath,

    KIWI_EVENTS_DATA_DIR: dataDirectory,
  };

  for (const variableName of SECRET_ENVIRONMENT_VARIABLES) {
    delete nextEnvironment[variableName];
  }

  return {
    ...nextEnvironment,
    ...environment,
  };
}

async function loadSetupModules({
  initialConfig = null,
  databaseUris = {},
  storedSecrets = {},
  environment = {},
} = {}) {
  vi.resetModules();

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kiwi-events-setup-test-"));

  const configPath = path.join(tempDir, "kiwi-events.config.json");

  const dataDirectory = path.join(tempDir, "data");

  process.env = buildIsolatedEnvironment({
    configPath,
    dataDirectory,
    environment,
  });

  testDatabaseConnectionMock = vi.fn().mockResolvedValue({
    success: true,

    message: "Database connection successful.",

    data: {
      provider: "mongodb",
    },
  });

  connectDatabaseMock = vi.fn().mockResolvedValue({
    success: true,
  });

  runLatestMigrationsMock = vi.fn().mockResolvedValue({
    skipped: false,
    executed: [],
  });

  ensureDefaultKiwiEventsAdminUserMock = vi.fn().mockResolvedValue({
    created: true,

    email: "admin@example.com",
  });

  ensureDefaultEventRolesMock = vi
    .fn()
    .mockResolvedValue(DEFAULT_ROLE_SEED_RESULT);

  vi.doMock("../../src/modules/database/database.service.js", () => ({
    testDatabaseConnection: testDatabaseConnectionMock,

    connectDatabase: connectDatabaseMock,
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

  if (initialConfig) {
    configStoreModule.saveKiwiEventsConfig(initialConfig);
  }

  for (const [provider, uri] of Object.entries(databaseUris)) {
    if (!uri) {
      continue;
    }

    const secretConfig =
      databaseConfigModule.getKiwiEventsDatabaseSecretConfig(provider);

    secretStoreModule.setKiwiEventsSecret(secretConfig.secretPath, uri);
  }

  for (const [secretPath, secretValue] of Object.entries(storedSecrets)) {
    secretStoreModule.setKiwiEventsSecret(secretPath, secretValue);
  }

  const setupServiceModule =
    await import("../../src/modules/setup/setup.service.js");

  return {
    configPath,

    ...configStoreModule,
    ...secretConstantsModule,
    ...databaseConfigModule,
    ...secretStoreModule,
    ...setupServiceModule,
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

describe("Setup service", () => {
  it("returns public status for an uninitialized installation", async () => {
    const { getSetupStatusService } = await loadSetupModules();

    expect(getSetupStatusService()).toEqual({
      initialized: false,
      databaseConfigured: false,
      databaseProvider: "",
      appName: "Kiwi Events",
    });
  });

  it("detects a database URI stored in the encrypted store", async () => {
    const { getSetupStatusService } = await loadSetupModules({
      initialConfig: {
        setup: {
          initialized: true,

          initializedAt: "2026-06-08T10:00:00.000Z",
        },

        database: {
          provider: "mongodb",
        },

        branding: {
          appName: "Kiwi Events Custom",
        },
      },

      databaseUris: {
        mongodb: "mongodb://127.0.0.1:27017/kiwi-events",
      },
    });

    expect(getSetupStatusService()).toEqual({
      initialized: true,
      databaseConfigured: true,
      databaseProvider: "mongodb",

      appName: "Kiwi Events Custom",
    });
  });

  it("tests a database without returning its URI", async () => {
    const { testSetupDatabaseService } = await loadSetupModules();

    const uri = "mongodb://user:password@localhost:27017/kiwi-events";

    const result = await testSetupDatabaseService({
      provider: "mongodb",
      uri,
    });

    expect(testDatabaseConnectionMock).toHaveBeenCalledWith({
      provider: "mongodb",
      uri,
    });

    expect(result).toEqual({
      success: true,

      message: "Database connection successful.",

      data: {
        provider: "mongodb",
      },
    });

    expect(JSON.stringify(result)).not.toContain(uri);
  });

  it("does not expose driver messages when a database test fails", async () => {
    const { testSetupDatabaseService } = await loadSetupModules();

    testDatabaseConnectionMock.mockResolvedValueOnce({
      success: false,

      message:
        "Authentication failed for mongodb://user:password@host/database",
    });

    const result = await testSetupDatabaseService({
      provider: "mongodb",

      uri: "mongodb://user:password@host/database",
    });

    expect(result).toEqual({
      success: false,

      message: "The database connection could not be established.",
    });

    expect(JSON.stringify(result)).not.toContain("user:password");
  });

  it("stores the selected database URI only in the encrypted store", async () => {
    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      saveSetupDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSetupModules();

    const uri = "mongodb://127.0.0.1:27017/kiwi-events";

    const result = await saveSetupDatabaseService({
      provider: "mongodb",
      uri,
    });

    expect(result).toEqual({
      success: true,

      message: "Database configuration saved.",

      data: {
        provider: "mongodb",
        configured: true,
      },
    });

    const config = loadKiwiEventsConfig();

    expect(config.database.provider).toBe("mongodb");

    expect(config.database.mongodb).not.toHaveProperty("uri");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe(uri);
  });

  it("does not persist a database when its connection test fails", async () => {
    const originalUri = "mongodb://original-database";

    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      saveSetupDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: originalUri,
      },
    });

    testDatabaseConnectionMock.mockResolvedValueOnce({
      success: false,

      message: "mysql://user:password@host/database failed",
    });

    const result = await saveSetupDatabaseService({
      provider: "mysql",

      uri: "mysql://user:password@host/database",
    });

    expect(result).toEqual({
      success: false,

      message: "The database connection could not be established.",
    });

    const config = loadKiwiEventsConfig();

    expect(config.database.provider).toBe("mongodb");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe(originalUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe("");
  });

  it("restores the previous database secrets when config persistence fails", async () => {
    const originalUri = "mongodb://original-database";

    const {
      configPath,
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      saveSetupDatabaseService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: originalUri,
      },
    });

    const realWriteFileSync = fs.writeFileSync.bind(fs);

    let configWriteFailed = false;

    vi.spyOn(fs, "writeFileSync").mockImplementation((filePath, ...args) => {
      const isConfigFile =
        path.resolve(String(filePath)) === path.resolve(configPath);

      if (isConfigFile && !configWriteFailed) {
        configWriteFailed = true;

        throw new Error("Simulated config write failure.");
      }

      return realWriteFileSync(filePath, ...args);
    });

    await expect(
      saveSetupDatabaseService({
        provider: "mysql",
        uri: "mysql://new-database",
      }),
    ).rejects.toThrow("Simulated config write failure.");

    const config = loadKiwiEventsConfig();

    expect(config.database.provider).toBe("mongodb");

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI),
    ).toBe(originalUri);

    expect(
      getStoredKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI),
    ).toBe("");
  });

  it("rejects database changes controlled by environment variables", async () => {
    const { saveSetupDatabaseService } = await loadSetupModules({
      environment: {
        KIWI_EVENTS_DATABASE_PROVIDER: "mongodb",

        KIWI_EVENTS_DATABASE_URI: "mongodb://environment-database",
      },
    });

    await expect(
      saveSetupDatabaseService({
        provider: "mysql",
        uri: "mysql://new-database",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "SETUP_DATABASE_MANAGED_BY_ENVIRONMENT",
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();
  });

  it("does not initialize before a database is configured", async () => {
    const { initializeKiwiEventsService } = await loadSetupModules();

    const result = await initializeKiwiEventsService({
      setupAdmin: {
        password: "secret123",
      },

      auth: {
        externalJwtSecret: "external-jwt-secret-12345678901234567890",
      },
    });

    expect(result).toEqual({
      success: false,

      message: "Database must be configured before initialization.",
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();

    expect(connectDatabaseMock).not.toHaveBeenCalled();
  });

  it("validates the admin password before accessing the database", async () => {
    const { initializeKiwiEventsService } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: "mongodb://configured-database",
      },
    });

    const result = await initializeKiwiEventsService({
      setupAdmin: {
        password: "",
      },

      auth: {
        externalJwtSecret: "external-jwt-secret-12345678901234567890",
      },
    });

    expect(result).toEqual({
      success: false,

      message: "Initial admin password is required.",
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();

    expect(connectDatabaseMock).not.toHaveBeenCalled();
  });

  it("validates the external JWT secret before accessing the database", async () => {
    const { initializeKiwiEventsService } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: "mongodb://configured-database",
      },
    });

    const result = await initializeKiwiEventsService({
      setupAdmin: {
        password: "secret123",
      },

      auth: {
        externalJwtSecret: "",
      },
    });

    expect(result).toEqual({
      success: false,

      message: "External JWT secret is required.",
    });

    expect(testDatabaseConnectionMock).not.toHaveBeenCalled();

    expect(connectDatabaseMock).not.toHaveBeenCalled();
  });

  it("initializes MongoDB and stores initialization secrets encrypted", async () => {
    const databaseUri = "mongodb://configured-database";

    const externalJwtSecret = "external-jwt-secret-12345678901234567890";

    const {
      getStoredKiwiEventsSecret,
      initializeKiwiEventsService,
      loadKiwiEventsConfig,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: databaseUri,
      },
    });

    const result = await initializeKiwiEventsService({
      setupAdmin: {
        password: "secret123",
      },

      auth: {
        externalJwtSecret,
      },
    });

    expect(result.success).toBe(true);

    expect(result.message).toBe("kiwi-events initialized.");

    expect(result.data.initialized).toBe(true);

    expect(result.data.initializedAt).toEqual(expect.any(String));

    expect(result.data.databaseProvider).toBe("mongodb");

    expect(result.data.admin).toEqual({
      created: true,

      email: "admin@example.com",
    });

    expect(result.data.migrations).toEqual({
      skipped: true,

      reason: "Current database provider is not SQL",
    });

    expect(testDatabaseConnectionMock).toHaveBeenCalledWith({
      provider: "mongodb",
      uri: databaseUri,
    });

    expect(connectDatabaseMock).toHaveBeenCalledWith({
      provider: "mongodb",
      uri: databaseUri,
    });

    expect(runLatestMigrationsMock).not.toHaveBeenCalled();

    expect(ensureDefaultEventRolesMock).toHaveBeenCalledOnce();

    expect(ensureDefaultKiwiEventsAdminUserMock).toHaveBeenCalledWith({
      email: "admin@admin",

      password: "secret123",
    });

    const config = loadKiwiEventsConfig();

    expect(config.setup.initialized).toBe(true);

    expect(config.setup.initializedAt).toEqual(expect.any(String));

    expect(config.setupAdmin.email).toBe("admin@admin");

    expect(config.setupAdmin).not.toHaveProperty("password");

    expect(config.auth).not.toHaveProperty("externalJwtSecret");

    expect(config.security).not.toHaveProperty("ticketQrSecret");

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
      ),
    ).toBe(externalJwtSecret);

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
      ),
    ).toMatch(/^[a-f0-9]{96}$/);

    expect(JSON.stringify(result)).not.toContain(externalJwtSecret);

    expect(JSON.stringify(result)).not.toContain("secret123");
  });

  it("uses an environment JWT secret without storing a shadow copy", async () => {
    const {
      getStoredKiwiEventsSecret,
      initializeKiwiEventsService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: "mongodb://configured-database",
      },

      environment: {
        KIWI_EVENTS_EXTERNAL_JWT_SECRET:
          "environment-jwt-secret-12345678901234567890",
      },
    });

    const result = await initializeKiwiEventsService({
      setupAdmin: {
        password: "secret123",
      },
    });

    expect(result.success).toBe(true);

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
      ),
    ).toBe("");

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
      ),
    ).toMatch(/^[a-f0-9]{96}$/);
  });

  it("runs migrations during SQL initialization", async () => {
    const { initializeKiwiEventsService } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mysql",
        },
      },

      databaseUris: {
        mysql: "mysql://user:pass@localhost:3306/kiwi-events",
      },
    });

    const result = await initializeKiwiEventsService({
      setupAdmin: {
        password: "secret123",
      },

      auth: {
        externalJwtSecret: "external-jwt-secret-12345678901234567890",
      },
    });

    expect(result.success).toBe(true);

    expect(runLatestMigrationsMock).toHaveBeenCalledOnce();

    expect(result.data.migrations).toEqual({
      skipped: false,
      executed: [],
    });
  });

  it("returns setup secret status flags without secret values", async () => {
    const externalJwtSecret = "external-jwt-secret-12345678901234567890";

    const ticketQrSecret = "ticket-qr-secret-123456789012345678901234";

    const { getSetupConfigService } = await loadSetupModules({
      storedSecrets: {
        "auth.externalJwtSecret": externalJwtSecret,

        "security.ticketQrSecret": ticketQrSecret,
      },
    });

    const setupConfig = getSetupConfigService();

    expect(setupConfig.auth.externalJwtSecretConfigured).toBe(true);

    expect(setupConfig.security.ticketQrSecretConfigured).toBe(true);

    expect(setupConfig.database.supportedProviders).toEqual(
      expect.arrayContaining(["mongodb", "mysql", "mariadb"]),
    );

    expect(JSON.stringify(setupConfig)).not.toContain(externalJwtSecret);

    expect(JSON.stringify(setupConfig)).not.toContain(ticketQrSecret);
  });

  it("restores initialization secrets when config persistence fails", async () => {
    const previousExternalSecret =
      "previous-external-secret-12345678901234567890";

    const previousTicketQrSecret =
      "previous-ticket-qr-secret-12345678901234567890";

    const {
      configPath,
      getStoredKiwiEventsSecret,
      initializeKiwiEventsService,
      loadKiwiEventsConfig,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSetupModules({
      initialConfig: {
        database: {
          provider: "mongodb",
        },
      },

      databaseUris: {
        mongodb: "mongodb://configured-database",
      },

      storedSecrets: {
        "auth.externalJwtSecret": previousExternalSecret,

        "security.ticketQrSecret": previousTicketQrSecret,
      },
    });

    const realWriteFileSync = fs.writeFileSync.bind(fs);

    let configWriteFailed = false;

    vi.spyOn(fs, "writeFileSync").mockImplementation((filePath, ...args) => {
      const isConfigFile =
        path.resolve(String(filePath)) === path.resolve(configPath);

      if (isConfigFile && !configWriteFailed) {
        configWriteFailed = true;

        throw new Error("Simulated initialization config write failure.");
      }

      return realWriteFileSync(filePath, ...args);
    });

    await expect(
      initializeKiwiEventsService({
        setupAdmin: {
          password: "secret123",
        },

        auth: {
          externalJwtSecret: "new-external-secret-123456789012345678901",
        },

        security: {
          ticketQrSecret: "new-ticket-qr-secret-123456789012345678901",
        },
      }),
    ).rejects.toThrow("Simulated initialization config write failure.");

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
      ),
    ).toBe(previousExternalSecret);

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
      ),
    ).toBe(previousTicketQrSecret);

    const config = loadKiwiEventsConfig();

    expect(config.setup.initialized).toBe(false);
  });
});
