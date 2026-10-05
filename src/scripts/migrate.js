import { connectDB, disconnectDB } from "../config/db.js";
import { logger } from "../config/logger.js";
import { runLatestMigrations } from "../modules/database/migration.service.js";

async function main() {
  try {
    await connectDB();

    const result = await runLatestMigrations();

    if (result.skipped) {
      logger.info(`Database migrations skipped: ${result.reason}`);
      return;
    }

    logger.info("Database migrations finished successfully", {
      batchNo: result.batchNo,
      migrations: result.migrations,
    });
  } catch (error) {
    logger.error("Database migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

main();
