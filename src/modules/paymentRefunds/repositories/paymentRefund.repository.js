import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";

import { getDatabaseProvider } from "../../database/database.service.js";

import * as mongoPaymentRefundRepository from "./mongo.paymentRefund.repository.js";
import * as sqlPaymentRefundRepository from "./sql.paymentRefund.repository.js";

function getPaymentRefundRepositoryContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoPaymentRefundRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlPaymentRefundRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function toPlainPaymentRefundRecord(record) {
  if (!record) {
    return null;
  }

  if (typeof record.toObject === "function") {
    return record.toObject();
  }

  return record;
}

function normalizeRequiredId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot normalize PaymentRefund without ${fieldName}.`);
  }

  if (typeof value === "string") {
    const id = value.trim();

    if (!id) {
      throw new TypeError(
        `Cannot normalize PaymentRefund without ${fieldName}.`,
      );
    }

    return id;
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id) {
    throw new TypeError(`Cannot normalize PaymentRefund without ${fieldName}.`);
  }

  return id;
}

function toCanonicalPaymentRefundRecord(paymentRefund, provider) {
  const record = toPlainPaymentRefundRecord(paymentRefund);

  if (!record) {
    return null;
  }

  const id =
    provider === DATABASE_PROVIDER.MONGODB
      ? normalizeRequiredId(record._id, "MongoDB _id")
      : normalizeRequiredId(record.id, "SQL id");

  const { _id, __v, id: ignoredId, ...fields } = record;

  return {
    id,
    ...fields,
  };
}

export async function createPaymentRefund(data, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.createPaymentRefund(data, options);

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function findPaymentRefundById(id, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.findPaymentRefundById(id, options);

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function findPaymentRefundByIdempotencyKey(
  idempotencyKey,
  options = {},
) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.findPaymentRefundByIdempotencyKey(
    idempotencyKey,
    options,
  );

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function findPaymentRefundBySource(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.findPaymentRefundBySource(
    input,
    options,
  );

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}
export async function findPaymentRefundsByOrderId(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefunds = await repository.findPaymentRefundsByOrderId(
    input,
    options,
  );

  return (paymentRefunds || []).map((paymentRefund) =>
    toCanonicalPaymentRefundRecord(paymentRefund, provider),
  );
}
export async function claimPaymentRefund(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.claimPaymentRefund(input, options);

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function markPaymentRefundProviderSucceeded(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.markPaymentRefundProviderSucceeded(
    input,
    options,
  );

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function completePaymentRefund(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.completePaymentRefund(input, options);

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function failPaymentRefund(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.failPaymentRefund(input, options);

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function recordPaymentRefundLocalFailure(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.recordPaymentRefundLocalFailure(
    input,
    options,
  );

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export async function markPaymentRefundManualReview(input, options = {}) {
  const { provider, repository } = getPaymentRefundRepositoryContext();

  const paymentRefund = await repository.markPaymentRefundManualReview(
    input,
    options,
  );

  return toCanonicalPaymentRefundRecord(paymentRefund, provider);
}

export function isPaymentRefundUniqueConstraintError(error) {
  const { repository } = getPaymentRefundRepositoryContext();

  return repository.isPaymentRefundUniqueConstraintError(error);
}
