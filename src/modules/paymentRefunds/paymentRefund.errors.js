import { AppError } from "../../core/errors/AppError.js";

export function paymentRefundInvalidInputError({ field, message }) {
  return AppError.badRequest(message, {
    code: "PAYMENT_REFUND_INVALID_INPUT",
    title: "Invalid payment refund input",
    action: "Provide a valid persistent payment refund definition.",
    fields: field
      ? [
          {
            path: field,
            message,
          },
        ]
      : [],
  });
}

export function paymentRefundReplayConflictError({
  idempotencyKey,
  sourceType,
  sourceId,
  conflictingFields = [],
}) {
  return AppError.conflict(
    "The existing payment refund does not match this refund request.",
    {
      code: "PAYMENT_REFUND_REPLAY_CONFLICT",
      title: "Payment refund conflict",
      action:
        "Reuse an idempotency key only for the exact same refund source and amount.",
      details: {
        idempotencyKey,
        sourceType,
        sourceId,
        conflictingFields,
      },
    },
  );
}

export function paymentRefundLedgerCollisionError({
  idempotencyKey,
  sourceType,
  sourceId,
}) {
  return AppError.conflict(
    "Payment refund ledger identities point to different refund records.",
    {
      code: "PAYMENT_REFUND_LEDGER_COLLISION",
      title: "Payment refund ledger collision",
      action: "Move the affected refund to manual review before retrying it.",
      details: {
        idempotencyKey,
        sourceType,
        sourceId,
      },
    },
  );
}
