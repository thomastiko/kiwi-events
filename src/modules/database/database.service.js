// src/modules/database/database.service.js

import { AppError } from "../../core/errors/AppError.js";
import { loadKiwiEventsConfig } from "../../config/kiwi-events/kiwi-events.config.store.js";
import { resolveKiwiEventsDatabaseConfig } from "../../config/kiwi-events/kiwi-events.database.config.js";
import {
  DATABASE_CONNECTION_STATE,
  DATABASE_PROVIDERS,
  isMongoDatabaseProvider,
  isSqlDatabaseProvider,
  isSupportedDatabaseProvider,
} from "./database.constants.js";
import {
  connectMongoDatabaseProvider,
  disconnectMongoDatabaseProvider,
  getMongoConnection,
  getMongoDatabaseProviderState,
  testMongoDatabaseConnection,
} from "./providers/mongodb.database.provider.js";
import {
  connectMySqlDatabaseProvider,
  disconnectMySqlDatabaseProvider,
  getMySqlConnection,
  getMySqlDatabaseProviderState,
  testMySqlDatabaseConnection,
} from "./providers/mysql.database.provider.js";

function getProviderDisplayName(provider) {
  if (provider === DATABASE_PROVIDERS.MONGODB) return "MongoDB";
  if (provider === DATABASE_PROVIDERS.MARIADB) return "MariaDB";
  if (provider === DATABASE_PROVIDERS.MYSQL) return "MySQL";
  return provider || "Database";
}

function getRuntimeDatabaseConfig() {
  const config = loadKiwiEventsConfig();

  return resolveKiwiEventsDatabaseConfig(config);
}

export function getConfiguredDatabase() {
  return getRuntimeDatabaseConfig();
}

export function hasDatabaseConfig(config = getConfiguredDatabase()) {
  return Boolean(config?.provider && config?.uri);
}

export function assertDatabaseConfigured(config = getConfiguredDatabase()) {
  if (!hasDatabaseConfig(config)) {
    throw AppError.serviceUnavailable("No database connection is configured.", {
      code: "DATABASE_NOT_CONFIGURED",
      title: "Database not configured",
      action:
        "Open kiwi events Admin Setup and configure a database provider and connection URI.",
      details: {
        provider: config?.provider || null,
      },
    });
  }
}

export function getDatabaseProvider() {
  return getConfiguredDatabase().provider || "";
}

export function getDatabaseState() {
  const database = getConfiguredDatabase();

  if (!database.provider) {
    return {
      provider: "",
      state: DATABASE_CONNECTION_STATE.NOT_CONFIGURED,
      lastError: null,
    };
  }

  if (isMongoDatabaseProvider(database.provider)) {
    return getMongoDatabaseProviderState();
  }

  if (isSqlDatabaseProvider(database.provider)) {
    return getMySqlDatabaseProviderState();
  }

  return {
    provider: database.provider,
    state: DATABASE_CONNECTION_STATE.UNSUPPORTED,
    lastError: `Unsupported database provider: ${database.provider}`,
  };
}

export function assertDatabaseConnected() {
  const status = getDatabaseState();

  if (status.state !== DATABASE_CONNECTION_STATE.CONNECTED) {
    throw AppError.serviceUnavailable("Database is not connected.", {
      code: "DATABASE_NOT_CONNECTED",
      title: "Database not connected",
      action:
        "Check the configured database connection in kiwi events admin setup.",
      details: {
        provider: getDatabaseProvider(),
        state: status.state,
        lastError: status.lastError || null,
      },
    });
  }
}

export async function connectDatabase(config = getConfiguredDatabase()) {
  if (!hasDatabaseConfig(config)) {
    return {
      success: false,
      provider: "",
      state: DATABASE_CONNECTION_STATE.NOT_CONFIGURED,
      message:
        "No database connection configured. kiwi-events is running in setup mode.",
    };
  }

  if (!isSupportedDatabaseProvider(config.provider)) {
    throw AppError.badRequest(
      `Unsupported database provider: ${config.provider}.`,
      {
        code: "DATABASE_PROVIDER_UNSUPPORTED",
        title: "Unsupported database provider",
        action: "Choose MongoDB, MariaDB or MySQL as database provider.",
        fields: [
          {
            path: "body.provider",
            message: "Choose a supported database provider.",
          },
        ],
        details: {
          provider: config.provider,
        },
      },
    );
  }

  if (isMongoDatabaseProvider(config.provider)) {
    await connectMongoDatabaseProvider(config);

    return {
      success: true,
      provider: DATABASE_PROVIDERS.MONGODB,
      state: DATABASE_CONNECTION_STATE.CONNECTED,
      message: "MongoDB connected.",
    };
  }

  if (isSqlDatabaseProvider(config.provider)) {
    await connectMySqlDatabaseProvider(config);

    return {
      success: true,
      provider: config.provider,
      state: DATABASE_CONNECTION_STATE.CONNECTED,
      message: `${getProviderDisplayName(config.provider)} connected.`,
    };
  }

  throw new Error(`Unsupported database provider: ${config.provider}`);
}

