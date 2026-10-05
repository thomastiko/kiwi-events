import { KIWI_EVENTS_SECRET_PATHS } from "./kiwi-events.secret.constants.js";

import {
  getKiwiEventsSecretStatus,
  KIWI_EVENTS_SECRET_SOURCES,
  resolveKiwiEventsSecret,
} from "./kiwi-events.secret.store.js";

export const KIWI_EVENTS_DATABASE_SECRET_CONFIG_BY_PROVIDER = Object.freeze({
  mongodb: Object.freeze({
    secretPath: KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI,
  }),

  mysql: Object.freeze({
    secretPath: KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI,
  }),

  mariadb: Object.freeze({
    secretPath: KIWI_EVENTS_SECRET_PATHS.DATABASE_MARIADB_URI,
  }),
});

export const KIWI_EVENTS_DATABASE_SECRET_PATHS = Object.freeze(
  Object.values(KIWI_EVENTS_DATABASE_SECRET_CONFIG_BY_PROVIDER).map(
    (entry) => entry.secretPath,
  ),
);

function firstNonEmptyString(...values) {
  for (const value of values) {
    const cleanValue = String(value ?? "").trim();

    if (cleanValue) {
      return cleanValue;
    }
  }

  return "";
}

export function getKiwiEventsDatabaseSecretConfig(provider) {
  const cleanProvider = String(provider ?? "")
    .trim()
    .toLowerCase();

  return KIWI_EVENTS_DATABASE_SECRET_CONFIG_BY_PROVIDER[cleanProvider] || null;
}

export function resolveKiwiEventsDatabaseConfig(config = {}) {
  const environmentProvider = firstNonEmptyString(
    process.env.KIWI_EVENTS_DATABASE_PROVIDER,
  ).toLowerCase();

  const configuredProvider = firstNonEmptyString(
    config.database?.provider,
  ).toLowerCase();

  const provider = environmentProvider || configuredProvider;

  const providerSource = environmentProvider
    ? "environment"
    : configuredProvider
      ? "config"
      : "none";

  const secretConfig = getKiwiEventsDatabaseSecretConfig(provider);

  if (!secretConfig) {
    return {
      provider,
      uri: "",
      source: KIWI_EVENTS_SECRET_SOURCES.NONE,
      providerSource,
      deletable: false,
    };
  }

  const secretStatus = getKiwiEventsSecretStatus(secretConfig.secretPath);

  return {
    provider,

    uri: resolveKiwiEventsSecret(secretConfig.secretPath),

    source: secretStatus.source,
    providerSource,
    deletable: secretStatus.deletable,
  };
}

export function buildKiwiEventsDatabaseSecretUpdate({ provider, uri } = {}) {
  const cleanProvider = String(provider ?? "")
    .trim()
    .toLowerCase();

  const cleanUri = String(uri ?? "").trim();

  const secretConfig = getKiwiEventsDatabaseSecretConfig(cleanProvider);

  if (!secretConfig) {
    throw new Error(
      `Unsupported database provider "${cleanProvider || "<empty>"}".`,
    );
  }

  if (!cleanUri) {
    throw new Error("Database URI must be a non-empty string.");
  }

  return {
    set: {
      [secretConfig.secretPath]: cleanUri,
    },

    remove: KIWI_EVENTS_DATABASE_SECRET_PATHS.filter(
      (secretPath) => secretPath !== secretConfig.secretPath,
    ),
  };
}
