import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getKiwiEventsConfigPath,
  loadKiwiEventsConfig,
} from "../../config/kiwi-events/kiwi-events.config.store.js";

import { deleteKiwiEventsSecretStore } from "../../config/kiwi-events/kiwi-events.secret.store.js";

import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseConnection,
  getConfiguredDatabase,
} from "../database/database.service.js";

import {
  DATABASE_PROVIDERS,
  isMongoDatabaseProvider,
  isSqlDatabaseProvider,
} from "../database/database.constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "../../..");

function normalizeKnexRows(result) {
  if (Array.isArray(result)) {
    return result[0] || [];
  }

  return result?.rows || [];
}

function getTableNameFromRow(row) {
  if (!row || typeof row !== "object") {
    return "";
  }

  const values = Object.values(row);

  return String(values[0] || "");
}

async function dropMongoDatabase() {
  const connection = getDatabaseConnection();

  if (!connection?.db) {
    throw new Error("MongoDB connection is missing db handle.");
  }

  await connection.db.dropDatabase();

  return {
    provider: DATABASE_PROVIDERS.MONGODB,
    dropped: true,
  };
}

async function dropMySqlLikeDatabaseTables(provider) {
  const db = getDatabaseConnection();

  const showTablesResult = await db.raw("SHOW TABLES");
  const rows = normalizeKnexRows(showTablesResult);
  const tables = rows.map(getTableNameFromRow).filter(Boolean);

  if (tables.length === 0) {
    return {
      provider,
      dropped: true,
      tables: [],
    };
  }

  await db.raw("SET FOREIGN_KEY_CHECKS = 0");

  try {
    for (const table of tables) {
      await db.schema.dropTableIfExists(table);
    }
  } finally {
    await db.raw("SET FOREIGN_KEY_CHECKS = 1");
  }

  return {
    provider,
    dropped: true,
    tables,
  };
}

async function resetDatabase(database, { skipDatabase = false } = {}) {
  if (skipDatabase) {
    return {
      skipped: true,
      reason: "Skipped by reset option",
    };
  }

  if (!database.provider || !database.uri) {
    return {
      skipped: true,
      reason: "No database configured",
    };
  }

  await connectDatabase(database);

  try {
    if (isMongoDatabaseProvider(database.provider)) {
      return await dropMongoDatabase();
    }

    if (isSqlDatabaseProvider(database.provider)) {
      return await dropMySqlLikeDatabaseTables(database.provider);
    }

    return {
      skipped: true,
      reason: `Unsupported provider: ${database.provider}`,
    };
  } finally {
    await disconnectDatabase(database);
  }
}

async function removePathIfExists(targetPath, label) {
  if (!fsSync.existsSync(targetPath)) {
    return {
      removed: false,
      path: targetPath,
      reason: `${label} does not exist`,
    };
  }

  await fs.rm(targetPath, {
    recursive: true,
    force: true,
  });

  return {
    removed: true,
    path: targetPath,
  };
}

async function resetUploads(config, { skipUploads = false } = {}) {
  if (skipUploads) {
    return {
      skipped: true,
      reason: "Skipped by reset option",
    };
  }

  const localDir =
    config.storage?.local?.dir || config.storage?.dir || "uploads";

  const uploadsPath = path.resolve(projectRoot, localDir);

  return removePathIfExists(uploadsPath, "Uploads directory");
}

async function resetConfig({ skipConfig = false } = {}) {
  if (skipConfig) {
    return {
      skipped: true,
      reason: "Skipped by reset option",
    };
  }

  const configPath = getKiwiEventsConfigPath();

  const config = await removePathIfExists(configPath, "Config file");

  const secretStore = deleteKiwiEventsSecretStore();

  return {
    config,
    secretStore,
  };
}

export async function resetKiwiEventsService({
  skipDatabase = false,
  skipUploads = false,
  skipConfig = false,
} = {}) {
  const config = loadKiwiEventsConfig();
  const database = getConfiguredDatabase();

  const result = {
    database: null,
    uploads: null,
    config: null,
  };

  result.database = await resetDatabase(database, {
    skipDatabase,
  });

  result.uploads = await resetUploads(config, {
    skipUploads,
  });

  result.config = await resetConfig({
    skipConfig,
  });

  return result;
}
