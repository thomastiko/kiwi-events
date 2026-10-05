// src/modules/ticketTypes/internal/ticketType.internal.service.js

import { toAdminTicketTypeDto } from "../ticketType.dto.js";
import {
  findEventById,
  listEventIdsByCreatedByEventUserId,
} from "../../events/repositories/event.repository.js";
import {
  createTicketType,
  deleteTicketTypeById,
  findTicketTypeById,
  listTicketTypes,
  updateTicketTypeById,
} from "../repositories/ticketType.repository.js";
import {
  EVENT_MANAGEMENT_SCOPE,
  canManageEvent,
  getEventManagementScope,
} from "../../permissions/eventAuthorization.service.js";
import {
  relatedEventNotFoundError,
  ticketTypeAccessRequiredError,
  ticketTypeDeleteBlockedBySalesError,
  ticketTypeManageForbiddenError,
  ticketTypeNotFoundError,
} from "../ticketType.errors.js";
import {
  assertTicketTypePricingAllowed,
  normalizeTicketTypePricing,
} from "../ticketType.pricing.js";
import {
  assertTicketTypeStockIsValid,
  normalizeTicketTypeStockTotal,
} from "../ticketType.stock.js";

function buildTicketTypeName(eventTitle, displayName) {
  return `${eventTitle} - ${displayName}`.trim();
}

function assertInternalActor(actor) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw ticketTypeAccessRequiredError();
  }
}

async function assertCanManageTicketTypeEvent(actor, event) {
  assertInternalActor(actor);

  if (!(await canManageEvent(actor, event))) {
    throw ticketTypeManageForbiddenError();
  }
}

async function loadManageableEvent(eventId, actor) {
  assertInternalActor(actor);

  const event = await findEventById(eventId, {
    lean: true,
  });

  if (!event) {
    throw relatedEventNotFoundError(eventId);
  }

  await assertCanManageTicketTypeEvent(actor, event);

  return event;
}

export async function createTicketTypeService(payload, actor) {
  const event = await loadManageableEvent(payload.eventId, actor);

  const { pricingMode, priceGross } = normalizeTicketTypePricing({
    pricingMode: payload.pricingMode,
    priceGross: payload.priceGross,
  });

  assertTicketTypePricingAllowed({
    ticketKind: payload.ticketKind,
    pricingMode,
    priceGross,
  });

  const displayName = payload.displayName?.trim();

  const stockTotal = normalizeTicketTypeStockTotal(payload.stockTotal, {
    field: "stockTotal",
  });

  const createdTicketType = await createTicketType({
    ...payload,

    eventId: event.id,

    name: buildTicketTypeName(event.title, displayName),

    displayName,
    pricingMode,
    priceGross,
    stockTotal,
    stockSold: 0,

    sessionIds: payload.sessionIds || [],
  });

  return toAdminTicketTypeDto(createdTicketType);
}

export async function listTicketTypesService(filters = {}, actor) {
  assertInternalActor(actor);

  const scopedFilters = {
    status: filters.status,
  };

  if (filters.eventId) {
    const event = await loadManageableEvent(filters.eventId, actor);

    scopedFilters.eventId = event.id;
  } else {
    const scope = await getEventManagementScope(actor);

    if (scope === EVENT_MANAGEMENT_SCOPE.NONE) {
      throw ticketTypeManageForbiddenError();
    }

    if (scope === EVENT_MANAGEMENT_SCOPE.OWN) {
      const eventIds = await listEventIdsByCreatedByEventUserId(
        actor.eventUserId,
      );

      if (!eventIds.length) {
        return [];
      }

      scopedFilters.eventIds = eventIds;
    }
  }

  const ticketTypes = await listTicketTypes(scopedFilters);

  const now = new Date();

  return ticketTypes.map((ticketType) =>
    toAdminTicketTypeDto(ticketType, {
      now,
    }),
  );
}

