import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

import {
  ORDER_BUYER_TYPE,
  ORDER_FULFILLMENT_STATUS,
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_SOURCE,
  ORDER_STATUS,
} from "./order.constants.js";

import {
  calculatePercentageDiscountAmount,
  getDiscountableOrderSubtotal,
} from "./order.pricing.js";

import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
} from "../ticketTypes/ticketType.constants.js";

import { EVENT_STATUSES } from "../events/event.constants.js";

import { toAdminTicketDto } from "../tickets/ticket.dto.js";

const ORDER_BUYER_TYPE_VALUES = Object.values(ORDER_BUYER_TYPE);
const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);
const ORDER_PAYMENT_STATUS_VALUES = Object.values(ORDER_PAYMENT_STATUS);
const ORDER_PAYMENT_PROVIDER_VALUES = Object.values(ORDER_PAYMENT_PROVIDER);
const ORDER_REFUND_STATUS_VALUES = Object.values(ORDER_REFUND_STATUS);
const ORDER_SOURCE_VALUES = Object.values(ORDER_SOURCE);
const TICKET_TYPE_KIND_VALUES = Object.values(TICKET_TYPE_KIND);
const EVENT_STATUS_VALUES = Object.values(EVENT_STATUSES);
const TICKET_TYPE_PRICING_MODE_VALUES = Object.values(TICKET_TYPE_PRICING_MODE);
const ORDER_FULFILLMENT_STATUS_VALUES = Object.values(ORDER_FULFILLMENT_STATUS);
function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize an order without ${fieldName}.`);
  }

  return id;
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(`Cannot serialize an order without ${fieldName}.`);
  }

  return date;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`Cannot serialize an order without ${fieldName}.`);
  }

  return normalized;
}

function normalizeOptionalString(value) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value) {
  const normalized = normalizeOptionalString(value);

  return normalized || null;
}

function normalizeEnum(value, allowedValues, fieldName) {
  const normalized = normalizeOptionalString(value);

  if (!allowedValues.includes(normalized)) {
    throw new TypeError(`Cannot serialize an invalid order ${fieldName}.`);
  }

  return normalized;
}

function normalizeInteger(value, fieldName, { minimum = 0 } = {}) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < minimum) {
    throw new TypeError(`Cannot serialize an invalid order ${fieldName}.`);
  }

  return normalized;
}
function normalizeBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Cannot serialize an order without boolean ${fieldName}.`,
    );
  }

  return value;
}
function buildBuyerDisplayName(order) {
  return (
    normalizeOptionalString(order.buyerDisplayNameSnapshot) ||
    [
      normalizeOptionalString(order.buyerFirstNameSnapshot),
      normalizeOptionalString(order.buyerLastNameSnapshot),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function assertExternalBuyerIdentity(order, buyerType) {
  if (buyerType !== ORDER_BUYER_TYPE.EXTERNAL_USER) {
    return;
  }

  if (
    !normalizeOptionalString(order.buyerExternalProvider) ||
    !normalizeOptionalString(order.buyerExternalUserId)
  ) {
    throw new TypeError(
      "Cannot serialize an external order buyer without provider and user id.",
    );
  }
}

function toPublicOrderItemDto(item, { eventId, currency }) {
  if (!item) {
    throw new TypeError("Cannot serialize a missing order item.");
  }

  const itemEventId = requireApiId(item.eventId, "item eventId");

  if (itemEventId !== eventId) {
    throw new TypeError(
      "Cannot serialize an order item for a different event.",
    );
  }

  const itemCurrency = normalizeRequiredString(
    item.currency,
    "item currency",
  ).toUpperCase();

  if (itemCurrency !== currency) {
    throw new TypeError(
      "Cannot serialize an order item with a different currency.",
    );
  }

  const quantity = normalizeInteger(item.quantity, "item quantity", {
    minimum: 1,
  });

  const unitPrice = normalizeInteger(item.unitPrice, "item unitPrice");

  const lineTotal = normalizeInteger(item.lineTotal, "item lineTotal");

  if (lineTotal !== quantity * unitPrice) {
    throw new TypeError(
      "Cannot serialize an order item with an inconsistent line total.",
    );
  }

  return {
    ticketType: {
      id: requireApiId(item.ticketTypeId, "item ticketTypeId"),

      displayName: normalizeRequiredString(
        item.ticketTypeNameSnapshot,
        "item ticketTypeNameSnapshot",
      ),

      description: normalizeOptionalString(item.ticketTypeDescriptionSnapshot),

      kind: normalizeEnum(
        item.ticketKindSnapshot,
        TICKET_TYPE_KIND_VALUES,
        "item ticketKindSnapshot",
      ),
      pricingMode: normalizeEnum(
        item.pricingModeSnapshot,
        TICKET_TYPE_PRICING_MODE_VALUES,
        "item pricingModeSnapshot",
      ),
    },

    quantity,
    unitPrice,
    lineTotal,
  };
}

function buildDiscountDto(order) {
  const discountAmount = normalizeInteger(
    order.discountAmount,
    "discountAmount",
  );

  if (discountAmount === 0) {
    if (order.discountPercent !== null && order.discountPercent !== undefined) {
      throw new TypeError(
        "Cannot serialize an order with discountPercent but no discount amount.",
      );
    }

    if (
      normalizeNullableString(order.discountCodeIdSnapshot) ||
      normalizeNullableString(order.discountCodeSnapshot) ||
      normalizeNullableString(order.discountCodeGroupIdSnapshot) ||
      normalizeNullableString(order.discountCodeGroupNameSnapshot)
    ) {
      throw new TypeError(
        "Cannot serialize an order with a discount snapshot but no discount amount.",
      );
    }

    return null;
  }

  const discountPercent = normalizeInteger(
    order.discountPercent,
    "discountPercent",
    {
      minimum: 1,
    },
  );

  if (discountPercent > 100) {
    throw new TypeError(
      "Cannot serialize an order with an invalid discount percent.",
    );
  }

  const discountableSubtotal = getDiscountableOrderSubtotal(order.items);

  const expectedDiscount = calculatePercentageDiscountAmount({
    amount: discountableSubtotal,
    discountPercent,
  });

  if (expectedDiscount !== discountAmount) {
    throw new TypeError(
      "Cannot serialize an order with an inconsistent discount amount.",
    );
  }

  return {
    codeId: requireApiId(
      order.discountCodeIdSnapshot,
      "discountCodeIdSnapshot",
    ),

    code: normalizeRequiredString(
      order.discountCodeSnapshot,
      "discountCodeSnapshot",
    ),

    group: {
      id: requireApiId(
        order.discountCodeGroupIdSnapshot,
        "discountCodeGroupIdSnapshot",
      ),

      name: normalizeRequiredString(
        order.discountCodeGroupNameSnapshot,
        "discountCodeGroupNameSnapshot",
      ),
    },

    percent: discountPercent,

    amount: discountAmount,
  };
}

export function toPublicOrderDto(order) {
  if (!order) {
    throw new TypeError("Cannot serialize a missing order.");
  }

  const id = requireApiId(order.id, "id");

  const eventId = requireApiId(order.eventId, "eventId");

  const currency = normalizeRequiredString(
    order.currency,
    "currency",
  ).toUpperCase();

  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new TypeError("Cannot serialize an order without items.");
  }

  const items = order.items.map((item) =>
    toPublicOrderItemDto(item, {
      eventId,
      currency,
    }),
  );

  const subtotal = normalizeInteger(order.subtotal, "subtotal");

  const discount = buildDiscountDto(order);

  const total = normalizeInteger(order.totalPrice, "totalPrice");

  const itemTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  if (subtotal !== itemTotal) {
    throw new TypeError(
      "Cannot serialize an order with an inconsistent subtotal.",
    );
  }

  const discountAmount = discount?.amount || 0;

  if (discountAmount > subtotal) {
    throw new TypeError(
      "Cannot serialize an order with a discount larger than its subtotal.",
    );
  }

  if (total !== subtotal - discountAmount) {
    throw new TypeError(
      "Cannot serialize an order with an inconsistent total price.",
    );
  }

  const refundedAmount = normalizeInteger(
    order.refundedAmount,
    "refundedAmount",
  );

  if (refundedAmount > total) {
    throw new TypeError(
      "Cannot serialize an order with an invalid refunded amount.",
    );
  }

  const buyerType = normalizeEnum(
    order.buyerType,
    ORDER_BUYER_TYPE_VALUES,
    "buyerType",
  );

  assertExternalBuyerIdentity(order, buyerType);

  return {
    id,

    orderNumber: normalizeRequiredString(order.orderNumber, "orderNumber"),

    buyer: {
      type: buyerType,

      email: normalizeRequiredString(
        order.buyerEmailSnapshot,
        "buyerEmailSnapshot",
      ).toLowerCase(),

      firstName: normalizeOptionalString(order.buyerFirstNameSnapshot),

      lastName: normalizeOptionalString(order.buyerLastNameSnapshot),

      displayName: buildBuyerDisplayName(order),
    },

    event: {
      id: eventId,

      title: normalizeRequiredString(
        order.eventTitleSnapshot,
        "eventTitleSnapshot",
      ),

      slug: normalizeNullableString(order.eventSlugSnapshot),

      category: normalizeNullableString(order.eventCategorySnapshot),

      location: normalizeOptionalString(order.eventLocationSnapshot),

      startsAt: toApiDate(order.eventStartsAtSnapshot),
    },

    items,

    pricing: {
      currency,
      subtotal,
      discount,
      total,
    },

    status: normalizeEnum(order.status, ORDER_STATUS_VALUES, "status"),

    payment: {
      status: normalizeEnum(
        order.paymentStatus,
        ORDER_PAYMENT_STATUS_VALUES,
        "paymentStatus",
      ),

      provider: normalizeEnum(
        order.paymentProvider,
        ORDER_PAYMENT_PROVIDER_VALUES,
        "paymentProvider",
      ),
    },

    refund: {
      status: normalizeEnum(
        order.refundStatus,
        ORDER_REFUND_STATUS_VALUES,
        "refundStatus",
      ),

      amount: refundedAmount,

      refundedAt: toApiDate(order.refundedAt),
    },

    confirmedAt: toApiDate(order.confirmedAt),

    cancelledAt: toApiDate(order.cancelledAt),

    cancellationReason: normalizeNullableString(order.cancellationReason),

    expiresAt: toApiDate(order.expiresAt),

    createdAt: requireApiDate(order.createdAt, "createdAt"),

    updatedAt: requireApiDate(order.updatedAt, "updatedAt"),
  };
}
export function toAdminOrderDto(order) {
  const publicOrder = toPublicOrderDto(order);

  const source = normalizeEnum(order.source, ORDER_SOURCE_VALUES, "source");

  const externalIdentity =
    publicOrder.buyer.type === ORDER_BUYER_TYPE.EXTERNAL_USER
      ? {
          provider: normalizeRequiredString(
            order.buyerExternalProvider,
            "buyerExternalProvider",
          ),

          userId: normalizeRequiredString(
            order.buyerExternalUserId,
            "buyerExternalUserId",
          ),
        }
      : null;

  return {
    ...publicOrder,

    buyer: {
      ...publicOrder.buyer,

      externalIdentity,
    },

    source,

    manualAssignmentReason: normalizeNullableString(
      order.manualAssignmentReason,
    ),

    audit: {
      createdByEventUserId: toApiId(order.createdByEventUserId),

      updatedByEventUserId: toApiId(order.updatedByEventUserId),
    },
  };
}
export function toAdminOrderListMetaDto({ event, pagination, summary }) {
  if (!event) {
    throw new TypeError(
      "Cannot serialize admin order list metadata without event.",
    );
  }

  if (!pagination) {
    throw new TypeError(
      "Cannot serialize admin order list metadata without pagination.",
    );
  }

  if (!summary) {
    throw new TypeError(
      "Cannot serialize admin order list metadata without summary.",
    );
  }

  const normalizedPagination = {
    page: normalizeInteger(pagination.page, "pagination.page", {
      minimum: 1,
    }),

    limit: normalizeInteger(pagination.limit, "pagination.limit", {
      minimum: 1,
    }),

    total: normalizeInteger(pagination.total, "pagination.total", {
      minimum: 0,
    }),

    pages: normalizeInteger(pagination.pages, "pagination.pages", {
      minimum: 1,
    }),
  };

  const expectedPages =
    Math.ceil(normalizedPagination.total / normalizedPagination.limit) || 1;

  if (normalizedPagination.pages !== expectedPages) {
    throw new TypeError(
      "Cannot serialize admin order list metadata with inconsistent pagination.",
    );
  }

  const normalizedSummary = {
    total: normalizeInteger(summary.total, "summary.total", {
      minimum: 0,
    }),
  };

  if (normalizedPagination.total !== normalizedSummary.total) {
    throw new TypeError(
      "Cannot serialize admin order list metadata with different pagination and summary totals.",
    );
  }

  return {
    event: {
      id: requireApiId(event.id, "event id"),

      title: normalizeRequiredString(event.title, "event title"),

      status: normalizeEnum(event.status, EVENT_STATUS_VALUES, "event status"),
    },

    pagination: normalizedPagination,

    summary: normalizedSummary,
  };
}
export function toAdminOrderDetailDto({ order, tickets }) {
  if (!Array.isArray(tickets)) {
    throw new TypeError("Cannot serialize admin order detail without tickets.");
  }

  const orderDto = toAdminOrderDto(order);

  const ticketDtos = tickets.map((ticket) => toAdminTicketDto(ticket));

  for (const ticketDto of ticketDtos) {
    if (ticketDto.orderId !== orderDto.id) {
      throw new TypeError(
        "Cannot serialize admin order detail with a ticket from a different order.",
      );
    }

    if (ticketDto.event.id !== orderDto.event.id) {
      throw new TypeError(
        "Cannot serialize admin order detail with a ticket from a different event.",
      );
    }
  }

  return {
    ...orderDto,

    tickets: ticketDtos,
  };
}
function toAdminOrderDetailSummaryDto(orderDetail) {
  if (
    !orderDetail ||
    typeof orderDetail !== "object" ||
    Array.isArray(orderDetail) ||
    !orderDetail.id ||
    !Array.isArray(orderDetail.tickets) ||
    !orderDetail.pricing
  ) {
    throw new TypeError(
      "Cannot serialize admin order detail metadata without an admin order detail DTO.",
    );
  }

  return {
    ticketsCount: orderDetail.tickets.length,

    totalPrice: normalizeInteger(
      orderDetail.pricing.total,
      "detail totalPrice",
    ),

    currency: normalizeRequiredString(
      orderDetail.pricing.currency,
      "detail currency",
    ).toUpperCase(),
  };
}
function toAdminOrderActionDto(action, fieldName) {
  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action) ||
    typeof action.allowed !== "boolean"
  ) {
    throw new TypeError(`Cannot serialize admin order action ${fieldName}.`);
  }

  return {
    allowed: action.allowed,
    reason: normalizeNullableString(action.reason),
  };
}

