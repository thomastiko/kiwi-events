import crypto from "node:crypto";

import {
  getPublicSetupStatus,
  loadKiwiEventsConfig,
  updateKiwiEventsConfig,
} from "../../config/kiwi-events/kiwi-events.config.store.js";

import {
  getKiwiEventsSecretDefinition,
  KIWI_EVENTS_SECRET_PATHS,
} from "../../config/kiwi-events/kiwi-events.secret.constants.js";

import {
  getKiwiEventsSecretStatus,
  KIWI_EVENTS_SECRET_SOURCES,
  loadKiwiEventsSecrets,
  resolveKiwiEventsSecret,
  updateKiwiEventsSecrets,
} from "../../config/kiwi-events/kiwi-events.secret.store.js";

import {
  buildKiwiEventsDatabaseSecretUpdate,
  getKiwiEventsDatabaseSecretConfig,
  KIWI_EVENTS_DATABASE_SECRET_PATHS,
  resolveKiwiEventsDatabaseConfig,
} from "../../config/kiwi-events/kiwi-events.database.config.js";

import {
  connectDatabase,
  testDatabaseConnection,
} from "../database/database.service.js";

import {
  isSqlDatabaseProvider,
  SUPPORTED_DATABASE_PROVIDERS,
} from "../database/database.constants.js";

import { runLatestMigrations } from "../database/migration.service.js";

import { ensureDefaultKiwiEventsAdminUser } from "../eventUsers/eventUser.seed.service.js";

import { ensureDefaultEventRoles } from "../eventRoles/eventRole.service.js";

import { AppError } from "../../core/errors/AppError.js";

const SETUP_INITIALIZATION_SECRET_PATHS = Object.freeze([
  KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
  KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
]);

function firstNonEmptyString(...values) {
  for (const value of values) {
    const cleanValue = String(value ?? "").trim();

    if (cleanValue) {
      return cleanValue;
    }
  }

  return "";
}

function normalizeDatabaseInput({ provider, uri } = {}) {
  const cleanProvider = firstNonEmptyString(provider).toLowerCase();

  const cleanUri = firstNonEmptyString(uri);

  if (!cleanProvider) {
    throw AppError.badRequest("Database provider is required.", {
      code: "SETUP_DATABASE_PROVIDER_REQUIRED",

      title: "Database provider required",

      action: "Choose a supported database provider before saving setup.",

      fields: [
        {
          path: "provider",

          message: "Database provider is required.",
        },
      ],
    });
  }

  if (!SUPPORTED_DATABASE_PROVIDERS.includes(cleanProvider)) {
    throw AppError.badRequest("Unsupported database provider.", {
      code: "SETUP_DATABASE_PROVIDER_UNSUPPORTED",

      title: "Unsupported database provider",

      action: "Use mongodb, mysql or mariadb.",

      fields: [
        {
          path: "provider",

          message: "Provider must be one of: mongodb, mysql, mariadb.",
        },
      ],
    });
  }

  if (!cleanUri) {
    throw AppError.badRequest("Database URI is required.", {
      code: "SETUP_DATABASE_URI_REQUIRED",

      title: "Database URI required",

      action: "Enter the connection URI for the selected database provider.",

      fields: [
        {
          path: "uri",

          message: "Database URI is required.",
        },
      ],
    });
  }

  return {
    provider: cleanProvider,
    uri: cleanUri,
  };
}

function buildSafeDatabaseTestResult(database, result) {
  if (!result?.success) {
    return {
      success: false,

      message: "The database connection could not be established.",
    };
  }

  return {
    success: true,

    message: "Database connection successful.",

    data: {
      provider: database.provider,
    },
  };
}

function assertDatabaseIsNotEnvironmentManaged(provider) {
  const config = loadKiwiEventsConfig();

  const activeDatabase = resolveKiwiEventsDatabaseConfig(config);

  if (
    activeDatabase.source === KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT ||
    activeDatabase.providerSource === KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT
  ) {
    throw AppError.conflict(
      "The database configuration is managed by environment variables.",
      {
        code: "SETUP_DATABASE_MANAGED_BY_ENVIRONMENT",

        title: "Database managed by environment",

        action:
          "Change or remove the database environment variables and restart Kiwi Events.",
      },
    );
  }

  const secretConfig = getKiwiEventsDatabaseSecretConfig(provider);

  const targetStatus = getKiwiEventsSecretStatus(secretConfig.secretPath);

  if (targetStatus.source !== KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT) {
    return;
  }

  throw AppError.conflict(
    "The selected database URI is managed by an environment variable.",
    {
      code: "SETUP_DATABASE_MANAGED_BY_ENVIRONMENT",

      title: "Database managed by environment",

      action:
        "Change or remove the database environment variable and restart Kiwi Events.",

      fields: [
        {
          path: "uri",

          message:
            "The URI for this database provider cannot be changed through setup.",
        },
      ],
    },
  );
}

