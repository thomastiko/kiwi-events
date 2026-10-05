import {
  connectDatabase,
  disconnectDatabase,
  getConfiguredDatabase,
  getDatabaseConnection,
  getDatabaseProvider,
  getDatabaseStatus,
  hasDatabaseConfig,
  testDatabaseConnection,
  withDatabaseTransaction,
} from "../modules/database/database.service.js";

export const connectDB = connectDatabase;
export const disconnectDB = disconnectDatabase;

export {
  getConfiguredDatabase,
  getDatabaseConnection,
  getDatabaseProvider,
  getDatabaseStatus,
  hasDatabaseConfig,
  testDatabaseConnection,
  withDatabaseTransaction,
};
