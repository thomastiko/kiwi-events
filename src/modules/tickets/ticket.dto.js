import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

import {
  TICKET_BUYER_TYPE,
  TICKET_CHECK_IN_STATE,
  TICKET_DEPOSIT_REFUND_STATUS,
  TICKET_KIND,
  TICKET_STATUS,
} from "./ticket.constants.js";

import { EVENT_STATUS_VALUES } from "../events/event.constants.js";

const TICKET_BUYER_TYPE_VALUES = Object.values(TICKET_BUYER_TYPE);

const TICKET_DEPOSIT_REFUND_STATUS_VALUES = Object.values(
  TICKET_DEPOSIT_REFUND_STATUS,
);

const TICKET_KIND_VALUES = Object.values(TICKET_KIND);

const TICKET_STATUS_VALUES = Object.values(TICKET_STATUS);

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize a ticket without ${fieldName}.`);
  }

  return id;
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(`Cannot serialize a ticket without ${fieldName}.`);
  }

  return date;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`Cannot serialize a ticket without ${fieldName}.`);
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
    throw new TypeError(`Cannot serialize an invalid ticket ${fieldName}.`);
  }

  return normalized;
}

function normalizeInteger(value, fieldName, { minimum = 0 } = {}) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < minimum) {
    throw new TypeError(`Cannot serialize an invalid ticket ${fieldName}.`);
  }

  return normalized;
}

function normalizeCurrency(value, fieldName) {
  return normalizeRequiredString(value, fieldName).toUpperCase();
}

function buildDisplayName({ displayName, firstName, lastName }) {
  return (
    normalizeOptionalString(displayName) ||
    [normalizeOptionalString(firstName), normalizeOptionalString(lastName)]
      .filter(Boolean)
      .join(" ")
  );
}

function assertExternalBuyerIdentity(ticket, buyerType) {
  if (buyerType !== TICKET_BUYER_TYPE.EXTERNAL_USER) {
    return;
  }

  if (
    !normalizeOptionalString(ticket.buyerExternalProvider) ||
    !normalizeOptionalString(ticket.buyerExternalUserId)
  ) {
    throw new TypeError(
      "Cannot serialize an external ticket buyer without provider and user id.",
    );
  }
}

function assertDepositRefundContract({
  ticketKind,
  unitPrice,
  currency,
  depositRefundStatus,
  depositRefundAmount,
  depositRefundCurrency,
}) {
  if (depositRefundCurrency !== currency) {
    throw new TypeError(
      "Cannot serialize a ticket with a different deposit refund currency.",
    );
  }

  if (ticketKind === TICKET_KIND.NORMAL) {
    if (
      depositRefundStatus !== TICKET_DEPOSIT_REFUND_STATUS.NOT_REQUIRED ||
      depositRefundAmount !== 0
    ) {
      throw new TypeError(
        "Cannot serialize a normal ticket with a deposit refund.",
      );
    }

    return;
  }

  if (depositRefundStatus === TICKET_DEPOSIT_REFUND_STATUS.NOT_REQUIRED) {
    throw new TypeError(
      "Cannot serialize a deposit ticket without a deposit refund state.",
    );
  }

  if (depositRefundAmount !== unitPrice) {
    throw new TypeError(
      "Cannot serialize a deposit ticket with an inconsistent refund amount.",
    );
  }
}
function getTicketCheckInState(status) {
  switch (status) {
    case TICKET_STATUS.ACTIVE:
      return TICKET_CHECK_IN_STATE.ALLOWED;

    case TICKET_STATUS.CHECKED_IN:
      return TICKET_CHECK_IN_STATE.ALREADY_CHECKED_IN;

    case TICKET_STATUS.CANCELLED:
      return TICKET_CHECK_IN_STATE.CANCELLED;

    case TICKET_STATUS.REFUNDED:
      return TICKET_CHECK_IN_STATE.REFUNDED;

    default:
      throw new TypeError("Cannot serialize an invalid ticket check-in state.");
  }
}
export function toPublicTicketDto(ticket) {
  if (!ticket) {
    throw new TypeError("Cannot serialize a missing ticket.");
  }

  const id = requireApiId(ticket.id, "id");

  const orderId = requireApiId(ticket.orderId, "orderId");

  const eventId = requireApiId(ticket.eventId, "eventId");

  const ticketTypeId = requireApiId(ticket.ticketTypeId, "ticketTypeId");

  const buyerType = normalizeEnum(
    ticket.buyerType,
    TICKET_BUYER_TYPE_VALUES,
    "buyerType",
  );

  assertExternalBuyerIdentity(ticket, buyerType);

  const ticketKind = normalizeEnum(
    ticket.ticketKind,
    TICKET_KIND_VALUES,
    "ticketKind",
  );

  const currency = normalizeCurrency(ticket.currency, "currency");

  const unitPrice = normalizeInteger(ticket.unitPrice, "unitPrice");

  const depositRefundStatus = normalizeEnum(
    ticket.depositRefundStatus,
    TICKET_DEPOSIT_REFUND_STATUS_VALUES,
    "depositRefundStatus",
  );

  const depositRefundAmount = normalizeInteger(
    ticket.depositRefundAmount,
    "depositRefundAmount",
  );

  const depositRefundCurrency = normalizeCurrency(
    ticket.depositRefundCurrency,
    "depositRefundCurrency",
  );

  assertDepositRefundContract({
    ticketKind,
    unitPrice,
    currency,
    depositRefundStatus,
    depositRefundAmount,
    depositRefundCurrency,
  });

  return {
    id,

    ticketCode: normalizeRequiredString(ticket.ticketCode, "ticketCode"),

    orderId,

    buyer: {
      type: buyerType,

      email: normalizeRequiredString(
        ticket.buyerEmailSnapshot,
        "buyerEmailSnapshot",
      ).toLowerCase(),

      firstName: normalizeOptionalString(ticket.buyerFirstNameSnapshot),

      lastName: normalizeOptionalString(ticket.buyerLastNameSnapshot),

      displayName: buildDisplayName({
        displayName: ticket.buyerDisplayNameSnapshot,

        firstName: ticket.buyerFirstNameSnapshot,

        lastName: ticket.buyerLastNameSnapshot,
      }),
    },

    holder: {
      type: normalizeRequiredString(ticket.holderType, "holderType"),

      email: normalizeRequiredString(
        ticket.holderEmailSnapshot,
        "holderEmailSnapshot",
      ).toLowerCase(),

      firstName: normalizeOptionalString(ticket.holderFirstNameSnapshot),

      lastName: normalizeOptionalString(ticket.holderLastNameSnapshot),

      displayName: buildDisplayName({
        displayName: ticket.holderDisplayNameSnapshot,

        firstName: ticket.holderFirstNameSnapshot,

        lastName: ticket.holderLastNameSnapshot,
      }),
    },

    event: {
      id: eventId,

      title: normalizeRequiredString(
        ticket.eventTitleSnapshot,
        "eventTitleSnapshot",
      ),

      slug: normalizeNullableString(ticket.eventSlugSnapshot),

      category: normalizeNullableString(ticket.eventCategorySnapshot),

      startsAt: toApiDate(ticket.eventStartsAtSnapshot),
    },

    ticketType: {
      id: ticketTypeId,

      displayName: normalizeRequiredString(
        ticket.ticketTypeNameSnapshot,
        "ticketTypeNameSnapshot",
      ),

      description: normalizeOptionalString(
        ticket.ticketTypeDescriptionSnapshot,
      ),

      kind: ticketKind,
    },

    pricing: {
      currency,
      unitPrice,
    },

    status: normalizeEnum(ticket.status, TICKET_STATUS_VALUES, "status"),

    checkIn: {
      checkedInAt: toApiDate(ticket.checkedInAt),
    },

    cancellation: {
      cancelledAt: toApiDate(ticket.cancelledAt),

      reason: normalizeNullableString(ticket.cancellationReason),
    },

    depositRefund: {
      status: depositRefundStatus,
      amount: depositRefundAmount,
      currency: depositRefundCurrency,

      triggeredAt: toApiDate(ticket.depositRefundTriggeredAt),
    },

    createdAt: requireApiDate(ticket.createdAt, "createdAt"),

    updatedAt: requireApiDate(ticket.updatedAt, "updatedAt"),
  };
}
export function toInternalCheckInTicketDto(ticket) {
  const publicTicket = toPublicTicketDto(ticket);

  return {
    id: publicTicket.id,

    ticketCode: publicTicket.ticketCode,

    holder: publicTicket.holder,

    event: publicTicket.event,

    ticketType: {
      id: publicTicket.ticketType.id,

      displayName: publicTicket.ticketType.displayName,

      kind: publicTicket.ticketType.kind,
    },

    status: publicTicket.status,

    checkIn: {
      checkedInAt: publicTicket.checkIn.checkedInAt,

      checkedInByEventUserId: toApiId(ticket.checkedInByEventUserId),
    },
  };
}
export function toAdminTicketDto(ticket) {
  const publicTicket = toPublicTicketDto(ticket);

  return {
    ...publicTicket,

    checkIn: {
      ...publicTicket.checkIn,

      checkedInByEventUserId: toApiId(ticket.checkedInByEventUserId),
    },

    document: {
      available: Boolean(normalizeOptionalString(ticket.ticketPdfStorageKey)),

      generatedAt: toApiDate(ticket.ticketPdfGeneratedAt),
    },

    depositRefund: {
      ...publicTicket.depositRefund,

      providerRefundId: normalizeNullableString(
        ticket.depositRefundProviderRefundId,
      ),

      triggeredByEventUserId: toApiId(
        ticket.depositRefundTriggeredByEventUserId,
      ),

      failureReason: normalizeNullableString(ticket.depositRefundFailureReason),
    },

    audit: {
      createdByEventUserId: toApiId(ticket.createdByEventUserId),

      updatedByEventUserId: toApiId(ticket.updatedByEventUserId),
    },
  };
}
export function toAdminTicketListMetaDto({ event, pagination, summary }) {
  if (!event) {
    throw new TypeError(
      "Cannot serialize admin ticket list metadata without event.",
    );
  }

  if (!pagination) {
    throw new TypeError(
      "Cannot serialize admin ticket list metadata without pagination.",
    );
  }

  if (!summary) {
    throw new TypeError(
      "Cannot serialize admin ticket list metadata without summary.",
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
      "Cannot serialize admin ticket list metadata with inconsistent pagination.",
    );
  }

  const normalizedSummary = {
    total: normalizeInteger(summary.total, "summary.total", {
      minimum: 0,
    }),

    active: normalizeInteger(summary.active, "summary.active", {
      minimum: 0,
    }),

    checkedIn: normalizeInteger(summary.checkedIn, "summary.checkedIn", {
      minimum: 0,
    }),

    cancelled: normalizeInteger(summary.cancelled, "summary.cancelled", {
      minimum: 0,
    }),

    refunded: normalizeInteger(summary.refunded, "summary.refunded", {
      minimum: 0,
    }),
  };

  const summarizedTotal =
    normalizedSummary.active +
    normalizedSummary.checkedIn +
    normalizedSummary.cancelled +
    normalizedSummary.refunded;

  if (normalizedSummary.total !== summarizedTotal) {
    throw new TypeError(
      "Cannot serialize admin ticket list metadata with an inconsistent summary.",
    );
  }

  if (normalizedPagination.total !== normalizedSummary.total) {
    throw new TypeError(
      "Cannot serialize admin ticket list metadata with different pagination and summary totals.",
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
export function toAdminTicketCheckInLookupDto(ticket) {
  const ticketDto = toInternalCheckInTicketDto(ticket);

  const state = getTicketCheckInState(ticketDto.status);

  return {
    ticket: ticketDto,

    checkIn: {
      allowed: state === TICKET_CHECK_IN_STATE.ALLOWED,

      state,
    },
  };
}

export function toAdminTicketCheckInConfirmDto({ ticketDto, statusChanged }) {
  if (
    !ticketDto ||
    typeof ticketDto !== "object" ||
    Array.isArray(ticketDto) ||
    !ticketDto.id ||
    !ticketDto.status ||
    !ticketDto.checkIn
  ) {
    throw new TypeError(
      "Cannot serialize ticket check-in confirmation without an admin ticket DTO.",
    );
  }

  if (typeof statusChanged !== "boolean") {
    throw new TypeError(
      "Cannot serialize ticket check-in confirmation without statusChanged.",
    );
  }

  return {
    ticket: ticketDto,

    checkIn: {
      requestedCheckedIn: true,

      statusChanged,
    },
  };
}
