// src/modules/mediaAssets/public/mediaAsset.public.service.js

import { getBuffer } from "../../storage/storage.service.js";
import { MEDIA_ASSET_KINDS } from "../mediaAsset.constants.js";
import { findMediaAssetById } from "../repositories/mediaAsset.repository.js";

import {
  mediaAssetNotFoundError,
  mediaAssetNotPublicError,
  mediaAssetStorageKeyMissingError,
  mediaStorageReadFailedError,
} from "../mediaAsset.errors.js";

const PUBLIC_MEDIA_KINDS = new Set([
  MEDIA_ASSET_KINDS.EVENT_IMAGE,

  MEDIA_ASSET_KINDS.EVENT_STAFF_PROFILE_IMAGE,

  MEDIA_ASSET_KINDS.TICKET_TEMPLATE_IMAGE,
]);

function unwrapStorageBuffer(file, fallbackContentType) {
  if (Buffer.isBuffer(file)) {
    return {
      buffer: file,
      contentType: fallbackContentType,
      contentLength: file.length,
    };
  }

  if (Buffer.isBuffer(file?.buffer)) {
    return {
      buffer: file.buffer,
      contentType: file.contentType || fallbackContentType,
      contentLength: file.contentLength || file.buffer.length,
    };
  }

  throw mediaStorageReadFailedError();
}

export async function getPublicMediaAssetFileService(assetId) {
  const asset = await findMediaAssetById(assetId, {
    lean: true,
  });

  if (!asset) {
    throw mediaAssetNotFoundError(assetId);
  }

  if (!PUBLIC_MEDIA_KINDS.has(asset.kind)) {
    throw mediaAssetNotPublicError(assetId);
  }

  if (!asset.key) {
    throw mediaAssetStorageKeyMissingError(assetId);
  }

  const storedFile = await getBuffer({
    key: asset.key,

    storageTarget: asset.storageTarget,
  });
  const file = unwrapStorageBuffer(
    storedFile,
    asset.mimeType || "application/octet-stream",
  );

  return {
    buffer: file.buffer,
    filename: asset.filenameOriginal || "media-file",
    contentType:
      asset.mimeType || file.contentType || "application/octet-stream",
    contentLength: file.contentLength,
    cacheControl: "public, max-age=31536000, immutable",
  };
}
