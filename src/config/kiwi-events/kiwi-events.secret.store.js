import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  assertKiwiEventsSecretPath,
  getKiwiEventsSecretEnvironmentVariableNames,
  KIWI_EVENTS_SECRET_PATH_VALUES,
} from "./kiwi-events.secret.constants.js";

const SECRET_STORE_VERSION = 1;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const MASTER_KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const ADDITIONAL_AUTHENTICATED_DATA = Buffer.from(
  "kiwi-events-secret-store:v1",
  "utf8",
);

function getProjectRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  return path.resolve(currentDir, "../../..");
}

function resolveStoragePath(configuredPath, fallbackPath) {
  const value = String(configuredPath ?? "").trim();

  if (!value) {
    return fallbackPath;
  }

  return path.isAbsolute(value) ? value : path.resolve(getProjectRoot(), value);
}

export function getKiwiEventsDataDirectory() {
  return resolveStoragePath(
    process.env.KIWI_EVENTS_DATA_DIR,
    path.join(getProjectRoot(), "data"),
  );
}

export function getKiwiEventsSecretsPath() {
  return resolveStoragePath(
    process.env.KIWI_EVENTS_SECRETS_FILE,
    path.join(getKiwiEventsDataDirectory(), "kiwi-events.secrets.enc"),
  );
}

export function getKiwiEventsMasterKeyPath() {
  return resolveStoragePath(
    process.env.KIWI_EVENTS_MASTER_KEY_FILE,
    path.join(getKiwiEventsDataDirectory(), "kiwi-events.master.key"),
  );
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
    mode: 0o700,
  });
}

function applyPrivateFilePermissions(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }
}

function writeFileAtomically(filePath, content) {
  ensureParentDirectory(filePath);

  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );

  try {
    fs.writeFileSync(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    fs.renameSync(temporaryPath, filePath);
    applyPrivateFilePermissions(filePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }
}

function decodeMasterKey(rawValue, keyPath) {
  const encodedKey = String(rawValue ?? "").trim();
  const key = Buffer.from(encodedKey, "base64");

  if (
    key.length !== MASTER_KEY_LENGTH ||
    key.toString("base64") !== encodedKey
  ) {
    throw new Error(
      `Invalid Kiwi Events master key at ${keyPath}. ` +
        `Expected exactly ${MASTER_KEY_LENGTH} Base64-encoded bytes.`,
    );
  }

  return key;
}

function readExistingMasterKey() {
  const keyPath = getKiwiEventsMasterKeyPath();

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Kiwi Events master key is missing at ${keyPath}. ` +
        "The existing encrypted secrets cannot be recovered without it.",
    );
  }

  return decodeMasterKey(fs.readFileSync(keyPath, "utf8"), keyPath);
}

function getOrCreateMasterKey() {
  const keyPath = getKiwiEventsMasterKeyPath();

  if (fs.existsSync(keyPath)) {
    return readExistingMasterKey();
  }

  ensureParentDirectory(keyPath);

  const newKey = crypto.randomBytes(MASTER_KEY_LENGTH);
  const encodedKey = `${newKey.toString("base64")}\n`;

  try {
    fs.writeFileSync(keyPath, encodedKey, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    applyPrivateFilePermissions(keyPath);

    return newKey;
  } catch (error) {
    if (error.code === "EEXIST") {
      return readExistingMasterKey();
    }

    throw error;
  }
}

function assertSecretValue(value, secretPath) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Secret "${secretPath}" must be a non-empty string.`);
  }

  return value;
}

function validateSecretRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Kiwi Events secret payload must be an object.");
  }

  const validatedSecrets = {};

  for (const [rawPath, rawValue] of Object.entries(value)) {
    const secretPath = assertKiwiEventsSecretPath(rawPath);

    validatedSecrets[secretPath] = assertSecretValue(rawValue, secretPath);
  }

  return validatedSecrets;
}

function encryptSecrets(secrets, masterKey) {
  const validatedSecrets = validateSecretRecord(secrets);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, masterKey, iv);

  cipher.setAAD(ADDITIONAL_AUTHENTICATED_DATA);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(validatedSecrets), "utf8"),
    cipher.final(),
  ]);

  const authenticationTag = cipher.getAuthTag();

  return {
    version: SECRET_STORE_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    iv: iv.toString("base64"),
    authenticationTag: authenticationTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decodeEnvelopeBuffer(value, name, expectedLength) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Encrypted secret store contains no valid ${name}.`);
  }

  const buffer = Buffer.from(value, "base64");

  if (buffer.length !== expectedLength || buffer.toString("base64") !== value) {
    throw new Error(`Encrypted secret store contains an invalid ${name}.`);
  }

  return buffer;
}

function decryptSecrets(envelope, masterKey) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("Encrypted secret store must contain an object.");
  }

  if (envelope.version !== SECRET_STORE_VERSION) {
    throw new Error(`Unsupported secret store version "${envelope.version}".`);
  }

  if (envelope.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error(
      `Unsupported secret store algorithm "${envelope.algorithm}".`,
    );
  }

  const iv = decodeEnvelopeBuffer(
    envelope.iv,
    "initialization vector",
    IV_LENGTH,
  );

  const authenticationTag = decodeEnvelopeBuffer(
    envelope.authenticationTag,
    "authentication tag",
    AUTH_TAG_LENGTH,
  );

  const ciphertext = Buffer.from(String(envelope.ciphertext ?? ""), "base64");

  if (!ciphertext.length) {
    throw new Error("Encrypted secret store contains no ciphertext.");
  }

  let plaintext;

  try {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      masterKey,
      iv,
    );

    decipher.setAAD(ADDITIONAL_AUTHENTICATED_DATA);
    decipher.setAuthTag(authenticationTag);

    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Could not decrypt the Kiwi Events secret store. " +
        "The master key is incorrect or the file was modified.",
    );
  }

  try {
    return validateSecretRecord(JSON.parse(plaintext));
  } catch (error) {
    throw new Error(
      `Invalid decrypted Kiwi Events secret payload: ${error.message}`,
    );
  }
}

function readSecretsFile() {
  const secretsPath = getKiwiEventsSecretsPath();

  if (!fs.existsSync(secretsPath)) {
    return {};
  }

  let envelope;

  try {
    envelope = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not parse encrypted secret store at ${secretsPath}: ` +
        error.message,
    );
  }

  return decryptSecrets(envelope, readExistingMasterKey());
}

