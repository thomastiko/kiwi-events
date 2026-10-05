// src/modules/events/public/event.public.service.js
import { EVENT_STATUSES, EVENT_VISIBILITIES } from "../event.constants.js";

import { TICKET_TYPE_STATUS } from "../../ticketTypes/ticketType.constants.js";
import { toPublicEventDto } from "../event.dto.js";

import {
  findEventById,
  findEventBySlug,
  listEvents,
} from "../repositories/event.repository.js";

import { listTicketTypes } from "../../ticketTypes/repositories/ticketType.repository.js";

import { findMediaAssetsByIds } from "../../mediaAssets/repositories/mediaAsset.repository.js";

import { publicEventNotFoundError } from "../event.errors.js";

function getSortedSessions(sessions = []) {
  return [...sessions].sort(
    (a, b) => new Date(a.startAt) - new Date(b.startAt),
  );
}

function getEventStartAt(event) {
  const sessions = getSortedSessions(event.sessions);

  return sessions.length ? sessions[0].startAt : null;
}

function eventMatchesPublicFilters(event, filters = {}) {
  if (event.visibility !== EVENT_VISIBILITIES.PUBLIC) {
    return false;
  }

  if (event.status !== EVENT_STATUSES.PUBLISHED) {
    return false;
  }

  if (event.archivedAt) {
    return false;
  }

  if (filters.category && event.category !== filters.category) {
    return false;
  }

  if (filters.featuredOnly && !event.isFeatured) {
    return false;
  }

  if (filters.upcomingOnly) {
    const now = new Date();

    const hasUpcomingSession = (event.sessions || []).some((session) => {
      if (!session.endAt) {
        return false;
      }

      return new Date(session.endAt) >= now;
    });

    if (!hasUpcomingSession) {
      return false;
    }
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim().toLowerCase();

    const values = [
      event.title,
      event.shortDescription,
      event.description,
      event.location,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    if (!values.some((value) => value.includes(search))) {
      return false;
    }
  }

  return true;
}

function getEventImageAssetIds(event) {
  return [...new Set((event?.imageAssetIds || []).filter(Boolean))];
}

async function loadPublicTicketTypesByEventIds(eventIds) {
  if (!eventIds.length) {
    return new Map();
  }

  const grouped = new Map();

  await Promise.all(
    eventIds.map(async (eventId) => {
      const ticketTypes = await listTicketTypes(
        {
          eventId,
        },
        {
          lean: true,
        },
      );

      const publicTicketTypes = ticketTypes.filter((ticketType) =>
        [TICKET_TYPE_STATUS.ACTIVE, TICKET_TYPE_STATUS.SOLD_OUT].includes(
          ticketType.status,
        ),
      );

      grouped.set(eventId, publicTicketTypes);
    }),
  );

  return grouped;
}

async function loadImageAssetsByIds(imageAssetIds = []) {
  const uniqueIds = [...new Set(imageAssetIds.filter(Boolean))];

  if (!uniqueIds.length) {
    return new Map();
  }

  const assets = await findMediaAssetsByIds(uniqueIds, {
    lean: true,
  });

  return new Map(assets.map((asset) => [asset.id, asset]));
}

function sortPublicEvents(events = []) {
  return [...events].sort((a, b) => {
    const aStart = getEventStartAt(a);

    const bStart = getEventStartAt(b);

    if (!aStart && !bStart) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }

    if (!aStart) {
      return 1;
    }

    if (!bStart) {
      return -1;
    }

    return new Date(aStart) - new Date(bStart);
  });
}

export async function listPublicEventsService(filters = {}) {
  const events = await listEvents(
    {
      category: filters.category,
      search: filters.search,
      visibility: EVENT_VISIBILITIES.PUBLIC,
    },
    {
      lean: true,
    },
  );

  const sortedEvents = sortPublicEvents(
    events.filter((event) => eventMatchesPublicFilters(event, filters)),
  );

  const imageAssetIds = sortedEvents.flatMap((event) =>
    getEventImageAssetIds(event),
  );

  const imageAssetMap = await loadImageAssetsByIds(imageAssetIds);

  const includeTicketTypes = Boolean(filters.includeTicketTypes);

  const groupedTicketTypes = includeTicketTypes
    ? await loadPublicTicketTypesByEventIds(
        sortedEvents.map((event) => event.id),
      )
    : new Map();

  const now = new Date();

  return sortedEvents.map((event) => {
    const eventId = event.id;

    const imageAssets = getEventImageAssetIds(event)
      .map((assetId) => imageAssetMap.get(assetId))
      .filter(Boolean);

    const ticketTypes = groupedTicketTypes.get(eventId) || [];

    return toPublicEventDto(event, {
      imageAssets,
      ticketTypes,
      now,
    });
  });
}

export async function getPublicEventBySlugService(slug) {
  const event = await findEventBySlug(slug, {
    lean: true,
  });

  if (!event || !eventMatchesPublicFilters(event)) {
    throw publicEventNotFoundError(slug);
  }

  const eventId = event.id;

  const [groupedTicketTypes, imageAssetMap] = await Promise.all([
    loadPublicTicketTypesByEventIds([eventId]),

    loadImageAssetsByIds(getEventImageAssetIds(event)),
  ]);

  const imageAssets = getEventImageAssetIds(event)
    .map((assetId) => imageAssetMap.get(assetId))
    .filter(Boolean);

  return toPublicEventDto(event, {
    ticketTypes: groupedTicketTypes.get(eventId) || [],

    imageAssets,

    now: new Date(),
  });
}

export async function getPublicEventByIdService(id) {
  const event = await findEventById(id, {
    lean: true,
  });

  if (!event || !eventMatchesPublicFilters(event)) {
    throw publicEventNotFoundError(id);
  }

  const eventId = event.id;

  const [groupedTicketTypes, imageAssetMap] = await Promise.all([
    loadPublicTicketTypesByEventIds([eventId]),

    loadImageAssetsByIds(getEventImageAssetIds(event)),
  ]);

  const imageAssets = getEventImageAssetIds(event)
    .map((assetId) => imageAssetMap.get(assetId))
    .filter(Boolean);

  return toPublicEventDto(event, {
    ticketTypes: groupedTicketTypes.get(eventId) || [],

    imageAssets,

    now: new Date(),
  });
}
