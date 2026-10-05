import { randomUUID } from "node:crypto";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_REFUND_STATUSES,
} from "../payments/payment.constants.js";
import { createPaymentRefund as createProviderPaymentRefund } from "../payments/payment.service.js";
import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_SOURCE_TYPE_VALUES,
  PAYMENT_REFUND_STATUS,
} from "./paymentRefund.constants.js";
import { sendPaymentRefundCompletedMailSafe } from "./paymentRefund.mail.service.js";
import {
  paymentRefundInvalidInputError,
  paymentRefundLedgerCollisionError,
  paymentRefundReplayConflictError,
} from "./paymentRefund.errors.js";
import {
  claimPaymentRefund,
  completePaymentRefund,
  createPaymentRefund,
  failPaymentRefund,
  findPaymentRefundById,
  findPaymentRefundByIdempotencyKey,
  findPaymentRefundBySource,
  isPaymentRefundUniqueConstraintError,
  markPaymentRefundManualReview,
  markPaymentRefundProviderSucceeded,
  recordPaymentRefundLocalFailure,
} from "./repositories/paymentRefund.repository.js";

export const PAYMENT_REFUND_LEASE_MS = 5 * 60 * 1000;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SUPPORTED_PROVIDERS = new Set([
  PAYMENT_PROVIDERS.MOLLIE,
  PAYMENT_PROVIDERS.STRIPE,
]);

function cleanRequiredString(value, { field, maxLength }) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw paymentRefundInvalidInputError({
      field,
      message: `${field} is required.`,
    });
  }

  if (normalized.length > maxLength) {
    throw paymentRefundInvalidInputError({
      field,
      message: `${field} must not exceed ${maxLength} characters.`,
    });
  }

  return normalized;
}

function cleanOptionalString(value, { field, maxLength }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return cleanRequiredString(value, {
    field,
    maxLength,
  });
}

function normalizeSourceType(value) {
  const sourceType = String(value || "")
    .trim()
    .toLowerCase();

  if (!PAYMENT_REFUND_SOURCE_TYPE_VALUES.includes(sourceType)) {
    throw paymentRefundInvalidInputError({
      field: "sourceType",
      message: "sourceType must be deposit_ticket or order.",
    });
  }

  return sourceType;
}

function normalizeProvider(value) {
  const provider = String(value || "")
    .trim()
    .toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw paymentRefundInvalidInputError({
      field: "provider",
      message: "provider must be mollie or stripe.",
    });
  }

  return provider;
}

function normalizeAmount(value) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw paymentRefundInvalidInputError({
      field: "amount",
      message: "amount must be a positive integer in minor currency units.",
    });
  }

  return amount;
}

function normalizeCurrency(value) {
  const currency = String(value || "EUR")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{3,10}$/.test(currency)) {
    throw paymentRefundInvalidInputError({
      field: "currency",
      message: "currency must contain 3 to 10 uppercase letters.",
    });
  }

  return currency;
}

function normalizeIdempotencyKey(value) {
  const idempotencyKey = cleanRequiredString(value, {
    field: "idempotencyKey",
    maxLength: 200,
  });

  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw paymentRefundInvalidInputError({
      field: "idempotencyKey",
      message:
        "idempotencyKey may only contain letters, numbers, dots, underscores, colons and hyphens.",
    });
  }

  return idempotencyKey;
}

function normalizeMetadata(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw paymentRefundInvalidInputError({
      field: "metadata",
      message: "metadata must be an object or null.",
    });
  }

  return value;
}

