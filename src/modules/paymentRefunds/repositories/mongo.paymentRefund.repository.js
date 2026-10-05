import { PaymentRefund } from "../paymentRefund.model.js";
import { PAYMENT_REFUND_STATUS } from "../paymentRefund.constants.js";

function getSession(options = {}) {
  return options?.session || options?.trx?.session || null;
}

function stripSecrets(paymentRefund, options = {}) {
  if (!paymentRefund || options.includeSecrets) {
    return paymentRefund;
  }

  const { leaseToken, ...safePaymentRefund } = paymentRefund;
  return safePaymentRefund;
}

function toObject(document, options = {}) {
  if (!document) return null;

  const paymentRefund = document.toObject ? document.toObject() : document;

  return stripSecrets(paymentRefund, options);
}

async function resolveQuery(query, options = {}) {
  if (options.select) {
    query.select(options.select);
  }

  if (options.includeSecrets) {
    query.select("+leaseToken");
  }

  const session = getSession(options);

  if (session) {
    query.session(session);
  }

  if (options.lean !== false) {
    const result = await query.lean();

    if (Array.isArray(result)) {
      return result.map((item) => stripSecrets(item, options));
    }

    return stripSecrets(result, options);
  }

  return query;
}

function buildRetryReadyQuery(now) {
  return {
    $or: [
      { nextRetryAt: null },
      { nextRetryAt: { $exists: false } },
      { nextRetryAt: { $lte: now } },
    ],
  };
}

function buildLeaseAvailableQuery(now) {
  return {
    $or: [
      { leaseToken: null },
      { leaseToken: { $exists: false } },
      { leaseExpiresAt: null },
      { leaseExpiresAt: { $exists: false } },
      { leaseExpiresAt: { $lte: now } },
    ],
  };
}

export async function createPaymentRefund(data, options = {}) {
  const document = new PaymentRefund(data);

  await document.save({
    session: getSession(options),
  });

  return toObject(document, options);
}

export function findPaymentRefundById(id, options = {}) {
  return resolveQuery(PaymentRefund.findById(id), options);
}

export function findPaymentRefundByIdempotencyKey(
  idempotencyKey,
  options = {},
) {
  return resolveQuery(
    PaymentRefund.findOne({
      idempotencyKey: String(idempotencyKey || "").trim(),
    }),
    options,
  );
}

