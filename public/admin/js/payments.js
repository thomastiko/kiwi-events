import { SECRET_PATHS } from "./constants.js";
import { els } from "./elements.js";

import { setInputValue, setSelectValue } from "./ui.js";

import { collectSecretInput } from "./secrets.js";

import { valueOrUndefined } from "./utils.js";

export function updatePaymentProviderFields() {
  const provider = els.paymentProvider?.value || "disabled";

  document
    .querySelectorAll("[data-payment-provider-field]")
    .forEach((field) => {
      field.classList.toggle(
        "hidden",
        field.dataset.paymentProviderField !== provider,
      );
    });
}

export function renderPaymentConfig(config = {}) {
  const payments = config.payments || {};

  setSelectValue(els.paymentProvider, payments.provider);

  setInputValue(els.paymentDefaultCurrency, payments.currency);

  setInputValue(els.paymentMollieRedirectUrl, payments.mollie?.redirectUrl);

  setInputValue(els.paymentMollieWebhookUrl, payments.mollie?.webhookUrl);

  setInputValue(els.paymentStripeSuccessUrl, payments.stripe?.successUrl);

  setInputValue(els.paymentStripeCancelUrl, payments.stripe?.cancelUrl);
}

export function collectPaymentPatch({ depositTickets = false } = {}) {
  const provider = els.paymentProvider?.value || "disabled";

  if (depositTickets && provider === "disabled") {
    throw new Error(
      "Deposit tickets require Mollie or Stripe as payment provider.",
    );
  }

  let secrets = {};

  if (provider === "mollie") {
    secrets = collectSecretInput(
      els.paymentMollieApiKey,
      SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY,
    );
  }

  if (provider === "stripe") {
    secrets = {
      ...collectSecretInput(
        els.paymentStripeSecretKey,
        SECRET_PATHS.PAYMENTS_STRIPE_SECRET_KEY,
      ),

      ...collectSecretInput(
        els.paymentStripeWebhookSecret,
        SECRET_PATHS.PAYMENTS_STRIPE_WEBHOOK_SECRET,
      ),
    };
  }

  return {
    config: {
      provider,

      currency: valueOrUndefined(els.paymentDefaultCurrency?.value),

      mollie:
        provider === "mollie"
          ? {
              redirectUrl: valueOrUndefined(
                els.paymentMollieRedirectUrl?.value,
              ),

              webhookUrl: valueOrUndefined(els.paymentMollieWebhookUrl?.value),
            }
          : undefined,

      stripe:
        provider === "stripe"
          ? {
              successUrl: valueOrUndefined(els.paymentStripeSuccessUrl?.value),

              cancelUrl: valueOrUndefined(els.paymentStripeCancelUrl?.value),
            }
          : undefined,
    },

    secrets,
  };
}
