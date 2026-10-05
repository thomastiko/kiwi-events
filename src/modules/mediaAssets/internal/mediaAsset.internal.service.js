// src/modules/mediaAssets/internal/mediaAsset.internal.service.js

import { logger } from "../../../config/logger.js";
import { deleteObject, uploadBuffer } from "../../storage/storage.service.js";
import { MEDIA_ASSET_KINDS } from "../mediaAsset.constants.js";
import {
  createMediaAsset,
  deleteMediaAssetById,
  findMediaAssetByIdAndKind,
  listMediaAssetsByKind,
} from "../repositories/mediaAsset.repository.js";
import {
  findEventsUsingImageAsset,
  findEventsUsingImageAssets,
} from "../../events/repositories/event.repository.js";

import {
  eventImageAssetInUseError,
  eventImageAssetNotFoundError,
  mediaStorageSaveFailedError,
  validImageFileRequiredError,
  pdfCompatibleImageRequiredError,
} from "../mediaAsset.errors.js";

import {
  assertSupportedImageFile,
  buildSafeImageOriginalName,
} from "../../../core/security/imageFile.service.js";

function buildEventStaffProfileFolder() {
  return "events/staff/profile-images";
}

function buildEventMediaFolder() {
  return "media/events";
}
function buildTicketTemplateMediaFolder(eventId) {
  return `media/ticket-templates/${String(eventId)}`;
}
function mapUsageInfo(events = []) {
  return events.map((event) => ({
    eventId: event.id,
    title: event.title,
    slug: event.slug,
    status: event.status,
  }));
}

function getActorEventUserId(actor) {
  return actor?.eventUserId || null;
}

async function deleteStorageObjectSafe(asset, context = {}) {
  if (!asset?.key) {
    return;
  }

  try {
    await deleteObject({
      key: asset.key,
      storageTarget: asset.storageTarget,
    });
  } catch (error) {
    logger.warn("media_asset.storage_delete_failed", {
      key: asset.key,
      storageTarget: asset.storageTarget || null,
      ...context,
      error,
    });
  }
}

async function uploadImageToStorage({
  file,
  folder,
  storageTarget,
  errorContext,
  allowedMimeTypes = null,
}) {
  if (!file?.buffer) {
    throw validImageFileRequiredError("file");
  }

  const detectedType = assertSupportedImageFile(file, "body.file");

  if (
    Array.isArray(allowedMimeTypes) &&
    !allowedMimeTypes.includes(detectedType.mimeType)
  ) {
    throw pdfCompatibleImageRequiredError();
  }

  const safeOriginalName = buildSafeImageOriginalName(
    file.originalname,
    detectedType.extension,
  );

  const uploaded = await uploadBuffer({
    storageTarget,

    buffer: file.buffer,

    mimeType: detectedType.mimeType,

    originalName: safeOriginalName,

    folder,
  });

  if (!uploaded?.key) {
    throw mediaStorageSaveFailedError(errorContext);
  }

  return {
    ...uploaded,
    mimeType: detectedType.mimeType,
    originalName: safeOriginalName,
  };
}
export async function uploadEventImageAssetService({
  file,
  storageTarget,
  actor,
}) {
  const folder = buildEventMediaFolder();

  const uploaded = await uploadImageToStorage({
    file,
    folder,
    storageTarget,

    errorContext: {
      kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
      folder,
    },
  });

  const eventUserId = getActorEventUserId(actor);

  return createMediaAsset({
    kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
    folder,
    key: uploaded.key,
    storageTarget: uploaded.storageTarget,
    filenameOriginal: uploaded.originalName || "",
    mimeType: uploaded.mimeType || "",
    size: file.size || 0,
    createdByEventUserId: eventUserId,
    updatedByEventUserId: eventUserId,
  });
}

export async function getEventMediaAssetUsageService(assetId) {
  const usedByEvents = await findEventsUsingImageAsset(assetId, {
    lean: true,
  });

  return {
    isUsed: usedByEvents.length > 0,
    usedBy: mapUsageInfo(usedByEvents),
  };
}

