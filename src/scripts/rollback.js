import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "../config/logger.js";
import { rollbackLastMigrationBatch } from "../modules/database/migration.service.js";

async function main() {
  try {
    await connectDB();

    const result = await rollbackLastMigrationBatch();

    if (result.skipped) {
      logger.info(`Database migration rollback skipped: ${result.reason}`);
      return;
    }

    logger.info("Database migration rollback finished successfully", {
      batchNo: result.batchNo,
      migrations: result.migrations,
    });
  } catch (error) {
    logger.error("Database migration rollback failed:", error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

main();
