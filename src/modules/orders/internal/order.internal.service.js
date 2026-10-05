// src/modules/orders/internal/order.internal.service.js
import { AppError } from "../../../core/errors/AppError.js";
import { logger } from "../../../config/logger.js";
import { withDatabaseTransaction } from "../../database/database.service.js";
import { randomReadableCode } from "../../../core/utils/codeGenerator.js";
import {
  buildOrderBuyerSnapshot,
  getOrderBuyerSnapshot,
} from "../order.buyerSnapshot.js";
import {
  ORDER_BUYER_TYPE,
  ORDER_MAIL_RESEND_TYPE,
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_SOURCE,
  ORDER_STATUS,
} from "../order.constants.js";
import { canManageEvent } from "../../permissions/eventAuthorization.service.js";
import { EVENT_STATUSES } from "../../events/event.constants.js";
import { findEventById } from "../../events/repositories/event.repository.js";
import {
  findTicketTypeByIdAndEventId,
  reserveTicketTypeStock,
} from "../../ticketTypes/repositories/ticketType.repository.js";
import {
  createOrder,
  findOrderById,
  listOrdersByEventInternal,
  updateOrderById,
} from "../repositories/order.repository.js";
import { TICKET_STATUS } from "../../tickets/ticket.constants.js";
import { cancelOrderExecutionService } from "../order.cancellationExecution.service.js";
import { executeOrderRefundService } from "../order.refundExecution.service.js";
import { terminatePendingOrderPaymentService } from "../order.pendingPaymentTermination.service.js";
import {
  findTicketsByOrderId,
  updateTicketBuyerSnapshotsByOrderId,
} from "../../tickets/repositories/ticket.repository.js";
import { generateTicketDocumentsForOrderService } from "../../tickets/ticket.service.js";
import { buildOrderEventSnapshot } from "../order.eventSnapshot.js";
import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_STATUS,
} from "../../ticketTypes/ticketType.constants.js";
import { fulfillConfirmedOrderService } from "../order.fulfillment.service.js";

import {
  toAdminManualOrderResultDto,
  toAdminOrderDetailDto,
  toAdminOrderDetailMetaDto,
  toAdminOrderDto,
  toAdminOrderListMetaDto,
} from "../order.dto.js";
import { assertTicketTypePricingAllowed } from "../../ticketTypes/ticketType.pricing.js";
import { resolveOrderItemPricing } from "../order.pricing.js";
import { EMAIL_DELIVERY_MODE } from "../../mail/mail.constants.js";
import {
  sendOrderCancelledMailSafe,
  sendOrderConfirmedMailSafe,
} from "../order.mail.service.js";

import {
  collectTicketPdfStorageReferences,
  deleteTicketPdfStorageReferencesSafe,
} from "../../tickets/ticketPdfStorage.service.js";

import { sendEventCancelledMailForOrderSafe } from "../../events/event.mail.service.js";
import { sendPaymentRefundCompletedMailSafe } from "../../paymentRefunds/paymentRefund.mail.service.js";

import { findPaymentRefundsByOrderId } from "../../paymentRefunds/repositories/paymentRefund.repository.js";

import {
  buildInternalOrderActions,
  findCompletedOrderPaymentRefund,
  getOrderBuyerEditAction,
  getOrderMailResendAction,
} from "./order.internal.actions.js";

import {
  archivedEventNotBookableError,
  buyerEmailRequiredError,
  cancelledEventNotBookableError,
  endedEventNotBookableError,
  eventNotBookableError,
  orderEventNotFoundError,
  orderItemsRequiredError,
  orderNotFoundError,
  orderCancellationNotAllowedError,
  orderTicketTypeNotFoundError,
  orderAccessRequiredError,
  orderManageForbiddenError,
  orderBuyerUpdateNotAllowedError,
  orderMailResendFailedError,
  orderMailResendNotAllowedError,
  ticketQuantityAboveMaximumError,
  ticketQuantityBelowMinimumError,
  ticketStockChangedError,
  ticketTypeInactiveError,
  ticketTypeSalesClosedError,
} from "../order.errors.js";

function cleanString(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return cleanString(value).toLowerCase();
}

function isWithinWindow(now, startAt, endAt) {
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
}

function generateOrderNumber() {
  const now = new Date();

  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");

  return `ORD-${datePart}-${randomReadableCode(6)}`;
}

