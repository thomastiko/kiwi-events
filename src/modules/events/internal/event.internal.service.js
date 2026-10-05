// src/modules/events/internal/event.internal.service.js

import { logger } from "../../../config/logger.js";
import { withDatabaseTransaction } from "../../database/database.service.js";
import {
  cleanupTicketTemplateImagesForDeletedEventService,
  deleteTicketTemplateRecordForEventService,
} from "../../ticketTemplates/ticketTemplate.service.js";
import { EVENT_STATUSES } from "../event.constants.js";
import {
  EVENT_MANAGEMENT_SCOPE,
  canCreateEvent,
  canManageEvent,
  getEventManagementScope,
} from "../../permissions/eventAuthorization.service.js";
import {
  createEvent,
  deleteEventById,
  findEventById,
  findEventBySlug,
  findEventBySlugExcludingId,
  listEvents,
  updateEventById,
} from "../repositories/event.repository.js";
import {
  aggregateTicketTypeSalesByEventIds,
  createTicketType,
  deleteTicketTypeById,
  updateTicketTypeById,
  deleteTicketTypesByEventId,
  findTicketTypesByEventId,
  insertManyTicketTypes,
} from "../../ticketTypes/repositories/ticketType.repository.js";
import { findMediaAssetsByIds } from "../../mediaAssets/repositories/mediaAsset.repository.js";
import {
  cleanupEventImageAssetService,
  uploadEventImageAssetService,
} from "../../mediaAssets/internal/mediaAsset.internal.service.js";
import { aggregateOrderStatsByEventIds } from "../../orders/repositories/order.repository.js";
import { countTicketsByEventId } from "../../tickets/repositories/ticket.repository.js";
import {
  eventAccessRequiredError,
  eventCancellationFinalizedError,
  eventDeleteBlockedByUsageError,
  eventImageAssetIdRequiredError,
  eventImageAssetNotAssignedError,
  eventImagesRequiredError,
  eventImageUploadMissingAssetIdsError,
  eventManageForbiddenError,
  eventNotFoundError,
  eventSlugAlreadyExistsError,
} from "../event.errors.js";
import {
  assertTicketTypePricingAllowed,
  normalizeTicketTypePricing,
} from "../../ticketTypes/ticketType.pricing.js";

import { TICKET_TYPE_STATUS } from "../../ticketTypes/ticketType.constants.js";
import {
  toAdminEventDetailDto,
  toAdminEventListItemDto,
} from "../event.dto.js";
import { assertTicketTypeStockIsValid } from "../../ticketTypes/ticketType.stock.js";

import { deleteDiscountCodeDataByEventId } from "../../discountCodes/repositories/discountCode.repository.js";

function buildInternalTicketTypeName(eventTitle, displayName) {
  return `${eventTitle} - ${displayName}`.trim();
}

function normalizeIdList(values = []) {
  return [
    ...new Set(
      (values || [])
        .filter((value) => value !== null && value !== undefined)
        .map(String)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function getEventImageAssetIds(event) {
  return normalizeIdList(event?.imageAssetIds || []);
}

function buildMediaActorFromEventPayload(payload, fallbackActor = null) {
  return {
    eventUserId:
      payload?.updatedByEventUserId ||
      payload?.createdByEventUserId ||
      fallbackActor?.eventUserId ||
      null,
    eventUser: fallbackActor?.eventUser || null,
  };
}

async function uploadEventImagesForEvent({
  imageFiles = [],
  storageTarget,
  payload,
  actor,
}) {
  const createdAssets = [];

  for (const file of imageFiles || []) {
    const asset = await uploadEventImageAssetService({
      file,
      storageTarget,
      actor: buildMediaActorFromEventPayload(payload, actor),
    });

    createdAssets.push(asset);
  }

  return createdAssets;
}

async function cleanupEventImageAssets(assets = []) {
  await Promise.all(
    assets.map(async (asset) => {
      const assetId = asset.id;

      try {
        await cleanupEventImageAssetService(assetId);
      } catch (error) {
        logger.warn("event.image_asset_cleanup_failed", {
          assetId,
          error,
        });
      }
    }),
  );
}

function toPlainObject(value) {
  if (!value) return value;
  return value.toObject ? value.toObject() : value;
}

function assertEventStatusNotFinalized(event) {
  if (event?.isCancellationFinalized) {
    throw eventCancellationFinalizedError();
  }
}

async function assertCanCreateEventAccess(actor) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw eventAccessRequiredError();
  }

  if (!(await canCreateEvent(actor))) {
    throw eventManageForbiddenError();
  }
}

async function assertCanManageEventAccess(actor, event) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw eventAccessRequiredError();
  }

  if (!(await canManageEvent(actor, event))) {
    throw eventManageForbiddenError();
  }
}