function writeSecretsFile(secrets) {
  const masterKey = getOrCreateMasterKey();
  const envelope = encryptSecrets(secrets, masterKey);

  writeFileAtomically(
    getKiwiEventsSecretsPath(),
    `${JSON.stringify(envelope, null, 2)}\n`,
  );
}

export function loadKiwiEventsSecrets() {
  return { ...readSecretsFile() };
}

export function getStoredKiwiEventsSecret(value) {
  const secretPath = assertKiwiEventsSecretPath(value);
  const secrets = readSecretsFile();

  return secrets[secretPath] ?? "";
}

export function hasStoredKiwiEventsSecret(value) {
  const secretPath = assertKiwiEventsSecretPath(value);
  const secrets = readSecretsFile();

  return Object.hasOwn(secrets, secretPath);
}
function readEnvironmentSecret(value) {
  const secretPath = assertKiwiEventsSecretPath(value);

  const environmentVariableNames =
    getKiwiEventsSecretEnvironmentVariableNames(secretPath);

  for (const environmentVariableName of environmentVariableNames) {
    const rawValue = process.env[environmentVariableName];

    if (typeof rawValue !== "string" || !rawValue.trim()) {
      continue;
    }

    return {
      configured: true,
      value: rawValue,
    };
  }

  return {
    configured: false,
    value: "",
  };
}

export function resolveKiwiEventsSecret(value) {
  const secretPath = assertKiwiEventsSecretPath(value);

  const environmentSecret = readEnvironmentSecret(secretPath);

  if (environmentSecret.configured) {
    return environmentSecret.value;
  }

  return getStoredKiwiEventsSecret(secretPath);
}

export function updateKiwiEventsSecrets({ set = {}, remove = [] } = {}) {
  if (!set || typeof set !== "object" || Array.isArray(set)) {
    throw new Error("Secret updates must be an object.");
  }

  if (!Array.isArray(remove)) {
    throw new Error("Removed secret paths must be an array.");
  }

  const currentSecrets = readSecretsFile();
  const nextSecrets = { ...currentSecrets };

  for (const value of remove) {
    const secretPath = assertKiwiEventsSecretPath(value);
    delete nextSecrets[secretPath];
  }

  for (const [rawPath, rawValue] of Object.entries(set)) {
    const secretPath = assertKiwiEventsSecretPath(rawPath);

    nextSecrets[secretPath] = assertSecretValue(rawValue, secretPath);
  }

  if (JSON.stringify(currentSecrets) !== JSON.stringify(nextSecrets)) {
    writeSecretsFile(nextSecrets);
  }

  return {
    configuredPaths: Object.keys(nextSecrets).sort(),
  };
}

export function setKiwiEventsSecret(secretPath, value) {
  return updateKiwiEventsSecrets({
    set: {
      [secretPath]: value,
    },
  });
}

export function deleteKiwiEventsSecret(secretPath) {
  return updateKiwiEventsSecrets({
    remove: [secretPath],
  });
}
export const KIWI_EVENTS_SECRET_SOURCES = Object.freeze({
  ENVIRONMENT: "environment",
  ENCRYPTED_STORE: "encrypted_store",
  NONE: "none",
});

function buildKiwiEventsSecretStatus(secretPath, storedSecrets) {
  const environmentSecret = readEnvironmentSecret(secretPath);

  if (environmentSecret.configured) {
    return {
      configured: true,
      source: KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT,
      deletable: false,
    };
  }

  if (Object.hasOwn(storedSecrets, secretPath)) {
    return {
      configured: true,
      source: KIWI_EVENTS_SECRET_SOURCES.ENCRYPTED_STORE,
      deletable: true,
    };
  }

  return {
    configured: false,
    source: KIWI_EVENTS_SECRET_SOURCES.NONE,
    deletable: false,
  };
}

export function getKiwiEventsSecretStatus(value) {
  const secretPath = assertKiwiEventsSecretPath(value);

  return buildKiwiEventsSecretStatus(secretPath, readSecretsFile());
}

export function getKiwiEventsSecretStatuses(
  values = KIWI_EVENTS_SECRET_PATH_VALUES,
) {
  if (!Array.isArray(values)) {
    throw new Error("Secret status paths must be an array.");
  }

  const secretPaths = [
    ...new Set(values.map((value) => assertKiwiEventsSecretPath(value))),
  ];

  const storedSecrets = readSecretsFile();

  return Object.fromEntries(
    secretPaths.map((secretPath) => [
      secretPath,
      buildKiwiEventsSecretStatus(secretPath, storedSecrets),
    ]),
  );
}
export function deleteKiwiEventsSecretStore() {
  const secretsPath = getKiwiEventsSecretsPath();

  if (!fs.existsSync(secretsPath)) {
    return {
      removed: false,
      reason: "Encrypted secret store does not exist",
    };
  }

  fs.rmSync(secretsPath, {
    force: true,
  });

  return {
    removed: true,
  };
}
