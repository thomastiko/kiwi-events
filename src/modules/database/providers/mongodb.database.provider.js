import mongoose from "mongoose";

import { AppError } from "../../../core/errors/AppError.js";
import { logger } from "../../../config/logger.js";
import {
  DATABASE_CONNECTION_STATE,
  DATABASE_PROVIDERS,
} from "../database.constants.js";

let state = DATABASE_CONNECTION_STATE.DISCONNECTED;
let lastError = null;

export async function connectMongoDatabaseProvider(config) {
  if (state === DATABASE_CONNECTION_STATE.CONNECTED) {
    return mongoose.connection;
  }

  if (state === DATABASE_CONNECTION_STATE.CONNECTING) {
    return mongoose.connection;
  }

  state = DATABASE_CONNECTION_STATE.CONNECTING;
  lastError = null;

  try {
    const uri = config?.uri;

    if (!uri) {
      throw AppError.serviceUnavailable("MongoDB URI is missing.", {
        code: "DATABASE_URI_MISSING",
        title: "MongoDB URI missing",
        action:
          "Configure a MongoDB connection URI in kiwi events admin setup.",
        fields: [
          {
            path: "body.uri",
            message: "Enter a MongoDB connection URI.",
          },
        ],
        details: {
          provider: DATABASE_PROVIDERS.MONGODB,
        },
      });
    }

    await mongoose.connect(uri);

    state = DATABASE_CONNECTION_STATE.CONNECTED;

    logger.info("MongoDB database provider connected");

    return mongoose.connection;
  } catch (error) {
    state = DATABASE_CONNECTION_STATE.ERROR;
    lastError = error;

    logger.error("MongoDB database provider connection failed:", error.message);

    throw error;
  }
}

export async function disconnectMongoDatabaseProvider() {
  if (
    state === DATABASE_CONNECTION_STATE.DISCONNECTED ||
    state === DATABASE_CONNECTION_STATE.DISCONNECTING
  ) {
    return;
  }

  state = DATABASE_CONNECTION_STATE.DISCONNECTING;

  try {
    await mongoose.disconnect();

    state = DATABASE_CONNECTION_STATE.DISCONNECTED;

    logger.info("MongoDB database provider disconnected");
  } catch (error) {
    state = DATABASE_CONNECTION_STATE.ERROR;
    lastError = error;

    logger.error("MongoDB database provider disconnect failed:", error.message);

    throw error;
  }
}

export function getMongoDatabaseProviderState() {
  const readyStateMap = {
    0: DATABASE_CONNECTION_STATE.DISCONNECTED,
    1: DATABASE_CONNECTION_STATE.CONNECTED,
    2: DATABASE_CONNECTION_STATE.CONNECTING,
    3: DATABASE_CONNECTION_STATE.DISCONNECTING,
  };

  return {
    provider: DATABASE_PROVIDERS.MONGODB,
    state: readyStateMap[mongoose.connection.readyState] || state,
    mongooseReadyState: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
    lastError: lastError?.message || null,
  };
}

export function getMongoConnection() {
  return mongoose.connection;
}

export async function testMongoDatabaseConnection(config) {
  const uri = config?.uri;

  if (!uri) {
    return {
      success: false,
      provider: DATABASE_PROVIDERS.MONGODB,
      message: "MongoDB URI is missing.",
    };
  }

  let connection = null;

  try {
    connection = await mongoose.createConnection(uri).asPromise();

    await connection.db.admin().ping();

    return {
      success: true,
      provider: DATABASE_PROVIDERS.MONGODB,
      message: "MongoDB connection successful.",
    };
  } catch (error) {
    return {
      success: false,
      provider: DATABASE_PROVIDERS.MONGODB,
      message: `MongoDB connection failed: ${error.message}`,
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        logger.warn("mongodb.test_connection_close_failed", {
          error: closeError,
        });
      }
    }
  }
}