function buildTicketTypePayload({
  type,
  event,
  index,
  createdByEventUserId,
  updatedByEventUserId,
}) {
  const ticketKind = type.ticketKind || "normal";
  const { pricingMode, priceGross } = normalizeTicketTypePricing({
    pricingMode: type.pricingMode,
    priceGross: type.priceGross,
  });

  const stock = assertTicketTypeStockIsValid({
    stockTotal: type.stockTotal,
    stockSold: 0,
    field: "ticketTypes.stockTotal",
  });

  assertTicketTypePricingAllowed({
    ticketKind,
    pricingMode,
    priceGross,
  });

  return {
    eventId: event.id,
    name: buildInternalTicketTypeName(event.title, type.displayName),
    displayName: type.displayName,
    description: type.description || "",
    status: type.status || TICKET_TYPE_STATUS.ACTIVE,
    ticketKind,
    pricingMode,
    priceGross,
    currency: type.currency || "EUR",
    stockTotal: stock.stockTotal,
    stockSold: 0,
    minPerOrder: type.minPerOrder ?? 1,
    maxPerOrder: type.maxPerOrder ?? null,
    salesStartAt: type.salesStartAt ?? null,
    salesEndAt: type.salesEndAt ?? null,
    isPersonalized: Boolean(type.isPersonalized),
    sessionIds: type.sessionIds || [],
    sortOrder: type.sortOrder ?? index,
    createdByEventUserId,
    updatedByEventUserId,
  };
}

function hasTicketTypeSales(ticketType) {
  return Number(ticketType?.stockSold || 0) > 0;
}

function buildTicketTypeUpdatePayload({
  type,
  event,
  index,
  existingTicketType,
  updatedByEventUserId,
}) {
  const ticketKind = type.ticketKind || "normal";

  const { pricingMode, priceGross } = normalizeTicketTypePricing({
    pricingMode: type.pricingMode,
    priceGross: type.priceGross,
  });
  const stock = assertTicketTypeStockIsValid({
    stockTotal: type.stockTotal,
    stockSold: existingTicketType?.stockSold ?? 0,
    field: "ticketTypes.stockTotal",
  });

  assertTicketTypePricingAllowed({
    ticketKind,
    pricingMode,
    priceGross,
  });

  return {
    name: buildInternalTicketTypeName(event.title, type.displayName),
    displayName: type.displayName,
    description: type.description || "",
    status: type.status || TICKET_TYPE_STATUS.ACTIVE,
    ticketKind,
    pricingMode,
    priceGross,
    currency: type.currency || "EUR",
    stockTotal: stock.stockTotal,
    minPerOrder: type.minPerOrder ?? 1,
    maxPerOrder: type.maxPerOrder ?? null,
    salesStartAt: type.salesStartAt ?? null,
    salesEndAt: type.salesEndAt ?? null,
    isPersonalized: Boolean(type.isPersonalized),
    sessionIds: type.sessionIds || [],
    sortOrder: type.sortOrder ?? index,
    updatedByEventUserId,
  };
}

/**
 * Erstellt ein neues Event.
 */
export async function createEventService(payload, actor) {
  await assertCanCreateEventAccess(actor);
  const existingSlug = await findEventBySlug(payload.slug, {
    lean: true,
  });

  if (existingSlug) {
    throw eventSlugAlreadyExistsError(payload.slug);
  }

  const { ticketTypes = [], ...rawEventPayload } = payload;

  const eventPayload = {
    ...rawEventPayload,

    imageAssetIds: normalizeIdList(rawEventPayload.imageAssetIds || []),

    createdByEventUserId: payload.createdByEventUserId || null,

    updatedByEventUserId: payload.updatedByEventUserId || null,
  };

  const createdEvent = await withDatabaseTransaction(async (tx) => {
    const event = await createEvent(eventPayload, tx);

    if (ticketTypes.length) {
      const ticketTypeDocs = ticketTypes.map((type, index) =>
        buildTicketTypePayload({
          type,
          event,
          index,

          createdByEventUserId: payload.createdByEventUserId || null,

          updatedByEventUserId: payload.updatedByEventUserId || null,
        }),
      );

      await insertManyTicketTypes(ticketTypeDocs, tx);
    }

    return event;
  });

  return loadAdminEventDetail(createdEvent.id);
}

