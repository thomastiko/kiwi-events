// src/modules/payments/payment.service.js

import { env } from "../../config/env.js";
import { PAYMENT_PROVIDERS } from "./payment.constants.js";
import { getPaymentProvider } from "./providers/paymentProvider.registry.js";

import {
  invalidPaymentAmountError,
  invalidRefundAmountError,
  paymentProviderNotConfiguredError,
  paymentProviderWebhookUnsupportedError,
  providerPaymentIdRequiredError,
} from "./payment.errors.js";

/**
 * Resolves the requested provider or falls back to the configured default.
 *
 * @param {string|undefined|null} provider
 * @returns {string}
 */
function resolvePaymentProviderName(provider) {
  const providerName = String(
    provider || env.payments?.provider || PAYMENT_PROVIDERS.DISABLED,
  )
    .trim()
    .toLowerCase();

  if (!providerName || providerName === PAYMENT_PROVIDERS.DISABLED) {
    throw paymentProviderNotConfiguredError();
  }

  return providerName;
}

export function getPaymentProviderCheckoutConfig(provider) {
  const providerName = resolvePaymentProviderName(provider);

  if (providerName === PAYMENT_PROVIDERS.MOLLIE) {
    return {
      provider: providerName,
      redirectUrl: env.payments?.mollie?.redirectUrl || null,
      webhookUrl: env.payments?.mollie?.webhookUrl || null,
    };
  }

  if (providerName === PAYMENT_PROVIDERS.STRIPE) {
    return {
      provider: providerName,
      redirectUrl:
        env.payments?.stripe?.successUrl ||
        env.frontendUrl ||
        env.adminFrontendUrl ||
        null,
      webhookUrl: null,
    };
  }

  return {
    provider: providerName,
    redirectUrl: null,
    webhookUrl: null,
  };
}
/**
 * Normalizes a payment amount to a provider-safe decimal string.
 *
 * kiwi-events internally stores order totals in cents, but payment service callers
 * pass major currency units, e.g. 12.50 EUR.
 *
 * @param {number|string} value
 * @returns {string}
 */
function normalizeAmount(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw invalidPaymentAmountError();
  }

  return numericValue.toFixed(2);
}

function assertProviderPaymentId(providerPaymentId) {
  if (!providerPaymentId || !String(providerPaymentId).trim()) {
    throw providerPaymentIdRequiredError();
  }
}

function normalizeRefundAmount(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw invalidRefundAmountError();
  }

  return numericValue.toFixed(2);
}

/**
 * Creates a payment session with the active payment provider.
 *
 * @param {object} params
 * @param {string} [params.provider]
 * @param {number|string} params.amount
 * @param {string} [params.currency]
 * @param {string} params.description
 * @param {string} params.orderId
 * @param {string} params.redirectUrl
 * @param {string} [params.webhookUrl]
 * @param {object} [params.metadata]
 * @returns {Promise<object>}
 */
export async function createPaymentSession({
  provider,
  amount,
  currency = "EUR",
  description,
  orderId,
  redirectUrl,
  webhookUrl,
  metadata = {},
}) {
  const providerName = resolvePaymentProviderName(provider);
  const paymentProvider = await getPaymentProvider(providerName);
  const normalizedAmount = normalizeAmount(amount);

  return paymentProvider.createPaymentSession({
    amount: normalizedAmount,
    currency,
    description,
    orderId,
    redirectUrl,
    webhookUrl,
    metadata,
  });
}

/**
 * Retrieves the current state of a payment session from the payment provider.
 *
 * @param {object} params
 * @param {string} [params.provider]
 * @param {string} params.providerPaymentId
 * @returns {Promise<object>}
 */
export async function getPaymentSession({ provider, providerPaymentId }) {
  assertProviderPaymentId(providerPaymentId);

  const providerName = resolvePaymentProviderName(provider);
  const paymentProvider = await getPaymentProvider(providerName);

  return paymentProvider.getPaymentSession({
    providerPaymentId,
  });
}
/**
 * Cancels or expires an active payment session at the payment provider.
 *
 * The concrete provider decides how the payment flow is terminated:
 * - Mollie: cancel payment
 * - Stripe: expire Checkout Session
 *
 * @param {object} params
 * @param {string} [params.provider]
 * @param {string} params.providerPaymentId
 * @returns {Promise<object>}
 */
export async function cancelPaymentSession({ provider, providerPaymentId }) {
  assertProviderPaymentId(providerPaymentId);

  const providerName = resolvePaymentProviderName(provider);
  const paymentProvider = await getPaymentProvider(providerName);

  return paymentProvider.cancelPaymentSession({
    providerPaymentId,
  });
}
/**
 * Creates a refund with the active payment provider.
 *
 * @param {object} params
 * @param {string} [params.provider]
 * @param {string} params.providerPaymentId
 * @param {number|string} params.amount
 * @param {string} [params.currency]
 * @param {string} [params.description]
 * @param {object} [params.metadata]
 * @returns {Promise<object>}
 */
export async function createPaymentRefund({
  provider,
  providerPaymentId,
  idempotencyKey,
  amount,
  currency = "EUR",
  description,
  metadata = {},
}) {
  assertProviderPaymentId(providerPaymentId);

  const normalizedAmount = normalizeRefundAmount(amount);

  const providerName = resolvePaymentProviderName(provider);
  const paymentProvider = await getPaymentProvider(providerName);

  return paymentProvider.createRefund({
    providerPaymentId,
    idempotencyKey,
    amount: normalizedAmount,
    currency,
    description,
    metadata,
  });
}

/**
 * Parses and normalizes a provider webhook payload.
 *
 * @param {object} params
 * @param {string} params.provider
 * @param {object} params.body
 * @param {object} [params.headers]
 * @param {Buffer|string} [params.rawBody]
 * @returns {Promise<{provider: string, providerPaymentId: string|null, eventType: string|null, rawEvent?: object}>}
 */
export async function parsePaymentWebhook({
  provider,
  body,
  headers = {},
  rawBody = null,
}) {
  const providerName = resolvePaymentProviderName(provider);
  const paymentProvider = await getPaymentProvider(providerName);

  if (typeof paymentProvider.parseWebhook !== "function") {
    throw paymentProviderWebhookUnsupportedError(providerName);
  }

  return paymentProvider.parseWebhook({
    body,
    headers,
    rawBody,
  });
}
