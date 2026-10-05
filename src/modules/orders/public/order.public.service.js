// src/modules/orders/public/order.public.service.js
import { logger } from "../../../config/logger.js";
import { env } from "../../../config/env.js";
import { features } from "../../../config/features.js";
import { withDatabaseTransaction } from "../../database/database.service.js";
import { randomReadableCode } from "../../../core/utils/codeGenerator.js";
import { assertTicketTypePricingAllowed } from "../../ticketTypes/ticketType.pricing.js";
import {
  ORDER_BUYER_TYPE,
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_SOURCE,
  ORDER_STATUS,
} from "../order.constants.js";
import { toPublicOrderDto } from "../order.dto.js";
import { toPublicTicketDto } from "../../tickets/ticket.dto.js";
import { EVENT_STATUSES } from "../../events/event.constants.js";
import { TICKET_TYPE_STATUS } from "../../ticketTypes/ticketType.constants.js";
import { findEventById } from "../../events/repositories/event.repository.js";
import {
  findTicketTypeByIdAndEventId,
  reserveTicketTypeStock,
  releaseTicketTypeStock,
} from "../../ticketTypes/repositories/ticketType.repository.js";
import {
  createOrder,
  findOrderById,
  findOrderByIdAndExternalBuyer,
  listOrdersByExternalBuyer,
  markOrderPaymentFailed,
  markOrderPaymentPending,
  markPendingOrderPaymentFailed,
  markPendingOrderPaymentPaid,
  markTerminatedOrderLatePaymentRefunded,
  findOrderByIdWithGuestAccess,
  markGuestAccessUsed,
  findOrderByIdempotency,
  updateOrderById,
} from "../repositories/order.repository.js";
import { findTicketsByOrderIdAndBuyerIdentity } from "../../tickets/repositories/ticket.repository.js";

import { buildOrderEventSnapshot } from "../order.eventSnapshot.js";
import {
  createPaymentSession,
  getPaymentProviderCheckoutConfig,
  getPaymentSession,
  parsePaymentWebhook,
} from "../../payments/payment.service.js";
import {
  hashGuestAccessToken,
  issueGuestAccessForOrderService,
} from "../order.guestAccess.service.js";

import { fulfillConfirmedOrderService } from "../order.fulfillment.service.js";

import { executeCustomerOrderCancellationService } from "../order.customerCancellation.execution.service.js";

import { getCustomerOrderCancellationEligibilityService } from "../order.customerCancellation.service.js";

import { toPublicCustomerOrderCancellationDto } from "../order.customerCancellation.dto.js";

import {
  calculatePercentageDiscountAmount,
  getDiscountableOrderSubtotal,
  resolveOrderItemPricing,
} from "../order.pricing.js";

import {
  findDiscountCodeByEventIdAndCode,
  findDiscountCodeGroupByIdAndEventId,
} from "../../discountCodes/repositories/discountCode.repository.js";

import {
  discountCodesDisabledError,
  discountCodeNotApplicableError,
  invalidDiscountCodeError,
} from "../../discountCodes/discountCode.errors.js";

import { PAYMENT_REFUND_SOURCE_TYPE } from "../../paymentRefunds/paymentRefund.constants.js";

import { executePaymentRefundService } from "../../paymentRefunds/paymentRefund.service.js";

import {
  archivedEventNotBookableError,
  buyerEmailRequiredError,
  cancelledEventNotBookableError,
  endedEventNotBookableError,
  eventNotBookableError,
  expiredGuestAccessTokenError,
  externalBuyerIdentityRequiredError,
  guestAccessUnavailableError,
  guestCheckoutDisabledError,
  guestCheckoutHostServiceRequiredError,
  guestDataRequiredError,
  guestOrderNotFoundError,
  invalidGuestAccessTokenError,
  notGuestOrderError,
  orderEventNotFoundError,
  orderItemsRequiredError,
  orderTicketTypeNotFoundError,
  ownOrderNotFoundError,
  providerPaymentIdMissingError,
  ticketingDisabledError,
  ticketQuantityAboveMaximumError,
  ticketQuantityBelowMinimumError,
  ticketStockChangedError,
  ticketTypeInactiveError,
  ticketTypeSalesClosedError,
  customerCheckoutHostServiceRequiredError,
  checkoutIdempotencyInProgressError,
  checkoutIdempotencyKeyReusedError,
  orderCurrencyMismatchError,
} from "../order.errors.js";

