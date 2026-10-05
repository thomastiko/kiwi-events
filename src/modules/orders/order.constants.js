// src/modules/orders/order.constants.js

export const ORDER_BUYER_TYPE = Object.freeze({
  GUEST: "guest",
  EXTERNAL_USER: "external_user",
  MANUAL: "manual",
});

export const ORDER_STATUS = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

export const ORDER_FULFILLMENT_STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  MANUAL_REVIEW: "manual_review",
});

export const ORDER_FULFILLMENT_STEP = Object.freeze({
  TICKETS: "tickets",
  DOCUMENTS: "documents",
  MAIL: "mail",
  COMPLETED: "completed",
});

export const ORDER_PAYMENT_STATUS = Object.freeze({
  PENDING: "pending",
  NOT_REQUIRED: "not_required",
  PAID: "paid",
  FAILED: "failed",
  EXPIRED: "expired",
  REFUNDED: "refunded",
});

export const ORDER_REFUND_STATUS = Object.freeze({
  NONE: "none",
  PENDING: "pending",
  PROCESSING: "processing",
  PROVIDER_SUCCEEDED: "provider_succeeded",
  COMPLETED: "completed",
  FAILED: "failed",
  MANUAL_REVIEW: "manual_review",
});

export const ORDER_PAYMENT_PROVIDER = Object.freeze({
  NONE: "none",
  MOLLIE: "mollie",
  STRIPE: "stripe",
});

export const ORDER_SOURCE = Object.freeze({
  PUBLIC: "public",
  MANUAL: "manual",
});
export const ORDER_MAIL_RESEND_TYPE = Object.freeze({
  CONFIRMED: "order.confirmed",
  CANCELLED: "order.cancelled",
  REFUNDED: "order.refunded",
  EVENT_CANCELLED: "event.cancelled",
});

export const ORDER_MAIL_RESEND_TYPE_VALUES = Object.freeze(
  Object.values(ORDER_MAIL_RESEND_TYPE),
);
