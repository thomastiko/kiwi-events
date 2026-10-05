import path from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../config/logger.js";
import { getDatabaseConnection, isSqlDatabase } from "./database.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIRECTORY = path.join(__dirname, "migrations");

export async function runLatestMigrations() {
  if (!isSqlDatabase()) {
    logger.info(
      "Skipping SQL migrations because current database provider is not SQL",
    );

    return {
      skipped: true,
      reason: "Current database provider is not SQL",
    };
  }

  const db = getDatabaseConnection();

  const result = await db.migrate.latest({
    directory: MIGRATIONS_DIRECTORY,
    extension: "js",
    loadExtensions: [".js"],
  });

  logger.info("SQL migrations completed", {
    batchNo: result?.[0],
    migrations: result?.[1] || [],
  });

  return {
    skipped: false,
    batchNo: result?.[0],
    migrations: result?.[1] || [],
  };
}

export async function rollbackLastMigrationBatch() {
  if (!isSqlDatabase()) {
    logger.info(
      "Skipping SQL migration rollback because current database provider is not SQL",
    );

    return {
      skipped: true,
      reason: "Current database provider is not SQL",
    };
  }

  const db = getDatabaseConnection();

  const result = await db.migrate.rollback({
    directory: MIGRATIONS_DIRECTORY,
    extension: "js",
    loadExtensions: [".js"],
  });

  logger.info("SQL migration rollback completed", {
    batchNo: result?.[0],
    migrations: result?.[1] || [],
  });

  return {
    skipped: false,
    batchNo: result?.[0],
    migrations: result?.[1] || [],
  };
}
