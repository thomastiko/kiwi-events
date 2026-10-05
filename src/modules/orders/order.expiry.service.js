// src/modules/orders/order.expiry.service.js

import { withDatabaseTransaction } from "../database/database.service.js";
import { cancelPaymentSession } from "../payments/payment.service.js";
import { fulfillConfirmedOrderService } from "./order.fulfillment.service.js";
import {
  expireOrder,
  findOrderById,
  findPendingExpiredOrders,
  markPendingOrderPaymentPaid,
} from "./repositories/order.repository.js";
import { releaseTicketTypeStock } from "../ticketTypes/repositories/ticketType.repository.js";
import { ORDER_PAYMENT_STATUS, ORDER_STATUS } from "./order.constants.js";

function isExpiredPendingOrder(order, now) {
  if (!order) {
    return false;
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    return false;
  }

  if (order.paymentStatus !== ORDER_PAYMENT_STATUS.PENDING) {
    return false;
  }

  if (!order.expiresAt || new Date(order.expiresAt) > now) {
    return false;
  }

  return true;
}

async function synchronizePaidOrder({ order, providerPaymentId }) {
  const orderId = String(order.id);

  await markPendingOrderPaymentPaid(
    orderId,
    {
      paymentProviderPaymentId:
        providerPaymentId || order.paymentProviderPaymentId,
      confirmedAt: new Date(),
    },
    {
      lean: true,
    },
  );

  /*
   * Always reload through the canonical repository wrapper.
   *
   * MongoDB repository transition results may still expose `_id`,
   * while SQL exposes `id`. The canonical read guarantees the same
   * shape for both providers before fulfillment continues.
   */
  const paidOrder = await findOrderById(orderId, {
    lean: true,
  });

  if (
    !paidOrder ||
    paidOrder.status !== ORDER_STATUS.CONFIRMED ||
    paidOrder.paymentStatus !== ORDER_PAYMENT_STATUS.PAID
  ) {
    return;
  }

  await fulfillConfirmedOrderService({
    orderId,
    context: {},
  });
}

export async function expirePendingOrdersService({
  now = new Date(),
  limit = 100,
} = {}) {
  const expiredOrderIds = [];
  let processed = 0;

  const candidateOrders = await findPendingExpiredOrders({
    now,
    limit,
  });

  for (const candidate of candidateOrders) {
    try {
      const order = await findOrderById(candidate.id, {
        lean: true,
      });

      if (!isExpiredPendingOrder(order, now)) {
        continue;
      }

      if (!order.paymentProviderPaymentId) {
        throw new Error(
          `Cannot safely expire order ${order.id}: provider payment id is missing.`,
        );
      }

      let paymentResult = null;

      try {
        paymentResult = await cancelPaymentSession({
          provider: order.paymentProvider,
          providerPaymentId: order.paymentProviderPaymentId,
        });
      } catch (error) {
        console.error("ORDER PAYMENT TERMINATION ERROR:", {
          orderId: order.id,
          provider: order.paymentProvider,
          providerPaymentId: order.paymentProviderPaymentId,
          message: error.message,
        });
      }

      /**
       * The payment became paid before we could terminate it.
       *
       * Do not expire the order and do not release stock.
       * Synchronize it as a normal successful payment instead.
       */
      if (paymentResult?.paid === true) {
        await synchronizePaidOrder({
          order,
          providerPaymentId:
            paymentResult.providerPaymentId || order.paymentProviderPaymentId,
        });

        continue;
      }

      /**
       * External payment is safely terminated.
       *
       * Only now may the local order transition to expired
       * and its stock be released.
       */
      const expiredOrder = await withDatabaseTransaction(async (tx) => {
        const currentOrder = await findOrderById(order.id, {
          ...tx,
          lean: true,
        });

        if (!isExpiredPendingOrder(currentOrder, now)) {
          return null;
        }

        /**
         * Transition the order FIRST.
         *
         * This conditional transition protects against a concurrent
         * webhook changing the order while the expiry job is running.
         */
        const transitionedOrder = await expireOrder(
          {
            orderId: currentOrder.id,
            reason: "Order expired",
            actor: {
              eventUserId:
                currentOrder.updatedByEventUserId ||
                currentOrder.createdByEventUserId ||
                null,
            },
          },
          {
            ...tx,
            lean: true,
          },
        );

        if (
          !transitionedOrder ||
          transitionedOrder.status !== ORDER_STATUS.EXPIRED ||
          transitionedOrder.paymentStatus !== ORDER_PAYMENT_STATUS.EXPIRED
        ) {
          return null;
        }

        /**
         * Stock is released only after the order transition
         * succeeded, inside the same database transaction.
         */
        for (const item of currentOrder.items || []) {
          await releaseTicketTypeStock(
            {
              ticketTypeId: item.ticketTypeId,
              quantity: item.quantity,
              updatedByEventUserId:
                currentOrder.updatedByEventUserId ||
                currentOrder.createdByEventUserId ||
                null,
            },
            tx,
          );
        }

        return transitionedOrder;
      });

      if (!expiredOrder) {
        continue;
      }

      expiredOrderIds.push(expiredOrder.id);
      processed += 1;
    } catch (error) {
      console.error("ORDER EXPIRY ERROR:", {
        orderId: candidate.id,
        message: error.message,
      });
    }
  }

  return {
    processed,
    expiredOrderIds,
  };
}