function cleanString(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return cleanString(value).toLowerCase();
}
function buildCheckoutFromPersistedOrder(order) {
  if (!order?.paymentCheckoutUrl) {
    return null;
  }

  return {
    provider: order.paymentProvider,
    providerPaymentId: order.paymentProviderPaymentId || null,
    checkoutUrl: order.paymentCheckoutUrl,
    status:
      order.paymentStatus === ORDER_PAYMENT_STATUS.PENDING
        ? "open"
        : order.paymentStatus,
  };
}

function buildIdempotentReplayMessage(order) {
  if (order.paymentProvider === ORDER_PAYMENT_PROVIDER.NONE) {
    return order.totalPrice <= 0
      ? "Order confirmed."
      : "Order confirmed. Payment is handled externally.";
  }

  if (order.paymentStatus === ORDER_PAYMENT_STATUS.FAILED) {
    return order.cancellationReason || "Payment initialization failed.";
  }

  return null;
}

function buildIdempotentReplay(record, idempotency) {
  if (record.requestHash !== idempotency.requestHash) {
    throw checkoutIdempotencyKeyReusedError();
  }

  if (!record.completedAt) {
    throw checkoutIdempotencyInProgressError();
  }

  const order = record.order;

  return {
    order,
    checkout: buildCheckoutFromPersistedOrder(order),

    paymentInitializationFailed:
      order.paymentStatus === ORDER_PAYMENT_STATUS.FAILED &&
      order.cancellationReason === "Payment initialization failed",

    message: buildIdempotentReplayMessage(order),

    // The raw guest token is deliberately never
    // persisted or returned again.
    guestAccess: null,
    documents: null,
    mail: null,

    idempotencyReplayed: true,
  };
}

async function findIdempotentReplay(idempotency) {
  const record = await findOrderByIdempotency({
    scope: idempotency.scope,
    key: idempotency.key,
  });

  if (!record) {
    return null;
  }

  return buildIdempotentReplay(record, idempotency);
}

