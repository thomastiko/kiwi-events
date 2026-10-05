import { withDatabaseTransaction } from "../../database/database.service.js";

import {
  findOrderById,
  findOrdersByEventId,
} from "../../orders/repositories/order.repository.js";
import { getOrderBuyerSnapshot } from "../../orders/order.buyerSnapshot.js";
import {
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
  ORDER_BUYER_TYPE,
} from "../../orders/order.constants.js";

import { findTicketsByOrderId } from "../../tickets/repositories/ticket.repository.js";

import { PAYMENT_REFUND_SOURCE_TYPE } from "../../paymentRefunds/paymentRefund.constants.js";

import { findPaymentRefundsByOrderId } from "../../paymentRefunds/repositories/paymentRefund.repository.js";

import { sendEventCancelledMailsSafe } from "../event.mail.service.js";

import { findConfirmedOrdersWithActiveTicketsForEvent } from "../event.orderAudience.service.js";

import {
  findEventById,
  updateEventById,
} from "../repositories/event.repository.js";

import {
  EVENT_CANCELLATION_REFUND_MODE,
  EVENT_STATUSES,
} from "../event.constants.js";

import { canManageEvent } from "../../permissions/eventAuthorization.service.js";

import { calculateRemainingOrderRefund } from "../../orders/order.refundCalculation.js";

import {
  executeOrderRefundService,
  isExternallyHandledPaidOrder,
} from "../../orders/order.refundExecution.service.js";

import { cancelOrderExecutionService } from "../../orders/order.cancellationExecution.service.js";

import { terminatePendingOrderPaymentService } from "../../orders/order.pendingPaymentTermination.service.js";

import {
  eventAccessRequiredError,
  eventManageForbiddenError,
  eventNotFoundError,
} from "../event.errors.js";

function getActorEventUserId(actor) {
  return actor?.updatedByEventUserId || actor?.eventUserId || null;
}

async function assertCanManageRefundEvent(actor, event) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw eventAccessRequiredError();
  }

  if (!(await canManageEvent(actor, event))) {
    throw eventManageForbiddenError();
  }
}
function getBuyerSummary(order = {}) {
  const buyer = getOrderBuyerSnapshot(order);

  return {
    type: order.buyerType || ORDER_BUYER_TYPE.GUEST,

    externalProvider: order.buyerExternalProvider || null,

    externalUserId: order.buyerExternalUserId || null,

    ...buyer,
  };
}

function getOrderRefundBlockReason({ order, calculation }) {
  if (
    order.refundStatus === ORDER_REFUND_STATUS.COMPLETED ||
    order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED
  ) {
    return "already_refunded";
  }
  if (isExternallyHandledPaidOrder(order)) {
    return "payment_handled_externally";
  }

  if (order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID) {
    return "not_paid";
  }

  if (calculation.orderTotal <= 0) {
    return "not_refundable";
  }

  if (calculation.hasDepositAmountConflict) {
    return "deposit_refund_amount_exceeds_order_total";
  }

  if (calculation.blockingDepositRefunds.length > 0) {
    return "deposit_refund_incomplete";
  }

  if (
    calculation.remainingRefundAmount > 0 &&
    !order.paymentProviderPaymentId
  ) {
    return "missing_payment_provider_payment_id";
  }

  return null;
}

function mapRefundPreviewOrder({ order, tickets, depositRefunds }) {
  const calculation = calculateRemainingOrderRefund({
    order,
    depositRefunds,
  });

  const blockedReason = getOrderRefundBlockReason({
    order,
    calculation,
  });

  const refundable = !blockedReason && calculation.remainingRefundAmount > 0;

  const localFinalizationOnly =
    !blockedReason &&
    calculation.orderTotal > 0 &&
    calculation.remainingRefundAmount === 0;

  return {
    orderId: order.id,

    orderNumber: order.orderNumber,

    buyer: getBuyerSummary(order),

    status: order.status,

    paymentStatus: order.paymentStatus,

    refundStatus: order.refundStatus || ORDER_REFUND_STATUS.NONE,

    totalPrice: order.totalPrice,

    currency: order.currency,

    ticketCount: tickets.length,

    alreadyRefundedDepositAmount: calculation.alreadyRefundedDepositAmount,

    blockingDepositRefunds: calculation.blockingDepositRefunds,

    refundable: Boolean(refundable),

    localFinalizationOnly: Boolean(localFinalizationOnly),

    refundBlocked: Boolean(blockedReason),

    refundBlockedReason: blockedReason,

    refundAmount: refundable ? calculation.remainingRefundAmount : 0,
  };
}

