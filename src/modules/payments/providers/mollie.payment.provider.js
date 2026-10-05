// src/modules/payments/providers/mollie.payment.provider.js

import { createMollieClient } from "@mollie/api-client";
import { env } from "../../../config/env.js";
import {
  PAYMENT_PROVIDERS,
  PAYMENT_REFUND_STATUSES,
  PAYMENT_SESSION_STATUSES,
} from "../payment.constants.js";
import { mollieApiKeyMissingError } from "../payment.errors.js";

/** @type {ReturnType<typeof createMollieClient>|null} */
let mollieClientInstance = null;

/**
 * Ensures Mollie is configured before calling the Mollie API.
 */
function assertMollieConfigured() {
  if (!env.payments.mollie.apiKey) {
    throw mollieApiKeyMissingError();
  }
}

/**
 * Returns a lazily initialized Mollie client.
 *
 * @returns {ReturnType<typeof createMollieClient>}
 */
function getMollieClient() {
  assertMollieConfigured();

  if (!mollieClientInstance) {
    mollieClientInstance = createMollieClient({
      apiKey: env.payments.mollie.apiKey,
    });
  }

  return mollieClientInstance;
}

/**
 * Maps a Mollie payment status to kiwi-events's normalized payment session status.
 *
 * @param {string} status
 * @returns {string}
 */
function mapMollieStatus(status) {
  switch (status) {
    case "paid":
      return PAYMENT_SESSION_STATUSES.PAID;
    case "open":
      return PAYMENT_SESSION_STATUSES.OPEN;
    case "pending":
      return PAYMENT_SESSION_STATUSES.PENDING;
    case "failed":
      return PAYMENT_SESSION_STATUSES.FAILED;
    case "canceled":
      return PAYMENT_SESSION_STATUSES.CANCELED;
    case "expired":
      return PAYMENT_SESSION_STATUSES.EXPIRED;
    default:
      return PAYMENT_SESSION_STATUSES.OPEN;
  }
}

/**
 * Maps a Mollie refund status to kiwi-events's normalized refund status.
 *
 * @param {string} status
 * @returns {string}
 */
function mapMollieRefundStatus(status) {
  switch (status) {
    case "queued":
      return PAYMENT_REFUND_STATUSES.QUEUED;
    case "pending":
      return PAYMENT_REFUND_STATUSES.PENDING;
    case "processing":
      return PAYMENT_REFUND_STATUSES.PROCESSING;
    case "refunded":
      return PAYMENT_REFUND_STATUSES.REFUNDED;
    case "failed":
      return PAYMENT_REFUND_STATUSES.FAILED;
    case "canceled":
      return PAYMENT_REFUND_STATUSES.CANCELED;
    default:
      return PAYMENT_REFUND_STATUSES.PENDING;
  }
}

/**
 * Creates a Mollie payment session.
 *
 * @param {object} params
 * @param {string} params.amount
 * @param {string} [params.currency]
 * @param {string} params.description
 * @param {string} params.orderId
 * @param {string} [params.redirectUrl]
 * @param {string} [params.webhookUrl]
 * @param {object} [params.metadata]
 * @returns {Promise<object>}
 */
async function createPaymentSession({
  amount,
  currency = "EUR",
  description,
  orderId,
  redirectUrl,
  webhookUrl,
  metadata = {},
}) {
  const mollieClient = getMollieClient();

  const payment = await mollieClient.payments.create({
    amount: {
      currency,
      value: amount,
    },
    description,
    redirectUrl: redirectUrl || env.payments.mollie.redirectUrl,
    webhookUrl: webhookUrl || env.payments.mollie.webhookUrl,
    metadata: {
      orderId: String(orderId),
      ...metadata,
    },
  });

  return {
    provider: PAYMENT_PROVIDERS.MOLLIE,
    providerPaymentId: payment.id,
    checkoutUrl: payment.getCheckoutUrl(),
    status: mapMollieStatus(payment.status),
    rawStatus: payment.status,
    rawPayment: payment,
  };
}

/**
 * Retrieves a Mollie payment session.
 *
 * @param {object} params
 * @param {string} params.providerPaymentId
 * @returns {Promise<object>}
 */
