import dotenv from "dotenv";

import { loadKiwiEventsConfig } from "./kiwi-events/kiwi-events.config.store.js";
import { getKiwiEventsDatabaseSecretConfig } from "./kiwi-events/kiwi-events.database.config.js";
import {
  DATABASE_PROVIDER,
  DATABASE_PROVIDER_VALUES,
} from "../modules/database/database.constants.js";

import {
  KIWI_EVENTS_MAIL_PROVIDER_VALUES,
  KIWI_EVENTS_PAYMENT_PROVIDER_VALUES,
} from "./kiwi-events/kiwi-events.config.constants.js";

import crypto from "node:crypto";

import { KIWI_EVENTS_SECRET_PATHS } from "./kiwi-events/kiwi-events.secret.constants.js";

import {
  resolveKiwiEventsSecret,
  setKiwiEventsSecret,
} from "./kiwi-events/kiwi-events.secret.store.js";

dotenv.config();

const appConfig = loadKiwiEventsConfig();

function getOrCreateLocalJwtSecret() {
  const secretPath = KIWI_EVENTS_SECRET_PATHS.AUTH_LOCAL_JWT_SECRET;

  const configuredSecret = resolveKiwiEventsSecret(secretPath);

  if (configuredSecret) {
    return configuredSecret;
  }

  const generatedSecret = crypto.randomBytes(48).toString("hex");

  setKiwiEventsSecret(secretPath, generatedSecret);

  return generatedSecret;
}
function normalizeString(value, fallback = "") {
  const normalized = String(value ?? "").trim();

  return normalized || fallback;
}

