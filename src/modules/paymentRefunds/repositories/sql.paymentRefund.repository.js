import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";
import { PAYMENT_REFUND_STATUS } from "../paymentRefund.constants.js";

function now() {
  return new Date();
}

function getDb(options = {}) {
  return options.trx || options.knex || getDatabaseConnection();
}

function parseJsonObject(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function stripSecrets(paymentRefund, options = {}) {
  if (!paymentRefund || options.includeSecrets) {
    return paymentRefund;
  }

  const { leaseToken, ...safePaymentRefund } = paymentRefund;
  return safePaymentRefund;
}

function mapPaymentRefundRow(row, options = {}) {
  if (!row) return null;

  return stripSecrets(
    {
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      orderId: row.order_id,
      ticketId: row.ticket_id || null,
      provider: row.provider,
      providerPaymentId: row.provider_payment_id,
      providerRefundId: row.provider_refund_id || null,
      amount: Number(row.amount || 0),
      currency: row.currency || "EUR",
      idempotencyKey: row.idempotency_key,
      status: row.status,
      attemptCount: Number(row.attempt_count || 0),
      leaseToken: row.lease_token || null,
      leaseExpiresAt: row.lease_expires_at || null,
      lastError: row.last_error || null,
      failedAt: row.failed_at || null,
      nextRetryAt: row.next_retry_at || null,
      providerSucceededAt: row.provider_succeeded_at || null,
      completedAt: row.completed_at || null,
      metadata: parseJsonObject(row.metadata),
      triggeredByEventUserId: row.triggered_by_event_user_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    options,
  );
}

function toPaymentRefundInsert(data) {
  const timestamp = now();

  return {
    id: data.id || randomUUID(),
    source_type: data.sourceType,
    source_id: data.sourceId,
    order_id: data.orderId,
    ticket_id: data.ticketId || null,
    provider: data.provider,
    provider_payment_id: data.providerPaymentId,
    provider_refund_id: data.providerRefundId || null,
    amount: Number(data.amount),
    currency: data.currency || "EUR",
    idempotency_key: data.idempotencyKey,
    status: data.status || PAYMENT_REFUND_STATUS.PENDING,
    attempt_count: Number(data.attemptCount || 0),
    lease_token: data.leaseToken || null,
    lease_expires_at: data.leaseExpiresAt || null,
    last_error: data.lastError || null,
    failed_at: data.failedAt || null,
    next_retry_at: data.nextRetryAt || null,
    provider_succeeded_at: data.providerSucceededAt || null,
    completed_at: data.completedAt || null,
    metadata: JSON.stringify(data.metadata ?? null),
    triggered_by_event_user_id: data.triggeredByEventUserId || null,
    created_at: data.createdAt || timestamp,
    updated_at: data.updatedAt || timestamp,
  };
}

async function findRowById(db, id) {
  return db("payment_refunds").where({ id }).first();
}

function addRetryReadyWhere(query, claimedAt) {
  query.whereNull("next_retry_at").orWhere("next_retry_at", "<=", claimedAt);
}

function addLeaseAvailableWhere(query, claimedAt) {
  query
    .whereNull("lease_token")
    .orWhereNull("lease_expires_at")
    .orWhere("lease_expires_at", "<=", claimedAt);
}

export async function createPaymentRefund(data, options = {}) {
  const db = getDb(options);
  const row = toPaymentRefundInsert(data);

  await db("payment_refunds").insert(row);

  return mapPaymentRefundRow(row, options);
}

export async function findPaymentRefundById(id, options = {}) {
  const db = getDb(options);
  const row = await findRowById(db, id);

  return mapPaymentRefundRow(row, options);
}

export async function findPaymentRefundByIdempotencyKey(
  idempotencyKey,
  options = {},
) {
  const db = getDb(options);
  const row = await db("payment_refunds")
    .where({
      idempotency_key: String(idempotencyKey || "").trim(),
    })
    .first();

  return mapPaymentRefundRow(row, options);
}

export async function findPaymentRefundBySource(
  { sourceType, sourceId },
  options = {},
) {
  const db = getDb(options);
  const row = await db("payment_refunds")
    .where({
      source_type: sourceType,
      source_id: String(sourceId || "").trim(),
    })
    .first();

  return mapPaymentRefundRow(row, options);
}
export async function findPaymentRefundsByOrderId(
  { orderId, sourceType = null },
  options = {},
) {
  const db = getDb(options);

  const query = db("payment_refunds")
    .where({
      order_id: String(orderId || "").trim(),
    })
    .orderBy("created_at", "asc");

  if (sourceType) {
    query.andWhere("source_type", sourceType);
  }

  const rows = await query;

  return rows.map((row) => mapPaymentRefundRow(row, options));
}
export async function claimPaymentRefund(
  { paymentRefundId, leaseToken, now: claimedAt = new Date(), leaseExpiresAt },
  options = {},
) {
  const db = getDb(options);

  const providerSucceededRows = await db("payment_refunds")
    .where({
      id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
    })
    .andWhere(function retryReady() {
      addRetryReadyWhere(this, claimedAt);
    })
    .andWhere(function leaseAvailable() {
      addLeaseAvailableWhere(this, claimedAt);
    })
    .update({
      lease_token: leaseToken,
      lease_expires_at: leaseExpiresAt,
      last_error: null,
      failed_at: null,
      next_retry_at: null,
      attempt_count: db.raw("attempt_count + 1"),
      updated_at: now(),
    });

  if (providerSucceededRows > 0) {
    return mapPaymentRefundRow(await findRowById(db, paymentRefundId), {
      ...options,
      includeSecrets: true,
    });
  }

  const processingRows = await db("payment_refunds")
    .where({ id: paymentRefundId })
    .andWhere(function eligibleRefund() {
      this.where("status", PAYMENT_REFUND_STATUS.PENDING)
        .orWhere(function failedRetry() {
          this.where("status", PAYMENT_REFUND_STATUS.FAILED).andWhere(
            function retryReady() {
              addRetryReadyWhere(this, claimedAt);
            },
          );
        })
        .orWhere(function staleProcessingLease() {
          this.where("status", PAYMENT_REFUND_STATUS.PROCESSING).andWhere(
            "lease_expires_at",
            "<=",
            claimedAt,
          );
        });
    })
    .update({
      status: PAYMENT_REFUND_STATUS.PROCESSING,
      lease_token: leaseToken,
      lease_expires_at: leaseExpiresAt,
      last_error: null,
      failed_at: null,
      next_retry_at: null,
      attempt_count: db.raw("attempt_count + 1"),
      updated_at: now(),
    });

  if (processingRows === 0) {
    return null;
  }

  return mapPaymentRefundRow(await findRowById(db, paymentRefundId), {
    ...options,
    includeSecrets: true,
  });
}

export async function markPaymentRefundProviderSucceeded(
  {
    paymentRefundId,
    leaseToken,
    providerRefundId,
    providerSucceededAt = new Date(),
    leaseExpiresAt,
  },
  options = {},
) {
  const db = getDb(options);
  const update = {
    status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
    provider_refund_id: providerRefundId,
    provider_succeeded_at: providerSucceededAt,
    last_error: null,
    failed_at: null,
    next_retry_at: null,
    updated_at: now(),
  };

  if (leaseExpiresAt) {
    update.lease_expires_at = leaseExpiresAt;
  }

  const updatedRows = await db("payment_refunds")
    .where({
      id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROCESSING,
      lease_token: leaseToken,
    })
    .update(update);

  if (updatedRows === 0) {
    return null;
  }

  const row = await findRowById(db, paymentRefundId);

  return mapPaymentRefundRow(row, {
    ...options,
    includeSecrets: true,
  });
}

export async function completePaymentRefund(
  { paymentRefundId, leaseToken, completedAt = new Date() },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("payment_refunds")
    .where({
      id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
      lease_token: leaseToken,
    })
    .update({
      status: PAYMENT_REFUND_STATUS.COMPLETED,
      completed_at: completedAt,
      last_error: null,
      failed_at: null,
      next_retry_at: null,
      lease_token: null,
      lease_expires_at: null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  return mapPaymentRefundRow(await findRowById(db, paymentRefundId), options);
}

export async function failPaymentRefund(
  {
    paymentRefundId,
    leaseToken,
    error,
    failedAt = new Date(),
    nextRetryAt = null,
  },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("payment_refunds")
    .where({
      id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROCESSING,
      lease_token: leaseToken,
    })
    .whereNull("provider_succeeded_at")
    .update({
      status: PAYMENT_REFUND_STATUS.FAILED,
      last_error: String(error || "").slice(0, 4000),
      failed_at: failedAt,
      next_retry_at: nextRetryAt,
      lease_token: null,
      lease_expires_at: null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  return mapPaymentRefundRow(await findRowById(db, paymentRefundId), options);
}

export async function recordPaymentRefundLocalFailure(
  {
    paymentRefundId,
    leaseToken,
    error,
    failedAt = new Date(),
    nextRetryAt = null,
  },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("payment_refunds")
    .where({
      id: paymentRefundId,
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
      lease_token: leaseToken,
    })
    .update({
      last_error: String(error || "").slice(0, 4000),
      failed_at: failedAt,
      next_retry_at: nextRetryAt,
      lease_token: null,
      lease_expires_at: null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  return mapPaymentRefundRow(await findRowById(db, paymentRefundId), options);
}

export async function markPaymentRefundManualReview(
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
  const db = getDb(options);

  const query = db("payment_refunds")
    .where({
      id: paymentRefundId,
    })
    .whereNot("status", PAYMENT_REFUND_STATUS.COMPLETED);

  if (leaseToken) {
    query.andWhere("lease_token", leaseToken);
  }

  const update = {
    status: PAYMENT_REFUND_STATUS.MANUAL_REVIEW,

    last_error: String(error || "").slice(0, 4000),

    failed_at: failedAt,
    next_retry_at: null,

    lease_token: null,
    lease_expires_at: null,

    updated_at: now(),
  };

  if (providerRefundId) {
    update.provider_refund_id = providerRefundId;
  }

  if (providerSucceededAt) {
    update.provider_succeeded_at = providerSucceededAt;
  }

  const updatedRows = await query.update(update);

  if (updatedRows === 0) {
    return null;
  }

  return mapPaymentRefundRow(await findRowById(db, paymentRefundId), options);
}

export function isPaymentRefundUniqueConstraintError(error) {
  return error?.code === "ER_DUP_ENTRY" || Number(error?.errno) === 1062;
}
