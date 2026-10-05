import {
  KIWI_EVENTS_DATABASE_PROVIDERS,
  KIWI_EVENTS_MAIL_PROVIDERS,
  KIWI_EVENTS_PAYMENT_PROVIDERS,
} from "./kiwi-events.config.constants.js";

export const KIWI_EVENTS_CONFIG_DEFAULTS = {
  setup: {
    initialized: false,
    initializedAt: null,
  },

  server: {
    nodeEnv: "development",
    port: 5001,
    appUrl: "http://localhost:5001",
    adminFrontendUrl: "http://localhost:5001/admin",
    publicFrontendUrl: "",
    corsOrigin: ["http://localhost:5001", "http://127.0.0.1:5001"],
  },

  database: {
    provider: "",

    [KIWI_EVENTS_DATABASE_PROVIDERS.MONGODB]: {},
    [KIWI_EVENTS_DATABASE_PROVIDERS.MYSQL]: {},
    [KIWI_EVENTS_DATABASE_PROVIDERS.MARIADB]: {},
  },

  security: {},

  auth: {
    provider: "hybrid",
  },

  setupAdmin: {
    email: "admin@admin",
  },

  features: {
    mail: false,

    mailOrderConfirmation: true,
    mailOrderCancellation: true,
    mailOrderRefunded: true,
    mailEventCancellation: true,
    mailEventReminder: false,
    mailEventCustom: true,

    ticketing: true,
    guestCheckout: true,
    depositTickets: false,
    discountCodes: false,
    ticketPdf: true,
    media: true,

    ticketQr: false,
  },
  orders: {
    customerSelfServiceCancellation: {
      enabled: false,
      refundDeadlineDaysBeforeSession: null,
    },
  },

  mail: {
    provider: KIWI_EVENTS_MAIL_PROVIDERS.DISABLED,

    defaultFromName: "Kiwi Events",
    defaultFromEmail: "",
    defaultReplyTo: "",

    smtp: {
      host: "",
      port: 587,
      secure: false,
      user: "",
    },

    resend: {
      timeoutMs: 10000,
    },
  },

  payments: {
    provider: KIWI_EVENTS_PAYMENT_PROVIDERS.DISABLED,
    currency: "EUR",

    stripe: {
      successUrl: "",
      cancelUrl: "",
    },

    mollie: {
      webhookUrl: "",
      redirectUrl: "",
    },
  },

  storage: {
    local: {
      dir: "uploads",
    },

    public: {
      enabled: false,
      endpoint: "",
      region: "auto",
      bucket: "",
      publicBaseUrl: "",
      forcePathStyle: false,
    },

    private: {
      enabled: false,
      endpoint: "",
      region: "auto",
      bucket: "",
      forcePathStyle: false,
    },

    generated: {
      ticketPdfTarget: "local",
    },
  },

  branding: {
    appName: "Kiwi Events",
    locale: "en-US",
    defaultCurrency: "EUR",
    ticketTitle: "Event Ticket",
    ticketSubtitle: "Official confirmation for your booked event ticket.",
  },
};
