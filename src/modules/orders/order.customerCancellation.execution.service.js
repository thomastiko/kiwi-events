import { logger } from "../../config/logger.js";

import { withDatabaseTransaction } from "../database/database.service.js";

import { terminatePendingOrderPaymentService } from "./order.pendingPaymentTermination.service.js";

import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../paymentRefunds/paymentRefund.constants.js";

import { executePaymentRefundService } from "../paymentRefunds/paymentRefund.service.js";

import {
  findPaymentRefundByIdempotencyKey,
  findPaymentRefundsByOrderId,
} from "../paymentRefunds/repositories/paymentRefund.repository.js";

import { cancelTicketsByOrderId } from "../tickets/repositories/ticket.repository.js";

import { releaseTicketTypeStock } from "../ticketTypes/repositories/ticketType.repository.js";

import { TICKET_STATUS } from "../tickets/ticket.constants.js";

import {
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "./order.constants.js";

import {
  cancelConfirmedFreeCustomerOrder,
  cancelPendingOrderIfUnpaid,
  findOrderById,
  markOrderRefundCompletedIfNotCompleted,
  updateOrderRefundStateIfNotCompleted,
} from "./repositories/order.repository.js";

import {
  buildOrderRefundIdempotencyKey,
  calculateRemainingOrderRefund,
} from "./order.refundCalculation.js";

import {
  CUSTOMER_ORDER_CANCELLATION_ACTION,
  CUSTOMER_ORDER_CANCELLATION_REASON,
  getCustomerOrderCancellationEligibilityService,
} from "./order.customerCancellation.service.js";

import { customerOrderCancellationNotAllowedError } from "./order.errors.js";

function cleanReason(reason) {
  const value = String(reason || "").trim();

  return value || "Cancelled by buyer";
}

function denyCancellation({ orderId, reason, details = {} }) {
  throw customerOrderCancellationNotAllowedError({
    orderId,
    reason,
    details,
  });
}

async function releaseStockForOrderItems(order, tx) {
  for (const item of order.items || []) {
    const released = await releaseTicketTypeStock(
      {
        ticketTypeId: item.ticketTypeId,

        quantity: item.quantity,

        updatedByEventUserId: null,
      },
      tx,
    );

    if (!released) {
      throw new Error(
        `Ticket type ${item.ticketTypeId} could not release stock for order ${order.id}.`,
      );
    }
  }
}

async function cancelOrderTickets({ orderId, reason, tx }) {
  await cancelTicketsByOrderId(
    orderId,
    {
      status: TICKET_STATUS.CANCELLED,

      cancelledAt: new Date(),

      cancellationReason: reason,

      updatedByEventUserId: null,
    },
    tx,
  );
}

async function finalizePendingCancellation({ order, reason }) {
  return withDatabaseTransaction(
    async (tx) => {
      const currentOrder = await findOrderById(order.id, {
        ...tx,
        lean: true,
      });

      if (!currentOrder) {
        throw new Error(`Order ${order.id} no longer exists.`);
      }

      const cancelledOrder = await cancelPendingOrderIfUnpaid(
        order.id,
        {
          cancelledAt: new Date(),

          cancellationReason: reason,

          updatedByEventUserId: null,
        },
        {
          ...tx,
          lean: true,
        },
      );

      if (!cancelledOrder) {
        return {
          transitioned: false,

          order: await findOrderById(order.id, {
            ...tx,
            lean: true,
          }),
        };
      }

      await releaseStockForOrderItems(currentOrder, tx);

      await cancelOrderTickets({
        orderId: order.id,

        reason,

        tx,
      });

      return {
        transitioned: true,

        order:
          (await findOrderById(order.id, {
            ...tx,
            lean: true,
          })) || cancelledOrder,
      };
    },
    {
      required: true,
    },
  );
}

async function finalizeFreeConfirmedCancellation({ order, reason }) {
  return withDatabaseTransaction(
    async (tx) => {
      const currentOrder = await findOrderById(order.id, {
        ...tx,
        lean: true,
      });

      if (!currentOrder) {
        throw new Error(`Order ${order.id} no longer exists.`);
      }

      const cancelledOrder = await cancelConfirmedFreeCustomerOrder(
        order.id,
        {
          cancelledAt: new Date(),

          cancellationReason: reason,

          updatedByEventUserId: null,
        },
        {
          ...tx,
          lean: true,
        },
      );

      if (!cancelledOrder) {
        return {
          transitioned: false,

          order: await findOrderById(order.id, {
            ...tx,
            lean: true,
          }),
        };
      }

      await releaseStockForOrderItems(currentOrder, tx);

      await cancelOrderTickets({
        orderId: order.id,

        reason,

        tx,
      });

      return {
        transitioned: true,

        order:
          (await findOrderById(order.id, {
            ...tx,
            lean: true,
          })) || cancelledOrder,
      };
    },
    {
      required: true,
    },
  );
}

async function finalizeRefundedCustomerOrder({
  order,
  reason,
  paymentRefund = null,
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

      const claimedOrder = await markOrderRefundCompletedIfNotCompleted(
        orderId,
        {
          status: ORDER_STATUS.CANCELLED,

          cancelledAt: currentOrder.cancelledAt || new Date(),

          cancellationReason: reason,

          refundReason: reason,

          /*
           * Nach vollständiger lokaler Finalisierung
           * ist der gesamte Order-Betrag finanziell
           * refundiert – teilweise ggf. bereits durch
           * Deposit-Refunds.
           */
          refundedAmount: Number(currentOrder.totalPrice || 0),

          paymentProviderRefundId:
            paymentRefund?.providerRefundId ||
            currentOrder.paymentProviderRefundId ||
            null,

          refundedAt: new Date(),

          updatedByEventUserId: null,
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
          `Order ${orderId} could not be claimed for customer refund finalization.`,
        );
      }

      await releaseStockForOrderItems(currentOrder, tx);

      await cancelOrderTickets({
        orderId,
        reason,
        tx,
      });

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

function mapPaymentRefundToOrderRefundStatus(status) {
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

async function projectCustomerRefundState({
  order,
  paymentRefund,
  reason,
  alreadyRefundedDepositAmount,
  error = null,
}) {
  if (!paymentRefund) {
    return order;
  }

  const currentOrder = await findOrderById(order.id, {
    lean: true,
  });

  if (currentOrder?.refundStatus === ORDER_REFUND_STATUS.COMPLETED) {
    return currentOrder;
  }

  const refundStatus = mapPaymentRefundToOrderRefundStatus(
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

  return (
    (await updateOrderRefundStateIfNotCompleted(
      order.id,
      {
        refundStatus,

        refundReason: reason,

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

        updatedByEventUserId: null,
      },
      {
        lean: true,
      },
    )) ||
    currentOrder ||
    order
  );
}

async function executePaidCustomerRefund({ order, reason }) {
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

  if (calculation.hasDepositAmountConflict) {
    denyCancellation({
      orderId,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.DEPOSIT_REFUND_AMOUNT_CONFLICT,
    });
  }

  if (calculation.blockingDepositRefunds.length > 0) {
    denyCancellation({
      orderId,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.DEPOSIT_REFUND_INCOMPLETE,

      details: {
        blockingDepositRefunds: calculation.blockingDepositRefunds,
      },
    });
  }

  /*
   * Deposit-Refunds haben bereits den gesamten
   * Order-Betrag ausgezahlt.
   *
   * Kein weiterer Provider-Aufruf.
   */
  if (calculation.remainingRefundAmount <= 0) {
    const localResult = await finalizeRefundedCustomerOrder({
      order,
      reason,
      paymentRefund: null,
    });

    return {
      action: CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED,

      order: localResult.order,

      paymentRefund: null,

      localResult,
    };
  }

  if (!order.paymentProviderPaymentId) {
    await updateOrderRefundStateIfNotCompleted(
      orderId,
      {
        refundStatus: ORDER_REFUND_STATUS.MANUAL_REVIEW,

        refundReason: reason,

        refundedAmount: calculation.alreadyRefundedDepositAmount,

        refundFailedAt: new Date(),

        refundFailureReason: "Paid order has no provider payment id.",

        updatedByEventUserId: null,
      },
      {
        lean: true,
      },
    );

    denyCancellation({
      orderId,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.MISSING_PROVIDER_PAYMENT_ID,
    });
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

      description: `Customer cancellation refund for order ${
        order.orderNumber || orderId
      }`,

      metadata: {
        source: "customer_self_service_cancellation",

        orderId,

        eventId: String(order.eventId),

        orderTotal: calculation.orderTotal,

        alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

        remainingRefundAmount: calculation.remainingRefundAmount,
      },

      /*
       * triggeredByEventUserId ist für
       * interne Event-User gedacht.
       * Customer Self-Service hat daher
       * bewusst keinen internen Actor.
       */
      actor: null,

      finalizeLocalState: async ({ paymentRefund }) =>
        finalizeRefundedCustomerOrder({
          order,

          reason,

          paymentRefund,
        }),
    });

    const currentOrder =
      result.localResult?.order ||
      (await findOrderById(orderId, {
        lean: true,
      })) ||
      order;

    if (!result.success) {
      await projectCustomerRefundState({
        order: currentOrder,

        paymentRefund: result.paymentRefund,

        reason,

        alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,
      });

      denyCancellation({
        orderId,

        reason: CUSTOMER_ORDER_CANCELLATION_REASON.REFUND_INCOMPLETE,

        details: {
          refundStatus: result.paymentRefund?.status || null,
        },
      });
    }

    return {
      action: CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED,

      order: currentOrder,

      paymentRefund: result.paymentRefund,

      providerRefund: result.providerRefund || null,

      localResult: result.localResult,
    };
  } catch (error) {
    /*
     * Unser eigener Conflict wurde bereits
     * sauber verarbeitet.
     */
    if (error?.code === "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED") {
      throw error;
    }

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      idempotencyKey,
      {
        lean: true,
      },
    );

    await projectCustomerRefundState({
      order,

      paymentRefund,

      reason,

      alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

      error,
    });

    throw error;
  }
}

async function executePendingCustomerCancellation({ order, reason, now }) {
  const providerPaymentId = String(order.paymentProviderPaymentId || "").trim();

  const terminationResult = await terminatePendingOrderPaymentService({
    order,
  });

  const paymentSynchronizedOrder = terminationResult.order;

  /*
   * Hat der Provider gemeldet, dass das Payment
   * während der Cancellation bereits bezahlt wurde,
   * gelten ab jetzt die Regeln für eine bezahlte
   * Customer-Cancellation.
   */
  if (terminationResult.termination?.paid === true) {
    if (
      !paymentSynchronizedOrder ||
      paymentSynchronizedOrder.status !== ORDER_STATUS.CONFIRMED ||
      paymentSynchronizedOrder.paymentStatus !== ORDER_PAYMENT_STATUS.PAID
    ) {
      denyCancellation({
        orderId: order.id,

        reason: CUSTOMER_ORDER_CANCELLATION_REASON.PAYMENT_STATUS_NOT_ELIGIBLE,
      });
    }

    const paidEligibility =
      await getCustomerOrderCancellationEligibilityService({
        order: paymentSynchronizedOrder,

        now,
      });

    if (
      !paidEligibility.allowed ||
      paidEligibility.action !==
        CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED
    ) {
      denyCancellation({
        orderId: order.id,

        reason:
          paidEligibility.reason ||
          CUSTOMER_ORDER_CANCELLATION_REASON.PAYMENT_STATUS_NOT_ELIGIBLE,
      });
    }

    return executePaidCustomerRefund({
      order: paymentSynchronizedOrder,

      reason,
    });
  }

  const localResult = await finalizePendingCancellation({
    order,
    reason,
  });

  if (localResult.transitioned) {
    return {
      action: CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_PENDING,

      order: localResult.order,

      localResult,
    };
  }

  const latestOrder = localResult.order;

  /*
   * Ein paralleler Webhook kann zwischen
   * Eligibility und dem atomaren Cancel das
   * Payment bestätigt haben.
   */
  if (
    latestOrder?.status === ORDER_STATUS.CONFIRMED &&
    latestOrder?.paymentStatus === ORDER_PAYMENT_STATUS.PAID
  ) {
    const eligibility = await getCustomerOrderCancellationEligibilityService({
      order: latestOrder,

      now,
    });

    if (
      eligibility.allowed &&
      eligibility.action === CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED
    ) {
      return executePaidCustomerRefund({
        order: latestOrder,

        reason,
      });
    }

    denyCancellation({
      orderId: order.id,

      reason:
        eligibility.reason ||
        CUSTOMER_ORDER_CANCELLATION_REASON.PAYMENT_STATUS_NOT_ELIGIBLE,
    });
  }

  /*
   * Paralleler identischer Cancel:
   * lokal bereits abgeschlossen → idempotenter Erfolg.
   */
  if (latestOrder?.status === ORDER_STATUS.CANCELLED) {
    return {
      action: CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_PENDING,

      order: latestOrder,

      localResult: {
        ...localResult,

        alreadyFinalized: true,
      },
    };
  }

  denyCancellation({
    orderId: order.id,

    reason: CUSTOMER_ORDER_CANCELLATION_REASON.ORDER_STATUS_NOT_ELIGIBLE,
  });
}

async function executeFreeConfirmedCustomerCancellation({ order, reason }) {
  const localResult = await finalizeFreeConfirmedCancellation({
    order,
    reason,
  });

  if (localResult.transitioned) {
    return {
      action: CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_CONFIRMED,

      order: localResult.order,

      localResult,
    };
  }

  if (localResult.order?.status === ORDER_STATUS.CANCELLED) {
    return {
      action: CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_CONFIRMED,

      order: localResult.order,

      localResult: {
        ...localResult,

        alreadyFinalized: true,
      },
    };
  }

  denyCancellation({
    orderId: order.id,

    reason: CUSTOMER_ORDER_CANCELLATION_REASON.ORDER_STATUS_NOT_ELIGIBLE,
  });
}

export async function executeCustomerOrderCancellationService({
  order,
  reason = null,
  now = new Date(),
}) {
  if (!order?.id) {
    throw new TypeError("Customer order cancellation requires an order.");
  }

  const currentOrder = await findOrderById(order.id, {
    lean: true,
  });

  if (!currentOrder) {
    throw new Error(`Order ${order.id} no longer exists.`);
  }

  const eligibility = await getCustomerOrderCancellationEligibilityService({
    order: currentOrder,

    now,
  });

  if (!eligibility.allowed) {
    denyCancellation({
      orderId: currentOrder.id,

      reason: eligibility.reason,

      details: {
        deadlineAt: eligibility.deadlineAt || null,

        earliestRelevantSessionStartAt:
          eligibility.earliestRelevantSessionStartAt || null,
      },
    });
  }

  const cancellationReason = cleanReason(reason);

  switch (eligibility.action) {
    case CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_PENDING:
      return executePendingCustomerCancellation({
        order: currentOrder,

        reason: cancellationReason,

        now,
      });

    case CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_CONFIRMED:
      return executeFreeConfirmedCustomerCancellation({
        order: currentOrder,

        reason: cancellationReason,
      });

    case CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED:
      return executePaidCustomerRefund({
        order: currentOrder,

        reason: cancellationReason,
      });

    default:
      denyCancellation({
        orderId: currentOrder.id,

        reason: CUSTOMER_ORDER_CANCELLATION_REASON.ORDER_STATUS_NOT_ELIGIBLE,
      });
  }
}