function buildPaymentRefundDefinition(input = {}) {
  const sourceType = normalizeSourceType(input.sourceType);
  const sourceId = cleanRequiredString(input.sourceId, {
    field: "sourceId",
    maxLength: 200,
  });
  const orderId = cleanRequiredString(input.orderId, {
    field: "orderId",
    maxLength: 200,
  });
  const ticketId = cleanOptionalString(input.ticketId, {
    field: "ticketId",
    maxLength: 200,
  });

  if (sourceType === PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET) {
    if (!ticketId) {
      throw paymentRefundInvalidInputError({
        field: "ticketId",
        message: "ticketId is required for deposit_ticket refunds.",
      });
    }

    if (sourceId !== ticketId) {
      throw paymentRefundInvalidInputError({
        field: "sourceId",
        message: "sourceId must equal ticketId for deposit_ticket refunds.",
      });
    }
  }

  if (sourceType === PAYMENT_REFUND_SOURCE_TYPE.ORDER) {
    if (ticketId) {
      throw paymentRefundInvalidInputError({
        field: "ticketId",
        message: "ticketId must be empty for order refunds.",
      });
    }

    if (sourceId !== orderId) {
      throw paymentRefundInvalidInputError({
        field: "sourceId",
        message: "sourceId must equal orderId for order refunds.",
      });
    }
  }

  return {
    sourceType,
    sourceId,
    orderId,
    ticketId,
    provider: normalizeProvider(input.provider),
    providerPaymentId: cleanRequiredString(input.providerPaymentId, {
      field: "providerPaymentId",
      maxLength: 300,
    }),
    providerRefundId: null,
    amount: normalizeAmount(input.amount),
    currency: normalizeCurrency(input.currency),
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    metadata: normalizeMetadata(input.metadata),
    triggeredByEventUserId: cleanOptionalString(
      input.triggeredByEventUserId || input.actor?.eventUserId,
      {
        field: "triggeredByEventUserId",
        maxLength: 200,
      },
    ),
  };
}

function compareImmutableDefinition(existing, definition) {
  const immutableFields = [
    "sourceType",
    "sourceId",
    "orderId",
    "ticketId",
    "provider",
    "providerPaymentId",
    "amount",
    "currency",
    "idempotencyKey",
  ];

  return immutableFields.filter((field) => {
    const existingValue = existing?.[field] ?? null;
    const definitionValue = definition?.[field] ?? null;

    return String(existingValue) !== String(definitionValue);
  });
}

function assertPaymentRefundReplayMatches(existing, definition) {
  const conflictingFields = compareImmutableDefinition(existing, definition);

  if (conflictingFields.length === 0) {
    return existing;
  }

  throw paymentRefundReplayConflictError({
    idempotencyKey: definition.idempotencyKey,
    sourceType: definition.sourceType,
    sourceId: definition.sourceId,
    conflictingFields,
  });
}

async function findExistingPaymentRefund(definition, options = {}) {
  const [byIdempotencyKey, bySource] = await Promise.all([
    findPaymentRefundByIdempotencyKey(definition.idempotencyKey, options),
    findPaymentRefundBySource(
      {
        sourceType: definition.sourceType,
        sourceId: definition.sourceId,
      },
      options,
    ),
  ]);

  if (byIdempotencyKey && bySource && byIdempotencyKey.id !== bySource.id) {
    throw paymentRefundLedgerCollisionError({
      idempotencyKey: definition.idempotencyKey,
      sourceType: definition.sourceType,
      sourceId: definition.sourceId,
    });
  }

  return byIdempotencyKey || bySource || null;
}

export async function ensurePaymentRefundService(input, options = {}) {
  const definition = buildPaymentRefundDefinition(input);
  const existing = await findExistingPaymentRefund(definition, options);

  if (existing) {
    return {
      created: false,
      paymentRefund: assertPaymentRefundReplayMatches(existing, definition),
    };
  }

  try {
    const paymentRefund = await createPaymentRefund(definition, options);

    return {
      created: true,
      paymentRefund,
    };
  } catch (error) {
    if (!isPaymentRefundUniqueConstraintError(error)) {
      throw error;
    }

    const racedExisting = await findExistingPaymentRefund(definition, options);

    if (!racedExisting) {
      throw error;
    }

    return {
      created: false,
      paymentRefund: assertPaymentRefundReplayMatches(
        racedExisting,
        definition,
      ),
    };
  }
}

export async function claimPaymentRefundService(
  { paymentRefundId, now = new Date(), leaseMs = PAYMENT_REFUND_LEASE_MS },
  options = {},
) {
  const claimedAt = new Date(now);
  const normalizedLeaseMs = Number(leaseMs);

  if (
    Number.isNaN(claimedAt.getTime()) ||
    !Number.isSafeInteger(normalizedLeaseMs) ||
    normalizedLeaseMs <= 0
  ) {
    throw paymentRefundInvalidInputError({
      field: "leaseMs",
      message: "leaseMs must be a positive safe integer.",
    });
  }

  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(claimedAt.getTime() + normalizedLeaseMs);
  const paymentRefund = await claimPaymentRefund(
    {
      paymentRefundId,
      leaseToken,
      now: claimedAt,
      leaseExpiresAt,
    },
    options,
  );

  if (!paymentRefund) {
    return null;
  }

  return {
    paymentRefund,
    leaseToken,
    leaseExpiresAt,
  };
}