export async function listEventImageAssetsService() {
  const assets = await listMediaAssetsByKind(MEDIA_ASSET_KINDS.EVENT_IMAGE, {
    lean: true,
  });

  if (!assets.length) {
    return [];
  }

  const assetIds = assets.map((asset) => asset.id);

  const usedEvents = await findEventsUsingImageAssets(assetIds, {
    lean: true,
  });

  const usageMap = new Map();

  for (const event of usedEvents) {
    const eventImageAssetIds = Array.isArray(event.imageAssetIds)
      ? event.imageAssetIds
      : [];

    for (const assetId of eventImageAssetIds) {
      const key = String(assetId);
      const current = usageMap.get(key) || [];

      current.push({
        eventId: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
      });

      usageMap.set(key, current);
    }
  }

  return assets.map((asset) => {
    const assetId = asset.id;
    const usedBy = usageMap.get(String(assetId)) || [];

    return {
      ...asset,
      isUsed: usedBy.length > 0,
      usedBy,
    };
  });
}

export async function deleteEventImageAssetService(assetId) {
  const asset = await findMediaAssetByIdAndKind(
    assetId,
    MEDIA_ASSET_KINDS.EVENT_IMAGE,
  );

  if (!asset) {
    throw eventImageAssetNotFoundError(assetId);
  }

  const usage = await getEventMediaAssetUsageService(asset.id);

  if (usage.isUsed) {
    throw eventImageAssetInUseError({
      assetId: asset.id,
      usedBy: usage.usedBy,
    });
  }

  const deletedAsset = await deleteMediaAssetById(asset.id);

  await deleteStorageObjectSafe(deletedAsset, {
    assetId: deletedAsset?.id || assetId,
    kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
    action: "delete_event_image_asset",
  });

  return { deleted: true };
}

export async function cleanupEventImageAssetService(assetId) {
  if (!assetId) {
    return { deleted: false };
  }

  const asset = await findMediaAssetByIdAndKind(
    assetId,
    MEDIA_ASSET_KINDS.EVENT_IMAGE,
  );

  if (!asset) {
    return { deleted: false };
  }

  const deletedAsset = await deleteMediaAssetById(asset.id);

  await deleteStorageObjectSafe(deletedAsset, {
    assetId: deletedAsset?.id || assetId,
    kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
    action: "cleanup_event_image_asset",
  });

  return { deleted: true };
}
export async function uploadTicketTemplateImageAssetService({
  eventId,
  file,
  storageTarget,
  actor,
}) {
  const folder = buildTicketTemplateMediaFolder(eventId);

  const uploaded = await uploadImageToStorage({
    file,

    storageTarget,

    folder,

    errorContext: {
      kind: MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,

      folder,

      eventId,
    },

    allowedMimeTypes: ["image/jpeg", "image/png"],
  });

  const eventUserId = getActorEventUserId(actor);

  return createMediaAsset({
    kind: MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,

    folder,

    key: uploaded.key,

    storageTarget: uploaded.storageTarget,

    filenameOriginal: uploaded.originalName || "",

    mimeType: uploaded.mimeType || "",

    size: file.size || 0,

    ownerEventId: eventId,

    createdByEventUserId: eventUserId,

    updatedByEventUserId: eventUserId,
  });
}

export async function deleteTicketTemplateImageAssetService(assetId) {
  const asset = await findMediaAssetByIdAndKind(
    assetId,

    MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,
  );

  if (!asset) {
    return {
      deleted: false,
    };
  }

  const deletedAsset = await deleteMediaAssetById(asset.id);

  await deleteStorageObjectSafe(deletedAsset, {
    assetId: deletedAsset?.id || assetId,

    kind: MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,

    action: "delete_ticket_template_image_asset",
  });

  return {
    deleted: true,
  };
}
export async function uploadEventStaffProfileImageAssetService({
  file,
  storageTarget,
  actor,
}) {
  const folder = buildEventStaffProfileFolder();

  const uploaded = await uploadImageToStorage({
    file,
    storageTarget,
    folder,
    errorContext: {
      kind: MEDIA_ASSET_KINDS.EVENT_STAFF_PROFILE_IMAGE,
      folder,
    },
  });

  const eventUserId = getActorEventUserId(actor);

  return createMediaAsset({
    kind: MEDIA_ASSET_KINDS.EVENT_STAFF_PROFILE_IMAGE,
    folder,
    key: uploaded.key,
    storageTarget: uploaded.storageTarget,
    filenameOriginal: uploaded.originalName || "",
    mimeType: uploaded.mimeType || "",
    size: file.size || 0,
    createdByEventUserId: eventUserId,
    updatedByEventUserId: eventUserId,
  });
}