async function markCheckoutIdempotencyCompleted(order) {
  const orderId = String(order?.id ?? "").trim();

  if (!orderId) {
    throw new TypeError(
      "Cannot complete checkout idempotency without a canonical order id.",
    );
  }

  await updateOrderById(
    orderId,
    {
      idempotencyCompletedAt: new Date(),
    },
    {
      lean: true,
    },
  );

  const updatedOrder = await findOrderById(orderId, {
    lean: true,
  });

  if (!updatedOrder) {
    throw new TypeError(
      "Cannot reload checkout order after completing idempotency.",
    );
  }

  return updatedOrder;
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

function assertEventCanReceiveOrders(event, now) {
  if (!event) {
    throw orderEventNotFoundError();
  }

  const eventId = event.id;

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

function assertTicketTypeCanBeOrdered({ ticketType, quantity, now }) {
  if (!ticketType) {
    throw orderTicketTypeNotFoundError();
  }

  const ticketTypeId = ticketType.id;

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

function buildBuyerSnapshot({ actor, guest, customer }) {
  const actorProvider = cleanString(actor?.externalProvider);
  const actorExternalUserId = cleanString(actor?.externalUserId);

  const customerProvider = cleanString(customer?.externalProvider);
  const customerExternalUserId = cleanString(customer?.externalUserId);

  const externalProvider = customerProvider || actorProvider || null;
  const externalUserId = customerExternalUserId || actorExternalUserId || null;

  const hasExternalBuyerIdentity = Boolean(externalProvider && externalUserId);

  const email =
    cleanEmail(
      customer?.emailSnapshot ||
        customer?.email ||
        guest?.email ||
        actor?.email,
    ) || "";

  const firstName =
    cleanString(
      customer?.firstNameSnapshot ||
        customer?.firstName ||
        guest?.firstName ||
        actor?.rawClaims?.firstName ||
        actor?.rawClaims?.given_name,
    ) || "";

  const lastName =
    cleanString(
      customer?.lastNameSnapshot ||
        customer?.lastName ||
        guest?.lastName ||
        actor?.rawClaims?.lastName ||
        actor?.rawClaims?.family_name,
    ) || "";

  const displayName =
    cleanString(customer?.displayNameSnapshot || customer?.displayName) ||
    [firstName, lastName].filter(Boolean).join(" ");

  const type = hasExternalBuyerIdentity
    ? ORDER_BUYER_TYPE.EXTERNAL_USER
    : ORDER_BUYER_TYPE.GUEST;

  if (!email) {
    throw buyerEmailRequiredError();
  }

  return {
    buyerType: type,

    // Wichtig:
    // Bei Guest Checkout speichern wir KEINE externe Buyer-Identity.
    // Der Host-Service ist nur der technische Caller, nicht der Käufer.
    buyerExternalProvider: hasExternalBuyerIdentity ? externalProvider : null,
    buyerExternalUserId: hasExternalBuyerIdentity ? externalUserId : null,

    buyerEmailSnapshot: email,
    buyerFirstNameSnapshot: firstName,
    buyerLastNameSnapshot: lastName,
    buyerDisplayNameSnapshot: displayName,

    // Raw external snapshot nur bei echtem external_user.
    // Bei guest wäre das sonst nur der Host-Service-JWT und fachlich irreführend.
    buyerRawExternalSnapshot: hasExternalBuyerIdentity
      ? customer?.rawExternalSnapshot || actor?.rawClaims || null
      : null,
  };
}
function buildHostServiceOwnership(actor) {
  if (!actor?.isHostService) {
    return {
      hostServiceProvider: null,
      hostServiceId: null,
    };
  }

  return {
    hostServiceProvider: cleanString(actor.externalProvider) || null,
    hostServiceId: cleanString(actor.hostServiceId) || null,
  };
}
function assertActorCanAccessOwnOrders(actor) {
  if (!actor?.externalProvider || !actor?.externalUserId) {
    throw externalBuyerIdentityRequiredError();
  }
}

function getPaymentProviderForOrder(totalPrice) {
  if (totalPrice <= 0) {
    return ORDER_PAYMENT_PROVIDER.NONE;
  }

  const provider = String(env.payments?.provider || "").toLowerCase();

  if (
    provider === ORDER_PAYMENT_PROVIDER.MOLLIE ||
    provider === ORDER_PAYMENT_PROVIDER.STRIPE
  ) {
    return provider;
  }

  return ORDER_PAYMENT_PROVIDER.NONE;
}

function getInitialPaymentStatus({ totalPrice, paymentProvider }) {
  if (totalPrice <= 0 || paymentProvider === ORDER_PAYMENT_PROVIDER.NONE) {
    return ORDER_PAYMENT_STATUS.NOT_REQUIRED;
  }

  return ORDER_PAYMENT_STATUS.PENDING;
}

function getInitialOrderStatus(paymentProvider) {
  if (paymentProvider === ORDER_PAYMENT_PROVIDER.NONE) {
    return ORDER_STATUS.CONFIRMED;
  }

  return ORDER_STATUS.PENDING;
}

function assertCheckoutFeatureCombinationAllowed() {
  if (!features.ticketing) {
    throw ticketingDisabledError();
  }
}
function getExpiryDate(paymentProvider) {
  if (paymentProvider === ORDER_PAYMENT_PROVIDER.NONE) {
    return null;
  }

  return new Date(Date.now() + 5 * 60 * 1000);
}

async function buildOrderItems({ event, items, now, tx }) {
  const normalizedItems = [];

  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity || 1));

    const ticketType = await findTicketTypeByIdAndEventId(
      {
        ticketTypeId: item.ticketTypeId,
        eventId: event.id,
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

    assertTicketTypeCanBeOrdered({
      ticketType,
      quantity,
      now,
    });

    const { pricingMode, unitPrice } = resolveOrderItemPricing({
      ticketType,
      donationAmountGross: item.donationAmountGross,
      fieldPath: "body.items[].donationAmountGross",
    });
    const lineTotal = unitPrice * quantity;
    const currency = (ticketType.currency || "EUR").toUpperCase();

    normalizedItems.push({
      ticketType,
      orderItem: {
        ticketTypeId: ticketType.id,
        eventId: event.id,
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
async function resolveCheckoutDiscount({
  eventId,
  discountCode,
  orderItems,
  tx,
}) {
  if (!discountCode) {
    return null;
  }

  if (!features.discountCodes) {
    throw discountCodesDisabledError();
  }

  const code = await findDiscountCodeByEventIdAndCode(
    {
      eventId,
      code: discountCode,
    },
    {
      ...tx,
      lean: true,
    },
  );

  if (!code || !code.isActive) {
    throw invalidDiscountCodeError();
  }

  const group = await findDiscountCodeGroupByIdAndEventId(
    {
      groupId: code.groupId,
      eventId,
    },
    {
      ...tx,
      lean: true,
    },
  );

  if (!group || !group.isActive) {
    throw invalidDiscountCodeError();
  }

  const discountableSubtotal = getDiscountableOrderSubtotal(orderItems);

  if (discountableSubtotal <= 0) {
    throw discountCodeNotApplicableError();
  }

  const discountAmount = calculatePercentageDiscountAmount({
    amount: discountableSubtotal,

    discountPercent: group.discountPercent,
  });

  if (discountAmount <= 0) {
    throw discountCodeNotApplicableError();
  }

  return {
    discountCodeIdSnapshot: code.id,

    discountCodeSnapshot: code.code,

    discountCodeGroupIdSnapshot: group.id,

    discountCodeGroupNameSnapshot: group.name,

    discountPercent: group.discountPercent,

    discountAmount,
  };
}
async function reserveStockForItems({ event, normalizedItems, tx }) {
  for (const item of normalizedItems) {
    const reservedTicketType = await reserveTicketTypeStock(
      {
        ticketTypeId: item.ticketType.id,
        eventId: event.id,
        quantity: item.orderItem.quantity,
        updatedByEventUserId: null,
      },
      tx,
    );

    if (!reservedTicketType) {
      throw ticketStockChangedError();
    }
  }
}

async function releaseStockForOrderItems(order, tx = {}) {
  if (!Array.isArray(order?.items)) return;

  for (const item of order.items) {
    await releaseTicketTypeStock(
      {
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        updatedByEventUserId:
          order.updatedByEventUserId || order.createdByEventUserId || null,
      },
      tx,
    );
  }
}
async function attachGuestAccessIfNeeded(order) {
  if (order.buyerType !== ORDER_BUYER_TYPE.GUEST) {
    return {
      order,
      guestAccess: null,
    };
  }

  return issueGuestAccessForOrderService(order);
}
function buildPaymentRedirectUrl({ baseRedirectUrl, order, isGuest }) {
  if (!baseRedirectUrl) return undefined;

  const url = new URL(baseRedirectUrl);

  url.searchParams.set("orderId", order.id);

  if (order.orderNumber) {
    url.searchParams.set("orderNumber", order.orderNumber);
  }

  if (isGuest) {
    url.searchParams.set("guest", "1");
  }

  return url.toString();
}
export async function checkoutPublicOrderService({
  actor,
  eventId,
  discountCode = null,
  items,
  guest,
  customer,
  idempotency,
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw orderItemsRequiredError();
  }
  const existingReplay = await findIdempotentReplay(idempotency);

  if (existingReplay) {
    return existingReplay;
  }
  if (customer && !actor?.isHostService) {
    throw customerCheckoutHostServiceRequiredError();
  }

  const buyerSnapshot = buildBuyerSnapshot({
    actor,
    guest,
    customer,
  });
  const hostServiceOwnership = buildHostServiceOwnership(actor);
  if (buyerSnapshot.buyerType === ORDER_BUYER_TYPE.GUEST) {
    if (!features.guestCheckout) {
      throw guestCheckoutDisabledError();
    }

    if (!actor?.isHostService) {
      throw guestCheckoutHostServiceRequiredError();
    }

    if (!guest) {
      throw guestDataRequiredError();
    }
  }

  let createdOrder;

  try {
    createdOrder = await withDatabaseTransaction(async (tx) => {
      const now = new Date();

      const event = await findEventById(eventId, {
        ...tx,
        lean: true,
      });

      assertEventCanReceiveOrders(event, now);

      const normalizedItems = await buildOrderItems({
        event,
        items,
        now,
        tx,
      });

      const orderItems = normalizedItems.map((item) => item.orderItem);

      const currencies = new Set(orderItems.map((item) => item.currency));

      if (currencies.size !== 1) {
        throw orderCurrencyMismatchError();
      }

      const [currency] = currencies;

      const subtotal = orderItems.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );

      if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
        throw new TypeError(
          "Order subtotal exceeds the supported integer range.",
        );
      }

      assertCheckoutFeatureCombinationAllowed();

      const discount = await resolveCheckoutDiscount({
        eventId: event.id,

        discountCode,

        orderItems,

        tx,
      });

      const discountAmount = discount?.discountAmount || 0;

      const totalPrice = subtotal - discountAmount;

      const paymentProvider = getPaymentProviderForOrder(totalPrice);

      const paymentConfig =
        paymentProvider !== ORDER_PAYMENT_PROVIDER.NONE
          ? getPaymentProviderCheckoutConfig(paymentProvider)
          : null;

      const paymentStatus = getInitialPaymentStatus({
        totalPrice,
        paymentProvider,
      });

      const status = getInitialOrderStatus(paymentProvider);

      const confirmedAt = status === ORDER_STATUS.CONFIRMED ? now : null;

      const order = await createOrder(
        {
          orderNumber: generateOrderNumber(),

          idempotencyScope: idempotency.scope,
          idempotencyKey: idempotency.key,
          idempotencyRequestHash: idempotency.requestHash,
          idempotencyCompletedAt: null,

          ...hostServiceOwnership,
          ...buyerSnapshot,

          eventId: event.id,
          eventTitleSnapshot: event.title,
          eventSlugSnapshot: event.slug || null,
          eventCategorySnapshot: event.category || null,

          ...buildOrderEventSnapshot(event),

          items: orderItems,

          currency,
          subtotal,

          discountCodeIdSnapshot: discount?.discountCodeIdSnapshot || null,

          discountCodeSnapshot: discount?.discountCodeSnapshot || null,

          discountCodeGroupIdSnapshot:
            discount?.discountCodeGroupIdSnapshot || null,

          discountCodeGroupNameSnapshot:
            discount?.discountCodeGroupNameSnapshot || null,

          discountPercent: discount?.discountPercent ?? null,

          discountAmount,

          totalPrice,

          status,
          paymentStatus,
          paymentProvider,

          paymentProviderPaymentId: null,
          paymentCheckoutUrl: null,
          paymentRedirectUrl: paymentConfig?.redirectUrl || null,
          paymentWebhookUrl: paymentConfig?.webhookUrl || null,

          source: ORDER_SOURCE.PUBLIC,
          manualAssignmentReason: null,

          confirmedAt,
          expiresAt: getExpiryDate(paymentProvider),

          createdByEventUserId: null,
          updatedByEventUserId: null,

          metadata: null,
        },
        tx,
      );

      /**
       * Only the request that successfully claimed
       * the idempotency key may reserve stock.
       */
      await reserveStockForItems({
        event,
        normalizedItems,
        tx,
      });

      return order;
    });
  } catch (error) {
    /**
     * A concurrent request may have inserted the
     * same scope/key first.
     */
    const concurrentReplay = await findIdempotentReplay(idempotency);

    if (concurrentReplay) {
      return concurrentReplay;
    }

    throw error;
  }

  let order = createdOrder;
  let checkout = null;
  let paymentInitializationFailed = false;
  let message = null;

  let guestAccessResult = await attachGuestAccessIfNeeded(order);
  order = guestAccessResult.order;

  if (order.paymentProvider === ORDER_PAYMENT_PROVIDER.NONE) {
    let fulfillment = null;

    try {
      fulfillment = await fulfillConfirmedOrderService({
        orderId: order.id,
        context: {},
      });

      order = fulfillment?.order || order;
    } catch (error) {
      logger.error("Immediate free order fulfillment failed", {
        orderId: order.id,
        error,
      });
    }

    order = await markCheckoutIdempotencyCompleted(order);

    return {
      order,

      checkout: null,

      paymentInitializationFailed: false,

      message:
        order.totalPrice <= 0
          ? "Order confirmed."
          : "Order confirmed. Payment is handled externally.",

      documents: fulfillment?.documents || null,

      mail: fulfillment?.mail || null,

      guestAccess: guestAccessResult.guestAccess,

      idempotencyReplayed: false,
    };
  }

  try {
    const paymentRedirectUrl = buildPaymentRedirectUrl({
      baseRedirectUrl: order.paymentRedirectUrl || null,
      order,
      isGuest: order.buyerType === ORDER_BUYER_TYPE.GUEST,
    });

    checkout = await createPaymentSession({
      provider: order.paymentProvider,
      amount: order.totalPrice / 100,
      currency: order.currency || "EUR",
      description: `Order ${order.orderNumber}`,
      orderId: order.id,
      redirectUrl: paymentRedirectUrl,
      webhookUrl: order.paymentWebhookUrl || undefined,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        eventId: String(order.eventId),
        isGuest: order.buyerType === ORDER_BUYER_TYPE.GUEST,
      },
    });

    order = await markOrderPaymentPending(
      order.id,
      {
        paymentProviderPaymentId: checkout.providerPaymentId || null,
        paymentCheckoutUrl: checkout.checkoutUrl || null,
      },
      {
        lean: true,
      },
    );
  } catch (error) {
    paymentInitializationFailed = true;
    message = error.message;

    order = await withDatabaseTransaction(async (tx) => {
      await releaseStockForOrderItems(order, tx);

      return markOrderPaymentFailed(
        order.id,
        {
          cancellationReason: "Payment initialization failed",
          updatedByEventUserId: null,
        },
        {
          ...tx,
          lean: true,
        },
      );
    });
  }
  order = await markCheckoutIdempotencyCompleted(order);
  return {
    order,
    idempotencyReplayed: false,
    checkout,
    paymentInitializationFailed,
    message,
    guestAccess: guestAccessResult.guestAccess,
  };
}
export async function listOwnOrdersService({
  actor,
  page = 1,
  limit = 20,
  status,
  paymentStatus,
}) {
  assertActorCanAccessOwnOrders(actor);

  const result = await listOrdersByExternalBuyer(
    {
      externalProvider: actor.externalProvider,
      externalUserId: actor.externalUserId,
      page,
      limit,
      status,
      paymentStatus,
    },
    {
      lean: true,
    },
  );

  return {
    items: (result.items || []).map((order) => toPublicOrderDto(order)),

    pagination: {
      page: result.page || page,
      limit: result.limit || limit,
      total: result.total || 0,

      pages: Math.ceil((result.total || 0) / (result.limit || limit)) || 1,
    },
  };
}

export async function getOwnOrderByIdService({ actor, orderId }) {
  assertActorCanAccessOwnOrders(actor);

  const order = await findOrderByIdAndExternalBuyer(
    {
      orderId,

      externalProvider: actor.externalProvider,

      externalUserId: actor.externalUserId,
    },
    {
      lean: true,
    },
  );

  if (!order) {
    throw ownOrderNotFoundError(orderId);
  }

  const tickets = await findTicketsByOrderIdAndBuyerIdentity(
    {
      orderId: order.id,

      buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,

      externalProvider: actor.externalProvider,

      externalUserId: actor.externalUserId,
    },
    {
      lean: true,
    },
  );
  const cancellation = await getCustomerOrderCancellationEligibilityService({
    order,
  });

  return {
    order: toPublicOrderDto(order),

    tickets: tickets.map((ticket) => toPublicTicketDto(ticket)),

    cancellation: toPublicCustomerOrderCancellationDto(cancellation),
  };
}

export async function cancelOwnOrderService({ actor, orderId, reason }) {
  assertActorCanAccessOwnOrders(actor);

  const order = await findOrderByIdAndExternalBuyer(
    {
      orderId,

      externalProvider: actor.externalProvider,

      externalUserId: actor.externalUserId,
    },
    {
      lean: true,
    },
  );

  if (!order) {
    throw ownOrderNotFoundError(orderId);
  }

  const result = await executeCustomerOrderCancellationService({
    order,

    reason: reason || "Cancelled by buyer",
  });

  return toPublicOrderDto(result.order);
}
async function refundLatePaidPublicOrder({ order, providerPaymentId }) {
  const orderId = String(order.id);
  const amount = Number(order.totalPrice || 0);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(
      `Cannot refund late payment for order ${orderId}: invalid order total.`,
    );
  }

  const storedProviderPaymentId = String(
    order.paymentProviderPaymentId || "",
  ).trim();

  if (
    storedProviderPaymentId &&
    storedProviderPaymentId !== String(providerPaymentId)
  ) {
    throw new Error(
      `Cannot refund late payment for order ${orderId}: provider payment id does not match.`,
    );
  }

  if (
    order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED &&
    order.refundStatus === ORDER_REFUND_STATUS.COMPLETED
  ) {
    return {
      success: true,
      ignored: true,
      reason: "late_payment_already_refunded",
      order,
    };
  }

  const result = await executePaymentRefundService({
    sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,

    sourceId: orderId,
    orderId,
    ticketId: null,

    provider: order.paymentProvider,

    providerPaymentId: storedProviderPaymentId || providerPaymentId,

    amount,

    currency: order.currency || "EUR",

    /*
     * Absichtlich derselbe globale Order-Refund-Key,
     * den auch normale vollständige Order-Refunds verwenden.
     *
     * Pro Order darf es genau einen vollständigen
     * Order-Refund geben.
     */
    idempotencyKey: `order-refund:${orderId}`,

    description: `Automatic refund - order ${order.orderNumber || orderId} was already closed`,

    metadata: {
      source: "late_payment_after_order_termination",
      orderId,
      previousOrderStatus: order.status,
      previousPaymentStatus: order.paymentStatus,
    },

    actor: null,

    finalizeLocalState: async ({ paymentRefund }) => {
      const refundedOrder = await markTerminatedOrderLatePaymentRefunded(
        orderId,
        {
          refundReason:
            "Payment completed after the order was already terminated.",

          refundedAmount: amount,

          paymentProviderPaymentId:
            storedProviderPaymentId || providerPaymentId,

          paymentProviderRefundId: paymentRefund.providerRefundId || null,

          refundedAt: new Date(),

          updatedByEventUserId: null,
        },
        {
          lean: true,
        },
      );

      if (refundedOrder) {
        return {
          order: refundedOrder,
          alreadyFinalized: false,
        };
      }

      /*
       * Idempotency / paralleler Webhook:
       * Ein anderer Request kann den Refund bereits
       * vollständig lokal finalisiert haben.
       */
      const currentOrder = await findOrderById(orderId, {
        lean: true,
      });

      if (
        currentOrder?.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED &&
        currentOrder?.refundStatus === ORDER_REFUND_STATUS.COMPLETED
      ) {
        return {
          order: currentOrder,
          alreadyFinalized: true,
        };
      }

      throw new Error(
        `Order ${orderId} could not be finalized after late payment refund.`,
      );
    },
  });

  /*
   * Die Refund-Saga kann z. B. wegen Retry-Lease,
   * Provider-Fehler oder manual_review noch nicht
   * abgeschlossen sein.
   *
   * Dann beantworten wir den Payment-Webhook bewusst
   * NICHT erfolgreich. So wird der Zustand nicht
   * stillschweigend als erledigt behandelt.
   */
  if (!result.success) {
    throw new Error(
      `Late payment refund for order ${orderId} is incomplete: ${
        result.reason || "unknown_reason"
      }`,
    );
  }

  const currentOrder =
    result.localResult?.order ||
    (await findOrderById(orderId, {
      lean: true,
    })) ||
    order;

  return {
    success: true,
    ignored: false,
    reason: "late_payment_refunded",
    order: currentOrder,
    refund: result.providerRefund || null,
  };
}
async function finalizePaidPublicOrder({
  order,
  providerPaymentId,
  context = {},
}) {
  const orderId = order.id;

  const transitionedOrder = await markPendingOrderPaymentPaid(
    orderId,
    {
      paymentProviderPaymentId: providerPaymentId,
      confirmedAt: order.confirmedAt || new Date(),
    },
    {
      lean: true,
    },
  );

  const paidOrder =
    transitionedOrder ||
    (await findOrderById(orderId, {
      lean: true,
    }));

  if (!paidOrder || paidOrder.paymentStatus !== ORDER_PAYMENT_STATUS.PAID) {
    return {
      success: true,
      ignored: true,
      reason: "payment_already_processed",
      order: paidOrder || order,
      tickets: [],
      documents: null,
      mail: null,
    };
  }

  return fulfillConfirmedOrderService({
    orderId,
    context,
  });
}
export async function handlePaymentWebhookService({
  provider,
  body,
  headers,
  rawBody,
}) {
  const webhookEvent = await parsePaymentWebhook({
    provider,
    body,
    headers,
    rawBody,
  });

  if (webhookEvent.ignored === true) {
    return {
      success: true,
      ignored: true,
      reason: webhookEvent.ignoreReason || "webhook_event_not_actionable",
      eventType: webhookEvent.eventType || null,
    };
  }

  const providerPaymentId = webhookEvent.providerPaymentId;

  if (!providerPaymentId) {
    throw providerPaymentIdMissingError();
  }

  const paymentSession = await getPaymentSession({
    provider,
    providerPaymentId,
  });

  const providerStatus = String(paymentSession.status || "").toLowerCase();

  const status = {
    provider: paymentSession.provider || provider,
    providerPaymentId: paymentSession.providerPaymentId || providerPaymentId,

    orderId:
      paymentSession.orderId ||
      paymentSession.metadata?.orderId ||
      paymentSession.rawPayment?.metadata?.orderId ||
      webhookEvent.rawEvent?.data?.object?.metadata?.orderId ||
      null,

    paymentStatus:
      providerStatus === "paid"
        ? ORDER_PAYMENT_STATUS.PAID
        : ["failed", "canceled", "cancelled", "expired"].includes(
              providerStatus,
            )
          ? ORDER_PAYMENT_STATUS.FAILED
          : ORDER_PAYMENT_STATUS.PENDING,

    rawStatus: paymentSession.rawStatus || paymentSession.status || null,
  };

  const order = status.orderId
    ? await findOrderById(status.orderId, { lean: true })
    : null;

  if (!order) {
    return {
      ignored: true,
      reason: "order_not_found",
    };
  }

  if (status.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
    if (
      order.status === ORDER_STATUS.EXPIRED ||
      order.status === ORDER_STATUS.CANCELLED
    ) {
      return refundLatePaidPublicOrder({
        order,
        providerPaymentId,
      });
    }

    return finalizePaidPublicOrder({
      order,
      providerPaymentId,
      context: {},
    });
  }

  if (status.paymentStatus === ORDER_PAYMENT_STATUS.FAILED) {
    const failedOrder = await withDatabaseTransaction(async (tx) => {
      const transitionedOrder = await markPendingOrderPaymentFailed(
        order.id,
        {
          paymentProviderPaymentId: providerPaymentId,
        },
        {
          ...tx,
          lean: true,
        },
      );

      if (!transitionedOrder) {
        return null;
      }

      await releaseStockForOrderItems(order, tx);

      return transitionedOrder;
    });

    if (!failedOrder) {
      const alreadyProcessedOrder = await findOrderById(order.id, {
        lean: true,
      });

      return {
        success: true,
        ignored: true,
        reason: "payment_already_processed",
        order: alreadyProcessedOrder || order,
      };
    }

    return {
      success: true,
      order: failedOrder,
    };
  }

  return {
    success: true,
    ignored: true,
    reason: "payment_status_not_actionable",
    status,
  };
}
async function resolveGuestOrderByAccessToken({ orderId, accessToken }) {
  const order = await findOrderByIdWithGuestAccess(orderId, {
    lean: true,
  });

  if (!order) {
    throw guestOrderNotFoundError(orderId);
  }

  if (order.buyerType !== ORDER_BUYER_TYPE.GUEST) {
    throw notGuestOrderError(orderId);
  }

  if (!order.guestAccessTokenHash) {
    throw guestAccessUnavailableError(orderId);
  }

  const tokenHash = hashGuestAccessToken(accessToken);

  if (tokenHash !== order.guestAccessTokenHash) {
    throw invalidGuestAccessTokenError(orderId);
  }

  if (
    order.guestAccessTokenExpiresAt &&
    new Date(order.guestAccessTokenExpiresAt) < new Date()
  ) {
    throw expiredGuestAccessTokenError(orderId);
  }

  return order;
}
export async function getGuestOrderByAccessTokenService({
  orderId,
  accessToken,
}) {
  const order = await resolveGuestOrderByAccessToken({
    orderId,
    accessToken,
  });

  await markGuestAccessUsed(order.id);

  const tickets = await findTicketsByOrderIdAndBuyerIdentity(
    {
      orderId: order.id,

      buyerType: ORDER_BUYER_TYPE.GUEST,

      externalProvider: null,

      externalUserId: null,
    },
    {
      lean: true,
    },
  );

  const cancellation = await getCustomerOrderCancellationEligibilityService({
    order,
  });

  return {
    order: toPublicOrderDto(order),

    tickets: tickets.map((ticket) => toPublicTicketDto(ticket)),

    cancellation: toPublicCustomerOrderCancellationDto(cancellation),
  };
}
export async function cancelGuestOrderByAccessTokenService({
  orderId,
  accessToken,
  reason,
}) {
  const order = await resolveGuestOrderByAccessToken({
    orderId,
    accessToken,
  });

  const result = await executeCustomerOrderCancellationService({
    order,

    reason: reason || "Cancelled by buyer",
  });

  return toPublicOrderDto(result.order);
}
