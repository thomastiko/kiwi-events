// src/modules/payments/providers/stripe.payment.provider.js

import Stripe from "stripe";
import { env } from "../../../config/env.js";
import {
  PAYMENT_PROVIDERS,
  PAYMENT_REFUND_STATUSES,
  PAYMENT_SESSION_STATUSES,
} from "../payment.constants.js";
import {
  invalidStripeAmountError,
  stripeCancelUrlMissingError,
  stripePaymentIntentMissingError,
  stripeRawWebhookBodyMissingError,
  stripeSecretKeyMissingError,
  stripeSuccessUrlMissingError,
  stripeWebhookSignatureMissingError,
  stripeWebhookSecretMissingError,
  stripeWebhookSignatureVerificationFailedError,
} from "../payment.errors.js";

/** @type {Stripe|null} */
let stripeClientInstance = null;

/**
 * Ensures Stripe is configured before calling the Stripe API.
 */
function assertStripeConfigured() {
  if (!env.payments.stripe.secretKey) {
    throw stripeSecretKeyMissingError();
  }
}

/**
 * Returns a lazily initialized Stripe client.
 *
 * @returns {Stripe}
 */
function getStripeClient() {
  assertStripeConfigured();

  if (!stripeClientInstance) {
    stripeClientInstance = new Stripe(env.payments.stripe.secretKey);
  }

  return stripeClientInstance;
}

/**
 * Converts a major-unit decimal amount to minor units.
 *
 * Example: "12.50" EUR -> 1250.
 *
 * @param {string|number} amount
 * @returns {number}
 */
function toMinorUnits(amount) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw invalidStripeAmountError();
  }

  return Math.round(numericAmount * 100);
}

/**
 * Maps Stripe Checkout Session status/payment status to kiwi-events status.
 *
 * @param {object} session
 * @returns {string}
 */
function mapStripeSessionStatus(session) {
  if (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  ) {
    return PAYMENT_SESSION_STATUSES.PAID;
  }

  if (session.status === "expired") {
    return PAYMENT_SESSION_STATUSES.EXPIRED;
  }

  if (session.status === "open" && session.payment_status === "unpaid") {
    return PAYMENT_SESSION_STATUSES.OPEN;
  }

  if (session.status === "complete" && session.payment_status === "unpaid") {
    return PAYMENT_SESSION_STATUSES.PENDING;
  }

  return PAYMENT_SESSION_STATUSES.PENDING;
}

/**
 * Maps Stripe refund status to kiwi-events's normalized refund status.
 *
 * @param {string} status
 * @returns {string}
 */
function mapStripeRefundStatus(status) {
  switch (status) {
    case "succeeded":
      return PAYMENT_REFUND_STATUSES.REFUNDED;
    case "pending":
      return PAYMENT_REFUND_STATUSES.PENDING;
    case "failed":
      return PAYMENT_REFUND_STATUSES.FAILED;
    case "canceled":
      return PAYMENT_REFUND_STATUSES.CANCELED;
    default:
      return PAYMENT_REFUND_STATUSES.PENDING;
  }
}
/**
 * Converts Stripe metadata values to strings and removes nullish entries.
 *
 * Stripe only accepts scalar string metadata values.
 *
 * @param {object} metadata
 * @returns {Record<string, string>}
 */
function normalizeStripeMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}
/**
 * Creates a Stripe Checkout Session.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
async function createPaymentSession({
  amount,
  currency = "EUR",
  description,
  orderId,
  redirectUrl,
  metadata = {},
}) {
  const stripe = getStripeClient();

  const successUrl =
    redirectUrl ||
    env.payments.stripe.successUrl ||
    env.frontendUrl ||
    env.adminFrontendUrl;

  const cancelUrl =
    env.payments.stripe.cancelUrl ||
    env.frontendUrl ||
    env.adminFrontendUrl ||
    successUrl;

  if (!successUrl) {
    throw stripeSuccessUrlMissingError();
  }

  if (!cancelUrl) {
    throw stripeCancelUrlMissingError();
  }

  const stripeMetadata = {
    ...metadata,
    orderId: String(orderId),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: toMinorUnits(amount),
          product_data: {
            name: description || `Order ${orderId}`,
          },
        },
      },
    ],
    metadata: stripeMetadata,
    payment_intent_data: {
      metadata: stripeMetadata,
    },
  });

  return {
    provider: PAYMENT_PROVIDERS.STRIPE,
    providerPaymentId: session.id,
    providerIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null,
    checkoutUrl: session.url,
    status: mapStripeSessionStatus(session),
    rawStatus: session.status,
    rawPayment: session,
  };
}

/**
 * Retrieves a Stripe Checkout Session.
 *
 * @param {object} params
 * @param {string} params.providerPaymentId
 * @returns {Promise<object>}
 */
