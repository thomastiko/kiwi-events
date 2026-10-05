import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
  TICKET_TYPE_STATUS,
} from "./ticketType.constants.js";

import { getTicketTypeAvailability } from "./ticketType.availability.js";

const TICKET_TYPE_STATUS_VALUES = Object.values(TICKET_TYPE_STATUS);

const TICKET_TYPE_KIND_VALUES = Object.values(TICKET_TYPE_KIND);

const TICKET_TYPE_PRICING_MODE_VALUES = Object.values(TICKET_TYPE_PRICING_MODE);

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize a ticket type without ${fieldName}.`);
  }

  return id;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`Cannot serialize a ticket type without ${fieldName}.`);
  }

  return normalized;
}

function normalizeInteger(
  value,
  fieldName,
  { nullable = false, minimum } = {},
) {
  if (value === null || value === undefined) {
    if (nullable) {
      return null;
    }

    throw new TypeError(`Cannot serialize a ticket type without ${fieldName}.`);
  }

  const normalized = Number(value);

  if (
    !Number.isInteger(normalized) ||
    (minimum !== undefined && normalized < minimum)
  ) {
    throw new TypeError(
      `Cannot serialize an invalid ticket type ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeEnum(value, allowedValues, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!allowedValues.includes(normalized)) {
    throw new TypeError(
      `Cannot serialize an invalid ticket type ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeSessionIds(sessionIds) {
  if (sessionIds === null || sessionIds === undefined) {
    return [];
  }

  if (!Array.isArray(sessionIds)) {
    throw new TypeError("Cannot serialize invalid ticket type sessionIds.");
  }

  return sessionIds.map((sessionId) => requireApiId(sessionId, "sessionId"));
}

function buildTicketTypeDto(ticketType, { now = new Date() } = {}) {
  if (!ticketType) {
    throw new TypeError("Cannot serialize a missing ticket type.");
  }

  const availability = getTicketTypeAvailability(ticketType, {
    now,
  });

  return {
    id: requireApiId(ticketType.id, "id"),

    eventId: requireApiId(ticketType.eventId, "eventId"),

    displayName: normalizeRequiredString(ticketType.displayName, "displayName"),

    description: String(ticketType.description ?? "").trim(),

    status: normalizeEnum(
      ticketType.status,
      TICKET_TYPE_STATUS_VALUES,
      "status",
    ),

    ticketKind: normalizeEnum(
      ticketType.ticketKind,
      TICKET_TYPE_KIND_VALUES,
      "ticketKind",
    ),
    pricingMode: normalizeEnum(
      ticketType.pricingMode,
      TICKET_TYPE_PRICING_MODE_VALUES,
      "pricingMode",
    ),
    priceGross: normalizeInteger(ticketType.priceGross, "priceGross", {
      minimum: 0,
    }),

    currency: normalizeRequiredString(
      ticketType.currency,
      "currency",
    ).toUpperCase(),

    stockTotal: availability.stockTotal,
    stockSold: availability.stockSold,
    stockRemaining: availability.stockRemaining,

    minPerOrder: normalizeInteger(ticketType.minPerOrder, "minPerOrder", {
      minimum: 1,
    }),

    maxPerOrder: normalizeInteger(ticketType.maxPerOrder, "maxPerOrder", {
      nullable: true,
      minimum: 1,
    }),

    salesStartAt: toApiDate(ticketType.salesStartAt),

    salesEndAt: toApiDate(ticketType.salesEndAt),

    isPersonalized: Boolean(ticketType.isPersonalized),

    sessionIds: normalizeSessionIds(ticketType.sessionIds),

    sortOrder: normalizeInteger(ticketType.sortOrder, "sortOrder"),

    isSoldOut: availability.isSoldOut,
    isSalesOpen: availability.isSalesOpen,

    createdByEventUserId: toApiId(ticketType.createdByEventUserId),

    updatedByEventUserId: toApiId(ticketType.updatedByEventUserId),

    createdAt: toApiDate(ticketType.createdAt),

    updatedAt: toApiDate(ticketType.updatedAt),
  };
}

export function toPublicTicketTypeDto(ticketType, options) {
  const dto = buildTicketTypeDto(ticketType, options);

  return {
    id: dto.id,
    eventId: dto.eventId,
    displayName: dto.displayName,
    description: dto.description,
    status: dto.status,
    ticketKind: dto.ticketKind,
    pricingMode: dto.pricingMode,
    priceGross: dto.priceGross,
    currency: dto.currency,
    stockRemaining: dto.stockRemaining,
    minPerOrder: dto.minPerOrder,
    maxPerOrder: dto.maxPerOrder,
    salesStartAt: dto.salesStartAt,
    salesEndAt: dto.salesEndAt,
    isPersonalized: dto.isPersonalized,
    sessionIds: dto.sessionIds,
    sortOrder: dto.sortOrder,
    isSoldOut: dto.isSoldOut,
    isSalesOpen: dto.isSalesOpen,
  };
}

export function toAdminTicketTypeDto(ticketType, options) {
  const dto = buildTicketTypeDto(ticketType, options);

  return {
    id: dto.id,
    eventId: dto.eventId,
    displayName: dto.displayName,
    description: dto.description,
    status: dto.status,
    ticketKind: dto.ticketKind,
    pricingMode: dto.pricingMode,
    priceGross: dto.priceGross,
    currency: dto.currency,
    stockTotal: dto.stockTotal,
    stockSold: dto.stockSold,
    stockRemaining: dto.stockRemaining,
    minPerOrder: dto.minPerOrder,
    maxPerOrder: dto.maxPerOrder,
    salesStartAt: dto.salesStartAt,
    salesEndAt: dto.salesEndAt,
    isPersonalized: dto.isPersonalized,
    sessionIds: dto.sessionIds,
    sortOrder: dto.sortOrder,
    isSoldOut: dto.isSoldOut,
    isSalesOpen: dto.isSalesOpen,
    createdByEventUserId: dto.createdByEventUserId,
    updatedByEventUserId: dto.updatedByEventUserId,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
