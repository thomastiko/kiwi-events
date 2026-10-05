// src/modules/database/database.constants.js

export const DATABASE_PROVIDERS = Object.freeze({
  MONGODB: "mongodb",
  MARIADB: "mariadb",
  MYSQL: "mysql",
});

export const DATABASE_PROVIDER = DATABASE_PROVIDERS;

export const DATABASE_PROVIDER_VALUES = Object.values(DATABASE_PROVIDERS);

export const SUPPORTED_DATABASE_PROVIDERS = DATABASE_PROVIDER_VALUES;

export const DATABASE_CONNECTION_STATE = Object.freeze({
  NOT_CONFIGURED: "not_configured",
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting",
  ERROR: "error",
  UNSUPPORTED: "unsupported",
});

export function isSupportedDatabaseProvider(provider) {
  return DATABASE_PROVIDER_VALUES.includes(provider);
}

export function isMongoDatabaseProvider(provider) {
  return provider === DATABASE_PROVIDERS.MONGODB;
}

export function isMariaDbDatabaseProvider(provider) {
  return provider === DATABASE_PROVIDERS.MARIADB;
}

export function isMySqlDatabaseProvider(provider) {
  return provider === DATABASE_PROVIDERS.MYSQL;
}

export function isMySqlLikeDatabaseProvider(provider) {
  return (
    isMariaDbDatabaseProvider(provider) || isMySqlDatabaseProvider(provider)
  );
}

export function isSqlDatabaseProvider(provider) {
  return isMySqlLikeDatabaseProvider(provider);
}
