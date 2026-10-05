import multer from "multer";
import { ZodError } from "zod";

import { logger } from "../../config/logger.js";
import { AppError } from "./AppError.js";
import { ERROR_CODES, titleFromErrorCode } from "./errorCodes.js";

function cleanPath(path) {
  return path.filter((part) => part !== undefined && part !== null).join(".");
}

function stripRequestRoot(path) {
  return String(path || "").replace(/^(body|params|query)\./, "");
}

function normalizeZodFields(error) {
  return error.issues.map((issue) => {
    const path = cleanPath(issue.path);

    return {
      path,
      field: stripRequestRoot(path),
      message: issue.message,
      code: issue.code,
    };
  });
}

function isMongoDuplicateKeyError(error) {
  return error?.name === "MongoServerError" && error?.code === 11000;
}

function isSqlDuplicateKeyError(error) {
  return ["ER_DUP_ENTRY", "SQLITE_CONSTRAINT", "23505"].includes(error?.code);
}

function normalizeAppError(error) {
  const message = error.expose
    ? error.message
    : "An unexpected server error occurred.";

  return {
    statusCode: error.statusCode,
    error: {
      code: error.code,
      title: error.title,
      message,
      ...(error.fields.length ? { fields: error.fields } : {}),
      ...(error.action ? { action: error.action } : {}),
      ...(error.details && error.expose ? { details: error.details } : {}),
    },
  };
}

function normalizeKnownError(error) {
  if (error instanceof AppError) {
    return normalizeAppError(error);
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        title: titleFromErrorCode(ERROR_CODES.VALIDATION_FAILED),
        message: "Please fix the highlighted fields.",
        fields: normalizeZodFields(error),
      },
    };
  }

  if (error instanceof multer.MulterError) {
    const isFileSize = error.code === "LIMIT_FILE_SIZE";

    return {
      statusCode: isFileSize ? 413 : 400,
      error: {
        code: isFileSize
          ? ERROR_CODES.PAYLOAD_TOO_LARGE
          : ERROR_CODES.BAD_REQUEST,
        title: isFileSize ? "Upload too large" : "Upload failed",
        message: isFileSize
          ? "The uploaded file is too large."
          : error.message || "The uploaded file could not be processed.",
      },
    };
  }

  if (
    ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
      error?.name,
    )
  ) {
    return {
      statusCode: 401,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        title: "Authentication failed",
        message: "Your session is invalid or expired. Please log in again.",
      },
    };
  }

  if (isMongoDuplicateKeyError(error) || isSqlDuplicateKeyError(error)) {
    return {
      statusCode: 409,
      error: {
        code: ERROR_CODES.CONFLICT,
        title: titleFromErrorCode(ERROR_CODES.CONFLICT),
        message: "A record with these values already exists.",
      },
    };
  }

  return null;
}

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const knownError = normalizeKnownError(err);

  const normalized = knownError || {
    statusCode: 500,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      title: titleFromErrorCode(ERROR_CODES.INTERNAL_ERROR),
      message: "An unexpected server error occurred.",
    },
  };

  if (!knownError || normalized.statusCode >= 500) {
    logger.error(err);
  }

  return res.status(normalized.statusCode).json({
    success: false,
    error: normalized.error,
  });
};
