import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseConnection,
} from "../../src/modules/database/database.service.js";
import { runLatestMigrations } from "../../src/modules/database/migration.service.js";

import { updateKiwiEventsConfig } from "../../src/config/kiwi-events/kiwi-events.config.store.js";
import { buildKiwiEventsDatabaseSecretUpdate } from "../../src/config/kiwi-events/kiwi-events.database.config.js";
import { updateKiwiEventsSecrets } from "../../src/config/kiwi-events/kiwi-events.secret.store.js";

import {
  DATABASE_PROVIDERS,
  isSqlDatabaseProvider,
} from "../../src/modules/database/database.constants.js";

import { ensureDefaultEventRoles } from "../../src/modules/eventRoles/eventRole.service.js";
const DEFAULT_MYSQL_TEST_URI =
  "mysql://root:Memories15!@127.0.0.1:3306/kiwi_events_test";

const SQL_TABLES_IN_DELETE_ORDER = [
  "discount_codes",
  "discount_code_groups",
  "payment_refunds",
  "email_logs",
  "email_templates",
  "tickets",
  "orders",
  "ticket_type_sessions",
  "ticket_types",
  "ticket_templates",
  "event_faqs",
  "event_sessions",
  "event_tags",
  "events",
  "media_assets",
  "event_users",
];

const SQL_TABLES_IN_DROP_ORDER = [
  "discount_codes",
  "discount_code_groups",
  "payment_refunds",
  "email_logs",
  "email_templates",
  "tickets",
  "orders",
  "ticket_type_sessions",
  "ticket_types",
  "ticket_templates",
  "event_faqs",
  "event_sessions",
  "event_tags",
  "events",
  "media_assets",
  "event_users",
  "event_roles",
  "knex_migrations_lock",
  "knex_migrations",
];

const MANAGED_ENVIRONMENT_VARIABLES = [
  "KIWI_EVENTS_CONFIG_FILE",
  "KIWI_EVENTS_DATA_DIR",
  "KIWI_EVENTS_SECRETS_FILE",
  "KIWI_EVENTS_MASTER_KEY_FILE",

  "KIWI_EVENTS_DATABASE_PROVIDER",
  "KIWI_EVENTS_DATABASE_URI",
  "DATABASE_URL",
  "MONGODB_URI",

  "NODE_ENV",
];

let previousEnvironment = null;
let testRuntimeDirectory = null;
let sqlTestConnected = false;

function captureEnvironment() {
  return Object.fromEntries(
    MANAGED_ENVIRONMENT_VARIABLES.map((name) => [
      name,
      Object.hasOwn(process.env, name) ? process.env[name] : undefined,
    ]),
  );
}

function restoreEnvironment() {
  if (!previousEnvironment) {
    return;
  }

  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function createTemporaryRuntimeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kiwi-events-sql-test-"));
}

function parseSqlTestUri(uri) {
  let parsedUri;

  try {
    parsedUri = new URL(uri);
  } catch {
    throw new Error(
      "KIWI_EVENTS_TEST_SQL_URI must be a valid MySQL or MariaDB connection URI.",
    );
  }

  const databaseName = decodeURIComponent(
    parsedUri.pathname.replace(/^\/+/, ""),
  ).trim();

  if (!databaseName) {
    throw new Error(
      "KIWI_EVENTS_TEST_SQL_URI must explicitly contain a database name.",
    );
  }

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      "Refusing to run SQL integration tests because the database name is not clearly marked as a test database.",
    );
  }

  return {
    protocol: parsedUri.protocol.toLowerCase(),
    databaseName,
  };
}
export function hasSqlTestDatabaseConfiguration() {
  const provider = getSqlTestProvider();

  return Boolean(
    process.env.KIWI_EVENTS_TEST_SQL_URI?.trim() ||
    provider === DATABASE_PROVIDERS.MYSQL,
  );
}
export function getSqlTestUri() {
  const provider = getSqlTestProvider();

  const configuredUri = process.env.KIWI_EVENTS_TEST_SQL_URI?.trim();

  const uri =
    configuredUri ||
    (provider === DATABASE_PROVIDERS.MYSQL ? DEFAULT_MYSQL_TEST_URI : null);

  if (!uri) {
    throw new Error(
      `KIWI_EVENTS_TEST_SQL_URI is missing for SQL provider "${provider}".`,
    );
  }

  parseSqlTestUri(uri);

  return uri;
}

