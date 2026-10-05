// src/modules/payments/providers/disabled.payment.provider.js

import { paymentProviderDisabledError } from "../payment.errors.js";

/**
 * Throws a consistent error when payments are enabled but no provider is active.
 */
function throwPaymentsDisabled() {
  throw paymentProviderDisabledError();
}

export const disabledPaymentProvider = {
  async createPaymentSession() {
    throwPaymentsDisabled();
  },

  async getPaymentSession() {
    throwPaymentsDisabled();
  },

  async createRefund() {
    throwPaymentsDisabled();
  },

  async parseWebhook() {
    throwPaymentsDisabled();
  },
};