export function toAdminOrderDetailMetaDto(orderDetail, actions) {
  const summary = toAdminOrderDetailSummaryDto(orderDetail);
  if (
    !actions ||
    typeof actions !== "object" ||
    Array.isArray(actions) ||
    !actions.mailResend
  ) {
    throw new TypeError(
      "Cannot serialize admin order detail metadata without actions.",
    );
  }

  return {
    summary,

    actions: {
      editBuyer: toAdminOrderActionDto(actions.editBuyer, "editBuyer"),

      cancel: toAdminOrderActionDto(actions.cancel, "cancel"),

      refund: toAdminOrderActionDto(actions.refund, "refund"),

      mailResend: {
        orderConfirmed: toAdminOrderActionDto(
          actions.mailResend.orderConfirmed,
          "mailResend.orderConfirmed",
        ),

        orderCancelled: toAdminOrderActionDto(
          actions.mailResend.orderCancelled,
          "mailResend.orderCancelled",
        ),

        orderRefunded: toAdminOrderActionDto(
          actions.mailResend.orderRefunded,
          "mailResend.orderRefunded",
        ),

        eventCancelled: toAdminOrderActionDto(
          actions.mailResend.eventCancelled,
          "mailResend.eventCancelled",
        ),
      },
    },
  };
}
function toAdminManualOrderDocumentResultDto(documents) {
  if (!documents) {
    return null;
  }

  const result = {
    skipped: normalizeBoolean(documents.skipped, "documents.skipped"),

    reason: normalizeNullableString(documents.reason),

    generated: normalizeInteger(
      documents.generated ?? 0,
      "documents.generated",
    ),

    alreadyExisted: normalizeInteger(
      documents.alreadyExisted ?? 0,
      "documents.alreadyExisted",
    ),

    failed: normalizeInteger(documents.failed ?? 0, "documents.failed"),
  };

  if (
    result.skipped &&
    (result.generated > 0 || result.alreadyExisted > 0 || result.failed > 0)
  ) {
    throw new TypeError(
      "Cannot serialize a skipped manual order document result with processed documents.",
    );
  }

  return result;
}
function toAdminManualOrderFulfillmentDto(order) {
  const status = normalizeEnum(
    order?.fulfillmentStatus || ORDER_FULFILLMENT_STATUS.NOT_STARTED,

    ORDER_FULFILLMENT_STATUS_VALUES,

    "fulfillment status",
  );

  return {
    status,

    completed: status === ORDER_FULFILLMENT_STATUS.COMPLETED,

    retryScheduled: status === ORDER_FULFILLMENT_STATUS.FAILED,

    manualReviewRequired: status === ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW,
  };
}
export function toAdminManualOrderResultDto({ order, tickets, documents }) {
  const data = toAdminOrderDetailDto({
    order,
    tickets,
  });

  if (data.source !== ORDER_SOURCE.MANUAL) {
    throw new TypeError(
      "Cannot serialize a non-manual order as manual order result.",
    );
  }

  if (data.status !== ORDER_STATUS.CONFIRMED) {
    throw new TypeError("Cannot serialize an unconfirmed manual order result.");
  }

  if (
    data.payment.status !== ORDER_PAYMENT_STATUS.NOT_REQUIRED ||
    data.payment.provider !== ORDER_PAYMENT_PROVIDER.NONE
  ) {
    throw new TypeError(
      "Cannot serialize a manual order result requiring payment.",
    );
  }

  const expectedTickets = data.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  const fulfillment = toAdminManualOrderFulfillmentDto(order);
  if (fulfillment.completed && data.tickets.length !== expectedTickets) {
    throw new TypeError(
      "Cannot serialize a completed manual order fulfillment with an inconsistent ticket count.",
    );
  }

  const summary = toAdminOrderDetailSummaryDto(data);

  return {
    data,

    meta: {
      summary,

      creation: {
        ticketsCreated: data.tickets.length,

        documents: toAdminManualOrderDocumentResultDto(documents),

        fulfillment,
      },
    },
  };
}