export function recordPaymentRefundProviderSucceededService(
  {
    paymentRefundId,
    leaseToken,
    providerRefundId,
    providerSucceededAt = new Date(),
    leaseMs = PAYMENT_REFUND_LEASE_MS,
  },
  options = {},
) {
  const succeededAt = new Date(providerSucceededAt);
  const leaseExpiresAt = new Date(succeededAt.getTime() + Number(leaseMs));

  return markPaymentRefundProviderSucceeded(
    {
      paymentRefundId,
      leaseToken,
      providerRefundId: cleanRequiredString(providerRefundId, {
        field: "providerRefundId",
        maxLength: 300,
      }),
      providerSucceededAt: succeededAt,
      leaseExpiresAt,
    },
    options,
  );
}

export function completePaymentRefundService(input, options = {}) {
  return completePaymentRefund(input, options);
}

export function recordPaymentRefundProviderFailureService(input, options = {}) {
  return failPaymentRefund(input, options);
}

export function recordPaymentRefundLocalFailureService(input, options = {}) {
  return recordPaymentRefundLocalFailure(input, options);
}

export function markPaymentRefundManualReviewService(input, options = {}) {
  return markPaymentRefundManualReview(input, options);
}
export const PAYMENT_REFUND_RETRY_BASE_MS = 60 * 1000;
export const PAYMENT_REFUND_RETRY_MAX_MS = 60 * 60 * 1000;

const ACCEPTED_PROVIDER_REFUND_STATUSES = new Set([
  PAYMENT_REFUND_STATUSES.QUEUED,
  PAYMENT_REFUND_STATUSES.PENDING,
  PAYMENT_REFUND_STATUSES.PROCESSING,
  PAYMENT_REFUND_STATUSES.REFUNDED,
]);

const REJECTED_PROVIDER_REFUND_STATUSES = new Set([
  PAYMENT_REFUND_STATUSES.FAILED,
  PAYMENT_REFUND_STATUSES.CANCELED,
]);

const DEFINITIVE_LOCAL_PROVIDER_ERROR_CODES = new Set([
  "PAYMENT_PROVIDER_NOT_CONFIGURED",
  "PAYMENT_PROVIDER_DISABLED",
  "PAYMENT_PROVIDER_UNSUPPORTED",
  "MOLLIE_API_KEY_MISSING",
  "STRIPE_SECRET_KEY_MISSING",
  "INVALID_REFUND_AMOUNT",
  "PROVIDER_PAYMENT_ID_REQUIRED",
]);

function normalizeExecutionDate(value, field = "now") {
  const normalized = new Date(value);

  if (Number.isNaN(normalized.getTime())) {
    throw paymentRefundInvalidInputError({
      field,
      message: `${field} must be a valid date.`,
    });
  }

  return normalized;
}

function normalizeRetryDuration(value, field, fallback) {
  const normalized = value === undefined ? fallback : Number(value);

  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw paymentRefundInvalidInputError({
      field,
      message: `${field} must be a non-negative safe integer.`,
    });
  }

  return normalized;
}

function buildNextPaymentRefundRetryAt({
  now = new Date(),
  attemptCount = 1,
  retryBaseMs = PAYMENT_REFUND_RETRY_BASE_MS,
  retryMaxMs = PAYMENT_REFUND_RETRY_MAX_MS,
}) {
  const normalizedNow = normalizeExecutionDate(now);

  const normalizedBaseMs = normalizeRetryDuration(
    retryBaseMs,
    "retryBaseMs",
    PAYMENT_REFUND_RETRY_BASE_MS,
  );

  const normalizedMaxMs = normalizeRetryDuration(
    retryMaxMs,
    "retryMaxMs",
    PAYMENT_REFUND_RETRY_MAX_MS,
  );

  const normalizedAttemptCount = Math.max(1, Number(attemptCount) || 1);

  const exponent = Math.min(normalizedAttemptCount - 1, 20);

  const delayMs = Math.min(normalizedBaseMs * 2 ** exponent, normalizedMaxMs);

  return new Date(normalizedNow.getTime() + delayMs);
}

function getPaymentRefundErrorMessage(error, fallback) {
  return String(error?.message || error || fallback).slice(0, 4000);
}