export async function getEventRefundPreviewService(eventId, actor) {
  const event = await findEventById(eventId, {
    lean: true,
  });

  if (!event) {
    throw eventNotFoundError(eventId);
  }

  await assertCanManageRefundEvent(actor, event);

  const orders = await findOrdersByEventId(event.id, {
    lean: true,
  });

  const items = [];

  for (const order of orders) {
    const orderId = String(order.id);

    const [tickets, depositRefunds] = await Promise.all([
      findTicketsByOrderId(orderId, {
        lean: true,
      }),

      findPaymentRefundsByOrderId(
        {
          orderId,

          sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
        },
        {
          lean: true,
        },
      ),
    ]);

    items.push(
      mapRefundPreviewOrder({
        order,
        tickets,
        depositRefunds,
      }),
    );
  }

  return {
    event: {
      id: event.id,

      title: event.title,

      status: event.status,
    },

    orders: items,

    summary: {
      orderCount: items.length,

      refundableOrderCount: items.filter((item) => item.refundable).length,

      blockedOrderCount: items.filter((item) => item.refundBlocked).length,

      refundAmountTotal: items.reduce(
        (sum, item) => sum + Number(item.refundAmount || 0),

        0,
      ),
    },
  };
}
function isOpenOrderForEventCancellation(order) {
  return (
    order?.status !== ORDER_STATUS.CANCELLED &&
    order?.status !== ORDER_STATUS.EXPIRED
  );
}

