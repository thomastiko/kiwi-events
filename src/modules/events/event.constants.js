// src/modules/events/event.constants.js

export const EVENT_CATEGORIES = {
  EVENT: "event",
  CONFERENCE: "conference",
  WORKSHOP: "workshop",
  COURSE: "course",
  PARTY: "party",
  SPORT: "sport",
  TRAVEL: "travel",
  CAREER: "career",
  COMMUNITY: "community",
  OTHER: "other",
};

export const EVENT_STATUSES = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
};
export const EVENT_CANCELLATION_REFUND_MODE = {
  NONE: "none",
  SELECTED: "selected",
  ALL: "all",
};
export const EVENT_CUSTOM_MAIL_AUDIENCE = {
  ALL: "all",
  SELECTED: "selected",
};
export const EVENT_VISIBILITIES = {
  PUBLIC: "public",
  PRIVATE: "private",
};

export const SESSION_STATUSES = {
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
};

export const ORDER_STATUSES = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  FAILED: "failed",
};

export const PAYMENT_STATUSES = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
};

export const CHECKIN_STATUSES = {
  SUCCESS: "success",
  DENIED: "denied",
  DUPLICATE: "duplicate",
};

export const EVENT_CATEGORY_VALUES = Object.values(EVENT_CATEGORIES);
export const EVENT_STATUS_VALUES = Object.values(EVENT_STATUSES);
export const EVENT_CANCELLATION_REFUND_MODE_VALUES = Object.values(
  EVENT_CANCELLATION_REFUND_MODE,
);
export const EVENT_CUSTOM_MAIL_AUDIENCE_VALUES = Object.values(
  EVENT_CUSTOM_MAIL_AUDIENCE,
);
export const EVENT_VISIBILITY_VALUES = Object.values(EVENT_VISIBILITIES);
export const SESSION_STATUS_VALUES = Object.values(SESSION_STATUSES);
export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUSES);
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUSES);
export const CHECKIN_STATUS_VALUES = Object.values(CHECKIN_STATUSES);