export async function disconnectDatabase(config = getConfiguredDatabase()) {
  if (!hasDatabaseConfig(config)) {
    return {
      success: true,
      provider: "",
      state: DATABASE_CONNECTION_STATE.NOT_CONFIGURED,
      message: "No database connection configured. Nothing to disconnect.",
    };
  }

  if (isMongoDatabaseProvider(config.provider)) {
    await disconnectMongoDatabaseProvider();

    return {
      success: true,
      provider: DATABASE_PROVIDERS.MONGODB,
      state: DATABASE_CONNECTION_STATE.DISCONNECTED,
      message: "MongoDB disconnected.",
    };
  }

  if (isSqlDatabaseProvider(config.provider)) {
    await disconnectMySqlDatabaseProvider();

    return {
      success: true,
      provider: config.provider,
      state: DATABASE_CONNECTION_STATE.DISCONNECTED,
      message: `${getProviderDisplayName(config.provider)} disconnected.`,
    };
  }

  throw new Error(`Unsupported database provider: ${config.provider}`);
}

export async function testDatabaseConnection(config) {
  if (!config?.provider) {
    return {
      success: false,
      provider: "",
      message: "Database provider is required.",
    };
  }

  if (!isSupportedDatabaseProvider(config.provider)) {
    return {
      success: false,
      provider: config.provider,
      message: `Unsupported database provider: ${config.provider}`,
    };
  }

  if (isMongoDatabaseProvider(config.provider)) {
    return testMongoDatabaseConnection(config);
  }

  if (isSqlDatabaseProvider(config.provider)) {
    return testMySqlDatabaseConnection(config);
  }

  return {
    success: false,
    provider: config.provider,
    message: `Unsupported database provider: ${config.provider}`,
  };
}

export function getDatabaseStatus() {
  const database = getConfiguredDatabase();

  return {
    provider: database.provider || "",

    configured: hasDatabaseConfig(database),

    source: database.source || "none",

    providerSource: database.providerSource || "none",

    managedByEnvironment:
      database.source === "environment" ||
      database.providerSource === "environment",

    ...getDatabaseState(),
  };
}
export function getDatabaseConnection() {
  const database = getConfiguredDatabase();

  assertDatabaseConfigured(database);
  assertDatabaseConnected();

  if (isMongoDatabaseProvider(database.provider)) {
    return getMongoConnection();
  }

  if (isSqlDatabaseProvider(database.provider)) {
    return getMySqlConnection();
  }

  throw new Error(`Unsupported database provider: ${database.provider}`);
}

export function isMongoDatabase() {
  return isMongoDatabaseProvider(getDatabaseProvider());
}

export function isSqlDatabase() {
  return isSqlDatabaseProvider(getDatabaseProvider());
}

function isMongoStandaloneTransactionError(error) {
  return (
    error?.code === 20 &&
    error?.codeName === "IllegalOperation" &&
    String(error?.message || "").includes(
      "Transaction numbers are only allowed on a replica set member or mongos",
    )
  );
}

function shouldUseDatabaseTransactions() {
  const config = loadKiwiEventsConfig();

  return String(config.database?.transactionMode || "auto").toLowerCase();
}
function databaseTransactionRequiredError(reason) {
  const error = new Error(
    `A database transaction is required for this operation: ${reason}`,
  );

  error.code = "DATABASE_TRANSACTION_REQUIRED";

  return error;
}
/**
 * Runs a callback inside the currently configured database transaction.
 *
 * MongoDB receives:
 *   { session }
 *
 * MySQL/MariaDB receives:
 *   { trx }
 *
 * @template T
 * @param {(transactionContext: { session?: object, trx?: object }) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withDatabaseTransaction(callback, options = {}) {
  const required = options.required === true;
  const database = getConfiguredDatabase();

  assertDatabaseConfigured(database);
  assertDatabaseConnected();

  const transactionMode = shouldUseDatabaseTransactions();

  if (transactionMode === "disabled" || transactionMode === "off") {
    if (required) {
      throw databaseTransactionRequiredError(
        "database transactions are disabled",
      );
    }

    return callback({});
  }

  if (isMongoDatabaseProvider(database.provider)) {
    const connection = getMongoConnection();
    const session = await connection.startSession();

    try {
      session.startTransaction();

      const result = await callback({ session });

      await session.commitTransaction();

      return result;
    } catch (error) {
      try {
        await session.abortTransaction();
      } catch {
        // Ignore abort errors because the original error is more relevant.
      }

      if (
        !required &&
        transactionMode === "auto" &&
        isMongoStandaloneTransactionError(error)
      ) {
        return callback({});
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  if (isSqlDatabaseProvider(database.provider)) {
    const db = getMySqlConnection();

    return db.transaction(async (trx) => {
      return callback({ trx });
    });
  }

  throw new Error(`Unsupported database provider: ${database.provider}`);
}
