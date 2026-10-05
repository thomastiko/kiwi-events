import { PAYMENT_REFUND_STATUS } from "../paymentRefunds/paymentRefund.constants.js";

const FINANCIALLY_SUCCESSFUL_DEPOSIT_REFUND_STATUSES = new Set([
  PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
  PAYMENT_REFUND_STATUS.COMPLETED,
]);

export function normalizeRefundMinorAmount(value) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

export function buildOrderRefundIdempotencyKey(orderId) {
  return `order-refund:${String(orderId)}`;
}

export function summarizeDepositRefunds(paymentRefunds = []) {
  let alreadyRefundedDepositAmount = 0;

  const blockingDepositRefunds = [];

  for (const paymentRefund of paymentRefunds) {
    const amount = normalizeRefundMinorAmount(paymentRefund.amount);

    if (
      FINANCIALLY_SUCCESSFUL_DEPOSIT_REFUND_STATUSES.has(paymentRefund.status)
    ) {
      alreadyRefundedDepositAmount += amount;
      continue;
    }

    /*
     * Pending / processing / failed /
     * manual_review deposit refunds block a
     * full order refund.
     *
     * Unknown future states are deliberately
     * treated conservatively as blocking too.
     */
    blockingDepositRefunds.push({
      paymentRefundId: String(paymentRefund.id),

      sourceId: paymentRefund.sourceId,

      status: paymentRefund.status,

      amount,

      providerRefundId: paymentRefund.providerRefundId || null,
    });
  }

  return {
    alreadyRefundedDepositAmount,
    blockingDepositRefunds,
  };
}

export function calculateRemainingOrderRefund({ order, depositRefunds = [] }) {
  const orderTotal = normalizeRefundMinorAmount(order?.totalPrice);

  const { alreadyRefundedDepositAmount, blockingDepositRefunds } =
    summarizeDepositRefunds(depositRefunds);

  const hasDepositAmountConflict = alreadyRefundedDepositAmount > orderTotal;

  const remainingRefundAmount = Math.max(
    0,
    orderTotal - alreadyRefundedDepositAmount,
  );

  return {
    orderTotal,
    alreadyRefundedDepositAmount,
    remainingRefundAmount,
    blockingDepositRefunds,
    hasDepositAmountConflict,
  };
}
