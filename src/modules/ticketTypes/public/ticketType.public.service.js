// src/modules/ticketTypes/public/ticketType.public.service.js

import {
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "../../events/event.constants.js";

import { TICKET_TYPE_STATUS } from "../ticketType.constants.js";
import { toPublicTicketTypeDto } from "../ticketType.dto.js";
import { findEventById } from "../../events/repositories/event.repository.js";
import {
  findTicketTypeById,
  listTicketTypes,
} from "../repositories/ticketType.repository.js";

import {
  publicEventCancelledError,
  publicEventIdRequiredError,
  publicEventNotFoundError,
  publicEventUnavailableError,
  publicTicketTypeNotFoundError,
  publicTicketTypeUnavailableError,
} from "../ticketType.errors.js";

function isPublicTicketType(ticketType) {
  return [TICKET_TYPE_STATUS.ACTIVE, TICKET_TYPE_STATUS.SOLD_OUT].includes(
    ticketType.status,
  );
}

async function ensurePublicEvent(eventId) {
  const event = await findEventById(eventId, { lean: true });

  if (!event) {
    throw publicEventNotFoundError(eventId);
  }

  if (event.visibility !== EVENT_VISIBILITIES.PUBLIC || event.archivedAt) {
    throw publicEventNotFoundError(eventId);
  }

  if (event.status !== EVENT_STATUSES.PUBLISHED) {
    throw publicEventUnavailableError(eventId);
  }

  if (event.cancelledAt || event.status === EVENT_STATUSES.CANCELLED) {
    throw publicEventCancelledError(eventId);
  }

  return event;
}

export async function listPublicTicketTypesService(filters = {}) {
  if (!filters.eventId) {
    throw publicEventIdRequiredError();
  }

  await ensurePublicEvent(filters.eventId);

  const ticketTypes = await listTicketTypes({
    eventId: filters.eventId,
  });

  const now = new Date();

  const publicTicketTypes = ticketTypes
    .filter(isPublicTicketType)
    .map((ticketType) =>
      toPublicTicketTypeDto(ticketType, {
        now,
      }),
    );

  if (filters.onlyBookable) {
    return publicTicketTypes.filter((ticketType) => ticketType.isSalesOpen);
  }

  return publicTicketTypes;
}

export async function getPublicTicketTypeByIdService(id) {
  const ticketType = await findTicketTypeById(id, { lean: true });

  if (!ticketType) {
    throw publicTicketTypeNotFoundError(id);
  }

  await ensurePublicEvent(ticketType.eventId);

  if (!isPublicTicketType(ticketType)) {
    throw publicTicketTypeUnavailableError(id);
  }

  return toPublicTicketTypeDto(ticketType);
}
