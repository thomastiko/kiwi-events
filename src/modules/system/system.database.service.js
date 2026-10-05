import { AppError } from "../../core/errors/AppError.js";

import { logger } from "../../config/logger.js";

import {
  loadKiwiEventsConfig,
  updateKiwiEventsConfig,
} from "../../config/kiwi-events/kiwi-events.config.store.js";

import {
  buildKiwiEventsDatabaseSecretUpdate,
  getKiwiEventsDatabaseSecretConfig,
  KIWI_EVENTS_DATABASE_SECRET_PATHS,
} from "../../config/kiwi-events/kiwi-events.database.config.js";

import {
  getKiwiEventsSecretStatus,
  KIWI_EVENTS_SECRET_SOURCES,
  loadKiwiEventsSecrets,
  updateKiwiEventsSecrets,
} from "../../config/kiwi-events/kiwi-events.secret.store.js";

import {
  connectDatabase,
  disconnectDatabase,
  getConfiguredDatabase,
  getDatabaseStatus,
  testDatabaseConnection,
} from "../database/database.service.js";

import { isSqlDatabaseProvider } from "../database/database.constants.js";

import { runLatestMigrations } from "../database/migration.service.js";

import { ensureDefaultKiwiEventsAdminUser } from "../eventUsers/eventUser.seed.service.js";

import { ensureDefaultEventRoles } from "../eventRoles/eventRole.service.js";

import {
  enableMaintenanceMode,
  disableMaintenanceMode,
} from "./system.maintenance.js";