function allEventSessionsEnded(event, now = new Date()) {
  if (!Array.isArray(event.sessions) || event.sessions.length === 0) {
    return true;
  }

  return event.sessions.every((session) => {
    if (!session?.endAt) return false;
    return new Date(session.endAt) < now;
  });
}

function assertInternalActor(actor) {
  if (!actor?.eventUserId || !actor?.eventUser) {
    throw orderAccessRequiredError();
  }
}

async function assertCanManageOrderEvent(actor, event) {
  assertInternalActor(actor);

  if (!(await canManageEvent(actor, event))) {
    throw orderManageForbiddenError();
  }
}

async function loadManageableOrderEvent(eventId, actor, options = {}) {
  assertInternalActor(actor);

  const event = await findEventById(eventId, {
    ...options,
    lean: true,
  });

  if (!event) {
    throw orderEventNotFoundError(eventId);
  }

  await assertCanManageOrderEvent(actor, event);

  return event;
}

function assertEventCanReceiveOrders({ event, eventId, now }) {
  if (event.status !== EVENT_STATUSES.PUBLISHED) {
    throw eventNotBookableError(eventId);
  }

  if (event.archivedAt || event.status === EVENT_STATUSES.ARCHIVED) {
    throw archivedEventNotBookableError(eventId);
  }

  if (event.cancelledAt || event.status === EVENT_STATUSES.CANCELLED) {
    throw cancelledEventNotBookableError(eventId);
  }

  if (allEventSessionsEnded(event, now)) {
    throw endedEventNotBookableError(eventId);
  }
}

function assertTicketTypeCanBeOrdered({
  ticketType,
  ticketTypeId,
  quantity,
  now,
}) {
  if (!ticketType) {
    throw orderTicketTypeNotFoundError();
  }

  const ticketTypeName = ticketType.displayName || ticketType.name || "ticket";

  if (ticketType.status !== TICKET_TYPE_STATUS.ACTIVE) {
    throw ticketTypeInactiveError(ticketTypeId);
  }

  if (!isWithinWindow(now, ticketType.salesStartAt, ticketType.salesEndAt)) {
    throw ticketTypeSalesClosedError(ticketTypeId);
  }

  const minPerOrder = ticketType.minPerOrder ?? 1;

  const maxPerOrder = ticketType.maxPerOrder ?? null;

  if (quantity < minPerOrder) {
    throw ticketQuantityBelowMinimumError({
      ticketTypeName,
      minPerOrder,
    });
  }

  if (maxPerOrder != null && quantity > maxPerOrder) {
    throw ticketQuantityAboveMaximumError({
      ticketTypeName,
      maxPerOrder,
    });
  }
}

function buildManualBuyerSnapshot(payload = {}) {
  const customer = payload.customer || {};
  const guest = payload.guest || {};

  const externalProvider =
    cleanString(payload.externalProvider || customer.externalProvider) || null;

  const externalUserId =
    cleanString(payload.externalUserId || customer.externalUserId) || null;

  const email = cleanEmail(
    payload.email || customer.emailSnapshot || customer.email || guest.email,
  );

  const firstName = cleanString(
    payload.firstName ||
      customer.firstNameSnapshot ||
      customer.firstName ||
      guest.firstName,
  );

  const lastName = cleanString(
    payload.lastName ||
      customer.lastNameSnapshot ||
      customer.lastName ||
      guest.lastName,
  );

  const displayName =
    cleanString(
      payload.displayName ||
        customer.displayNameSnapshot ||
        customer.displayName,
    ) || [firstName, lastName].filter(Boolean).join(" ");

  if (!email) {
    throw buyerEmailRequiredError();
  }

  return {
    buyerType:
      externalProvider && externalUserId
        ? ORDER_BUYER_TYPE.EXTERNAL_USER
        : ORDER_BUYER_TYPE.MANUAL,

    buyerExternalProvider: externalProvider,
    buyerExternalUserId: externalUserId,

    buyerEmailSnapshot: email,
    buyerFirstNameSnapshot: firstName,
    buyerLastNameSnapshot: lastName,
    buyerDisplayNameSnapshot: displayName,

    buyerRawExternalSnapshot: customer.rawExternalSnapshot || null,
  };
}

