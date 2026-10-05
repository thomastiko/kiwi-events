// src/modules/database/providers/mysql.database.provider.js

import knex from "knex";

import { logger } from "../../../config/logger.js";
import { AppError } from "../../../core/errors/AppError.js";
import {
  DATABASE_CONNECTION_STATE,
  DATABASE_PROVIDERS,
  isMySqlLikeDatabaseProvider,
} from "../database.constants.js";

let db = null;
let state = DATABASE_CONNECTION_STATE.DISCONNECTED;
let lastError = null;
let activeProvider = null;

function normalizeConnectionUri(provider, uri) {
  if (!uri) {
    return uri;
  }

  /**
   * mysql2/Knex works reliably with mysql://.
   * MariaDB servers are compatible with the mysql2 driver.
   *
   * Users may enter mariadb:// for clarity in the UI.
   * Internally we normalize it to mysql:// so mysql2 can parse it.
   */
  if (provider === DATABASE_PROVIDERS.MARIADB && uri.startsWith("mariadb://")) {
    return uri.replace(/^mariadb:\/\//, "mysql://");
  }

  return uri;
}

function getProviderLabel(provider) {
  if (provider === DATABASE_PROVIDERS.MARIADB) {
    return "MariaDB";
  }

  if (provider === DATABASE_PROVIDERS.MYSQL) {
    return "MySQL";
  }

  return "MySQL/MariaDB";
}

function createMySqlClient({ provider, uri }) {
  if (!isMySqlLikeDatabaseProvider(provider)) {
    throw AppError.badRequest(`Unsupported MySQL-like provider: ${provider}.`, {
      code: "DATABASE_PROVIDER_UNSUPPORTED",
      title: "Unsupported database provider",
      action: "Choose MariaDB or MySQL as database provider.",
      fields: [
        {
          path: "body.provider",
          message: "Choose MariaDB or MySQL.",
        },
      ],
      details: {
        provider,
      },
    });
  }

  if (!uri) {
    throw AppError.badRequest(
      `${getProviderLabel(provider)} connection URI is missing.`,
      {
        code: "DATABASE_URI_MISSING",
        title: "Database URI missing",
        action: `Enter a ${getProviderLabel(provider)} connection URI.`,
        fields: [
          {
            path: "body.uri",
            message: `Enter a ${getProviderLabel(provider)} connection URI.`,
          },
        ],
        details: {
          provider,
        },
      },
    );
  }

  return knex({
    client: "mysql2",
    connection: normalizeConnectionUri(provider, uri),
    pool: {
      min: Number(process.env.KIWI_EVENTS_DATABASE_POOL_MIN || 0),
      max: Number(process.env.KIWI_EVENTS_DATABASE_POOL_MAX || 10),
    },
    acquireConnectionTimeout: Number(
      process.env.KIWI_EVENTS_DATABASE_ACQUIRE_TIMEOUT_MS || 10000,
    ),
  });
}

export async function connectMySqlDatabaseProvider(config) {
  if (state === DATABASE_CONNECTION_STATE.CONNECTED && db) {
    return db;
  }

  if (state === DATABASE_CONNECTION_STATE.CONNECTING && db) {
    return db;
  }

  state = DATABASE_CONNECTION_STATE.CONNECTING;
  lastError = null;
  activeProvider = config.provider;

  try {
    db = createMySqlClient(config);

    await db.raw("select 1 as KIWI_EVENTS_db_check");

    state = DATABASE_CONNECTION_STATE.CONNECTED;

    logger.info(
      `${getProviderLabel(config.provider)} database provider connected`,
    );

    return db;
  } catch (error) {
    state = DATABASE_CONNECTION_STATE.ERROR;
    lastError = error;

    logger.error(
      `${getProviderLabel(config.provider)} database provider connection failed:`,
      error.message,
    );

    if (db) {
      try {
        await db.destroy();
      } catch (destroyError) {
        logger.warn("mysql.connection_cleanup_failed", {
          provider: config.provider,
          error: destroyError,
        });
      }
      db = null;
    }

    throw error;
  }
}

export async function disconnectMySqlDatabaseProvider() {
  if (
    state === DATABASE_CONNECTION_STATE.DISCONNECTED ||
    state === DATABASE_CONNECTION_STATE.DISCONNECTING
  ) {
    return;
  }

  state = DATABASE_CONNECTION_STATE.DISCONNECTING;

  try {
    if (db) {
      await db.destroy();
      db = null;
    }

    logger.info(
      `${getProviderLabel(activeProvider)} database provider disconnected`,
    );

    state = DATABASE_CONNECTION_STATE.DISCONNECTED;
    activeProvider = null;
  } catch (error) {
    state = DATABASE_CONNECTION_STATE.ERROR;
    lastError = error;

    logger.error(
      `${getProviderLabel(activeProvider)} database provider disconnect failed:`,
      error.message,
    );

    throw error;
  }
}

export function getMySqlDatabaseProviderState() {
  return {
    provider: activeProvider,
    state,
    client: db?.client?.config?.client || null,
    lastError: lastError?.message || null,
  };
}

export function getMySqlConnection() {
  if (!db) {
    throw new Error(
      "MySQL/MariaDB database connection has not been initialized. Call connectDatabase() before using repositories.",
    );
  }

  return db;
}

export async function testMySqlDatabaseConnection(config) {
  let testDb = null;

  try {
    testDb = createMySqlClient(config);

    await testDb.raw("select 1 as KIWI_EVENTS_db_check");

    return {
      success: true,
      provider: config.provider,
      message: `${getProviderLabel(config.provider)} connection successful.`,
    };
  } catch (error) {
    return {
      success: false,
      provider: config.provider,
      message: `${getProviderLabel(config.provider)} connection failed: ${error.message}`,
    };
  } finally {
    if (testDb) {
      try {
        await testDb.destroy();
      } catch (destroyError) {
        logger.warn("mysql.test_connection_cleanup_failed", {
          provider: config.provider,
          error: destroyError,
        });
      }
    }
  }
}
