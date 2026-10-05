export const PAYMENT_REFUND_SOURCE_TYPE = Object.freeze({
  DEPOSIT_TICKET: "deposit_ticket",
  ORDER: "order",
});

export const PAYMENT_REFUND_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  PROVIDER_SUCCEEDED: "provider_succeeded",
  COMPLETED: "completed",
  FAILED: "failed",
  MANUAL_REVIEW: "manual_review",
});

export const PAYMENT_REFUND_SOURCE_TYPE_VALUES = Object.freeze(
  Object.values(PAYMENT_REFUND_SOURCE_TYPE),
);

export const PAYMENT_REFUND_STATUS_VALUES = Object.freeze(
  Object.values(PAYMENT_REFUND_STATUS),
);
