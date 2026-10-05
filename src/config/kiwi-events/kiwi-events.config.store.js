import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { KIWI_EVENTS_CONFIG_DEFAULTS } from "./kiwi-events.config.defaults.js";
import { deepFreeze, deepMerge } from "./kiwi-events.config.utils.js";
import { KIWI_EVENTS_SECRET_PATH_VALUES } from "./kiwi-events.secret.constants.js";

import { resolveKiwiEventsDatabaseConfig } from "./kiwi-events.database.config.js";

let cachedConfig = null;
function cacheConfig(config) {
  cachedConfig = deepFreeze(config);

  return cachedConfig;
}
const FORBIDDEN_PLAINTEXT_CONFIG_PATHS = Object.freeze([
  ...KIWI_EVENTS_SECRET_PATH_VALUES,
  "setupAdmin.password",
]);

function hasOwnConfigPath(value, configPath) {
  let currentValue = value;

  for (const segment of configPath.split(".")) {
    if (
      !currentValue ||
      typeof currentValue !== "object" ||
      Array.isArray(currentValue) ||
      !Object.hasOwn(currentValue, segment)
    ) {
      return false;
    }

    currentValue = currentValue[segment];
  }

  return true;
}

export function assertKiwiEventsConfigContainsNoSecrets(config) {
  const forbiddenPaths = FORBIDDEN_PLAINTEXT_CONFIG_PATHS.filter((configPath) =>
    hasOwnConfigPath(config, configPath),
  );

  if (!forbiddenPaths.length) {
    return;
  }

  throw new Error(
    "Plaintext secrets are not allowed in kiwi-events.config.json. " +
      `Forbidden paths: ${forbiddenPaths.join(", ")}.`,
  );
}
function getProjectRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  return path.resolve(currentDir, "../../..");
}

export function getKiwiEventsConfigPath() {
  return (
    process.env.KIWI_EVENTS_CONFIG_FILE ||
    path.join(getProjectRoot(), "kiwi-events.config.json")
  );
}

function ensureConfigFileExists() {
  const configPath = getKiwiEventsConfigPath();

  if (fs.existsSync(configPath)) {
    return;
  }

  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(
    configPath,
    `${JSON.stringify(KIWI_EVENTS_CONFIG_DEFAULTS, null, 2)}\n`,
    "utf8",
  );
}

function readConfigFileRaw() {
  ensureConfigFileExists();

  const configPath = getKiwiEventsConfigPath();
  const raw = fs.readFileSync(configPath, "utf8");

  if (!raw.trim()) {
    return {};
  }

  let parsedConfig;

  try {
    parsedConfig = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Could not parse kiwi-events config file at ${configPath}: ${error.message}`,
    );
  }

  assertKiwiEventsConfigContainsNoSecrets(parsedConfig);

  return parsedConfig;
}
function writeConfigFileRaw(config) {
  assertKiwiEventsConfigContainsNoSecrets(config);

  const configPath = getKiwiEventsConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function loadKiwiEventsConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const fileConfig = readConfigFileRaw();

  return cacheConfig(deepMerge(KIWI_EVENTS_CONFIG_DEFAULTS, fileConfig));
}

export function saveKiwiEventsConfig(nextConfig) {
  assertKiwiEventsConfigContainsNoSecrets(nextConfig);

  const mergedConfig = deepMerge(KIWI_EVENTS_CONFIG_DEFAULTS, nextConfig);

  assertKiwiEventsConfigContainsNoSecrets(mergedConfig);

  writeConfigFileRaw(mergedConfig);

  return cacheConfig(mergedConfig);
}

export function updateKiwiEventsConfig(patch) {
  const currentConfig = loadKiwiEventsConfig();

  const nextConfig = deepMerge(currentConfig, patch);

  return saveKiwiEventsConfig(nextConfig);
}

export function getPublicSetupStatus() {
  const config = loadKiwiEventsConfig();
  const database = resolveKiwiEventsDatabaseConfig(config);

  return {
    initialized: Boolean(config.setup?.initialized),

    databaseConfigured: Boolean(database.provider && database.uri),

    databaseProvider: database.provider,

    appName: config.branding?.appName || "Kiwi Events",
  };
}

export function isKiwiEventsInitialized() {
  const status = getPublicSetupStatus();

  return Boolean(status.initialized && status.databaseConfigured);
}