async function getPaymentSession({ providerPaymentId }) {
  const mollieClient = getMollieClient();
  const payment = await mollieClient.payments.get(providerPaymentId);

  return {
    provider: PAYMENT_PROVIDERS.MOLLIE,
    providerPaymentId: payment.id,
    checkoutUrl: payment.getCheckoutUrl?.() || null,
    status: mapMollieStatus(payment.status),
    rawStatus: payment.status,
    paidAt: payment.paidAt || null,
    rawPayment: payment,
  };
}
/**
 * Attempts to terminate an active Mollie payment.
 *
 * A payment that is already paid must never be treated as expired locally.
 * Terminal failed/canceled/expired payments are already safe to release.
 * Open/pending payments are canceled only when Mollie explicitly allows it.
 *
 * @param {object} params
 * @param {string} params.providerPaymentId
 * @returns {Promise<object>}
 */
async function cancelPaymentSession({ providerPaymentId }) {
  const mollieClient = getMollieClient();

  const payment = await mollieClient.payments.get(providerPaymentId);

  const status = mapMollieStatus(payment.status);

  if (status === PAYMENT_SESSION_STATUSES.PAID) {
    return {
      provider: PAYMENT_PROVIDERS.MOLLIE,
      providerPaymentId: payment.id,
      status,
      rawStatus: payment.status,
      terminated: false,
      terminal: true,
      paid: true,
      rawPayment: payment,
    };
  }

  if (
    status === PAYMENT_SESSION_STATUSES.CANCELED ||
    status === PAYMENT_SESSION_STATUSES.EXPIRED ||
    status === PAYMENT_SESSION_STATUSES.FAILED
  ) {
    return {
      provider: PAYMENT_PROVIDERS.MOLLIE,
      providerPaymentId: payment.id,
      status,
      rawStatus: payment.status,
      terminated: true,
      terminal: true,
      paid: false,
      rawPayment: payment,
    };
  }

  if (payment.isCancelable !== true) {
    return {
      provider: PAYMENT_PROVIDERS.MOLLIE,
      providerPaymentId: payment.id,
      status,
      rawStatus: payment.status,
      terminated: false,
      terminal: false,
      paid: false,
      rawPayment: payment,
    };
  }

  const canceledPayment = await mollieClient.payments.cancel(providerPaymentId);

  return {
    provider: PAYMENT_PROVIDERS.MOLLIE,
    providerPaymentId: canceledPayment.id,
    status: mapMollieStatus(canceledPayment.status),
    rawStatus: canceledPayment.status,
    terminated: true,
    terminal: true,
    paid: false,
    rawPayment: canceledPayment,
  };
}
/**
 * Creates a Mollie refund.
 *
 * @param {object} params
 * @param {string} params.providerPaymentId
 * @param {string} params.amount
 * @param {string} [params.currency]
 * @param {string} [params.description]
 * @param {object} [params.metadata]
 * @returns {Promise<object>}
 */
async function createRefund({
  providerPaymentId,
  amount,
  currency = "EUR",
  description,
  metadata = {},
  idempotencyKey,
}) {
  const mollieClient = getMollieClient();

  const refund = await mollieClient.paymentRefunds.create({
    paymentId: providerPaymentId,

    amount: {
      currency,
      value: amount,
    },

    description,
    metadata,

    ...(idempotencyKey
      ? {
          idempotencyKey: String(idempotencyKey),
        }
      : {}),
  });

  return {
    provider: PAYMENT_PROVIDERS.MOLLIE,
    providerPaymentId,
    providerRefundId: refund.id,
    status: mapMollieRefundStatus(refund.status),
    rawStatus: refund.status,
    amount: refund.amount || null,
    createdAt: refund.createdAt || null,
    rawRefund: refund,
  };
}

/**
 * Parses a Mollie webhook payload.
 *
 * Mollie sends the payment id as body.id.
 *
 * @param {object} params
 * @param {object} params.body
 * @returns {{provider: string, providerPaymentId: string|null, eventType: string|null, rawEvent: object}}
 */
function parseWebhook({ body }) {
  return {
    provider: PAYMENT_PROVIDERS.MOLLIE,
    providerPaymentId: body?.id || null,
    eventType: "payment.updated",
    rawEvent: body,
  };
}

export const molliePaymentProvider = {
  createPaymentSession,
  getPaymentSession,
  cancelPaymentSession,
  createRefund,
  parseWebhook,
};