/**
 * Gibt alle Events zurück.
 */
export async function listEventsService(filters = {}, actor) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw eventAccessRequiredError();
  }

  const scope = await getEventManagementScope(actor);

  if (scope === EVENT_MANAGEMENT_SCOPE.NONE) {
    throw eventManageForbiddenError();
  }

  const scopedFilters =
    scope === EVENT_MANAGEMENT_SCOPE.OWN
      ? {
          ...filters,

          createdByEventUserId: actor.eventUserId,
        }
      : filters;

  const events = await listEvents(scopedFilters, {
    lean: true,
  });

  if (!events.length) {
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const imageAssetIds = events.flatMap((event) => getEventImageAssetIds(event));

  const [orderStats, ticketStats, imageAssets] = await Promise.all([
    aggregateOrderStatsByEventIds(eventIds),

    aggregateTicketTypeSalesByEventIds(eventIds),

    imageAssetIds.length
      ? findMediaAssetsByIds(imageAssetIds, {
          select: "key storageTarget filenameOriginal mimeType size",

          lean: true,
        })
      : [],
  ]);

  const orderStatsMap = new Map(
    orderStats.map((item) => [String(item.eventId), item]),
  );

  const ticketStatsMap = new Map(
    ticketStats.map((item) => [String(item.eventId), item]),
  );

  const imageAssetMap = new Map(
    imageAssets.map((asset) => [String(asset.id), asset]),
  );

  return events.map((event) => {
    const eventId = String(event.id);

    const orderStat = orderStatsMap.get(eventId);

    const ticketStat = ticketStatsMap.get(eventId);

    const eventImageAssets = getEventImageAssetIds(event)
      .map((assetId) => imageAssetMap.get(String(assetId)))
      .filter(Boolean);

    return toAdminEventListItemDto(event, {
      imageAssets: eventImageAssets,

      stats: {
        ordersCount: orderStat?.ordersCount || 0,

        paidOrdersCount: orderStat?.paidOrdersCount || 0,

        ticketsSold: ticketStat?.ticketsSold || 0,
      },
    });
  });
}
async function buildAdminEventDetail(event) {
  const eventId = event.id;

  const eventImageAssetIds = getEventImageAssetIds(event);

  const [ticketTypes, imageAssetsRaw] = await Promise.all([
    findTicketTypesByEventId(eventId, {
      lean: true,
    }),

    eventImageAssetIds.length
      ? findMediaAssetsByIds(eventImageAssetIds, {
          select: "key storageTarget filenameOriginal mimeType size",

          lean: true,
        })
      : [],
  ]);

  const imageAssetMap = new Map(
    imageAssetsRaw.map((asset) => [String(asset.id), asset]),
  );

  const imageAssets = eventImageAssetIds
    .map((assetId) => imageAssetMap.get(String(assetId)))
    .filter(Boolean);

  return toAdminEventDetailDto(event, {
    imageAssets,
    ticketTypes,
    now: new Date(),
  });
}

async function loadAdminEventDetail(id) {
  const event = await findEventById(id, {
    lean: true,
  });

  if (!event) {
    throw eventNotFoundError(id);
  }

  return buildAdminEventDetail(event);
}