export async function getTicketTypeByIdService(id, actor) {
  const ticketType = await findTicketTypeById(id, {
    lean: true,
  });

  if (!ticketType) {
    throw ticketTypeNotFoundError(id);
  }

  await loadManageableEvent(ticketType.eventId, actor);

  return toAdminTicketTypeDto(ticketType);
}

export async function updateTicketTypeService(id, payload, actor) {
  const ticketType = await findTicketTypeById(id);

  if (!ticketType) {
    throw ticketTypeNotFoundError(id);
  }

  const currentEvent = await loadManageableEvent(ticketType.eventId, actor);

  let targetEvent = currentEvent;

  /*
   * If a ticket type is moved to another event,
   * the actor must be allowed to manage both:
   *
   * - the current event
   * - the target event
   */
  if (
    payload.eventId !== undefined &&
    String(payload.eventId) !== String(ticketType.eventId)
  ) {
    targetEvent = await loadManageableEvent(payload.eventId, actor);
  }

  const nextTicketKind =
    payload.ticketKind !== undefined
      ? payload.ticketKind
      : ticketType.ticketKind;
  const nextPricingMode =
    payload.pricingMode !== undefined
      ? payload.pricingMode
      : ticketType.pricingMode;
  const { pricingMode: normalizedPricingMode, priceGross: nextPriceGross } =
    normalizeTicketTypePricing({
      pricingMode: nextPricingMode,
      priceGross:
        payload.priceGross !== undefined
          ? payload.priceGross
          : ticketType.priceGross,
    });

  const nextStockTotal =
    payload.stockTotal !== undefined
      ? payload.stockTotal
      : ticketType.stockTotal;

  const normalizedStock = assertTicketTypeStockIsValid({
    stockTotal: nextStockTotal,

    stockSold: ticketType.stockSold,

    field: "stockTotal",
  });

  assertTicketTypePricingAllowed({
    ticketKind: nextTicketKind,
    pricingMode: normalizedPricingMode,
    priceGross: nextPriceGross,
  });

  const update = {};

  if (payload.eventId !== undefined) {
    update.eventId = targetEvent.id;
  }

  if (payload.sessionIds !== undefined) {
    update.sessionIds = payload.sessionIds;
  }

  const fields = [
    "displayName",
    "description",
    "status",
    "ticketKind",
    "currency",
    "minPerOrder",
    "maxPerOrder",
    "salesStartAt",
    "salesEndAt",
    "isPersonalized",
    "sortOrder",
    "updatedByEventUserId",
  ];

  for (const field of fields) {
    if (payload[field] !== undefined) {
      update[field] = payload[field];
    }
  }

  if (payload.pricingMode !== undefined || payload.priceGross !== undefined) {
    update.pricingMode = normalizedPricingMode;
    update.priceGross = nextPriceGross;
  }
  if (payload.stockTotal !== undefined) {
    update.stockTotal = normalizedStock.stockTotal;
  }

  if (payload.displayName !== undefined || payload.eventId !== undefined) {
    const nextDisplayName =
      payload.displayName !== undefined
        ? payload.displayName?.trim()
        : ticketType.displayName;

    update.displayName = nextDisplayName;

    update.name = buildTicketTypeName(targetEvent.title, nextDisplayName);
  }

  const updatedTicketType = await updateTicketTypeById(id, update);

  if (!updatedTicketType) {
    throw ticketTypeNotFoundError(id);
  }

  return toAdminTicketTypeDto(updatedTicketType);
}

export async function deleteTicketTypeService(id, actor) {
  const ticketType = await findTicketTypeById(id, {
    lean: true,
  });

  if (!ticketType) {
    throw ticketTypeNotFoundError(id);
  }

  const eventId = ticketType.eventId;

  await loadManageableEvent(eventId, actor);

  const stockSold = Number(ticketType.stockSold || 0);

  if (stockSold > 0) {
    throw ticketTypeDeleteBlockedBySalesError({
      ticketTypeId: id,
      eventId,
      stockSold,
    });
  }

  const deleted = await deleteTicketTypeById(id);

  if (!deleted) {
    throw ticketTypeNotFoundError(id);
  }

  return {
    deleted: true,
  };
}
