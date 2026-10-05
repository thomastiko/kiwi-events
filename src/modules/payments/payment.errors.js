import { AppError } from "../../core/errors/AppError.js";

export function paymentProviderNotConfiguredError() {
  return new AppError({
    code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    title: "Payment provider not configured",
    message: "Payment provider is not configured.",
    statusCode: 503,
    expose: true,
    action: "Configure Mollie or Stripe in the kiwi-events payment settings.",
  });
}

export function invalidPaymentAmountError() {
  return AppError.badRequest("Invalid payment amount.", {
    code: "INVALID_PAYMENT_AMOUNT",
    title: "Invalid payment amount",
    action: "Use a valid payment amount greater than or equal to 0.",
    fields: [
      {
        path: "body.amount",
        message: "Amount must be a valid number greater than or equal to 0.",
      },
    ],
  });
}

export function providerPaymentIdRequiredError() {
  return AppError.badRequest("Provider payment id is required.", {
    code: "PROVIDER_PAYMENT_ID_REQUIRED",
    title: "Provider payment id required",
    action: "Provide the payment id returned by the payment provider.",
    fields: [
      {
        path: "body.providerPaymentId",
        message: "Provider payment id is required.",
      },
    ],
  });
}

export function invalidRefundAmountError() {
  return AppError.badRequest("Invalid refund amount.", {
    code: "INVALID_REFUND_AMOUNT",
    title: "Invalid refund amount",
    action: "Use a valid refund amount greater than 0.",
    fields: [
      {
        path: "body.amount",
        message: "Refund amount must be greater than 0.",
      },
    ],
  });
}

export function paymentProviderWebhookUnsupportedError(providerName) {
  return AppError.badRequest(
    `Payment provider does not support webhooks: ${providerName}.`,
    {
      code: "PAYMENT_PROVIDER_WEBHOOK_UNSUPPORTED",
      title: "Webhooks not supported",
      action: "Use a payment provider that supports webhooks.",
      details: {
        provider: providerName,
      },
    },
  );
}

export function paymentProviderDisabledError() {
  return AppError.forbidden("Payment provider is disabled.", {
    code: "PAYMENT_PROVIDER_DISABLED",
    title: "Payment provider disabled",
    action: "Configure an active payment provider before using payment flows.",
  });
}

export function mollieApiKeyMissingError() {
  return new AppError({
    code: "MOLLIE_API_KEY_MISSING",
    title: "Mollie API key missing",
    message: "Mollie API key is not configured.",
    statusCode: 500,
    expose: true,
    action: "Configure the Mollie API key in the kiwi-events payment settings.",
  });
}

export function unsupportedPaymentProviderError(provider) {
  return AppError.badRequest(`Unsupported payment provider: ${provider}.`, {
    code: "PAYMENT_PROVIDER_UNSUPPORTED",
    title: "Unsupported payment provider",
    action: "Choose one of the supported payment providers.",
    fields: [
      {
        path: "body.provider",
        message: "Choose a supported payment provider.",
      },
    ],
    details: {
      provider,
      supportedProviders: ["disabled", "mollie", "stripe"],
    },
  });
}

export function stripeSecretKeyMissingError() {
  return new AppError({
    code: "STRIPE_SECRET_KEY_MISSING",
    title: "Stripe secret key missing",
    message: "Stripe secret key is not configured.",
    statusCode: 500,
    expose: true,
    action:
      "Configure the Stripe secret key in the kiwi-events payment settings.",
  });
}
export function stripeWebhookSecretMissingError() {
  return new AppError({
    code: "STRIPE_WEBHOOK_SECRET_MISSING",
    title: "Stripe webhook secret missing",
    message: "Stripe webhook secret is required.",
    statusCode: 503,
    expose: true,
    action:
      "Configure payments.stripe.webhookSecret before accepting Stripe webhooks.",
  });
}

export function invalidStripeAmountError() {
  return AppError.badRequest("Invalid Stripe amount.", {
    code: "INVALID_STRIPE_AMOUNT",
    title: "Invalid Stripe amount",
    action: "Use a valid Stripe amount greater than or equal to 0.",
    fields: [
      {
        path: "body.amount",
        message: "Amount must be a valid number greater than or equal to 0.",
      },
    ],
  });
}

export function stripeSuccessUrlMissingError() {
  return new AppError({
    code: "STRIPE_SUCCESS_URL_MISSING",
    title: "Stripe success URL missing",
    message: "Stripe success URL is not configured.",
    statusCode: 500,
    expose: true,
    action:
      "Configure a Stripe success URL, frontend URL or admin frontend URL in the kiwi-events settings.",
  });
}

export function stripeCancelUrlMissingError() {
  return new AppError({
    code: "STRIPE_CANCEL_URL_MISSING",
    title: "Stripe cancel URL missing",
    message: "Stripe cancel URL is not configured.",
    statusCode: 500,
    expose: true,
    action:
      "Configure a Stripe cancel URL, frontend URL or admin frontend URL in the kiwi-events settings.",
  });
}

export function stripePaymentIntentMissingError() {
  return AppError.badRequest("Stripe payment intent could not be resolved.", {
    code: "STRIPE_PAYMENT_INTENT_MISSING",
    title: "Stripe payment intent missing",
    action:
      "Refresh the payment state and try again. The Checkout Session does not contain a PaymentIntent.",
  });
}

export function stripeWebhookSignatureMissingError() {
  return AppError.badRequest("Stripe webhook signature is missing.", {
    code: "STRIPE_WEBHOOK_SIGNATURE_MISSING",
    title: "Stripe webhook signature missing",
    action: "Make sure Stripe sends the stripe-signature header.",
  });
}

export function stripeRawWebhookBodyMissingError() {
  return new AppError({
    code: "STRIPE_RAW_WEBHOOK_BODY_MISSING",
    title: "Stripe raw webhook body missing",
    message: "Stripe raw webhook body is missing.",
    statusCode: 500,
    expose: true,
    action:
      "Configure the Express webhook route so the raw request body is available before JSON parsing.",
  });
}

export function stripeWebhookSignatureVerificationFailedError(message) {
  return AppError.badRequest(
    `Stripe webhook signature verification failed: ${message}.`,
    {
      code: "STRIPE_WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
      title: "Stripe webhook verification failed",
      action:
        "Check the configured Stripe webhook secret and make sure the raw request body is passed unchanged.",
      details: {
        reason: message,
      },
    },
  );
}
