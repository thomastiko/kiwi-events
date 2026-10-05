import path from "node:path";
import { AppError } from "../errors/AppError.js";

const SUPPORTED_IMAGE_TYPES = Object.freeze({
  JPEG: {
    mimeType: "image/jpeg",
    extension: "jpg",
    matches(buffer) {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    },
  },
  PNG: {
    mimeType: "image/png",
    extension: "png",
    matches(buffer) {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    },
  },
  GIF: {
    mimeType: "image/gif",
    extension: "gif",
    matches(buffer) {
      const signature = buffer.subarray(0, 6).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    },
  },
  WEBP: {
    mimeType: "image/webp",
    extension: "webp",
    matches(buffer) {
      return (
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    },
  },
});

export const SUPPORTED_IMAGE_MIME_TYPES = Object.values(
  SUPPORTED_IMAGE_TYPES,
).map((type) => type.mimeType);

export function detectSupportedImageFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  return (
    Object.values(SUPPORTED_IMAGE_TYPES).find((type) => type.matches(buffer)) ||
    null
  );
}

export function assertSupportedImageFile(file, fieldPath = "body.file") {
  const detectedType = detectSupportedImageFile(file?.buffer);

  if (!detectedType) {
    throw AppError.badRequest(
      "Invalid image file. Only JPG, PNG, WEBP and GIF images are allowed.",
      {
        code: "INVALID_IMAGE_FILE_SIGNATURE",
        title: "Invalid image file",
        action: "Upload a valid JPG, PNG, WEBP or GIF image.",
        fields: [
          {
            path: fieldPath,
            message: "Only real JPG, PNG, WEBP and GIF files are allowed.",
          },
        ],
      },
    );
  }

  return detectedType;
}

export function buildSafeImageOriginalName(originalName, extension) {
  const parsedName = path.parse(String(originalName || "upload")).name;
  const safeBaseName =
    parsedName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "upload";

  return `${safeBaseName}.${extension}`;
}