function isRefundFinanciallyRelevant(order) {
  return (
    order?.paymentStatus === ORDER_PAYMENT_STATUS.PAID ||
    isExternallyHandledPaidOrder(order)
  );
}
export async function cancelEventWithOrdersService({
  eventId,
  reason,
  refundMode,
  orderIds = [],
  actor,
}) {
  const event = await findEventById(eventId, {
    lean: true,
  });

  if (!event) {
    throw eventNotFoundError(eventId);
  }

  await assertCanManageRefundEvent(actor, event);

  const orders = await findOrdersByEventId(event.id, {
    lean: true,
  });

  const cancellationMailOrders =
    await findConfirmedOrdersWithActiveTicketsForEvent(event.id, {
      orders,
    });

  const selectedRefundOrderIds =
    refundMode === EVENT_CANCELLATION_REFUND_MODE.SELECTED
      ? new Set(orderIds.map(String))
      : null;

  const cancellationTimestamp = event.cancelledAt || new Date();

  const cancellationFinalizedAt =
    event.cancellationFinalizedAt || cancellationTimestamp;

  const cancelledEvent = await withDatabaseTransaction(async (tx) => {
    const updatedEvent = await updateEventById(
      event.id,
      {
        status: EVENT_STATUSES.CANCELLED,

        cancelledAt: cancellationTimestamp,

        cancellationReason: reason || null,

        isCancellationFinalized: true,

        cancellationFinalizedAt,

        updatedByEventUserId: getActorEventUserId(actor),
      },
      tx,
    );

    if (!updatedEvent) {
      throw eventNotFoundError(event.id);
    }

    return updatedEvent;
  });

  const processedOrders = new Map();

  const cancellationFailures = [];

  for (const sourceOrder of orders) {
    const orderId = String(sourceOrder.id);

    let currentOrder = sourceOrder;

    if (isOpenOrderForEventCancellation(currentOrder)) {
      try {
        const terminationResult = await terminatePendingOrderPaymentService({
          order: currentOrder,
        });

        currentOrder = terminationResult.order || currentOrder;

        if (isOpenOrderForEventCancellation(currentOrder)) {
          const cancellation = await cancelOrderExecutionService({
            order: currentOrder,

            reason,

            actor,

            fallbackReason: "Event cancelled",
          });

          currentOrder = cancellation.order || currentOrder;
        }
      } catch (error) {
        currentOrder =
          (await findOrderById(orderId, {
            lean: true,
          })) || currentOrder;

        cancellationFailures.push({
          orderId,

          orderNumber: sourceOrder.orderNumber,

          reason: String(error?.message || error),
        });
      }
    }

    processedOrders.set(orderId, currentOrder);
  }

  const mail = await sendEventCancelledMailsSafe({
    event: cancelledEvent,

    orders: cancellationMailOrders,

    cancellationReason: cancelledEvent.cancellationReason || reason || null,

    context: {
      eventUserId: getActorEventUserId(actor),
    },
  });

  const refundResults = [];

  for (const sourceOrder of orders) {
    const orderId = String(sourceOrder.id);

    const refundRequested =
      refundMode === EVENT_CANCELLATION_REFUND_MODE.ALL ||
      (refundMode === EVENT_CANCELLATION_REFUND_MODE.SELECTED &&
        selectedRefundOrderIds.has(orderId));

    if (!refundRequested) {
      continue;
    }

    let currentOrder = processedOrders.get(orderId) || sourceOrder;

    if (!isRefundFinanciallyRelevant(currentOrder)) {
      refundResults.push({
        orderId,

        orderNumber: sourceOrder.orderNumber,

        buyer: getBuyerSummary(sourceOrder),

        refund: {
          skipped: true,

          failed: false,

          reason: "not_refundable",

          order: currentOrder,

          alreadyRefundedDepositAmount: Number(
            currentOrder.refundedAmount || 0,
          ),

          remainingRefundAmount: 0,
        },
      });

      continue;
    }

    if (currentOrder.status !== ORDER_STATUS.CANCELLED) {
      refundResults.push({
        orderId,

        orderNumber: sourceOrder.orderNumber,

        buyer: getBuyerSummary(sourceOrder),

        refund: {
          skipped: true,

          failed: true,

          reason: "order_cancellation_failed",

          order: currentOrder,

          alreadyRefundedDepositAmount: Number(
            currentOrder.refundedAmount || 0,
          ),

          remainingRefundAmount: Number(currentOrder.totalPrice || 0),
        },
      });

      continue;
    }

    try {
      const refund = await executeOrderRefundService({
        order: currentOrder,

        reason,

        actor,

        cancellationFallbackReason: "Event cancelled",

        metadataSource: "event_cancel_refund",
      });

      currentOrder = refund.order || currentOrder;

      processedOrders.set(orderId, currentOrder);

      refundResults.push({
        orderId,

        orderNumber: sourceOrder.orderNumber,

        buyer: getBuyerSummary(sourceOrder),

        refund,
      });
    } catch (error) {
      currentOrder =
        error.order ||
        (await findOrderById(orderId, {
          lean: true,
        })) ||
        currentOrder;

      processedOrders.set(orderId, currentOrder);

      refundResults.push({
        orderId,

        orderNumber: sourceOrder.orderNumber,

        buyer: getBuyerSummary(sourceOrder),

        refund: {
          failed: true,

          reason: String(error?.message || error),

          order: currentOrder,

          paymentRefund: error?.paymentRefund || null,
        },
      });
    }
  }

  const finalOrders = [...processedOrders.values()];

  const cancelledOrders = finalOrders.filter(
    (order) => order?.status === ORDER_STATUS.CANCELLED,
  ).length;

  return {
    eventId: event.id,

    refundMode,

    totalOrders: orders.length,

    cancelledOrders,

    failedCancellations: cancellationFailures.length,

    cancellationFailures,

    refundRequestedOrders: refundResults.length,

    refunds: refundResults,

    mail,
  };
}
