export const EMAIL_TEMPLATE_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
});

export const EMAIL_LOG_STATUS = Object.freeze({
  QUEUED: "queued",
  SENDING: "sending",
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped",
  UNKNOWN: "unknown",
});

export const MAIL_TEMPLATE_KEYS = Object.freeze({
  ORDER_CONFIRMED: "order.confirmed",
  ORDER_CANCELLED: "order.cancelled",
  ORDER_REFUNDED: "order.refunded",
  EVENT_CANCELLED: "event.cancelled",
  EVENT_REMINDER_TOMORROW: "event.reminder.tomorrow",
});
export const EMAIL_MESSAGE_KEYS = Object.freeze({
  EVENT_CUSTOM: "event.custom",
});
export const EMAIL_DELIVERY_MODE = Object.freeze({
  ALWAYS: "always",
  ONCE_PER_SOURCE: "once_per_source",
});
export const EMAIL_DELIVERY_CLAIM_TTL_MS = 15 * 60 * 1000;
