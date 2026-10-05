// src/modules/payments/payment.constants.js

export const PAYMENT_PROVIDERS = Object.freeze({
  DISABLED: "disabled",
  MOLLIE: "mollie",
  STRIPE: "stripe",
});

export const PAYMENT_SESSION_STATUSES = Object.freeze({
  OPEN: "open",
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  CANCELED: "canceled",
  EXPIRED: "expired",
  REFUNDED: "refunded",
});

export const PAYMENT_REFUND_STATUSES = Object.freeze({
  QUEUED: "queued",
  PENDING: "pending",
  PROCESSING: "processing",
  REFUNDED: "refunded",
  FAILED: "failed",
  CANCELED: "canceled",
});