export function getSqlTestProvider() {
  const provider =
    process.env.KIWI_EVENTS_TEST_SQL_PROVIDER?.trim().toLowerCase() ||
    DATABASE_PROVIDERS.MYSQL;

  if (!isSqlDatabaseProvider(provider)) {
    throw new Error(
      `KIWI_EVENTS_TEST_SQL_PROVIDER must be "${DATABASE_PROVIDERS.MYSQL}" or "${DATABASE_PROVIDERS.MARIADB}".`,
    );
  }

  return provider;
}

function validateProviderAndUri(provider, uri) {
  const { protocol } = parseSqlTestUri(uri);

  if (provider === DATABASE_PROVIDERS.MYSQL && protocol !== "mysql:") {
    throw new Error('MySQL SQL tests require a URI beginning with "mysql://".');
  }

  if (
    provider === DATABASE_PROVIDERS.MARIADB &&
    !["mysql:", "mariadb:"].includes(protocol)
  ) {
    throw new Error(
      'MariaDB SQL tests require a URI beginning with "mariadb://" or "mysql://".',
    );
  }
}

function setupSqlTestRuntime({ provider, uri }) {
  if (testRuntimeDirectory) {
    throw new Error(
      "The isolated SQL test runtime has already been initialized.",
    );
  }

  previousEnvironment = captureEnvironment();
  testRuntimeDirectory = createTemporaryRuntimeDirectory();

  const dataDirectory = path.join(testRuntimeDirectory, "data");

  process.env.KIWI_EVENTS_CONFIG_FILE = path.join(
    testRuntimeDirectory,
    "kiwi-events.config.json",
  );

  process.env.KIWI_EVENTS_DATA_DIR = dataDirectory;

  process.env.KIWI_EVENTS_SECRETS_FILE = path.join(
    dataDirectory,
    "kiwi-events.secrets.enc",
  );

  process.env.KIWI_EVENTS_MASTER_KEY_FILE = path.join(
    dataDirectory,
    "kiwi-events.master.key",
  );

  /*
   * Keep these variables defined but empty. This prevents a later
   * dotenv.config() call from loading a development or production
   * database configuration into the test process.
   *
   * The actual test URI is resolved from the isolated encrypted store.
   */
  process.env.KIWI_EVENTS_DATABASE_PROVIDER = "";
  process.env.KIWI_EVENTS_DATABASE_URI = "";
  process.env.DATABASE_URL = "";
  process.env.MONGODB_URI = "";

  process.env.NODE_ENV = "test";

  updateKiwiEventsSecrets(
    buildKiwiEventsDatabaseSecretUpdate({
      provider,
      uri,
    }),
  );

  updateKiwiEventsConfig({
    setup: {
      initialized: true,
    },

    database: {
      provider,
      transactionMode: "auto",
    },
  });
}

async function resetSqlTestSchema() {
  const db = getDatabaseConnection();

  await db.raw("SET FOREIGN_KEY_CHECKS = 0");

  try {
    for (const table of SQL_TABLES_IN_DROP_ORDER) {
      await db.schema.dropTableIfExists(table);
    }
  } finally {
    await db.raw("SET FOREIGN_KEY_CHECKS = 1");
  }
}

export async function connectSqlTestDb() {
  const provider = getSqlTestProvider();
  const uri = getSqlTestUri();

  validateProviderAndUri(provider, uri);
  setupSqlTestRuntime({
    provider,
    uri,
  });

  try {
    await disconnectDatabase().catch(() => {});

    await connectDatabase();
    sqlTestConnected = true;

    await resetSqlTestSchema();
    await runLatestMigrations();
    await ensureDefaultEventRoles();
  } catch (error) {
    await disconnectSqlTestDb().catch(() => {});

    throw error;
  }
}

export async function clearSqlTestDb() {
  if (!sqlTestConnected) {
    return;
  }

  const db = getDatabaseConnection();

  await db.raw("SET FOREIGN_KEY_CHECKS = 0");

  try {
    for (const table of SQL_TABLES_IN_DELETE_ORDER) {
      const exists = await db.schema.hasTable(table);

      if (exists) {
        await db(table).del();
      }
    }
  } finally {
    await db.raw("SET FOREIGN_KEY_CHECKS = 1");
  }

  await ensureDefaultEventRoles();
}

export async function disconnectSqlTestDb() {
  let disconnectError = null;

  try {
    if (testRuntimeDirectory) {
      await disconnectDatabase();
    }
  } catch (error) {
    disconnectError = error;
  } finally {
    sqlTestConnected = false;

    restoreEnvironment();

    if (testRuntimeDirectory) {
      fs.rmSync(testRuntimeDirectory, {
        recursive: true,
        force: true,
      });
    }

    previousEnvironment = null;
    testRuntimeDirectory = null;
  }

  if (disconnectError) {
    throw disconnectError;
  }
}
