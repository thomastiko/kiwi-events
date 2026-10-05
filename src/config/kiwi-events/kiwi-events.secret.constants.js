export const KIWI_EVENTS_SECRET_PATHS = Object.freeze({
  DATABASE_MONGODB_URI: "database.mongodb.uri",
  DATABASE_MYSQL_URI: "database.mysql.uri",
  DATABASE_MARIADB_URI: "database.mariadb.uri",

  AUTH_LOCAL_JWT_SECRET: "auth.localJwtSecret",
  AUTH_EXTERNAL_JWT_SECRET: "auth.externalJwtSecret",

  SECURITY_TICKET_QR_SECRET: "security.ticketQrSecret",

  PAYMENTS_MOLLIE_API_KEY: "payments.mollie.apiKey",
  PAYMENTS_STRIPE_SECRET_KEY: "payments.stripe.secretKey",
  PAYMENTS_STRIPE_WEBHOOK_SECRET: "payments.stripe.webhookSecret",

  MAIL_SMTP_PASSWORD: "mail.smtp.pass",
  MAIL_RESEND_API_KEY: "mail.resend.apiKey",

  STORAGE_PUBLIC_ACCESS_KEY_ID: "storage.public.accessKeyId",
  STORAGE_PUBLIC_SECRET_ACCESS_KEY: "storage.public.secretAccessKey",

  STORAGE_PRIVATE_ACCESS_KEY_ID: "storage.private.accessKeyId",
  STORAGE_PRIVATE_SECRET_ACCESS_KEY: "storage.private.secretAccessKey",
});

function defineSecret({
  environmentVariableNames = [],
  minimumLength = null,
} = {}) {
  return Object.freeze({
    environmentVariableNames: Object.freeze([...environmentVariableNames]),

    minimumLength:
      Number.isInteger(minimumLength) && minimumLength > 0
        ? minimumLength
        : null,
  });
}

export const KIWI_EVENTS_SECRET_DEFINITIONS = Object.freeze({
  [KIWI_EVENTS_SECRET_PATHS.DATABASE_MONGODB_URI]: defineSecret({
    environmentVariableNames: [
      "KIWI_EVENTS_DATABASE_URI",
      "DATABASE_URL",
      "MONGODB_URI",
    ],
  }),

  [KIWI_EVENTS_SECRET_PATHS.DATABASE_MYSQL_URI]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_DATABASE_URI", "DATABASE_URL"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.DATABASE_MARIADB_URI]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_DATABASE_URI", "DATABASE_URL"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.AUTH_LOCAL_JWT_SECRET]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_LOCAL_JWT_SECRET"],
    minimumLength: 32,
  }),

  [KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_EXTERNAL_JWT_SECRET"],
    minimumLength: 32,
  }),

  [KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_TICKET_QR_SECRET"],
    minimumLength: 32,
  }),

  [KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_MOLLIE_API_KEY", "MOLLIE_API_KEY"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_SECRET_KEY]: defineSecret({
    environmentVariableNames: [
      "KIWI_EVENTS_STRIPE_SECRET_KEY",
      "STRIPE_SECRET_KEY",
    ],
  }),

  [KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_WEBHOOK_SECRET]: defineSecret({
    environmentVariableNames: [
      "KIWI_EVENTS_STRIPE_WEBHOOK_SECRET",
      "STRIPE_WEBHOOK_SECRET",
    ],
  }),

  [KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_MAIL_SMTP_PASS"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.MAIL_RESEND_API_KEY]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_MAIL_RESEND_API_KEY"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_STORAGE_PUBLIC_ACCESS_KEY_ID"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_STORAGE_PUBLIC_SECRET_ACCESS_KEY"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_STORAGE_PRIVATE_ACCESS_KEY_ID"],
  }),

  [KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY]: defineSecret({
    environmentVariableNames: ["KIWI_EVENTS_STORAGE_PRIVATE_SECRET_ACCESS_KEY"],
  }),
});

export const KIWI_EVENTS_SECRET_PATH_VALUES = Object.freeze(
  Object.values(KIWI_EVENTS_SECRET_PATHS),
);
export const KIWI_EVENTS_SYSTEM_CONFIG_SECRET_PATH_VALUES = Object.freeze([
  KIWI_EVENTS_SECRET_PATHS.AUTH_LOCAL_JWT_SECRET,
  KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,

  KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,

  KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY,
  KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_SECRET_KEY,
  KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_WEBHOOK_SECRET,

  KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD,
  KIWI_EVENTS_SECRET_PATHS.MAIL_RESEND_API_KEY,

  KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID,
  KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY,

  KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID,
  KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY,
]);

const KIWI_EVENTS_SYSTEM_CONFIG_SECRET_PATH_SET = new Set(
  KIWI_EVENTS_SYSTEM_CONFIG_SECRET_PATH_VALUES,
);
const KIWI_EVENTS_SECRET_PATH_SET = new Set(KIWI_EVENTS_SECRET_PATH_VALUES);

function normalizeSecretPath(value) {
  return String(value ?? "").trim();
}

export function isKiwiEventsSecretPath(value) {
  return KIWI_EVENTS_SECRET_PATH_SET.has(normalizeSecretPath(value));
}

export function assertKiwiEventsSecretPath(value) {
  const secretPath = normalizeSecretPath(value);

  if (!KIWI_EVENTS_SECRET_PATH_SET.has(secretPath)) {
    throw new Error(
      `Unsupported Kiwi Events secret path "${secretPath || "<empty>"}".`,
    );
  }

  return secretPath;
}
export function isKiwiEventsSystemConfigSecretPath(value) {
  const secretPath = normalizeSecretPath(value);

  return KIWI_EVENTS_SYSTEM_CONFIG_SECRET_PATH_SET.has(secretPath);
}

export function assertKiwiEventsSystemConfigSecretPath(value) {
  const secretPath = assertKiwiEventsSecretPath(value);

  if (!KIWI_EVENTS_SYSTEM_CONFIG_SECRET_PATH_SET.has(secretPath)) {
    throw new Error(
      `Secret "${secretPath}" cannot be managed through the system config API.`,
    );
  }

  return secretPath;
}
export function getKiwiEventsSecretDefinition(value) {
  const secretPath = assertKiwiEventsSecretPath(value);

  const definition = KIWI_EVENTS_SECRET_DEFINITIONS[secretPath];

  if (!definition) {
    throw new Error(
      `Missing Kiwi Events secret definition for "${secretPath}".`,
    );
  }

  return definition;
}

export function getKiwiEventsSecretEnvironmentVariableNames(value) {
  const definition = getKiwiEventsSecretDefinition(value);

  return [...definition.environmentVariableNames];
}
