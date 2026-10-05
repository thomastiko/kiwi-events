import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import mongoose from "mongoose";

import { updateKiwiEventsConfig } from "../../src/config/kiwi-events/kiwi-events.config.store.js";
import { buildKiwiEventsDatabaseSecretUpdate } from "../../src/config/kiwi-events/kiwi-events.database.config.js";

import { updateKiwiEventsSecrets } from "../../src/config/kiwi-events/kiwi-events.secret.store.js";
import { DATABASE_PROVIDERS } from "../../src/modules/database/database.constants.js";

import { ensureDefaultEventRoles } from "../../src/modules/eventRoles/eventRole.service.js";

let previousConfigFile = null;
let previousDataDirectory = null;
let testConfigFile = null;

export function getMongoTestUri() {
  const uri =
    process.env.KIWI_EVENTS_TEST_MONGODB_URI ||
    "mongodb://127.0.0.1:27017/KIWI_EVENTS_test";

  if (!uri) {
    throw new Error(
      "KIWI_EVENTS_TEST_MONGODB_URI is missing. Set it to a dedicated test database, e.g. mongodb://127.0.0.1:27017/KIWI_EVENTS_test",
    );
  }

  if (!uri.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to run integration tests against non-test database URI: ${uri}`,
    );
  }

  return uri;
}

function createTemporaryConfigFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kiwi-events-mongo-test-"));
  return path.join(dir, "kiwi-events.config.json");
}

function setupMongoTestConfig(uri) {
  if (!testConfigFile) {
    previousConfigFile = process.env.KIWI_EVENTS_CONFIG_FILE;

    previousDataDirectory = process.env.KIWI_EVENTS_DATA_DIR;

    testConfigFile = createTemporaryConfigFile();
  }

  process.env.KIWI_EVENTS_CONFIG_FILE = testConfigFile;

  process.env.KIWI_EVENTS_DATA_DIR = path.dirname(testConfigFile);

  process.env.NODE_ENV = "test";

  updateKiwiEventsSecrets(
    buildKiwiEventsDatabaseSecretUpdate({
      provider: DATABASE_PROVIDERS.MONGODB,

      uri,
    }),
  );

  updateKiwiEventsConfig({
    setup: {
      initialized: true,
    },

    database: {
      provider: DATABASE_PROVIDERS.MONGODB,

      transactionMode: "auto",
    },
  });
}

export async function connectMongoTestDb() {
  const uri = getMongoTestUri();

  setupMongoTestConfig(uri);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(uri);
}

export async function clearMongoTestDb() {
  const db = mongoose.connection.db;

  if (!db) {
    return;
  }

  const collections = await db.collections();

  for (const collection of collections) {
    await collection.deleteMany({});
  }

  await ensureDefaultEventRoles();
}

export async function disconnectMongoTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (previousDataDirectory) {
    process.env.KIWI_EVENTS_DATA_DIR = previousDataDirectory;
  } else {
    delete process.env.KIWI_EVENTS_DATA_DIR;
  }

  if (testConfigFile) {
    fs.rmSync(path.dirname(testConfigFile), {
      recursive: true,
      force: true,
    });
  }

  previousConfigFile = null;
  previousDataDirectory = null;
  testConfigFile = null;
}