function getProviderErrorStatusCode(error) {
  const value =
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.response?.statusCode;

  const statusCode = Number(value);

  return Number.isInteger(statusCode) ? statusCode : null;
}

function isDefinitiveProviderFailure(error) {
  if (error?.refundOutcome === "not_created") {
    return true;
  }

  if (error?.refundOutcome === "unknown") {
    return false;
  }

  if (DEFINITIVE_LOCAL_PROVIDER_ERROR_CODES.has(error?.code)) {
    return true;
  }

  const statusCode = getProviderErrorStatusCode(error);

  if (!statusCode) {
    return false;
  }

  if ([408, 409, 425, 429].includes(statusCode) || statusCode >= 500) {
    return false;
  }

  return statusCode >= 400 && statusCode < 500;
}

function normalizeProviderRefundOutcome(providerRefund) {
  const providerRefundId = cleanOptionalString(
    providerRefund?.providerRefundId || providerRefund?.id,
    {
      field: "providerRefundId",
      maxLength: 300,
    },
  );

  const status = String(providerRefund?.status || "")
    .trim()
    .toLowerCase();

  if (providerRefundId && ACCEPTED_PROVIDER_REFUND_STATUSES.has(status)) {
    return {
      kind: "accepted",
      providerRefundId,
      status,
    };
  }

  if (!providerRefundId && REJECTED_PROVIDER_REFUND_STATUSES.has(status)) {
    return {
      kind: "rejected",
      providerRefundId: null,
      status,
    };
  }

  return {
    kind: "unknown",
    providerRefundId,
    status: status || null,
  };
}

function buildClaimUnavailableResult(paymentRefund) {
  const status = paymentRefund?.status || null;

  if (status === PAYMENT_REFUND_STATUS.COMPLETED) {
    return {
      success: true,
      ignored: true,
      reason: "refund_already_completed",
      paymentRefund,
      providerRefund: null,
      localResult: null,
    };
  }

  if (status === PAYMENT_REFUND_STATUS.MANUAL_REVIEW) {
    return {
      success: false,
      ignored: true,
      reason: "refund_requires_manual_review",
      paymentRefund,
      providerRefund: null,
      localResult: null,
    };
  }

  if (status === PAYMENT_REFUND_STATUS.FAILED) {
    return {
      success: false,
      ignored: true,
      reason: "refund_retry_not_due",
      paymentRefund,
      providerRefund: null,
      localResult: null,
    };
  }

  return {
    success: false,
    ignored: true,
    reason: "refund_in_progress",
    paymentRefund,
    providerRefund: null,
    localResult: null,
  };
}

async function requirePaymentRefundTransition(result, message) {
  if (result) {
    return result;
  }

  throw new Error(message);
}

async function persistPaymentRefundManualReview({
  paymentRefundId,
  leaseToken = null,
  providerRefundId = null,
  providerSucceededAt = null,
  error,
  failedAt = new Date(),
}) {
  let paymentRefund = await markPaymentRefundManualReviewService({
    paymentRefundId,
    leaseToken,
    providerRefundId,
    providerSucceededAt,
    error,
    failedAt,
  });

  /*
   * Der Provider kann bereits erfolgreich gewesen sein,
   * während unser Lease inzwischen abgelaufen oder
   * übernommen worden ist.
   *
   * In diesem Fall stoppen wir automatische Auszahlungen
   * hart über manual_review.
   */
  if (!paymentRefund && leaseToken) {
    paymentRefund = await markPaymentRefundManualReviewService({
      paymentRefundId,
      providerRefundId,
      providerSucceededAt,
      error,
      failedAt,
    });
  }

  return requirePaymentRefundTransition(
    paymentRefund,
    "Payment refund could not be moved to manual review.",
  );
}

