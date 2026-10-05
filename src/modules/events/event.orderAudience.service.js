import { ORDER_STATUS } from "../orders/order.constants.js";
import { findOrdersByIdsAndEventId } from "../orders/repositories/order.repository.js";
import {
  findDistinctOrderIdsForActiveTicketsByEventId,
  findDistinctOrderIdsForParticipantTicketsByEventId,
} from "../tickets/repositories/ticket.repository.js";

function isConfirmedOrder(order) {
  return order?.status === ORDER_STATUS.CONFIRMED;
}

export async function findConfirmedOrdersWithActiveTicketsForEvent(
  eventId,
  { orders = null } = {},
) {
  const orderIds = await findDistinctOrderIdsForActiveTicketsByEventId(
    eventId,
    {
      lean: true,
    },
  );

  if (!orderIds.length) {
    return [];
  }

  const activeOrderIds = new Set(orderIds.map(String));

  const candidateOrders =
    orders ||
    (await findOrdersByIdsAndEventId(
      {
        orderIds,
        eventId,
      },
      {
        lean: true,
      },
    ));

  return candidateOrders.filter(
    (order) => isConfirmedOrder(order) && activeOrderIds.has(String(order.id)),
  );
}
export async function findParticipantOrdersForEvent(
  eventId,
  { orders = null } = {},
) {
  const orderIds = await findDistinctOrderIdsForParticipantTicketsByEventId(
    eventId,
    {
      lean: true,
    },
  );

  if (!orderIds.length) {
    return [];
  }

  const participantOrderIds = new Set(orderIds.map(String));

  const candidateOrders =
    orders ||
    (await findOrdersByIdsAndEventId(
      {
        orderIds,
        eventId,
      },
      {
        lean: true,
      },
    ));

  return candidateOrders.filter(
    (order) =>
      isConfirmedOrder(order) && participantOrderIds.has(String(order.id)),
  );
}