function createStoredSecretSnapshot(secretPaths) {
  const storedSecrets = loadKiwiEventsSecrets();

  return Object.fromEntries(
    secretPaths
      .filter((secretPath) => Object.hasOwn(storedSecrets, secretPath))
      .map((secretPath) => [secretPath, storedSecrets[secretPath]]),
  );
}

function restoreStoredSecretSnapshot(secretPaths, snapshot) {
  const set = {};
  const remove = [];

  for (const secretPath of secretPaths) {
    if (Object.hasOwn(snapshot, secretPath)) {
      set[secretPath] = snapshot[secretPath];
    } else {
      remove.push(secretPath);
    }
  }

  updateKiwiEventsSecrets({
    set,
    remove,
  });
}

function persistSetupDatabase(database) {
  const previousConfig = loadKiwiEventsConfig();

  const previousProvider = firstNonEmptyString(
    previousConfig.database?.provider,
  ).toLowerCase();

  const previousSecrets = createStoredSecretSnapshot(
    KIWI_EVENTS_DATABASE_SECRET_PATHS,
  );

  const secretUpdate = buildKiwiEventsDatabaseSecretUpdate(database);

  updateKiwiEventsSecrets(secretUpdate);

  try {
    updateKiwiEventsConfig({
      database: {
        provider: database.provider,
      },
    });
  } catch (error) {
    try {
      restoreStoredSecretSnapshot(
        KIWI_EVENTS_DATABASE_SECRET_PATHS,
        previousSecrets,
      );

      updateKiwiEventsConfig({
        database: {
          provider: previousProvider,
        },
      });
    } catch (rollbackError) {
      throw AppError.internal(
        "The database configuration could not be saved or safely rolled back.",
        {
          code: "SETUP_DATABASE_ROLLBACK_FAILED",

          cause: new AggregateError(
            [error, rollbackError],

            "Setup database persistence and rollback both failed.",
          ),
        },
      );
    }

    throw error;
  }
}

function resolveSetupSecretInput(secretPath, requestedValue) {
  const requestedSecret = firstNonEmptyString(requestedValue);

  const status = getKiwiEventsSecretStatus(secretPath);

  if (status.source === KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT) {
    return {
      effectiveSecret: firstNonEmptyString(resolveKiwiEventsSecret(secretPath)),

      secretToStore: "",
    };
  }

  if (requestedSecret) {
    return {
      effectiveSecret: requestedSecret,

      secretToStore: requestedSecret,
    };
  }

  return {
    effectiveSecret: firstNonEmptyString(resolveKiwiEventsSecret(secretPath)),

    secretToStore: "",
  };
}

function validateSecretMinimumLength(secretPath, value, label) {
  const minimumLength = getKiwiEventsSecretDefinition(secretPath).minimumLength;

  if (!minimumLength || value.length >= minimumLength) {
    return null;
  }

  return `${label} must be at least ` + `${minimumLength} characters long.`;
}

function prepareInitializationSecrets(payload) {
  const externalJwtInput = resolveSetupSecretInput(
    KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
    payload.auth?.externalJwtSecret,
  );

  if (!externalJwtInput.effectiveSecret) {
    return {
      success: false,

      message: "External JWT secret is required.",
    };
  }

  const externalJwtLengthError = validateSecretMinimumLength(
    KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
    externalJwtInput.effectiveSecret,
    "External JWT secret",
  );

  if (externalJwtLengthError) {
    return {
      success: false,

      message: externalJwtLengthError,
    };
  }

  const ticketQrInput = resolveSetupSecretInput(
    KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
    payload.security?.ticketQrSecret,
  );

  const ticketQrLengthError = ticketQrInput.effectiveSecret
    ? validateSecretMinimumLength(
        KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
        ticketQrInput.effectiveSecret,
        "Ticket QR secret",
      )
    : null;

  if (ticketQrLengthError) {
    return {
      success: false,

      message: ticketQrLengthError,
    };
  }

  const generatedTicketQrSecret = ticketQrInput.effectiveSecret
    ? ""
    : crypto.randomBytes(48).toString("hex");

  const secretsToStore = {};

  if (externalJwtInput.secretToStore) {
    secretsToStore[KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET] =
      externalJwtInput.secretToStore;
  }

  if (ticketQrInput.secretToStore) {
    secretsToStore[KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET] =
      ticketQrInput.secretToStore;
  } else if (generatedTicketQrSecret) {
    secretsToStore[KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET] =
      generatedTicketQrSecret;
  }

  return {
    success: true,
    secretsToStore,
  };
}

