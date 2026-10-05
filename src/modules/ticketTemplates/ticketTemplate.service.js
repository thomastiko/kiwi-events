import { logger } from "../../config/logger.js";

import { withDatabaseTransaction } from "../database/database.service.js";

import { findEventById } from "../events/repositories/event.repository.js";

import {
  eventAccessRequiredError,
  eventManageForbiddenError,
  eventNotFoundError,
} from "../events/event.errors.js";

import { canManageEvent } from "../permissions/eventAuthorization.service.js";

import { MEDIA_ASSET_KINDS } from "../mediaAssets/mediaAsset.constants.js";

import {
  findMediaAssetByIdAndKind,
  findMediaAssetsByIds,
  listMediaAssetsByKindAndOwnerEventId,
} from "../mediaAssets/repositories/mediaAsset.repository.js";

import {
  deleteTicketTemplateImageAssetService,
  uploadTicketTemplateImageAssetService,
} from "../mediaAssets/internal/mediaAsset.internal.service.js";

import {
  invalidateTicketPdfDocumentsByEventId,
  listTickets,
} from "../tickets/repositories/ticket.repository.js";

import {
  collectTicketPdfStorageReferences,
  deleteTicketPdfStorageReferencesSafe,
} from "../tickets/ticketPdfStorage.service.js";

import {
  TICKET_TEMPLATE_SCHEMA_VERSION,
  TICKET_TEMPLATE_SOURCE,
} from "./ticketTemplate.constants.js";

import { buildDefaultTicketTemplate } from "./ticketTemplate.default.js";

import {
  collectTicketTemplateImageAssetIds,
  ticketTemplateSchema,
} from "./ticketTemplate.schema.js";

import {
  deleteTicketTemplateByEventId,
  findTicketTemplateByEventId,
  upsertTicketTemplateByEventId,
} from "./repositories/ticketTemplate.repository.js";

import {
  ticketTemplateImageInUseError,
  ticketTemplateImageNotFoundError,
  ticketTemplateImageNotOwnedByEventError,
  ticketTemplateRenderAssetMissingError,
} from "./ticketTemplate.errors.js";

function getActorEventUserId(actor) {
  return actor?.eventUserId || actor?.eventUser?.id || null;
}

async function loadManageableEvent(eventId, actor, options = {}) {
  if (!actor?.eventUser || !getActorEventUserId(actor)) {
    throw eventAccessRequiredError();
  }

  const event = await findEventById(eventId, {
    ...options,
    lean: true,
  });

  if (!event) {
    throw eventNotFoundError(eventId);
  }

  if (!(await canManageEvent(actor, event))) {
    throw eventManageForbiddenError();
  }

  return event;
}

function buildEffectiveTemplate(customTemplate, images = []) {
  if (!customTemplate) {
    return {
      source: TICKET_TEMPLATE_SOURCE.DEFAULT,

      schemaVersion: TICKET_TEMPLATE_SCHEMA_VERSION,

      revision: 0,

      template: buildDefaultTicketTemplate(),

      images,
    };
  }

  return {
    source: TICKET_TEMPLATE_SOURCE.CUSTOM,

    schemaVersion: customTemplate.schemaVersion,

    revision: customTemplate.revision,

    template: structuredClone(customTemplate.template),

    images,
  };
}

async function listTemplateImages(eventId) {
  return listMediaAssetsByKindAndOwnerEventId(
    MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,

    eventId,

    {
      lean: true,
    },
  );
}

async function assertTemplateImageReferences({ eventId, template }) {
  const assetIds = collectTicketTemplateImageAssetIds(template);

  if (!assetIds.length) {
    return [];
  }

  const assets = await findMediaAssetsByIds(assetIds, {
    lean: true,
  });

  const assetMap = new Map(assets.map((asset) => [String(asset.id), asset]));

  for (const assetId of assetIds) {
    const asset = assetMap.get(String(assetId));

    if (!asset) {
      throw ticketTemplateImageNotFoundError(assetId);
    }

    if (
      asset.kind !== MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE ||
      String(asset.ownerEventId || "") !== String(eventId)
    ) {
      throw ticketTemplateImageNotOwnedByEventError({
        eventId,
        assetId,
      });
    }
  }

  return assetIds.map((assetId) => assetMap.get(String(assetId)));
}

export async function getTicketTemplateForEventService({ eventId, actor }) {
  await loadManageableEvent(eventId, actor);

  const [customTemplate, images] = await Promise.all([
    findTicketTemplateByEventId(eventId, {
      lean: true,
    }),

    listTemplateImages(eventId),
  ]);

  return buildEffectiveTemplate(customTemplate, images);
}

