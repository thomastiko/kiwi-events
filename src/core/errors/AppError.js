import {
  errorCodeFromStatus,
  titleFromErrorCode,
  ERROR_CODES,
} from "./errorCodes.js";

function normalizeStatusCode(statusCode) {
  const numericStatus = Number(statusCode);

  if (
    Number.isInteger(numericStatus) &&
    numericStatus >= 400 &&
    numericStatus <= 599
  ) {
    return numericStatus;
  }

  return 500;
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .map((field) => ({
      path: String(field?.path || field?.field || "").trim(),
      message: String(field?.message || "").trim(),
      code: field?.code ? String(field.code).trim() : undefined,
    }))
    .filter((field) => field.path && field.message);
}

export class AppError extends Error {
  constructor({
    code,
    title,
    message,
    statusCode = 500,
    details = null,
    fields = [],
    action = null,
    expose,
    cause = null,
  } = {}) {
    if (!message) {
      throw new TypeError("AppError requires a message.");
    }

    super(message);

    if (cause) {
      this.cause = cause;
    }

    this.name = "AppError";
    this.statusCode = normalizeStatusCode(statusCode);
    this.code = code || errorCodeFromStatus(this.statusCode);
    this.title = title || titleFromErrorCode(this.code);
    this.details = details;
    this.fields = normalizeFields(fields);
    this.action = action ? String(action) : null;
    this.expose = expose ?? this.statusCode < 500;

    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, options = {}) {
    return new AppError({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
      message,
      ...options,
    });
  }

  static unauthorized(message = "Authentication is required.", options = {}) {
    return new AppError({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
      message,
      ...options,
    });
  }

  static forbidden(message = "Access is denied.", options = {}) {
    return new AppError({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
      message,
      ...options,
    });
  }

  static notFound(message = "Resource not found.", options = {}) {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
      message,
      ...options,
    });
  }

  static conflict(message, options = {}) {
    return new AppError({
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
      message,
      ...options,
    });
  }
  static serviceUnavailable(message = "Service unavailable.", options = {}) {
    return new AppError({
      code: "SERVICE_UNAVAILABLE",
      statusCode: 503,
      message,
      ...options,
    });
  }
  static internal(message = "Internal server error.", options = {}) {
    return new AppError({
      code: ERROR_CODES.INTERNAL_ERROR,
      statusCode: 500,
      message,
      expose: false,
      ...options,
    });
  }
}