export async function getEventByIdService(id, actor) {
  const event = await findEventById(id, {
    lean: true,
  });

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  return buildAdminEventDetail(event);
}
export async function addImagesToEventService(
  id,
  imageFiles = [],
  actor,
  options = {},
) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  if (!Array.isArray(imageFiles) || imageFiles.length === 0) {
    throw eventImagesRequiredError();
  }

  let createdImageAssets = [];

  try {
    createdImageAssets = await uploadEventImagesForEvent({
      imageFiles,

      storageTarget: options.storageTarget,

      payload: {
        updatedByEventUserId: options.updatedByEventUserId || null,
      },

      actor,
    });

    const uploadedImageAssetIds = createdImageAssets
      .map((asset) => asset.id)
      .filter(Boolean);

    if (!uploadedImageAssetIds.length) {
      throw eventImageUploadMissingAssetIdsError();
    }

    const finalImageAssetIds = normalizeIdList([
      ...getEventImageAssetIds(event),
      ...uploadedImageAssetIds,
    ]);

    const updatedEvent = await updateEventById(id, {
      imageAssetIds: finalImageAssetIds,
      updatedByEventUserId: options.updatedByEventUserId || null,
    });

    return loadAdminEventDetail(updatedEvent.id);
  } catch (error) {
    if (createdImageAssets.length) {
      await cleanupEventImageAssets(createdImageAssets);
    }

    throw error;
  }
}

export async function removeImageFromEventService(
  id,
  assetId,
  actor,
  audit = {},
) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  const currentImageAssetIds = getEventImageAssetIds(event);
  const normalizedAssetId = String(assetId || "");

  if (!normalizedAssetId) {
    throw eventImageAssetIdRequiredError();
  }

  if (!currentImageAssetIds.includes(normalizedAssetId)) {
    throw eventImageAssetNotAssignedError({
      eventId: id,
      assetId: normalizedAssetId,
    });
  }

  const finalImageAssetIds = currentImageAssetIds.filter(
    (imageAssetId) => imageAssetId !== normalizedAssetId,
  );

  const updatedEvent = await updateEventById(id, {
    imageAssetIds: finalImageAssetIds,
    updatedByEventUserId: audit.updatedByEventUserId || null,
  });

  return loadAdminEventDetail(updatedEvent.id);
}

/**
 * Aktualisiert ein Event.
 */
export async function updateEventService(id, payload, actor) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  const wantsToChangeStatus =
    Object.prototype.hasOwnProperty.call(payload, "status") &&
    payload.status !== event.status;

  if (wantsToChangeStatus) {
    assertEventStatusNotFinalized(event);
  }

  if (payload.slug && payload.slug !== event.slug) {
    const existingSlug = await findEventBySlugExcludingId({
      slug: payload.slug,
      excludeId: id,
    });

    if (existingSlug) {
      throw eventSlugAlreadyExistsError(payload.slug);
    }
  }

  const { ticketTypes, ...rawEventPayload } = payload;

  if (rawEventPayload.imageAssetIds !== undefined) {
    rawEventPayload.imageAssetIds = normalizeIdList(
      rawEventPayload.imageAssetIds,
    );
  }

  const eventPayload = rawEventPayload;

  const updatedEvent = await withDatabaseTransaction(async (tx) => {
    const updatedEvent = await updateEventById(
      event.id,
      {
        ...eventPayload,
        updatedByEventUserId: payload.updatedByEventUserId || null,
      },
      tx,
    );

    if (ticketTypes === undefined) {
      return updatedEvent;
    }

    const existingTicketTypes = await findTicketTypesByEventId(event.id, tx);

    const existingMap = new Map(
      existingTicketTypes.map((item) => [String(item.id), item]),
    );

    const incomingIds = new Set(
      ticketTypes
        .map((item) => item?.id)
        .filter(Boolean)
        .map(String),
    );

    for (const existing of existingTicketTypes) {
      if (incomingIds.has(String(existing.id))) {
        continue;
      }

      if (hasTicketTypeSales(existing)) {
        await updateTicketTypeById(
          existing.id,
          {
            status: TICKET_TYPE_STATUS.INACTIVE,
            updatedByEventUserId: payload.updatedByEventUserId || null,
          },
          tx,
        );

        continue;
      }

      await deleteTicketTypeById(existing.id, tx);
    }

    for (let index = 0; index < ticketTypes.length; index += 1) {
      const type = ticketTypes[index];

      if (type.id && existingMap.has(String(type.id))) {
        const ticketType = existingMap.get(String(type.id));

        await updateTicketTypeById(
          ticketType.id,
          buildTicketTypeUpdatePayload({
            type,
            event: updatedEvent,
            index,
            existingTicketType: ticketType,
            updatedByEventUserId: payload.updatedByEventUserId || null,
          }),
          tx,
        );

        continue;
      }

      await createTicketType(
        buildTicketTypePayload({
          type,
          event: updatedEvent,
          index,
          createdByEventUserId: payload.updatedByEventUserId || null,
          updatedByEventUserId: payload.updatedByEventUserId || null,
        }),
        tx,
      );
    }

    return updatedEvent;
  });

  return loadAdminEventDetail(updatedEvent.id);
}