async function buildOrderItems({ eventId, items, now, tx }) {
  const normalizedItems = [];

  for (const item of items) {
    const ticketTypeId = String(item.ticketTypeId);

    const quantity = Math.max(1, Number(item.quantity || 1));

    const ticketType = await findTicketTypeByIdAndEventId(
      {
        ticketTypeId,
        eventId,
      },
      {
        ...tx,

        lean: true,
      },
    );
    assertTicketTypePricingAllowed({
      ticketKind: ticketType?.ticketKind,
      pricingMode: ticketType?.pricingMode,
      priceGross: ticketType?.priceGross,
    });
    if (ticketType?.ticketKind === TICKET_TYPE_KIND.DEPOSIT) {
      throw AppError.badRequest(
        "Deposit tickets cannot be created through manual orders.",
        {
          code: "MANUAL_DEPOSIT_TICKET_NOT_ALLOWED",
          title: "Deposit ticket not allowed",
          action:
            "Deposit tickets must be purchased through the payment-provider checkout.",
          fields: [
            {
              path: "body.ticketTypeId",
              message:
                "Deposit tickets cannot be assigned through a manual order.",
            },
          ],
        },
      );
    }
    assertTicketTypeCanBeOrdered({
      ticketType,
      ticketTypeId,
      quantity,
      now,
    });

    const { pricingMode, unitPrice } = resolveOrderItemPricing({
      ticketType,
      donationAmountGross: item.donationAmountGross,
      fieldPath: "body.donationAmountGross",
    });

    const lineTotal = unitPrice * quantity;

    const currency = (ticketType.currency || "EUR").toUpperCase();

    normalizedItems.push({
      orderItem: {
        ticketTypeId,
        eventId,

        quantity,
        unitPrice,
        lineTotal,
        currency,

        ticketTypeNameSnapshot: ticketType.displayName || ticketType.name,

        ticketTypeDescriptionSnapshot: ticketType.description || null,

        ticketKindSnapshot: ticketType.ticketKind || "normal",

        pricingModeSnapshot: pricingMode,
      },
    });
  }

  return normalizedItems;
}
async function reserveStockForItems({
  eventId,
  normalizedItems,
  tx,
  updatedByEventUserId,
}) {
  for (const item of normalizedItems) {
    const reservedTicketType = await reserveTicketTypeStock(
      {
        ticketTypeId: item.orderItem.ticketTypeId,

        eventId,

        quantity: item.orderItem.quantity,

        updatedByEventUserId,
      },
      tx,
    );

    if (!reservedTicketType) {
      throw ticketStockChangedError();
    }
  }
}
function throwOrderMailResendNotAllowed({ order, event, type, reason }) {
  throw orderMailResendNotAllowedError({
    orderId: order.id,
    type,
    reason,
    status: order.status,
    refundStatus: order.refundStatus || null,
    eventStatus: event.status || null,
  });
}

