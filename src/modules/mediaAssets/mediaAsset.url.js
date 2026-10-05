import { env } from "../../config/env.js";

import {
  STORAGE_TARGETS,
  STORAGE_TARGET_VALUES,
} from "../storage/storage.constants.js";

function requireString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(
      `Cannot build MediaAsset file URL without ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeStorageTarget(value) {
  const target = requireString(value, "storageTarget").toLowerCase();

  if (!STORAGE_TARGET_VALUES.includes(target)) {
    throw new TypeError(
      `Cannot build MediaAsset file URL for unsupported storage target "${target}".`,
    );
  }

  return target;
}

function encodeStorageKey(key) {
  return requireString(key, "key")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildDirectPublicUrl(key) {
  const baseUrl = requireString(
    env.storage.public?.publicBaseUrl,
    "public storage base URL",
  ).replace(/\/+$/, "");

  return `${baseUrl}/${encodeStorageKey(key)}`;
}

export function getMediaAssetFileUrl(asset) {
  if (!asset) {
    throw new TypeError("Cannot build file URL for a missing MediaAsset.");
  }

  const storageTarget = normalizeStorageTarget(asset.storageTarget);

  if (storageTarget === STORAGE_TARGETS.PUBLIC) {
    return buildDirectPublicUrl(asset.key);
  }

  const id = requireString(asset.id, "id");

  return `/api/public/media-assets/${encodeURIComponent(id)}/file`;
}
