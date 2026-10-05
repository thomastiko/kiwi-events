export const ERROR_CODES = Object.freeze({
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  DATABASE_CONNECTION_FAILED: "DATABASE_CONNECTION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

const DEFAULT_TITLES_BY_CODE = Object.freeze({
  [ERROR_CODES.BAD_REQUEST]: "Bad request",
  [ERROR_CODES.VALIDATION_FAILED]: "Validation failed",
  [ERROR_CODES.UNAUTHORIZED]: "Authentication required",
  [ERROR_CODES.FORBIDDEN]: "Access denied",
  [ERROR_CODES.NOT_FOUND]: "Not found",
  [ERROR_CODES.ROUTE_NOT_FOUND]: "Route not found",
  [ERROR_CODES.CONFLICT]: "Conflict",
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: "Upload too large",
  [ERROR_CODES.UNSUPPORTED_MEDIA_TYPE]: "Unsupported file type",
  [ERROR_CODES.DATABASE_CONNECTION_FAILED]: "Database connection failed",
  [ERROR_CODES.INTERNAL_ERROR]: "Internal server error",
});

export function titleFromErrorCode(code) {
  return DEFAULT_TITLES_BY_CODE[code] || "Request failed";
}

export function errorCodeFromStatus(statusCode) {
  if (statusCode === 400) return ERROR_CODES.BAD_REQUEST;
  if (statusCode === 401) return ERROR_CODES.UNAUTHORIZED;
  if (statusCode === 403) return ERROR_CODES.FORBIDDEN;
  if (statusCode === 404) return ERROR_CODES.NOT_FOUND;
  if (statusCode === 409) return ERROR_CODES.CONFLICT;
  if (statusCode === 413) return ERROR_CODES.PAYLOAD_TOO_LARGE;
  if (statusCode === 415) return ERROR_CODES.UNSUPPORTED_MEDIA_TYPE;

  return ERROR_CODES.INTERNAL_ERROR;
}
