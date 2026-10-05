import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

import { getMediaAssetFileUrl } from "./mediaAsset.url.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize MediaAsset without ${fieldName}.`);
  }

  return id;
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(`Cannot serialize MediaAsset without ${fieldName}.`);
  }

  return date;
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function toMediaAssetUsageDto(usage) {
  return {
    eventId: requireApiId(usage.eventId, "usage eventId"),

    title: cleanString(usage.title),
    slug: cleanString(usage.slug),
    status: cleanString(usage.status),
  };
}

export function toMediaAssetDto(asset) {
  if (!asset) {
    throw new TypeError("Cannot serialize a missing MediaAsset.");
  }

  const id = requireApiId(asset.id, "id");

  return {
    id,

    kind: cleanString(asset.kind),

    fileUrl: getMediaAssetFileUrl(asset),

    filenameOriginal: cleanString(asset.filenameOriginal),

    mimeType: cleanString(asset.mimeType),

    size: Number(asset.size ?? 0),

    isUsed: Boolean(asset.isUsed),

    usedBy: Array.isArray(asset.usedBy)
      ? asset.usedBy.map(toMediaAssetUsageDto)
      : [],

    createdAt: requireApiDate(asset.createdAt, "createdAt"),

    updatedAt: requireApiDate(asset.updatedAt, "updatedAt"),
  };
}
