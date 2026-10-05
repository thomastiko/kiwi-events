import { withDatabaseTransaction } from "../database/database.service.js";

import {
  findOrderById,
  markOrderRefundCompletedIfNotCompleted,
  updateOrderById,
  updateOrderRefundStateIfNotCompleted,
} from "./repositories/order.repository.js";

import {
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "./order.constants.js";

import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../paymentRefunds/paymentRefund.constants.js";

import { executePaymentRefundService } from "../paymentRefunds/paymentRefund.service.js";

import {
  findPaymentRefundByIdempotencyKey,
  findPaymentRefundsByOrderId,
} from "../paymentRefunds/repositories/paymentRefund.repository.js";

import {
  cancelOrderExecutionService,
  claimOrderCancellationExecution,
  finalizeOrderCancellationResources,
} from "./order.cancellationExecution.service.js";

import {
  buildOrderRefundIdempotencyKey,
  calculateRemainingOrderRefund,
} from "./order.refundCalculation.js";

function getActorEventUserId(actor) {
  return actor?.updatedByEventUserId || actor?.eventUserId || null;
}

export function isExternallyHandledPaidOrder(order) {
  return (
    Number(order?.totalPrice || 0) > 0 &&
    order?.paymentProvider === ORDER_PAYMENT_PROVIDER.NONE &&
    order?.paymentStatus === ORDER_PAYMENT_STATUS.NOT_REQUIRED
  );
}

async function finalizeRefundedOrderLocalState({
  order,
  reason,
  actor,
  paymentRefund = null,
  cancellationFallbackReason,
}) {
  const orderId = String(order.id);

  return withDatabaseTransaction(
    async (tx) => {
      const currentOrder = await findOrderById(orderId, {
        ...tx,
        lean: true,
      });

      if (!currentOrder) {
        throw new Error(`Order ${orderId} no longer exists.`);
      }
      const cancellationClaim = await claimOrderCancellationExecution({
        orderId,
        reason,
        actor,
        tx,
        fallbackReason: cancellationFallbackReason,
      });

      /*
       * Das bedingte Order-Update ist der
       * lokale Exactly-once-Claim.
       *
       * Schlägt später etwas fehl, wird bei
       * aktiver Transaktion alles zurückgerollt.
       */
      const claimedOrder = await markOrderRefundCompletedIfNotCompleted(
        orderId,
        {
          status: ORDER_STATUS.CANCELLED,

          cancelledAt:
            cancellationClaim?.cancelledAt ||
            currentOrder.cancelledAt ||
            new Date(),

          cancellationReason:
            cancellationClaim?.cancellationReason ||
            currentOrder.cancellationReason ||
            reason ||
            cancellationFallbackReason,

          refundReason: reason || null,

          refundedAmount: Number(currentOrder.totalPrice || 0),

          paymentProviderRefundId:
            paymentRefund?.providerRefundId ||
            currentOrder.paymentProviderRefundId ||
            null,

          refundedAt: new Date(),

          updatedByEventUserId: getActorEventUserId(actor),
        },
        tx,
      );

      if (!claimedOrder) {
        const existing = await findOrderById(orderId, {
          ...tx,
          lean: true,
        });

        if (
          existing?.refundStatus === ORDER_REFUND_STATUS.COMPLETED &&
          existing?.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED
        ) {
          return {
            order: existing,

            alreadyFinalized: true,
          };
        }

        throw new Error(
          `Order ${orderId} could not be claimed for refund finalization.`,
        );
      }

      if (cancellationClaim) {
        await finalizeOrderCancellationResources({
          order: currentOrder,
          reason,
          actor,
          tx,
          fallbackReason: cancellationFallbackReason,
        });
      }
      const finalizedOrder = await findOrderById(orderId, {
        ...tx,
        lean: true,
      });

      return {
        order: finalizedOrder || claimedOrder,

        alreadyFinalized: false,
      };
    },
    {
      required: true,
    },
  );
}
function mapPaymentRefundStatusToOrderStatus(status) {
  switch (status) {
    case PAYMENT_REFUND_STATUS.PENDING:
      return ORDER_REFUND_STATUS.PENDING;

    case PAYMENT_REFUND_STATUS.PROCESSING:
      return ORDER_REFUND_STATUS.PROCESSING;

    case PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED:
      return ORDER_REFUND_STATUS.PROVIDER_SUCCEEDED;

    case PAYMENT_REFUND_STATUS.COMPLETED:
      return ORDER_REFUND_STATUS.COMPLETED;

    case PAYMENT_REFUND_STATUS.FAILED:
      return ORDER_REFUND_STATUS.FAILED;

    case PAYMENT_REFUND_STATUS.MANUAL_REVIEW:
      return ORDER_REFUND_STATUS.MANUAL_REVIEW;

    default:
      return ORDER_REFUND_STATUS.MANUAL_REVIEW;
  }
}
async function projectOrderRefundState({
  order,
  paymentRefund,
  reason,
  actor,
  alreadyRefundedDepositAmount,
  error = null,
}) {
  if (!paymentRefund) {
    return order;
  }

  const currentOrder = await findOrderById(order.id, {
    lean: true,
  });

  /*
   * Ein abgeschlossener lokaler Zustand darf
   * niemals durch einen verspäteten Fehler
   * zurückgestuft werden.
   */
  if (currentOrder?.refundStatus === ORDER_REFUND_STATUS.COMPLETED) {
    return currentOrder;
  }

  const refundStatus = mapPaymentRefundStatusToOrderStatus(
    paymentRefund.status,
  );

  const providerFinanciallySucceeded =
    paymentRefund.status === PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED ||
    paymentRefund.status === PAYMENT_REFUND_STATUS.COMPLETED;

  const refundedAmount = Math.min(
    Number(currentOrder?.totalPrice || order.totalPrice || 0),

    Number(alreadyRefundedDepositAmount || 0) +
      (providerFinanciallySucceeded ? Number(paymentRefund.amount || 0) : 0),
  );

  const failureReason = error?.message || paymentRefund.lastError || null;

  const projectedOrder = await updateOrderRefundStateIfNotCompleted(
    order.id,
    {
      refundStatus,

      refundReason: reason || null,

      refundedAmount,

      paymentProviderRefundId:
        paymentRefund.providerRefundId ||
        currentOrder?.paymentProviderRefundId ||
        null,

      refundFailedAt: failureReason
        ? paymentRefund.failedAt || new Date()
        : null,

      refundFailureReason: failureReason
        ? String(failureReason).slice(0, 1000)
        : null,

      updatedByEventUserId: getActorEventUserId(actor),
    },
    {
      lean: true,
    },
  );

  if (projectedOrder) {
    return projectedOrder;
  }

  /*
   * Ein paralleler Request kann zwischen dem
   * vorherigen Read und diesem Update bereits
   * vollständig finalisiert haben.
   *
   * Der bedingte Repository-Write verhindert
   * dann atomar jede Rückstufung von COMPLETED.
   */
  return (
    (await findOrderById(order.id, {
      lean: true,
    })) ||
    currentOrder ||
    order
  );
}
async function blockOrderRefund({ order, calculation, reason, actor }) {
  let refundStatus = ORDER_REFUND_STATUS.PROCESSING;

  if (
    calculation.blockingDepositRefunds.some(
      (refund) => refund.status === PAYMENT_REFUND_STATUS.MANUAL_REVIEW,
    )
  ) {
    refundStatus = ORDER_REFUND_STATUS.MANUAL_REVIEW;
  } else if (
    calculation.blockingDepositRefunds.some(
      (refund) => refund.status === PAYMENT_REFUND_STATUS.FAILED,
    )
  ) {
    refundStatus = ORDER_REFUND_STATUS.FAILED;
  }

  const failureReason = calculation.hasDepositAmountConflict
    ? "Successful deposit refunds exceed the order total."
    : "A deposit refund for this order is not in a financially final state.";

  const updatedOrder = await updateOrderById(
    order.id,
    {
      refundStatus,

      refundReason: reason || null,

      refundedAmount: calculation.alreadyRefundedDepositAmount,

      refundFailedAt: new Date(),

      refundFailureReason: failureReason,

      updatedByEventUserId: getActorEventUserId(actor),
    },
    {
      lean: true,
    },
  );

  return {
    skipped: true,
    failed: true,

    reason: calculation.hasDepositAmountConflict
      ? "deposit_refund_amount_exceeds_order_total"
      : "deposit_refund_incomplete",

    order: updatedOrder || order,

    alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

    remainingRefundAmount: calculation.remainingRefundAmount,

    blockingDepositRefunds: calculation.blockingDepositRefunds,
  };
}
export async function executeOrderRefundService({
  order,
  reason,
  actor,
  cancellationFallbackReason = "Order cancelled",
  metadataSource = "order_refund",
}) {
  const orderId = String(order.id);

  const depositRefunds = await findPaymentRefundsByOrderId(
    {
      orderId,

      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
    },
    {
      lean: true,
    },
  );

  const calculation = calculateRemainingOrderRefund({
    order,
    depositRefunds,
  });

  if (
    calculation.hasDepositAmountConflict ||
    calculation.blockingDepositRefunds.length > 0
  ) {
    return blockOrderRefund({
      order,
      calculation,
      reason,
      actor,
    });
  }
  if (isExternallyHandledPaidOrder(order)) {
    const localResult = await cancelOrderExecutionService({
      order,
      reason,
      actor,
      fallbackReason: cancellationFallbackReason,
    });

    return {
      skipped: true,
      reason: "payment_handled_externally",

      order: localResult.order,
      localResult,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      remainingRefundAmount: 0,
    };
  }

  /*
   * Free Orders und tatsächlich nicht bezahlte Orders
   * benötigen keinen Provider-Refund, müssen aber Tickets
   * und Stock genau einmal lokal finalisieren.
   */
  if (
    order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID ||
    calculation.orderTotal <= 0
  ) {
    const localResult = await cancelOrderExecutionService({
      order,
      reason,
      actor,
      fallbackReason: cancellationFallbackReason,
    });

    return {
      skipped: true,
      reason: "not_refundable",

      order: localResult.order,

      localResult,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      remainingRefundAmount: 0,
    };
  }

  /*
   * Alle Zahlungen wurden bereits durch
   * erfolgreiche Deposit-Refunds ausgezahlt.
   *
   * Es ist kein weiterer Provider-Aufruf
   * erforderlich.
   */
  if (calculation.remainingRefundAmount <= 0) {
    const localResult = await finalizeRefundedOrderLocalState({
      order,
      reason,
      actor,
      paymentRefund: null,
      cancellationFallbackReason,
    });

    return {
      skipped: true,

      reason: "fully_refunded_by_deposit_refunds",

      order: localResult.order,

      localResult,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      remainingRefundAmount: 0,
    };
  }

  if (!order.paymentProviderPaymentId) {
    const updatedOrder = await updateOrderById(
      orderId,
      {
        refundStatus: ORDER_REFUND_STATUS.MANUAL_REVIEW,

        refundReason: reason || null,

        refundedAmount: calculation.alreadyRefundedDepositAmount,

        refundFailedAt: new Date(),

        refundFailureReason: "Paid order has no provider payment id.",

        updatedByEventUserId: getActorEventUserId(actor),
      },
      {
        lean: true,
      },
    );

    return {
      skipped: true,
      failed: true,

      reason: "missing_payment_provider_payment_id",

      order: updatedOrder || order,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      remainingRefundAmount: calculation.remainingRefundAmount,
    };
  }

  const idempotencyKey = buildOrderRefundIdempotencyKey(orderId);

  try {
    const result = await executePaymentRefundService({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,

      sourceId: orderId,

      orderId,

      ticketId: null,

      provider: order.paymentProvider,

      providerPaymentId: order.paymentProviderPaymentId,

      amount: calculation.remainingRefundAmount,

      currency: order.currency || "EUR",

      idempotencyKey,

      description: reason || `Refund Order ${order.orderNumber}`,

      metadata: {
        source: metadataSource,

        orderId,

        eventId: String(order.eventId),

        orderTotal: calculation.orderTotal,

        alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

        remainingRefundAmount: calculation.remainingRefundAmount,
      },

      actor,

      finalizeLocalState: async ({ paymentRefund }) => {
        return finalizeRefundedOrderLocalState({
          order,
          reason,
          actor,
          paymentRefund,
          cancellationFallbackReason,
        });
      },
    });

    const currentOrder =
      result.localResult?.order ||
      (await findOrderById(orderId, {
        lean: true,
      })) ||
      order;

    if (!result.success) {
      await projectOrderRefundState({
        order: currentOrder,

        paymentRefund: result.paymentRefund,

        reason,
        actor,

        alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,
      });
    }

    return {
      skipped: Boolean(result.ignored),

      reason: result.reason || null,

      order: currentOrder,

      refund:
        result.providerRefund ||
        (result.paymentRefund?.providerRefundId
          ? {
              provider: result.paymentRefund.provider,

              providerPaymentId: result.paymentRefund.providerPaymentId,

              providerRefundId: result.paymentRefund.providerRefundId,

              status: "refunded",

              resumed: true,
            }
          : null),

      paymentRefund: result.paymentRefund,

      localResult: result.localResult,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      remainingRefundAmount: calculation.remainingRefundAmount,
    };
  } catch (error) {
    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      idempotencyKey,
      {
        lean: true,
      },
    );

    const projectedOrder = await projectOrderRefundState({
      order,

      paymentRefund,

      reason,
      actor,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      error,
    });

    error.order = projectedOrder || order;

    error.paymentRefund = paymentRefund || null;

    throw error;
  }
}
