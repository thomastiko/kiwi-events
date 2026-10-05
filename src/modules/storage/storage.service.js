import { env } from "../../config/env.js";
import { localStorageProvider } from "./providers/local.storage.provider.js";
import { createS3StorageProvider } from "./providers/s3.storage.provider.js";
import { STORAGE_TARGETS, STORAGE_TARGET_VALUES } from "./storage.constants.js";
import { unsupportedStorageTargetError } from "./storage.errors.js";

const s3Providers = new Map();

function normalizeStorageTarget(value) {
  const target = String(value ?? STORAGE_TARGETS.LOCAL)
    .trim()
    .toLowerCase();

  if (!STORAGE_TARGET_VALUES.includes(target)) {
    throw unsupportedStorageTargetError(target);
  }

  return target;
}

function getS3Provider(target) {
  if (!s3Providers.has(target)) {
    s3Providers.set(
      target,
      createS3StorageProvider({
        target,
        config: env.storage[target],
      }),
    );
  }

  return s3Providers.get(target);
}

function getStorageProvider(target) {
  switch (target) {
    case STORAGE_TARGETS.LOCAL:
      return localStorageProvider;

    case STORAGE_TARGETS.PUBLIC:
    case STORAGE_TARGETS.PRIVATE:
      return getS3Provider(target);

    default:
      throw unsupportedStorageTargetError(target);
  }
}

export async function uploadBuffer({
  storageTarget = STORAGE_TARGETS.LOCAL,
  ...params
} = {}) {
  const target = normalizeStorageTarget(storageTarget);

  return getStorageProvider(target).uploadBuffer(params);
}

export async function getBuffer({
  storageTarget = STORAGE_TARGETS.LOCAL,
  key,
} = {}) {
  const target = normalizeStorageTarget(storageTarget);

  return getStorageProvider(target).getBuffer(key);
}

export async function deleteObject({
  storageTarget = STORAGE_TARGETS.LOCAL,
  key,
} = {}) {
  const target = normalizeStorageTarget(storageTarget);

  return getStorageProvider(target).deleteObject(key);
}
