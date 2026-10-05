import multer from "multer";

import { AppError } from "../errors/AppError.js";

export const CUSTOM_MAIL_MAX_FILES = 5;

export const CUSTOM_MAIL_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",

  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",

  "text/plain",
  "text/csv",
  "application/rtf",

  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function fileFilter(req, file, callback) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return callback(
      AppError.badRequest("This attachment file type is not allowed.", {
        code: "CUSTOM_MAIL_ATTACHMENT_TYPE_INVALID",
        title: "Invalid attachment",
        action: "Upload a PDF, image, text file or common Office document.",
        fields: [
          {
            path: "body.attachments",
            message: `File "${file.originalname}" has an unsupported file type.`,
          },
        ],
      }),
    );
  }

  return callback(null, true);
}

export const uploadCustomMailAttachments = multer({
  storage,

  fileFilter,

  limits: {
    files: CUSTOM_MAIL_MAX_FILES,

    /*
     * Multer only supports a per-file size limit.
     * The combined limit is checked separately below.
     */
    fileSize: CUSTOM_MAIL_MAX_TOTAL_BYTES,
  },
});

export function validateCustomMailAttachmentTotal(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : [];

  const totalBytes = files.reduce(
    (sum, file) => sum + Number(file?.size || 0),
    0,
  );

  if (totalBytes <= CUSTOM_MAIL_MAX_TOTAL_BYTES) {
    return next();
  }

  return next(
    new AppError({
      statusCode: 413,

      code: "CUSTOM_MAIL_ATTACHMENTS_TOO_LARGE",

      title: "Attachments too large",

      message: "The combined attachment size exceeds the allowed limit.",

      action: "Reduce the combined attachment size to 25 MB or less.",

      fields: [
        {
          path: "body.attachments",
          message: "Attachments may be at most 25 MB in total.",
        },
      ],
    }),
  );
}