export async function saveTicketTemplateForEventService({
  eventId,
  template,
  actor,
}) {
  await loadManageableEvent(eventId, actor);

  const validatedTemplate = ticketTemplateSchema.parse(template);

  await assertTemplateImageReferences({
    eventId,
    template: validatedTemplate,
  });

  const eventUserId = getActorEventUserId(actor);

  const staleTicketPdfReferences = await withDatabaseTransaction(async (tx) => {
    const tickets = await listTickets(
      {
        eventId,
      },
      {
        ...tx,
        lean: true,
        includeSecrets: true,
      },
    );

    const references = collectTicketPdfStorageReferences(tickets);

    await upsertTicketTemplateByEventId(
      eventId,

      {
        schemaVersion: TICKET_TEMPLATE_SCHEMA_VERSION,

        template: validatedTemplate,

        createdByEventUserId: eventUserId,

        updatedByEventUserId: eventUserId,
      },

      tx,
    );

    await invalidateTicketPdfDocumentsByEventId(
      eventId,

      {
        updatedByEventUserId: eventUserId,
      },

      tx,
    );

    return references;
  });

  await deleteTicketPdfStorageReferencesSafe(staleTicketPdfReferences, {
    eventId,
    reason: "ticket_template_updated",
  });

  return getTicketTemplateForEventService({
    eventId,
    actor,
  });
}

export async function resetTicketTemplateForEventService({ eventId, actor }) {
  await loadManageableEvent(eventId, actor);

  const eventUserId = getActorEventUserId(actor);

  const staleTicketPdfReferences = await withDatabaseTransaction(async (tx) => {
    const deleted = await deleteTicketTemplateByEventId(eventId, tx);

    if (!deleted) {
      return [];
    }

    const tickets = await listTickets(
      {
        eventId,
      },
      {
        ...tx,
        lean: true,
        includeSecrets: true,
      },
    );

    const references = collectTicketPdfStorageReferences(tickets);

    await invalidateTicketPdfDocumentsByEventId(
      eventId,

      {
        updatedByEventUserId: eventUserId,
      },

      tx,
    );

    return references;
  });

  await deleteTicketPdfStorageReferencesSafe(staleTicketPdfReferences, {
    eventId,
    reason: "ticket_template_reset",
  });

  return getTicketTemplateForEventService({
    eventId,
    actor,
  });
}

export async function uploadTicketTemplateImageForEventService({
  eventId,
  file,
  storageTarget,
  actor,
}) {
  await loadManageableEvent(eventId, actor);

  return uploadTicketTemplateImageAssetService({
    eventId,
    file,
    storageTarget,
    actor,
  });
}

export async function deleteTicketTemplateImageForEventService({
  eventId,
  assetId,
  actor,
}) {
  await loadManageableEvent(eventId, actor);

  const asset = await findMediaAssetByIdAndKind(
    assetId,

    MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,

    {
      lean: true,
    },
  );

  if (!asset) {
    throw ticketTemplateImageNotFoundError(assetId);
  }

  if (String(asset.ownerEventId || "") !== String(eventId)) {
    throw ticketTemplateImageNotOwnedByEventError({
      eventId,
      assetId,
    });
  }

  const customTemplate = await findTicketTemplateByEventId(eventId, {
    lean: true,
  });

  if (
    customTemplate &&
    collectTicketTemplateImageAssetIds(customTemplate.template).includes(
      String(assetId),
    )
  ) {
    throw ticketTemplateImageInUseError({
      eventId,
      assetId,
    });
  }

  return deleteTicketTemplateImageAssetService(assetId);
}

export async function resolveTicketTemplateForRenderService(eventId) {
  const customTemplate = await findTicketTemplateByEventId(eventId, {
    lean: true,
  });

  const effective = buildEffectiveTemplate(customTemplate);

  const validatedTemplate = ticketTemplateSchema.parse(effective.template);

  const assetIds = collectTicketTemplateImageAssetIds(validatedTemplate);

  if (!assetIds.length) {
    return {
      ...effective,

      template: validatedTemplate,

      imageAssets: [],
    };
  }

  const assets = await findMediaAssetsByIds(assetIds, {
    lean: true,
  });

  const assetMap = new Map(assets.map((asset) => [String(asset.id), asset]));

  for (const assetId of assetIds) {
    const asset = assetMap.get(String(assetId));

    if (
      !asset ||
      asset.kind !== MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE ||
      String(asset.ownerEventId || "") !== String(eventId) ||
      !asset.key
    ) {
      throw ticketTemplateRenderAssetMissingError({
        eventId,
        assetId,
      });
    }
  }

  return {
    ...effective,

    template: validatedTemplate,

    imageAssets: assetIds.map((assetId) => assetMap.get(String(assetId))),
  };
}

export async function deleteTicketTemplateRecordForEventService(
  eventId,
  options = {},
) {
  return deleteTicketTemplateByEventId(eventId, options);
}

export async function cleanupTicketTemplateImagesForDeletedEventService(
  eventId,
) {
  const images = await listTemplateImages(eventId);

  for (const image of images) {
    try {
      await deleteTicketTemplateImageAssetService(image.id);
    } catch (error) {
      logger.warn("ticket_template.image_cleanup_failed", {
        eventId,

        assetId: image.id,

        error,
      });
    }
  }
}