function normalizeProvider(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeUri(value) {
  return String(value ?? "").trim();
}

function hasDatabaseConfig(database) {
  return Boolean(database?.provider && database?.uri);
}

function assertSuccessfulDatabaseTest(result) {
  if (result?.success) {
    return;
  }

  throw AppError.badRequest(
    "The database connection could not be established.",
    {
      code: "DATABASE_CONNECTION_FAILED",
      title: "Database connection failed",
      action:
        "Check the URI, credentials, host, port and whether the database server is running.",
      fields: [
        {
          path: "body.uri",
          message: "The database connection could not be established.",
        },
      ],
      details: {
        provider: result?.provider || null,
      },
    },
  );
}

function getSwitchAdminPassword(payload = {}) {
  return String(payload.setupAdmin?.password || "");
}

function assertDatabaseCanBeChanged(currentDatabase, targetProvider) {
  const currentDatabaseIsEnvironmentManaged =
    currentDatabase.source === KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT ||
    currentDatabase.providerSource === KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT;

  if (currentDatabaseIsEnvironmentManaged) {
    throw AppError.conflict(
      "The active database is controlled by environment variables.",
      {
        code: "DATABASE_MANAGED_BY_ENVIRONMENT",
        title: "Database managed by environment",
        action:
          "Remove the database environment variables and restart Kiwi Events before changing the database through the Admin interface.",
      },
    );
  }

  const targetSecretConfig = getKiwiEventsDatabaseSecretConfig(targetProvider);

  if (!targetSecretConfig) {
    return;
  }

  const targetSecretStatus = getKiwiEventsSecretStatus(
    targetSecretConfig.secretPath,
  );

  if (targetSecretStatus.source !== KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT) {
    return;
  }

  throw AppError.conflict(
    "The selected database is controlled by an environment variable.",
    {
      code: "DATABASE_MANAGED_BY_ENVIRONMENT",
      title: "Database managed by environment",
      action:
        "Remove the database environment variable and restart Kiwi Events before changing this database through the Admin interface.",
      fields: [
        {
          path: "body.uri",
          message:
            "The URI for this database provider is controlled by an environment variable.",
        },
      ],
    },
  );
}

function getStoredDatabaseSecrets() {
  const allStoredSecrets = loadKiwiEventsSecrets();

  return Object.fromEntries(
    KIWI_EVENTS_DATABASE_SECRET_PATHS.filter((secretPath) =>
      Object.hasOwn(allStoredSecrets, secretPath),
    ).map((secretPath) => [secretPath, allStoredSecrets[secretPath]]),
  );
}

function createDatabasePersistenceSnapshot() {
  const config = loadKiwiEventsConfig();

  return {
    provider: normalizeProvider(config.database?.provider),

    storedSecrets: getStoredDatabaseSecrets(),
  };
}

function restoreDatabasePersistenceSnapshot(snapshot) {
  const storedSecrets = snapshot?.storedSecrets || {};

  const pathsToRemove = KIWI_EVENTS_DATABASE_SECRET_PATHS.filter(
    (secretPath) => !Object.hasOwn(storedSecrets, secretPath),
  );

  updateKiwiEventsSecrets({
    set: storedSecrets,
    remove: pathsToRemove,
  });

  updateKiwiEventsConfig({
    database: {
      provider: normalizeProvider(snapshot?.provider),
    },
  });
}

function persistDatabaseSelection({ provider, uri }) {
  const secretUpdate = buildKiwiEventsDatabaseSecretUpdate({
    provider,
    uri,
  });

  /*
   * Store the URI first. This prevents the config from
   * pointing at a provider whose secret does not exist yet.
   */
  updateKiwiEventsSecrets(secretUpdate);

  updateKiwiEventsConfig({
    database: {
      provider,
    },
  });
}

function logDatabaseSwitchFailure(eventName, { provider, error }) {
  logger.error(eventName, {
    provider,
    errorName: error?.name || "Error",
    errorCode: error?.code || null,
  });
}

async function rollbackDatabaseSwitch({
  persistenceSnapshot,
  previousDatabase,
  targetDatabase,
  targetActivationStarted,
}) {
  const rollbackErrors = [];

  if (targetActivationStarted) {
    try {
      await disconnectDatabase(targetDatabase);
    } catch (error) {
      rollbackErrors.push(error);

      logDatabaseSwitchFailure("database.switch_target_disconnect_failed", {
        provider: targetDatabase.provider,
        error,
      });
    }
  }

  try {
    restoreDatabasePersistenceSnapshot(persistenceSnapshot);
  } catch (error) {
    rollbackErrors.push(error);

    logDatabaseSwitchFailure("database.switch_persistence_rollback_failed", {
      provider: previousDatabase.provider,
      error,
    });
  }

  if (hasDatabaseConfig(previousDatabase)) {
    try {
      await connectDatabase(previousDatabase);
    } catch (error) {
      rollbackErrors.push(error);

      logDatabaseSwitchFailure("database.switch_previous_reconnect_failed", {
        provider: previousDatabase.provider,
        error,
      });
    }
  }

  if (rollbackErrors.length > 0) {
    throw new AggregateError(
      rollbackErrors,
      "The previous database could not be fully restored.",
    );
  }

  logger.info("database.switch_rollback_succeeded", {
    provider: previousDatabase.provider || null,
  });
}

export async function getSystemDatabaseStatusService() {
  return getDatabaseStatus();
}

export async function testSystemDatabaseConfigService({ provider, uri } = {}) {
  const cleanProvider = normalizeProvider(provider);

  const cleanUri = normalizeUri(uri);

  if (!cleanProvider || !cleanUri) {
    throw AppError.badRequest("Provider and database URI are required.", {
      code: "DATABASE_CONFIG_INCOMPLETE",
      title: "Database configuration incomplete",
      action: "Complete the highlighted database fields.",
      fields: [
        ...(!cleanProvider
          ? [
              {
                path: "body.provider",
                message: "Choose a database provider.",
              },
            ]
          : []),

        ...(!cleanUri
          ? [
              {
                path: "body.uri",
                message: "Enter a database URI.",
              },
            ]
          : []),
      ],
    });
  }

  const result = await testDatabaseConnection({
    provider: cleanProvider,
    uri: cleanUri,
  });

  assertSuccessfulDatabaseTest(result);

  return {
    success: true,
    provider: cleanProvider,
    message: result.message || "Database connection successful.",
  };
}

export async function switchSystemDatabaseService(payload = {}) {
  const provider = normalizeProvider(payload.provider);

  const uri = normalizeUri(payload.uri);

  if (!provider || !uri) {
    throw AppError.badRequest(
      "Provider and database URI are required before switching the database.",
      {
        code: "DATABASE_CONFIG_INCOMPLETE",
        title: "Database configuration incomplete",
        action: "Complete the highlighted database fields before switching.",
        fields: [
          ...(!provider
            ? [
                {
                  path: "body.provider",
                  message: "Choose a database provider.",
                },
              ]
            : []),

          ...(!uri
            ? [
                {
                  path: "body.uri",
                  message: "Enter a database URI.",
                },
              ]
            : []),
        ],
      },
    );
  }

  const previousDatabase = getConfiguredDatabase();

  assertDatabaseCanBeChanged(previousDatabase, provider);

  const testResult = await testDatabaseConnection({
    provider,
    uri,
  });

  assertSuccessfulDatabaseTest(testResult);

  const persistenceSnapshot = createDatabasePersistenceSnapshot();

  const targetDatabase = {
    provider,
    uri,
  };

  let targetActivationStarted = false;

  enableMaintenanceMode("database_switch");

  try {
    await disconnectDatabase(previousDatabase);

    persistDatabaseSelection(targetDatabase);

    targetActivationStarted = true;

    await connectDatabase(targetDatabase);

    let migrations = {
      skipped: true,
      reason: "Current database provider is not SQL",
    };

    if (isSqlDatabaseProvider(provider)) {
      migrations = await runLatestMigrations();
    }

    const roleSeed = await ensureDefaultEventRoles();

    const adminSeed = await ensureDefaultKiwiEventsAdminUser({
      email: "admin@admin",

      password: getSwitchAdminPassword(payload),
    });

    logger.info("database.switch_succeeded", {
      provider,
    });

    return {
      success: true,
      provider,
      message:
        "Database switched successfully. No data was migrated; the selected database is now active.",

      data: {
        migrations,
        roles: roleSeed,

        admin: {
          created: adminSeed.created,

          passwordUpdated: adminSeed.passwordUpdated,

          email: adminSeed.email,
        },
      },
    };
  } catch (error) {
    logDatabaseSwitchFailure("database.switch_failed", {
      provider,
      error,
    });

    try {
      await rollbackDatabaseSwitch({
        persistenceSnapshot,
        previousDatabase,
        targetDatabase,
        targetActivationStarted,
      });
    } catch (rollbackError) {
      throw AppError.internal(
        "The database switch failed and the previous database could not be safely restored.",
        {
          code: "DATABASE_SWITCH_ROLLBACK_FAILED",

          cause: new AggregateError(
            [error, rollbackError],
            "Database switch and rollback both failed.",
          ),
        },
      );
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw AppError.internal(
      "The database switch failed. The previous database configuration was restored.",
      {
        code: "DATABASE_SWITCH_FAILED",
        cause: error,
      },
    );
  } finally {
    disableMaintenanceMode();
  }
}