async function getPaymentSession({ providerPaymentId }) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.retrieve(providerPaymentId, {
    expand: ["payment_intent.latest_charge"],
  });

  const paymentIntent =
    session.payment_intent && typeof session.payment_intent === "object"
      ? session.payment_intent
      : null;

  const latestCharge =
    paymentIntent?.latest_charge &&
    typeof paymentIntent.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;

  const paidAt =
    session.payment_status === "paid" && Number.isFinite(latestCharge?.created)
      ? new Date(latestCharge.created * 1000).toISOString()
      : null;

  return {
    provider: PAYMENT_PROVIDERS.STRIPE,
    providerPaymentId: session.id,

    providerIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null,

    checkoutUrl: session.url || null,
    status: mapStripeSessionStatus(session),
    rawStatus: session.status,
    paidAt,
    rawPayment: session,
  };
}
/**
 * Attempts to terminate an active Stripe Checkout Session.
 *
 * Paid sessions must never be expired locally.
 * Already expired sessions are safe to release.
 * Only open Checkout Sessions can be explicitly expired at Stripe.
 *
 * @param {object} params
 * @param {string} params.providerPaymentId
 * @returns {Promise<object>}
 */
async function cancelPaymentSession({ providerPaymentId }) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.retrieve(providerPaymentId);

  const status = mapStripeSessionStatus(session);

  if (status === PAYMENT_SESSION_STATUSES.PAID) {
    return {
      provider: PAYMENT_PROVIDERS.STRIPE,
      providerPaymentId: session.id,
      status,
      rawStatus: session.status,
      terminated: false,
      terminal: true,
      paid: true,
      rawPayment: session,
    };
  }

  if (status === PAYMENT_SESSION_STATUSES.EXPIRED) {
    return {
      provider: PAYMENT_PROVIDERS.STRIPE,
      providerPaymentId: session.id,
      status,
      rawStatus: session.status,
      terminated: true,
      terminal: true,
      paid: false,
      rawPayment: session,
    };
  }

  if (session.status !== "open") {
    return {
      provider: PAYMENT_PROVIDERS.STRIPE,
      providerPaymentId: session.id,
      status,
      rawStatus: session.status,
      terminated: false,
      terminal: false,
      paid: false,
      rawPayment: session,
    };
  }

  const expiredSession =
    await stripe.checkout.sessions.expire(providerPaymentId);

  return {
    provider: PAYMENT_PROVIDERS.STRIPE,
    providerPaymentId: expiredSession.id,
    status: mapStripeSessionStatus(expiredSession),
    rawStatus: expiredSession.status,
    terminated: true,
    terminal: true,
    paid: false,
    rawPayment: expiredSession,
  };
}
/**
 * Creates a Stripe refund.
 *
 * For Stripe Checkout Sessions, kiwi-events stores the Checkout Session id as
 * providerPaymentId. Refunds therefore resolve the underlying PaymentIntent
 * before creating the refund.
 *
 * @param {object} params
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
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.retrieve(providerPaymentId, {
    expand: ["payment_intent"],
  });

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  if (!paymentIntentId) {
    throw stripePaymentIntentMissingError();
  }

  const refundMetadata = {
    ...normalizeStripeMetadata(metadata),

    ...(description
      ? {
          description: String(description),
        }
      : {}),

    currency: String(currency || "EUR").toUpperCase(),
  };

  const refundPayload = {
    payment_intent: paymentIntentId,
    amount: toMinorUnits(amount),
    metadata: refundMetadata,
  };

  const refund = idempotencyKey
    ? await stripe.refunds.create(refundPayload, {
        idempotencyKey: String(idempotencyKey),
      })
    : await stripe.refunds.create(refundPayload);

  return {
    provider: PAYMENT_PROVIDERS.STRIPE,
    providerPaymentId,
    providerRefundId: refund.id,
    status: mapStripeRefundStatus(refund.status),
    rawStatus: refund.status,
    amount: refund.amount ?? null,

    createdAt: Number.isFinite(refund.created)
      ? new Date(refund.created * 1000).toISOString()
      : null,

    rawRefund: refund,
  };
}

const STRIPE_CHECKOUT_SESSION_EVENT_TYPES = Object.freeze({
  COMPLETED: "checkout.session.completed",
  ASYNC_PAYMENT_SUCCEEDED: "checkout.session.async_payment_succeeded",
  ASYNC_PAYMENT_FAILED: "checkout.session.async_payment_failed",
  EXPIRED: "checkout.session.expired",
});

const SUPPORTED_STRIPE_CHECKOUT_SESSION_EVENTS = new Set(
  Object.values(STRIPE_CHECKOUT_SESSION_EVENT_TYPES),
);

/**
 * Maps a supported Stripe Checkout webhook event to a normalized
 * kiwi-events payment status.
 *
 * @param {string|null} eventType
 * @param {object|null} session
 * @returns {string|null}
 */
