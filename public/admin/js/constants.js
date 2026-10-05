export const SYSTEM_RESET_CONFIRMATION = "reset kiwi-events";

export const STORAGE_KEYS = {
  accessToken: "KIWI_EVENTS_admin_access_token",
  user: "KIWI_EVENTS_admin_user",
};

export const SECRET_PATHS = Object.freeze({
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

export const RESTART_REQUIRED_SECTIONS = new Set([
  "general",
  "ticketing",
  "mailing",
  "storage",
]);

export const DATABASE_EXAMPLES = {
  mongodb: {
    hint: "Example: mongodb://user:password@host:27017/database or mongodb+srv://...",
    setupHint: "MongoDB stores kiwi-events data in a document database.",
  },

  mariadb: {
    hint: "Example: mariadb://user:password@host:3306/database",
    setupHint:
      "MariaDB is supported through the SQL provider and mysql2 driver.",
  },

  mysql: {
    hint: "Example: mysql://user:password@host:3306/database",
    setupHint: "MySQL is supported through the SQL provider and mysql2 driver.",
  },
};
