import { AppError } from "../../core/errors/AppError.js";

export function unsupportedStorageTargetError(target) {
  return AppError.badRequest("Unsupported storage target.", {
    code: "STORAGE_TARGET_UNSUPPORTED",
    title: "Unsupported storage target",
    action: "Use one of the supported storage targets.",
    fields: [
      {
        path: "storageTarget",
        message: `Unsupported storage target: ${target || "<empty>"}.`,
      },
    ],
    details: {
      target,
      supportedTargets: ["local", "public", "private"],
    },
  });
}

export function storageTargetNotConfiguredError(target) {
  return new AppError({
    code: "STORAGE_TARGET_NOT_CONFIGURED",
    title: "Storage target not configured",
    message: `${target} storage is not configured.`,
    statusCode: 500,
    expose: true,
    action: `Configure and enable ${target} storage before using this target.`,
    details: {
      target,
    },
  });
}

export function storageKeyRequiredError() {
  return AppError.badRequest("Storage key is required.", {
    code: "STORAGE_KEY_REQUIRED",
    title: "Storage key required",
    action: "Provide a valid storage object key.",
    fields: [
      {
        path: "key",
        message: "Storage key is required.",
      },
    ],
  });
}

export function invalidStorageKeyError() {
  return AppError.badRequest("Invalid storage key.", {
    code: "INVALID_STORAGE_KEY",
    title: "Invalid storage key",
    action: "Use a storage key inside the configured storage folder.",
    fields: [
      {
        path: "key",
        message:
          "Storage key must stay inside the configured storage directory.",
      },
    ],
  });
}

export function storageBucketMissingError(target) {
  return new AppError({
    code: "STORAGE_BUCKET_MISSING",
    title: "Storage bucket missing",
    message: `${target} storage bucket is not configured.`,
    statusCode: 500,
    expose: true,
    action: `Configure a bucket for ${target} storage.`,
    details: {
      target,
    },
  });
}

export function storageCredentialsMissingError(target) {
  return new AppError({
    code: "STORAGE_CREDENTIALS_MISSING",
    title: "Storage credentials missing",
    message: `${target} storage credentials are not configured.`,
    statusCode: 500,
    expose: true,
    action: `Configure accessKeyId and secretAccessKey for ${target} storage.`,
    details: {
      target,
    },
  });
}
