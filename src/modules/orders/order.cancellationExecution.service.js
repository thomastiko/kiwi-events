import { withDatabaseTransaction } from "../database/database.service.js";

import {
  cancelOrderByIdIfNotCancelled,
  cancelPendingOrderIfUnpaid,
  findOrderById,
} from "./repositories/order.repository.js";

import { cancelTicketsByOrderId } from "../tickets/repositories/ticket.repository.js";

import { releaseTicketTypeStock } from "../ticketTypes/repositories/ticketType.repository.js";

import { ORDER_PAYMENT_STATUS, ORDER_STATUS } from "./order.constants.js";
import { TICKET_STATUS } from "../tickets/ticket.constants.js";

function getActorEventUserId(actor) {
  return actor?.updatedByEventUserId || actor?.eventUserId || null;
}

async function releaseStockForOrder({ order, actor, tx }) {
  for (const item of order.items || []) {
    const releasedTicketType = await releaseTicketTypeStock(
      {
        ticketTypeId: item.ticketTypeId,

        quantity: item.quantity,

        updatedByEventUserId: getActorEventUserId(actor),
      },
      tx,
    );

    if (!releasedTicketType) {
      throw new Error(
        `Ticket type ${item.ticketTypeId} could not release stock for order ${order.id}.`,
      );
    }
  }
}
export async function finalizeOrderCancellationResources({
  order,
  reason,
  actor,
  tx,
  fallbackReason = "Order cancelled",
}) {
  if (!order?.id) {
    throw new TypeError(
      "Order cancellation resource finalization requires an order.",
    );
  }

  const orderId = String(order.id);
  const cancellationReason = reason || fallbackReason;

  await releaseStockForOrder({
    order,
    actor,
    tx,
  });

  await cancelTicketsByOrderId(
    orderId,
    {
      status: TICKET_STATUS.CANCELLED,

      cancelledAt: new Date(),

      cancellationReason,

      updatedByEventUserId: getActorEventUserId(actor),
    },
    tx,
  );
}
export async function claimOrderCancellationExecution({
  orderId,
  reason,
  actor,
  tx,
  fallbackReason = "Order cancelled",
}) {
  const cancellationReason = reason || fallbackReason;

  return cancelOrderByIdIfNotCancelled(
    String(orderId),
    {
      status: ORDER_STATUS.CANCELLED,

      cancelledAt: new Date(),

      cancellationReason,

      updatedByEventUserId: getActorEventUserId(actor),
    },
    tx,
  );
}
export async function cancelOrderExecutionService({
  order,
  reason,
  actor,
  fallbackReason = "Order cancelled",
}) {
  if (!order?.id) {
    throw new TypeError("Order cancellation execution requires an order.");
  }

  const orderId = String(order.id);

  const cancellationReason = reason || fallbackReason;

  return withDatabaseTransaction(
    async (tx) => {
      const currentOrder = await findOrderById(orderId, {
        ...tx,
        lean: true,
      });

      if (!currentOrder) {
        throw new Error(`Order ${orderId} no longer exists.`);
      }

      let cancelledOrder = null;

      if (
        currentOrder.status === ORDER_STATUS.PENDING &&
        currentOrder.paymentStatus === ORDER_PAYMENT_STATUS.PENDING
      ) {
        /*
         * Eine unbezahlte Pending-Order wird nicht nur
         * fachlich storniert, sondern ihr Payment-Lifecycle
         * wird lokal als beendet markiert.
         *
         * Die Query ist atomar auf PENDING/PENDING begrenzt,
         * damit ein paralleler Payment-Webhook nicht
         * versehentlich wieder auf FAILED überschrieben wird.
         */
        cancelledOrder = await cancelPendingOrderIfUnpaid(
          orderId,
          {
            status: ORDER_STATUS.CANCELLED,

            cancelledAt: new Date(),

            cancellationReason,

            updatedByEventUserId: getActorEventUserId(actor),
          },
          {
            ...tx,
            lean: true,
          },
        );

        /*
         * Wenn der atomare Pending-Claim verloren ging,
         * kann genau in diesem Moment z. B. ein Payment-
         * Webhook die Order bestätigt haben.
         */
        if (!cancelledOrder) {
          const latestOrder = await findOrderById(orderId, {
            ...tx,
            lean: true,
          });

          if (latestOrder?.status === ORDER_STATUS.CANCELLED) {
            return {
              order: latestOrder,
              alreadyFinalized: true,
            };
          }

          /*
           * Wurde sie parallel bezahlt/bestätigt,
           * stornieren wir jetzt den bestätigten Zustand.
           * Das Payment selbst bleibt dabei PAID:
           * "cancel without refund" bedeutet bewusst
           * keine automatische Erstattung.
           */
          if (latestOrder?.status === ORDER_STATUS.CONFIRMED) {
            cancelledOrder = await claimOrderCancellationExecution({
              orderId,
              reason: cancellationReason,
              actor,
              tx,
            });
          }

          if (!cancelledOrder) {
            throw new Error(
              `Order ${orderId} could not be claimed for cancellation.`,
            );
          }
        }
      } else {
        cancelledOrder = await claimOrderCancellationExecution({
          orderId,
          reason: cancellationReason,
          actor,
          tx,
        });
      }

      if (!cancelledOrder) {
        const existing = await findOrderById(orderId, {
          ...tx,
          lean: true,
        });

        return {
          order: existing || currentOrder,

          alreadyFinalized: true,
        };
      }

      await finalizeOrderCancellationResources({
        order: currentOrder,
        reason: cancellationReason,
        actor,
        tx,
      });

      const finalizedOrder = await findOrderById(orderId, {
        ...tx,
        lean: true,
      });

      return {
        order: finalizedOrder || cancelledOrder,

        alreadyFinalized: false,
      };
    },
    {
      required: true,
    },
  );
}