function mapStripeWebhookStatus(eventType, session) {
  switch (eventType) {
    case STRIPE_CHECKOUT_SESSION_EVENT_TYPES.ASYNC_PAYMENT_SUCCEEDED:
      return PAYMENT_SESSION_STATUSES.PAID;

    case STRIPE_CHECKOUT_SESSION_EVENT_TYPES.ASYNC_PAYMENT_FAILED:
      return PAYMENT_SESSION_STATUSES.FAILED;

    case STRIPE_CHECKOUT_SESSION_EVENT_TYPES.EXPIRED:
      return PAYMENT_SESSION_STATUSES.EXPIRED;

    case STRIPE_CHECKOUT_SESSION_EVENT_TYPES.COMPLETED:
      return mapStripeSessionStatus(session || {});

    default:
      return null;
  }
}

/**
 * Verifies and normalizes a Stripe webhook.
 *
 * Only Checkout Session events are actionable because kiwi-events stores the
 * Checkout Session id as providerPaymentId. Other Stripe object ids, such as
 * PaymentIntent ids, must never be treated as Checkout Session ids.
 *
 * @param {object} params
 * @param {object} [params.headers]
 * @param {Buffer|string|null} [params.rawBody]
 * @returns {object}
 */
function parseWebhook({ headers = {}, rawBody = null }) {
  const stripe = getStripeClient();
  const webhookSecret = env.payments.stripe.webhookSecret;

  if (!webhookSecret) {
    throw stripeWebhookSecretMissingError();
  }

  const signature = headers["stripe-signature"];

  if (!signature) {
    throw stripeWebhookSignatureMissingError();
  }

  if (!rawBody) {
    throw stripeRawWebhookBodyMissingError();
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    throw stripeWebhookSignatureVerificationFailedError(
      error instanceof Error
        ? error.message
        : "Unknown Stripe verification error",
    );
  }

  const eventType = typeof event?.type === "string" ? event.type : null;

  if (!eventType || !SUPPORTED_STRIPE_CHECKOUT_SESSION_EVENTS.has(eventType)) {
    return {
      provider: PAYMENT_PROVIDERS.STRIPE,
      providerPaymentId: null,
      eventType,
      orderId: null,
      status: null,
      ignored: true,
      ignoreReason: "unsupported_event_type",
      rawEvent: event,
    };
  }

  const session = event?.data?.object || null;

  return {
    provider: PAYMENT_PROVIDERS.STRIPE,
    providerPaymentId: session?.id || null,
    eventType,
    orderId: session?.metadata?.orderId || null,
    status: mapStripeWebhookStatus(eventType, session),
    ignored: false,
    rawEvent: event,
  };
}

export const stripePaymentProvider = {
  createPaymentSession,
  getPaymentSession,
  cancelPaymentSession,
  createRefund,
  parseWebhook,
};