export function findPaymentRefundBySource(
  { sourceType, sourceId },
  options = {},
) {
  return resolveQuery(
    PaymentRefund.findOne({
      sourceType,
      sourceId: String(sourceId || "").trim(),
    }),
    options,
  );
}
export function findPaymentRefundsByOrderId(
  { orderId, sourceType = null },
  options = {},
) {
  const filter = {
    orderId: String(orderId || "").trim(),
  };

  if (sourceType) {
    filter.sourceType = sourceType;
  }

  return resolveQuery(
    PaymentRefund.find(filter).sort({
      createdAt: 1,
    }),
    options,
  );
}
export async function claimPaymentRefund(
  { paymentRefundId, leaseToken, now = new Date(), leaseExpiresAt },
  options = {},
) {
  const session = getSession(options);

  const providerSucceededQuery = PaymentRefund.findOneAndUpdate(
    {
      _id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
      $and: [buildRetryReadyQuery(now), buildLeaseAvailableQuery(now)],
    },
    {
      $set: {
        leaseToken,
        leaseExpiresAt,
        lastError: null,
        failedAt: null,
        nextRetryAt: null,
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      new: true,
      runValidators: true,
      session,
    },
  );

  const providerSucceededRefund = await resolveQuery(providerSucceededQuery, {
    ...options,
    includeSecrets: true,
  });

  if (providerSucceededRefund) {
    return providerSucceededRefund;
  }

  const processingQuery = PaymentRefund.findOneAndUpdate(
    {
      _id: paymentRefundId,
      $or: [
        {
          status: PAYMENT_REFUND_STATUS.PENDING,
        },
        {
          $and: [
            { status: PAYMENT_REFUND_STATUS.FAILED },
            buildRetryReadyQuery(now),
          ],
        },
        {
          status: PAYMENT_REFUND_STATUS.PROCESSING,
          leaseExpiresAt: {
            $lte: now,
          },
        },
      ],
    },
    {
      $set: {
        status: PAYMENT_REFUND_STATUS.PROCESSING,
        leaseToken,
        leaseExpiresAt,
        lastError: null,
        failedAt: null,
        nextRetryAt: null,
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      new: true,
      runValidators: true,
      session,
    },
  );

  return resolveQuery(processingQuery, {
    ...options,
    includeSecrets: true,
  });
}

export function markPaymentRefundProviderSucceeded(
  {
    paymentRefundId,
    leaseToken,
    providerRefundId,
    providerSucceededAt = new Date(),
    leaseExpiresAt,
  },
  options = {},
) {
  const set = {
    status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
    providerRefundId,
    providerSucceededAt,
    lastError: null,
    failedAt: null,
    nextRetryAt: null,
  };

  if (leaseExpiresAt) {
    set.leaseExpiresAt = leaseExpiresAt;
  }

  const query = PaymentRefund.findOneAndUpdate(
    {
      _id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROCESSING,
      leaseToken,
    },
    {
      $set: set,
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return resolveQuery(query, {
    ...options,
    includeSecrets: true,
  });
}

export function completePaymentRefund(
  { paymentRefundId, leaseToken, completedAt = new Date() },
  options = {},
) {
  const query = PaymentRefund.findOneAndUpdate(
    {
      _id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
      leaseToken,
    },
    {
      $set: {
        status: PAYMENT_REFUND_STATUS.COMPLETED,
        completedAt,
        lastError: null,
        failedAt: null,
        nextRetryAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return resolveQuery(query, options);
}

export function failPaymentRefund(
  {
    paymentRefundId,
    leaseToken,
    error,
    failedAt = new Date(),
    nextRetryAt = null,
  },
  options = {},
) {
  const query = PaymentRefund.findOneAndUpdate(
    {
      _id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROCESSING,
      leaseToken,
      providerSucceededAt: null,
    },
    {
      $set: {
        status: PAYMENT_REFUND_STATUS.FAILED,
        lastError: String(error || "").slice(0, 4000),
        failedAt,
        nextRetryAt,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return resolveQuery(query, options);
}

export function recordPaymentRefundLocalFailure(
  {
    paymentRefundId,
    leaseToken,
    error,
    failedAt = new Date(),
    nextRetryAt = null,
  },
  options = {},
) {
  const query = PaymentRefund.findOneAndUpdate(
    {
      _id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
      leaseToken,
    },
    {
      $set: {
        lastError: String(error || "").slice(0, 4000),
        failedAt,
        nextRetryAt,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return resolveQuery(query, options);
}

export function markPaymentRefundManualReview(
  {
    paymentRefundId,
    leaseToken = null,

    providerRefundId = null,
    providerSucceededAt = null,

    error,
    failedAt = new Date(),
  },
  options = {},
) {
  const filter = {
    _id: paymentRefundId,

    status: {
      $ne: PAYMENT_REFUND_STATUS.COMPLETED,
    },
  };

  if (leaseToken) {
    filter.leaseToken = leaseToken;
  }

  const set = {
    status: PAYMENT_REFUND_STATUS.MANUAL_REVIEW,

    lastError: String(error || "").slice(0, 4000),

    failedAt,
    nextRetryAt: null,

    leaseToken: null,
    leaseExpiresAt: null,
  };

  /*
   * Falls der Provider bereits eine Refund-ID
   * zurückgegeben hat, muss sie auch im
   * Manual-Review-Zustand dauerhaft erhalten
   * bleiben.
   */
  if (providerRefundId) {
    set.providerRefundId = providerRefundId;
  }

  if (providerSucceededAt) {
    set.providerSucceededAt = providerSucceededAt;
  }

  const query = PaymentRefund.findOneAndUpdate(
    filter,
    {
      $set: set,
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return resolveQuery(query, options);
}
export function isPaymentRefundUniqueConstraintError(error) {
  return error?.code === 11000;
}