function persistInitialization({ secretsToStore, setupAdminEmail }) {
  const previousSecrets = createStoredSecretSnapshot(
    SETUP_INITIALIZATION_SECRET_PATHS,
  );

  updateKiwiEventsSecrets({
    set: secretsToStore,
  });

  try {
    return updateKiwiEventsConfig({
      setup: {
        initialized: true,

        initializedAt: new Date().toISOString(),
      },

      setupAdmin: {
        email: setupAdminEmail,
      },
    });
  } catch (error) {
    try {
      restoreStoredSecretSnapshot(
        SETUP_INITIALIZATION_SECRET_PATHS,
        previousSecrets,
      );
    } catch (rollbackError) {
      throw AppError.internal(
        "Kiwi Events initialization could not be saved or safely rolled back.",
        {
          code: "SETUP_INITIALIZATION_ROLLBACK_FAILED",

          cause: new AggregateError(
            [error, rollbackError],

            "Setup initialization persistence and rollback both failed.",
          ),
        },
      );
    }

    throw error;
  }
}

export function getSetupStatusService() {
  return getPublicSetupStatus();
}

export async function testSetupDatabaseService(payload = {}) {
  const database = normalizeDatabaseInput(payload);

  const result = await testDatabaseConnection(database);

  return buildSafeDatabaseTestResult(database, result);
}

export async function saveSetupDatabaseService(payload = {}) {
  const database = normalizeDatabaseInput(payload);

  assertDatabaseIsNotEnvironmentManaged(database.provider);

  const testResult = await testDatabaseConnection(database);

  const safeTestResult = buildSafeDatabaseTestResult(database, testResult);

  if (!safeTestResult.success) {
    return safeTestResult;
  }

  persistSetupDatabase(database);

  return {
    success: true,

    message: "Database configuration saved.",

    data: {
      provider: database.provider,

      configured: true,
    },
  };
}

export async function initializeKiwiEventsService(payload = {}) {
  const config = loadKiwiEventsConfig();

  const database = resolveKiwiEventsDatabaseConfig(config);
  const connectionConfig = {
    provider: database.provider,
    uri: database.uri,
  };

  if (!database.provider || !database.uri) {
    return {
      success: false,

      message: "Database must be configured before initialization.",
    };
  }

  const setupAdminPassword = String(payload.setupAdmin?.password || "");

  if (!setupAdminPassword.trim()) {
    return {
      success: false,

      message: "Initial admin password is required.",
    };
  }

  const preparedSecrets = prepareInitializationSecrets(payload);

  if (!preparedSecrets.success) {
    return preparedSecrets;
  }

  const testResult = await testDatabaseConnection(connectionConfig);

  const safeTestResult = buildSafeDatabaseTestResult(database, testResult);

  if (!safeTestResult.success) {
    return safeTestResult;
  }

  await connectDatabase(connectionConfig);

  let migrations = {
    skipped: true,

    reason: "Current database provider is not SQL",
  };

  if (isSqlDatabaseProvider(database.provider)) {
    migrations = await runLatestMigrations();
  }

  await ensureDefaultEventRoles();

  const setupAdmin = {
    email: "admin@admin",

    password: setupAdminPassword,
  };

  const adminSeed = await ensureDefaultKiwiEventsAdminUser(setupAdmin);

  const nextConfig = persistInitialization({
    secretsToStore: preparedSecrets.secretsToStore,

    setupAdminEmail: setupAdmin.email,
  });

  return {
    success: true,

    message: "kiwi-events initialized.",

    data: {
      initialized: Boolean(nextConfig.setup.initialized),

      initializedAt: nextConfig.setup.initializedAt,

      databaseProvider: nextConfig.database.provider,

      admin: {
        created: adminSeed.created,

        email: adminSeed.email,
      },

      migrations,
    },
  };
}

export function getSetupConfigService() {
  const config = loadKiwiEventsConfig();

  const setup = getPublicSetupStatus();

  const externalJwtSecretStatus = getKiwiEventsSecretStatus(
    KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
  );

  const ticketQrSecretStatus = getKiwiEventsSecretStatus(
    KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
  );

  return {
    setup,

    database: {
      provider: setup.databaseProvider,

      configured: setup.databaseConfigured,

      supportedProviders: SUPPORTED_DATABASE_PROVIDERS,
    },

    server: {
      appUrl: config.server?.appUrl || "",

      adminFrontendUrl: config.server?.adminFrontendUrl || "",

      publicFrontendUrl: config.server?.publicFrontendUrl || "",
    },

    branding: {
      appName: config.branding?.appName || "Kiwi Events",
    },

    auth: {
      externalJwtSecretConfigured: externalJwtSecretStatus.configured,
    },

    security: {
      ticketQrSecretConfigured: ticketQrSecretStatus.configured,
    },
  };
}