function assertOrderMailResendSucceeded({ result, order, event, type }) {
  if (result?.success === true && result?.skipped === false) {
    return;
  }

  if (!result || result.mail || result.error) {
    throw orderMailResendFailedError({
      orderId: order.id,
      type,
      reason: result?.reason || "mail_send_failed",
    });
  }

  throwOrderMailResendNotAllowed({
    order,
    event,
    type,
    reason: result.reason || "mail_not_available",
  });
}
async function buildInternalOrderDetailResult(order, { event = null } = {}) {
  const [tickets, paymentRefunds] = await Promise.all([
    findTicketsByOrderId(order.id, {
      lean: true,
    }),

    findPaymentRefundsByOrderId(
      {
        orderId: order.id,
      },
      {
        lean: true,
      },
    ),
  ]);

  const resolvedEvent =
    event ||
    (await findEventById(order.eventId, {
      lean: true,
    }));

  if (!resolvedEvent) {
    throw orderEventNotFoundError(order.eventId);
  }

  const orderDetail = toAdminOrderDetailDto({
    order,
    tickets,
  });

  const actions = buildInternalOrderActions({
    order,
    event: resolvedEvent,
    tickets,
    paymentRefunds,
  });

  return {
    order: orderDetail,

    meta: toAdminOrderDetailMetaDto(orderDetail, actions),
  };
}
export async function getInternalOrderByIdService({ actor, orderId }) {
  const order = await findOrderById(orderId, {
    lean: true,
  });

  if (!order) {
    throw orderNotFoundError(orderId);
  }

  const event = await loadManageableOrderEvent(order.eventId, actor);

  return buildInternalOrderDetailResult(order, {
    event,
  });
}
export async function updateInternalOrderBuyerService({
  actor,
  orderId,
  payload = {},
}) {
  const {
    order: updatedOrder,
    event,
    staleTicketPdfReferences,
  } = await withDatabaseTransaction(async (tx) => {
    const order = await findOrderById(orderId, {
      ...tx,
      lean: true,
    });

    if (!order) {
      throw orderNotFoundError(orderId);
    }

    const event = await loadManageableOrderEvent(order.eventId, actor, tx);

    const tickets = await findTicketsByOrderId(order.id, {
      ...tx,
      lean: true,
    });

    const staleTicketPdfReferences = collectTicketPdfStorageReferences(tickets);

    const buyerEditAction = getOrderBuyerEditAction({
      order,
      tickets,
    });

    if (!buyerEditAction.allowed) {
      throw orderBuyerUpdateNotAllowedError({
        orderId: order.id,
        buyerType: order.buyerType,
        status: order.status,
        reason: buyerEditAction.reason,
      });
    }

    const buyerSnapshot = buildOrderBuyerSnapshot({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
    });

    const currentBuyer = getOrderBuyerSnapshot(order);

    const emailChanged =
      currentBuyer.email !== buyerSnapshot.buyerEmailSnapshot;

    const orderAfterUpdate = await updateOrderById(
      order.id,
      {
        ...buyerSnapshot,

        ...(emailChanged
          ? {
              guestAccessTokenHash: null,
              guestAccessTokenExpiresAt: null,
            }
          : {}),

        updatedByEventUserId: actor.eventUserId,
      },
      tx,
    );

    if (!orderAfterUpdate) {
      throw orderNotFoundError(order.id);
    }

    await updateTicketBuyerSnapshotsByOrderId(
      order.id,
      {
        ...buyerSnapshot,
        updatedByEventUserId: actor.eventUserId,
      },
      tx,
    );

    return {
      order: orderAfterUpdate,
      event,
      staleTicketPdfReferences,
    };
  });
  await deleteTicketPdfStorageReferencesSafe(staleTicketPdfReferences, {
    orderId: updatedOrder.id,

    eventId: updatedOrder.eventId,

    reason: "order_buyer_updated",
  });

  if (updatedOrder.status === ORDER_STATUS.CONFIRMED) {
    await generateTicketDocumentsForOrderService({
      order: updatedOrder,
    });
  }

  return buildInternalOrderDetailResult(updatedOrder, {
    event,
  });
}
export async function resendInternalOrderMailService({ actor, orderId, type }) {
  const order = await findOrderById(orderId, {
    lean: true,
  });

  if (!order) {
    throw orderNotFoundError(orderId);
  }

  const event = await loadManageableOrderEvent(order.eventId, actor);
  const paymentRefunds = await findPaymentRefundsByOrderId(
    {
      orderId: order.id,
    },
    {
      lean: true,
    },
  );

  const resendAction = getOrderMailResendAction({
    type,
    order,
    event,
    paymentRefunds,
  });

  if (!resendAction.allowed) {
    throwOrderMailResendNotAllowed({
      order,
      event,
      type,
      reason: resendAction.reason,
    });
  }
  let result;

  switch (type) {
    case ORDER_MAIL_RESEND_TYPE.CONFIRMED: {
      const documents = await generateTicketDocumentsForOrderService({
        order,
      });

      if (!documents.skipped && documents.failed > 0) {
        throw orderMailResendFailedError({
          orderId: order.id,
          type,
          reason: "ticket_document_generation_failed",
        });
      }

      result = await sendOrderConfirmedMailSafe({
        order,
        context: {
          eventUserId: actor.eventUserId,
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      });

      break;
    }

    case ORDER_MAIL_RESEND_TYPE.CANCELLED: {
      result = await sendOrderCancelledMailSafe({
        order,
        context: {
          eventUserId: actor.eventUserId,
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      });

      break;
    }

    case ORDER_MAIL_RESEND_TYPE.REFUNDED: {
      const paymentRefund = findCompletedOrderPaymentRefund(paymentRefunds);

      result = await sendPaymentRefundCompletedMailSafe({
        paymentRefund,
        context: {
          eventUserId: actor.eventUserId,
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      });

      break;
    }

    case ORDER_MAIL_RESEND_TYPE.EVENT_CANCELLED: {
      result = await sendEventCancelledMailForOrderSafe({
        event,
        order,
        cancellationReason: event.cancellationReason || null,
        context: {
          eventUserId: actor.eventUserId,
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      });

      break;
    }

    default:
      throwOrderMailResendNotAllowed({
        order,
        event,
        type,
        reason: "unsupported_mail_type",
      });
  }

  assertOrderMailResendSucceeded({
    result,
    order,
    event,
    type,
  });

  const detail = await buildInternalOrderDetailResult(order, {
    event,
  });

  return {
    ...detail,
    mailResend: {
      type,
      email: result.email || null,
    },
  };
}
export async function cancelInternalOrderService({
  actor,
  orderId,
  reason = null,
}) {
  const order = await findOrderById(orderId, {
    lean: true,
  });

  if (!order) {
    throw orderNotFoundError(orderId);
  }

  const event = await loadManageableOrderEvent(order.eventId, actor);

  if (order.status === ORDER_STATUS.EXPIRED) {
    throw orderCancellationNotAllowedError({
      orderId: order.id,

      status: order.status,

      reason: "order_expired",
    });
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return buildInternalOrderDetailResult(order, {
      event,
    });
  }
  const tickets = await findTicketsByOrderId(order.id, {
    lean: true,
  });

  if (tickets.some((ticket) => ticket.status === TICKET_STATUS.CHECKED_IN)) {
    throw orderCancellationNotAllowedError({
      orderId: order.id,

      status: order.status,

      reason: "ticket_already_checked_in",
    });
  }
  const terminationResult = await terminatePendingOrderPaymentService({
    order,
  });

  const orderForCancellation = terminationResult.order || order;

  const cancellationResult = await cancelOrderExecutionService({
    order: orderForCancellation,

    reason,

    actor,

    fallbackReason: "Order cancelled by organizer",
  });

  const cancelledOrder =
    cancellationResult.order ||
    (await findOrderById(orderId, {
      lean: true,
    }));

  if (!cancelledOrder) {
    throw orderNotFoundError(orderId);
  }

  if (!cancellationResult.alreadyFinalized) {
    await sendOrderCancelledMailSafe({
      order: cancelledOrder,
      context: {
        eventUserId: actor.eventUserId,
      },
    });
  }

  return buildInternalOrderDetailResult(cancelledOrder, {
    event,
  });
}
export async function refundInternalOrderService({
  actor,
  orderId,
  reason = null,
}) {
  let order = await findOrderById(orderId, {
    lean: true,
  });

  if (!order) {
    throw orderNotFoundError(orderId);
  }

  const event = await loadManageableOrderEvent(order.eventId, actor);

  if (order.status === ORDER_STATUS.EXPIRED) {
    throw orderCancellationNotAllowedError({
      orderId: order.id,

      status: order.status,

      reason: "order_expired",
    });
  }

  /*
   * Solange wir Ticket-Refund-Semantik bewusst
   * außen vor lassen, darf eine Order mit bereits
   * eingechecktem Ticket nicht komplett
   * storniert/refundiert werden.
   */
  const tickets = await findTicketsByOrderId(order.id, {
    lean: true,
  });

  if (tickets.some((ticket) => ticket.status === TICKET_STATUS.CHECKED_IN)) {
    throw orderCancellationNotAllowedError({
      orderId: order.id,

      status: order.status,

      reason: "ticket_already_checked_in",
    });
  }

  /*
   * Falls das Payment noch pending ist, versuchen
   * wir zuerst die Provider-Session zu beenden.
   *
   * Wird sie währenddessen bezahlt, synchronisiert
   * dieser Service die Order auf CONFIRMED/PAID.
   * Die Refund-Engine refundiert anschließend
   * genau diese Zahlung.
   */
  const terminationResult = await terminatePendingOrderPaymentService({
    order,
  });

  order = terminationResult.order || order;

  const refund = await executeOrderRefundService({
    order,

    reason,

    actor,

    cancellationFallbackReason: "Order cancelled by organizer",

    metadataSource: "admin_order_refund",
  });

  /*
   * Immer den tatsächlich aktuellen Zustand laden.
   * Der Refund kann Order-/Payment-/Refund-State
   * während seiner Saga mehrfach aktualisieren.
   */
  const currentOrder = await findOrderById(orderId, {
    lean: true,
  });

  if (!currentOrder) {
    throw orderNotFoundError(orderId);
  }

  const detail = await buildInternalOrderDetailResult(currentOrder, {
    event,
  });

  return {
    ...detail,

    refund,
  };
}
export async function listEventOrdersInternalService({
  actor,
  eventId,
  page = 1,
  limit = 20,
  status,
  paymentStatus,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  const event = await loadManageableOrderEvent(eventId, actor);

  const result = await listOrdersByEventInternal(
    {
      eventId,
      page,
      limit,
      status,
      paymentStatus,
      search,
      sortBy,
      sortOrder,
    },
    {
      lean: true,
    },
  );

  const pagination = {
    page: result.page || page,

    limit: result.limit || limit,

    total: result.total || 0,

    pages: Math.ceil((result.total || 0) / (result.limit || limit)) || 1,
  };

  const summary = {
    total: result.total || 0,
  };

  return {
    items: (result.items || []).map((order) => toAdminOrderDto(order)),

    meta: toAdminOrderListMetaDto({
      event: {
        id: eventId,

        title: event.title,

        status: event.status,
      },

      pagination,

      summary,
    }),
  };
}

export async function createManualOrderForEventService({
  actor,
  eventId,
  payload = {},
}) {
  const canonicalEventId = String(eventId);
  const orderItems =
    Array.isArray(payload.items) && payload.items.length > 0
      ? payload.items
      : [
          {
            ticketTypeId: payload.ticketTypeId,
            quantity: payload.quantity || 1,
            donationAmountGross: payload.donationAmountGross,
          },
        ];

  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    throw orderItemsRequiredError();
  }

  const order = await withDatabaseTransaction(async (tx) => {
    const now = new Date();

    const event = await loadManageableOrderEvent(canonicalEventId, actor, tx);

    assertEventCanReceiveOrders({
      event,

      eventId: canonicalEventId,

      now,
    });

    const normalizedItems = await buildOrderItems({
      eventId: canonicalEventId,

      items: orderItems,

      now,
      tx,
    });

    await reserveStockForItems({
      eventId: canonicalEventId,

      normalizedItems,
      tx,

      updatedByEventUserId: actor.eventUserId,
    });

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.orderItem.lineTotal,
      0,
    );

    const currency = normalizedItems[0]?.orderItem?.currency || "EUR";

    const buyerSnapshot = buildManualBuyerSnapshot(payload);

    return createOrder(
      {
        orderNumber: generateOrderNumber(),

        ...buyerSnapshot,

        eventId: canonicalEventId,

        eventTitleSnapshot: event.title,

        eventSlugSnapshot: event.slug || null,

        eventCategorySnapshot: event.category || null,

        ...buildOrderEventSnapshot(event),

        items: normalizedItems.map((item) => item.orderItem),

        currency,
        subtotal,

        totalPrice: subtotal,

        status: ORDER_STATUS.CONFIRMED,

        paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

        paymentProviderPaymentId: null,

        paymentCheckoutUrl: null,

        source: ORDER_SOURCE.MANUAL,

        manualAssignmentReason:
          payload.reason || payload.manualAssignmentReason || null,

        confirmedAt: now,

        expiresAt: null,

        createdByEventUserId: actor.eventUserId,

        updatedByEventUserId: actor.eventUserId,

        metadata: null,
      },
      tx,
    );
  });

  let fulfillment = null;

  try {
    fulfillment = await fulfillConfirmedOrderService({
      orderId: order.id,

      context: {
        eventUserId: actor.eventUserId,
      },
    });
  } catch (error) {
    logger.error("Immediate manual order fulfillment failed", {
      orderId: order.id,
      eventId: canonicalEventId,
      eventUserId: actor.eventUserId,
      error: error?.message || String(error),
    });
  }

  const currentOrder =
    fulfillment?.order ||
    (await findOrderById(order.id, {
      lean: true,
    })) ||
    order;

  const tickets =
    fulfillment?.tickets ||
    (await findTicketsByOrderId(order.id, {
      lean: true,
    }));

  return toAdminManualOrderResultDto({
    order: currentOrder,
    tickets,
    documents: fulfillment?.documents || null,
  });
}