function normalizeLower(value, fallback = "") {
  return normalizeString(value, fallback).toLowerCase();
}
function normalizeUpper(value, fallback = "") {
  return normalizeString(value, fallback).toUpperCase();
}
function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}
function readRuntimeValue(...names) {
  for (const name of names) {
    const value = process.env[name];

    if (value === undefined || value === null) {
      continue;
    }

    const normalized = String(value).trim();

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function resolveString(runtimeNames, configValue, fallback = "") {
  return (
    readRuntimeValue(...runtimeNames) || normalizeString(configValue, fallback)
  );
}
function resolveNumber(runtimeNames, configValue, fallback) {
  const runtimeValue = readRuntimeValue(...runtimeNames);

  if (runtimeValue) {
    const parsed = Number(runtimeValue);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (configValue !== undefined && configValue !== null && configValue !== "") {
    const parsed = Number(configValue);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function resolveBoolean(runtimeNames, configValue, fallback = false) {
  const runtimeValue = readRuntimeValue(...runtimeNames);

  if (runtimeValue) {
    return normalizeBoolean(runtimeValue, fallback);
  }

  return normalizeBoolean(configValue, fallback);
}

function normalizeStringList(value) {
  const entries = Array.isArray(value) ? value : String(value ?? "").split(",");

  return [
    ...new Set(entries.map((entry) => normalizeString(entry)).filter(Boolean)),
  ];
}

function resolveStringList(runtimeNames, configValue, fallback = []) {
  const runtimeValue = readRuntimeValue(...runtimeNames);

  if (runtimeValue) {
    return normalizeStringList(runtimeValue);
  }

  if (configValue !== undefined && configValue !== null) {
    return normalizeStringList(configValue);
  }

  return normalizeStringList(fallback);
}

function getServerPort() {
  return resolveNumber(["PORT"], appConfig.server?.port, 5001);
}

function getAppUrl() {
  return resolveString(
    ["KIWI_EVENTS_APP_URL"],
    appConfig.server?.appUrl,
    `http://localhost:${getServerPort()}`,
  );
}

function getActiveDatabaseProvider() {
  return normalizeLower(
    process.env.KIWI_EVENTS_DATABASE_PROVIDER ||
      appConfig.database?.provider ||
      DATABASE_PROVIDER.MONGODB,
    DATABASE_PROVIDER.MONGODB,
  );
}

function getActiveDatabaseUri(provider) {
  const secretConfig = getKiwiEventsDatabaseSecretConfig(provider);

  if (!secretConfig) {
    return "";
  }

  return resolveKiwiEventsSecret(secretConfig.secretPath);
}

function getAuthProvider() {
  return normalizeLower(
    resolveString(
      ["KIWI_EVENTS_AUTH_PROVIDER"],
      appConfig.auth?.provider,
      "local",
    ),
    "local",
  );
}

function getSqlClient(provider) {
  if (
    provider === DATABASE_PROVIDER.MYSQL ||
    provider === DATABASE_PROVIDER.MARIADB
  ) {
    return "mysql2";
  }

  return "";
}

const databaseProvider = getActiveDatabaseProvider();

if (!DATABASE_PROVIDER_VALUES.includes(databaseProvider)) {
  throw new Error(
    `Unsupported database provider "${databaseProvider}". Supported providers: ${DATABASE_PROVIDER_VALUES.join(
      ", ",
    )}`,
  );
}

const databaseUri = getActiveDatabaseUri(databaseProvider);
const databaseConfigured = Boolean(databaseUri);

const authProvider = getAuthProvider();
const supportedAuthProviders = ["local", "external-jwt", "hybrid"];

if (!supportedAuthProviders.includes(authProvider)) {
  throw new Error(
    `Unsupported auth provider "${authProvider}". Supported providers: ${supportedAuthProviders.join(
      ", ",
    )}`,
  );
}

const localJwtSecret = getOrCreateLocalJwtSecret();

const externalJwtSecret = resolveKiwiEventsSecret(
  KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
);
const ticketQrSecret = resolveKiwiEventsSecret(
  KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
);

const setupInitialized = Boolean(appConfig.setup?.initialized);

if (
  setupInitialized &&
  (authProvider === "external-jwt" || authProvider === "hybrid") &&
  !externalJwtSecret
) {
  throw new Error(
    "Missing external JWT secret. Configure it during setup " +
      "or set KIWI_EVENTS_EXTERNAL_JWT_SECRET.",
  );
}
const paymentProvider = normalizeLower(
  resolveString(
    ["KIWI_EVENTS_PAYMENT_PROVIDER"],
    appConfig.payments?.provider,
    "disabled",
  ),
  "disabled",
);

if (!KIWI_EVENTS_PAYMENT_PROVIDER_VALUES.includes(paymentProvider)) {
  throw new Error(
    `Unsupported payment provider "${paymentProvider}". Supported providers: ${KIWI_EVENTS_PAYMENT_PROVIDER_VALUES.join(
      ", ",
    )}`,
  );
}

const paymentCurrency = normalizeUpper(
  resolveString(
    ["KIWI_EVENTS_PAYMENT_CURRENCY", "KIWI_EVENTS_DEFAULT_CURRENCY"],
    appConfig.payments?.currency || appConfig.branding?.defaultCurrency,
    "EUR",
  ),
  "EUR",
);

const mailProvider = normalizeLower(
  resolveString(
    ["KIWI_EVENTS_MAIL_PROVIDER"],
    appConfig.mail?.provider,
    "disabled",
  ),
  "disabled",
);

if (!KIWI_EVENTS_MAIL_PROVIDER_VALUES.includes(mailProvider)) {
  throw new Error(
    `Unsupported mail provider "${mailProvider}". Supported providers: ${KIWI_EVENTS_MAIL_PROVIDER_VALUES.join(
      ", ",
    )}`,
  );
}
const ticketPdfStorageTarget = normalizeLower(
  resolveString(
    ["KIWI_EVENTS_TICKET_PDF_STORAGE_TARGET"],
    appConfig.storage?.generated?.ticketPdfTarget,
    "local",
  ),
  "local",
);

const supportedStorageTargets = ["local", "public", "private"];

if (!supportedStorageTargets.includes(ticketPdfStorageTarget)) {
  throw new Error(
    `Unsupported ticket PDF storage target "${ticketPdfStorageTarget}". ` +
      `Supported targets: ${supportedStorageTargets.join(", ")}`,
  );
}

export const env = {
  config: appConfig,

  nodeEnv: normalizeLower(
    resolveString(["NODE_ENV"], appConfig.server?.nodeEnv, "development"),
    "development",
  ),
  port: getServerPort(),

  appUrl: getAppUrl(),

  database: {
    configured: databaseConfigured,
    provider: databaseProvider,
    uri: databaseUri,

    mongodb: {
      uri: databaseProvider === DATABASE_PROVIDER.MONGODB ? databaseUri : "",
    },

    sql: {
      uri:
        databaseProvider === DATABASE_PROVIDER.MYSQL ||
        databaseProvider === DATABASE_PROVIDER.MARIADB
          ? databaseUri
          : "",
      client: getSqlClient(databaseProvider),
    },
  },

  auth: {
    provider: authProvider,

    localJwtSecret,

    localJwtExpiresIn:
      process.env.KIWI_EVENTS_LOCAL_JWT_EXPIRES_IN ||
      appConfig.auth?.localJwtExpiresIn ||
      "7d",

    externalJwtSecret,
  },

  security: {
    ticketQrSecret,
  },

  storage: {
    local: {
      dir: resolveString(
        ["KIWI_EVENTS_LOCAL_STORAGE_DIR"],
        appConfig.storage?.local?.dir,
        "uploads",
      ),
    },

    public: {
      enabled: resolveBoolean(
        ["KIWI_EVENTS_STORAGE_PUBLIC_ENABLED"],
        appConfig.storage?.public?.enabled,
        false,
      ),

      endpoint: resolveString(
        ["KIWI_EVENTS_STORAGE_PUBLIC_ENDPOINT"],
        appConfig.storage?.public?.endpoint,
      ),

      region: resolveString(
        ["KIWI_EVENTS_STORAGE_PUBLIC_REGION"],
        appConfig.storage?.public?.region,
        "auto",
      ),

      bucket: resolveString(
        ["KIWI_EVENTS_STORAGE_PUBLIC_BUCKET"],
        appConfig.storage?.public?.bucket,
      ),

      publicBaseUrl: resolveString(
        ["KIWI_EVENTS_STORAGE_PUBLIC_BASE_URL"],
        appConfig.storage?.public?.publicBaseUrl,
      ),

      accessKeyId: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID,
      ),

      secretAccessKey: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY,
      ),

      forcePathStyle: resolveBoolean(
        ["KIWI_EVENTS_STORAGE_PUBLIC_FORCE_PATH_STYLE"],
        appConfig.storage?.public?.forcePathStyle,
        false,
      ),
    },

    private: {
      enabled: resolveBoolean(
        ["KIWI_EVENTS_STORAGE_PRIVATE_ENABLED"],
        appConfig.storage?.private?.enabled,
        false,
      ),

      endpoint: resolveString(
        ["KIWI_EVENTS_STORAGE_PRIVATE_ENDPOINT"],
        appConfig.storage?.private?.endpoint,
      ),

      region: resolveString(
        ["KIWI_EVENTS_STORAGE_PRIVATE_REGION"],
        appConfig.storage?.private?.region,
        "auto",
      ),

      bucket: resolveString(
        ["KIWI_EVENTS_STORAGE_PRIVATE_BUCKET"],
        appConfig.storage?.private?.bucket,
      ),

      accessKeyId: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID,
      ),

      secretAccessKey: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY,
      ),

      forcePathStyle: resolveBoolean(
        ["KIWI_EVENTS_STORAGE_PRIVATE_FORCE_PATH_STYLE"],
        appConfig.storage?.private?.forcePathStyle,
        false,
      ),
    },

    generated: {
      ticketPdfTarget: ticketPdfStorageTarget,
    },
  },

  payments: {
    provider: paymentProvider,
    currency: paymentCurrency,

    mollie: {
      apiKey: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY,
      ),

      webhookUrl: resolveString(
        ["KIWI_EVENTS_MOLLIE_WEBHOOK_URL", "MOLLIE_WEBHOOK_URL"],
        appConfig.payments?.mollie?.webhookUrl,
      ),

      redirectUrl: resolveString(
        ["KIWI_EVENTS_MOLLIE_REDIRECT_URL", "MOLLIE_REDIRECT_URL"],
        appConfig.payments?.mollie?.redirectUrl,
      ),
    },

    stripe: {
      secretKey: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_SECRET_KEY,
      ),

      webhookSecret: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_WEBHOOK_SECRET,
      ),

      successUrl: resolveString(
        ["KIWI_EVENTS_STRIPE_SUCCESS_URL", "STRIPE_SUCCESS_URL"],
        appConfig.payments?.stripe?.successUrl,
      ),

      cancelUrl: resolveString(
        ["KIWI_EVENTS_STRIPE_CANCEL_URL", "STRIPE_CANCEL_URL"],
        appConfig.payments?.stripe?.cancelUrl,
      ),
    },
  },

  mail: {
    provider: mailProvider,

    smtp: {
      host: resolveString(
        ["KIWI_EVENTS_MAIL_SMTP_HOST"],
        appConfig.mail?.smtp?.host,
      ),

      port: resolveNumber(
        ["KIWI_EVENTS_MAIL_SMTP_PORT"],
        appConfig.mail?.smtp?.port,
        587,
      ),

      secure: resolveBoolean(
        ["KIWI_EVENTS_MAIL_SMTP_SECURE"],
        appConfig.mail?.smtp?.secure,
        false,
      ),

      user: resolveString(
        ["KIWI_EVENTS_MAIL_SMTP_USER"],
        appConfig.mail?.smtp?.user,
      ),

      pass: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD,
      ),
    },

    resend: {
      apiKey: resolveKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.MAIL_RESEND_API_KEY,
      ),

      timeoutMs: resolveNumber(
        ["KIWI_EVENTS_MAIL_RESEND_TIMEOUT_MS"],
        appConfig.mail?.resend?.timeoutMs,
        10000,
      ),
    },

    defaults: {
      fromName: resolveString(
        ["KIWI_EVENTS_MAIL_DEFAULT_FROM_NAME"],
        appConfig.mail?.defaultFromName,
        "Kiwi Events",
      ),

      fromEmail: resolveString(
        ["KIWI_EVENTS_MAIL_DEFAULT_FROM_EMAIL"],
        appConfig.mail?.defaultFromEmail,
      ),

      replyTo: resolveString(
        ["KIWI_EVENTS_MAIL_DEFAULT_REPLY_TO"],
        appConfig.mail?.defaultReplyTo,
      ),
    },
  },

  branding: {
    appName: resolveString(
      ["KIWI_EVENTS_BRAND_NAME"],
      appConfig.branding?.appName,
      "Kiwi Events",
    ),

    ticketTitle: resolveString(
      ["KIWI_EVENTS_TICKET_TITLE"],
      appConfig.branding?.ticketTitle,
      "Event Ticket",
    ),

    ticketSubtitle: resolveString(
      ["KIWI_EVENTS_TICKET_SUBTITLE"],
      appConfig.branding?.ticketSubtitle,
      "Official confirmation for your booked event ticket.",
    ),

    locale: resolveString(
      ["KIWI_EVENTS_LOCALE"],
      appConfig.branding?.locale,
      "en-US",
    ),

    defaultCurrency: normalizeUpper(
      resolveString(
        ["KIWI_EVENTS_DEFAULT_CURRENCY"],
        appConfig.branding?.defaultCurrency,
        "EUR",
      ),
      "EUR",
    ),
  },

  frontendUrl: resolveString(
    ["KIWI_EVENTS_PUBLIC_FRONTEND_URL"],
    appConfig.server?.publicFrontendUrl,
  ),

  adminFrontendUrl: resolveString(
    ["KIWI_EVENTS_ADMIN_FRONTEND_URL"],
    appConfig.server?.adminFrontendUrl,
  ),

  corsOrigins: resolveStringList(
    ["KIWI_EVENTS_CORS_ORIGIN"],
    appConfig.server?.corsOrigin,
  ),
};