/**
 * Event hervorheben / Pin setzen.
 */
export async function featureEventService(id, payload, actor) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  if (event.isCancellationFinalized) {
    throw eventCancellationFinalizedError();
  }
  await assertCanManageEventAccess(actor, event);

  const updatedEvent = await updateEventById(id, {
    isFeatured: payload.isFeatured,

    featuredOrder: payload.isFeatured
      ? (payload.featuredOrder ?? event.featuredOrder ?? 0)
      : 0,

    updatedByEventUserId: actor.eventUserId || null,
  });

  if (!updatedEvent) {
    throw eventNotFoundError(id);
  }

  return loadAdminEventDetail(updatedEvent.id);
}

async function getEventDeleteUsageStats(eventId) {
  const [orderStatsRows, ticketSalesRows, ticketsCount] = await Promise.all([
    aggregateOrderStatsByEventIds([eventId]),
    aggregateTicketTypeSalesByEventIds([eventId]),
    countTicketsByEventId(eventId),
  ]);

  const orderStats = orderStatsRows?.[0] || {};
  const ticketSales = ticketSalesRows?.[0] || {};

  return {
    ordersCount: Number(orderStats.ordersCount || 0),
    ticketsCount: Number(ticketsCount || 0),
    ticketsSold: Number(ticketSales.ticketsSold || 0),
  };
}

function assertEventCanBeHardDeleted({ eventId, usageStats }) {
  const ordersCount = Number(usageStats?.ordersCount || 0);
  const ticketsCount = Number(usageStats?.ticketsCount || 0);
  const ticketsSold = Number(usageStats?.ticketsSold || 0);

  if (ordersCount > 0 || ticketsCount > 0 || ticketsSold > 0) {
    throw eventDeleteBlockedByUsageError({
      eventId,
      ordersCount,
      ticketsCount,
      ticketsSold,
    });
  }
}

export async function deleteEventService(id, actor) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  const eventId = event.id;
  const usageStats = await getEventDeleteUsageStats(eventId);

  assertEventCanBeHardDeleted({
    eventId,
    usageStats,
  });

  const result = await withDatabaseTransaction(async (tx) => {
    await deleteTicketTemplateRecordForEventService(eventId, tx);

    await deleteDiscountCodeDataByEventId(eventId, tx);

    await deleteTicketTypesByEventId(eventId, tx);

    const deleted = await deleteEventById(eventId, tx);

    if (!deleted) {
      throw eventNotFoundError(id);
    }

    return {
      deleted: true,
    };
  });

  await cleanupTicketTemplateImagesForDeletedEventService(eventId);

  return result;
}

export async function archiveEventService(id, auditActor, actor) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  assertEventStatusNotFinalized(event);

  const updatedEvent = await updateEventById(id, {
    status: EVENT_STATUSES.ARCHIVED,
    archivedAt: new Date(),

    updatedByEventUserId: auditActor.updatedByEventUserId || null,
  });

  if (!updatedEvent) {
    throw eventNotFoundError(id);
  }

  return loadAdminEventDetail(updatedEvent.id);
}

export async function publishEventService(id, auditActor, actor) {
  const event = await findEventById(id);

  if (!event) {
    throw eventNotFoundError(id);
  }

  await assertCanManageEventAccess(actor, event);

  assertEventStatusNotFinalized(event);

  const updatedEvent = await updateEventById(id, {
    status: EVENT_STATUSES.PUBLISHED,

    publishedAt: event.publishedAt || new Date(),

    updatedByEventUserId: auditActor.updatedByEventUserId || null,
  });

  if (!updatedEvent) {
    throw eventNotFoundError(id);
  }

  return loadAdminEventDetail(updatedEvent.id);
}
