import { AppError } from "../../core/errors/AppError.js";

export function validImageFileRequiredError(field = "file") {
  return AppError.badRequest("A valid image file is required.", {
    code: "VALID_IMAGE_FILE_REQUIRED",
    title: "Image file required",
    action: "Choose a valid image file and upload it again.",
    fields: [
      {
        path: `body.${field}`,
        message: "Choose a valid image file.",
      },
    ],
  });
}

export function mediaStorageSaveFailedError(details = {}) {
  return new AppError({
    code: "MEDIA_STORAGE_SAVE_FAILED",
    title: "Media storage failed",
    message: "The image could not be saved to storage.",
    statusCode: 500,
    expose: true,
    action:
      "Check the configured storage provider and try uploading the image again.",
    details,
  });
}

export function mediaStorageReadFailedError(details = {}) {
  return new AppError({
    code: "MEDIA_STORAGE_READ_FAILED",
    title: "Media storage read failed",
    message: "The stored media file could not be read.",
    statusCode: 500,
    expose: true,
    action: "Check whether the file still exists in the configured storage.",
    details,
  });
}

export function eventImageAssetNotFoundError(assetId) {
  return AppError.notFound("Image not found.", {
    code: "EVENT_IMAGE_ASSET_NOT_FOUND",
    title: "Image not found",
    action: "Refresh the media list and try again.",
    details: {
      assetId,
    },
  });
}

export function eventImageAssetInUseError({ assetId, usedBy = [] } = {}) {
  return AppError.conflict("Image is still in use by at least one event.", {
    code: "EVENT_IMAGE_ASSET_IN_USE",
    title: "Image is still in use",
    action:
      "Remove this image from all events before deleting it from the media library.",
    details: {
      assetId,
      usedBy,
    },
  });
}

export function mediaAssetNotFoundError(assetId) {
  return AppError.notFound("Media asset not found.", {
    code: "MEDIA_ASSET_NOT_FOUND",
    title: "Media asset not found",
    action: "Check the media asset id and try again.",
    details: {
      assetId,
    },
  });
}

export function mediaAssetNotPublicError(assetId) {
  return AppError.forbidden("Media asset is not public.", {
    code: "MEDIA_ASSET_NOT_PUBLIC",
    title: "Media asset is not public",
    action: "Only public media assets can be opened.",
    details: {
      assetId,
    },
  });
}

export function mediaAssetStorageKeyMissingError(assetId) {
  return AppError.notFound("Media asset has no storage key.", {
    code: "MEDIA_ASSET_STORAGE_KEY_MISSING",
    title: "Media file missing",
    action:
      "The media record exists, but no storage file is linked. Upload the file again.",
    details: {
      assetId,
    },
  });
}
export function pdfCompatibleImageRequiredError() {
  return AppError.badRequest(
    "This image format cannot be rendered into PDF tickets.",
    {
      code: "PDF_COMPATIBLE_IMAGE_REQUIRED",

      title: "PDF-compatible image required",

      action: "Upload a PNG or JPEG image.",

      fields: [
        {
          path: "body.image",

          message:
            "Only PNG and JPEG images are supported for ticket templates.",
        },
      ],
    },
  );
}
