export const TICKET_STATUS = Object.freeze({
  ACTIVE: "active",
  CHECKED_IN: "checked_in",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
});
export const TICKET_CHECK_IN_STATE = Object.freeze({
  ALLOWED: "allowed",

  ALREADY_CHECKED_IN: "already_checked_in",

  CANCELLED: "cancelled",

  REFUNDED: "refunded",
});
export const TICKET_BUYER_TYPE = Object.freeze({
  GUEST: "guest",
  EXTERNAL_USER: "external_user",
  MANUAL: "manual",
});

export const TICKET_KIND = Object.freeze({
  NORMAL: "normal",
  DEPOSIT: "deposit",
});

export const TICKET_DEPOSIT_REFUND_STATUS = Object.freeze({
  NOT_REQUIRED: "not_required",
  ELIGIBLE: "eligible",

  PROCESSING: "processing",
  PROVIDER_SUCCEEDED: "provider_succeeded",

  REFUNDED: "refunded",
  FAILED: "failed",
  MANUAL_REVIEW: "manual_review",
});

export const OFFICIAL_TICKET_DOCUMENT_STATUS = Object.freeze({
  MISSING: "missing",
  GENERATING: "generating",
  READY: "ready",
  FAILED: "failed",
});
