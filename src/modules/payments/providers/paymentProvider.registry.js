// src/modules/payments/providers/paymentProvider.registry.js

import { PAYMENT_PROVIDERS } from "../payment.constants.js";
import { disabledPaymentProvider } from "./disabled.payment.provider.js";
import { molliePaymentProvider } from "./mollie.payment.provider.js";
import { stripePaymentProvider } from "./stripe.payment.provider.js";
import { unsupportedPaymentProviderError } from "../payment.errors.js";

/**
 * Resolves a payment provider implementation by name.
 *
 * @param {string} provider
 * @returns {Promise<object>}
 */
export async function getPaymentProvider(provider) {
  switch (provider) {
    case PAYMENT_PROVIDERS.DISABLED:
      return disabledPaymentProvider;

    case PAYMENT_PROVIDERS.MOLLIE:
      return molliePaymentProvider;

    case PAYMENT_PROVIDERS.STRIPE:
      return stripePaymentProvider;

    default:
      throw unsupportedPaymentProviderError(provider);
  }
}