export async function executePaymentRefundService({
  sourceType,
  sourceId,
  orderId,
  ticketId = null,

  provider,
  providerPaymentId,

  amount,
  currency = "EUR",

  idempotencyKey,
  description = null,
  metadata = null,

  actor = null,

  finalizeLocalState,

  now = new Date(),
  leaseMs = PAYMENT_REFUND_LEASE_MS,

  retryBaseMs = PAYMENT_REFUND_RETRY_BASE_MS,

  retryMaxMs = PAYMENT_REFUND_RETRY_MAX_MS,
}) {
  if (typeof finalizeLocalState !== "function") {
    throw paymentRefundInvalidInputError({
      field: "finalizeLocalState",
      message: "finalizeLocalState must be a function.",
    });
  }

  const executionStartedAt = normalizeExecutionDate(now);

  /*
   * Dieser Schritt geschieht zwingend vor jedem
   * externen Provider-Aufruf.
   */
  const ensured = await ensurePaymentRefundService({
    sourceType,
    sourceId,
    orderId,
    ticketId,

    provider,
    providerPaymentId,

    amount,
    currency,

    idempotencyKey,
    metadata,
    actor,
  });

  const paymentRefundId = ensured.paymentRefund.id;

  const claim = await claimPaymentRefundService({
    paymentRefundId,
    now: executionStartedAt,
    leaseMs,
  });

  if (!claim) {
    const current = await findPaymentRefundById(paymentRefundId, {
      lean: true,
    });

    const resolvedPaymentRefund = current || ensured.paymentRefund;

    if (
      resolvedPaymentRefund?.status === PAYMENT_REFUND_STATUS.COMPLETED &&
      resolvedPaymentRefund?.sourceType === PAYMENT_REFUND_SOURCE_TYPE.ORDER
    ) {
      await sendPaymentRefundCompletedMailSafe({
        paymentRefund: resolvedPaymentRefund,
        context: {
          eventUserId: actor?.eventUserId || null,
        },
      });
    }

    return buildClaimUnavailableResult(resolvedPaymentRefund);
  }

  let claimedPaymentRefund = claim.paymentRefund;

  let providerRefund = null;

  /*
   * processing bedeutet:
   * Der Provider wurde für diesen Ledger-Datensatz
   * noch nicht nachweisbar erfolgreich aufgerufen.
   */
  if (claimedPaymentRefund.status === PAYMENT_REFUND_STATUS.PROCESSING) {
    try {
      providerRefund = await createProviderPaymentRefund({
        provider: claimedPaymentRefund.provider,

        providerPaymentId: claimedPaymentRefund.providerPaymentId,

        idempotencyKey: claimedPaymentRefund.idempotencyKey,

        /*
         * Das Ledger speichert Minor Units.
         * Der Payment-Service erwartet aktuell
         * Major Units.
         */
        amount: (Number(claimedPaymentRefund.amount) / 100).toFixed(2),

        currency: claimedPaymentRefund.currency,

        description:
          description ||
          `Refund ${claimedPaymentRefund.sourceType}:${claimedPaymentRefund.sourceId}`,

        metadata: claimedPaymentRefund.metadata || {},
      });
    } catch (error) {
      const failedAt = new Date();

      const errorMessage = getPaymentRefundErrorMessage(
        error,
        "Payment provider refund failed.",
      );

      /*
       * Nur eindeutig nicht ausgeführte Requests
       * dürfen automatisch erneut versucht werden.
       */
      if (isDefinitiveProviderFailure(error)) {
        await requirePaymentRefundTransition(
          recordPaymentRefundProviderFailureService({
            paymentRefundId,
            leaseToken: claim.leaseToken,

            error: errorMessage,
            failedAt,

            nextRetryAt: buildNextPaymentRefundRetryAt({
              now: failedAt,

              attemptCount: claimedPaymentRefund.attemptCount,

              retryBaseMs,
              retryMaxMs,
            }),
          }),

          "Payment refund lease was lost while recording a provider failure.",
        );
      } else {
        /*
         * Timeout, Netzwerkabbruch, 5xx oder
         * sonstiger unklarer Ausgang:
         *
         * Niemals blind erneut auszahlen.
         */
        await persistPaymentRefundManualReview({
          paymentRefundId,
          leaseToken: claim.leaseToken,

          error: errorMessage,
          failedAt,
        });
      }

      throw error;
    }

    const providerOutcome = normalizeProviderRefundOutcome(providerRefund);

    /*
     * Der Provider hat eindeutig abgelehnt und
     * keine Refund-Ressource erzeugt.
     */
    if (providerOutcome.kind === "rejected") {
      const error = new Error(
        `Payment provider rejected the refund with status ${providerOutcome.status}.`,
      );

      const failedAt = new Date();

      await requirePaymentRefundTransition(
        recordPaymentRefundProviderFailureService({
          paymentRefundId,
          leaseToken: claim.leaseToken,

          error: error.message,
          failedAt,

          nextRetryAt: buildNextPaymentRefundRetryAt({
            now: failedAt,

            attemptCount: claimedPaymentRefund.attemptCount,

            retryBaseMs,
            retryMaxMs,
          }),
        }),

        "Payment refund lease was lost while recording a rejected provider refund.",
      );

      throw error;
    }

    /*
     * Provider-ID ohne bekannten Status oder
     * Antwort ohne Provider-ID:
     *
     * Zustand ist nicht sicher automatisch
     * fortsetzbar.
     */
    if (providerOutcome.kind === "unknown") {
      const error = new Error(
        providerOutcome.providerRefundId
          ? `Payment provider returned refund ${providerOutcome.providerRefundId} with an unknown status.`
          : "Payment provider returned no durable refund id.",
      );

      await persistPaymentRefundManualReview({
        paymentRefundId,

        leaseToken: claim.leaseToken,

        providerRefundId: providerOutcome.providerRefundId,

        providerSucceededAt: providerOutcome.providerRefundId
          ? new Date()
          : null,

        error: error.message,
        failedAt: new Date(),
      });

      throw error;
    }

    /*
     * Wichtigste Persistenzgrenze:
     *
     * Erst nachdem providerRefundId dauerhaft
     * gespeichert ist, darf lokale Finalisierung
     * beginnen.
     */
    const providerSucceededAt = new Date();

    claimedPaymentRefund = await recordPaymentRefundProviderSucceededService({
      paymentRefundId,

      leaseToken: claim.leaseToken,

      providerRefundId: providerOutcome.providerRefundId,

      providerSucceededAt,
      leaseMs,
    });

    /*
     * Provider war erfolgreich, aber unser
     * Lease ging vor der Persistenz verloren.
     *
     * Automatische weitere Provider-Aufrufe
     * werden über manual_review gestoppt.
     */
    if (!claimedPaymentRefund) {
      const error = new Error(
        "Payment refund lease was lost after the provider accepted the refund.",
      );

      await persistPaymentRefundManualReview({
        paymentRefundId,

        providerRefundId: providerOutcome.providerRefundId,

        providerSucceededAt,

        error: error.message,
        failedAt: new Date(),
      });

      throw error;
    }
  } else {
    /*
     * provider_succeeded wurde erneut geclaimt.
     *
     * Der Provider darf jetzt ausdrücklich nicht
     * noch einmal aufgerufen werden.
     */
    providerRefund = {
      provider: claimedPaymentRefund.provider,

      providerPaymentId: claimedPaymentRefund.providerPaymentId,

      providerRefundId: claimedPaymentRefund.providerRefundId,

      status: PAYMENT_REFUND_STATUSES.REFUNDED,

      resumed: true,
    };
  }

  let localResult = null;
  let completed = null;

  try {
    localResult = await finalizeLocalState({
      paymentRefund: claimedPaymentRefund,

      providerRefund,
      actor,
    });

    completed = await requirePaymentRefundTransition(
      completePaymentRefundService({
        paymentRefundId,

        leaseToken: claim.leaseToken,

        completedAt: new Date(),
      }),

      "Payment refund lease was lost before local completion was persisted.",
    );
  } catch (error) {
    const failedAt = new Date();

    /*
     * Der Status bleibt provider_succeeded.
     *
     * Dadurch überspringt der nächste Retry
     * garantiert den Provider-Aufruf und führt
     * nur finalizeLocalState erneut aus.
     */
    await requirePaymentRefundTransition(
      recordPaymentRefundLocalFailureService({
        paymentRefundId,

        leaseToken: claim.leaseToken,

        error: getPaymentRefundErrorMessage(
          error,
          "Local payment refund finalization failed.",
        ),

        failedAt,

        nextRetryAt: buildNextPaymentRefundRetryAt({
          now: failedAt,

          attemptCount: claimedPaymentRefund.attemptCount,

          retryBaseMs,
          retryMaxMs,
        }),
      }),

      "Payment refund lease was lost while recording a local finalization failure.",
    );

    throw error;
  }

  if (completed.sourceType === PAYMENT_REFUND_SOURCE_TYPE.ORDER) {
    await sendPaymentRefundCompletedMailSafe({
      paymentRefund: completed,
      context: {
        eventUserId: actor?.eventUserId || null,
      },
    });
  }

  return {
    success: true,
    ignored: false,

    paymentRefund: completed,
    providerRefund,
    localResult,
  };
}
