export const KIWI_EVENTS_DATABASE_PROVIDERS = Object.freeze({
  MONGODB: "mongodb",
  MYSQL: "mysql",
  MARIADB: "mariadb",
});

export const KIWI_EVENTS_DATABASE_PROVIDER_VALUES = Object.values(
  KIWI_EVENTS_DATABASE_PROVIDERS,
);

export const KIWI_EVENTS_PAYMENT_PROVIDERS = Object.freeze({
  DISABLED: "disabled",
  STRIPE: "stripe",
  MOLLIE: "mollie",
});

export const KIWI_EVENTS_PAYMENT_PROVIDER_VALUES = Object.values(
  KIWI_EVENTS_PAYMENT_PROVIDERS,
);

export const KIWI_EVENTS_MAIL_PROVIDERS = Object.freeze({
  DISABLED: "disabled",
  SMTP: "smtp",
  RESEND: "resend",
});

export const KIWI_EVENTS_MAIL_PROVIDER_VALUES = Object.values(
  KIWI_EVENTS_MAIL_PROVIDERS,
);

export const KIWI_EVENTS_AUTH_PROVIDERS = Object.freeze({
  LOCAL: "local",
  EXTERNAL: "external-jwt",
  HYBRID: "hybrid",
});

export const KIWI_EVENTS_AUTH_PROVIDER_VALUES = Object.values(
  KIWI_EVENTS_AUTH_PROVIDERS,
);
