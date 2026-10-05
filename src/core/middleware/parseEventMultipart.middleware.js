import { AppError } from "../errors/AppError.js";

function safeJsonParse(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw AppError.badRequest(`Invalid JSON in field "${fieldName}".`, {
      code: "INVALID_MULTIPART_JSON_FIELD",
      title: "Invalid form data",
      action: "Check the submitted form data and retry the request.",
      fields: [
        {
          path: `body.${fieldName}`,
          message: `Field "${fieldName}" must contain valid JSON.`,
        },
      ],
    });
  }
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);

  return Number.isNaN(parsed) ? value : parsed;
}

export function parseEventMultipartBody(req, res, next) {
  try {
    if (!req.body || typeof req.body !== "object") {
      return next();
    }

    req.body.sessions = safeJsonParse(req.body.sessions, "sessions");
    req.body.ticketTypes = safeJsonParse(req.body.ticketTypes, "ticketTypes");
    req.body.faqs = safeJsonParse(req.body.faqs, "faqs");
    req.body.tags = safeJsonParse(req.body.tags, "tags");

    req.body.isFree = parseBoolean(req.body.isFree);
    req.body.isFeatured = parseBoolean(req.body.isFeatured);

    req.body.imageAssetIds = safeJsonParse(
      req.body.imageAssetIds,
      "imageAssetIds",
    );

    if (req.body.imageAssetIds === undefined) {
      delete req.body.imageAssetIds;
    }

    req.body.featuredOrder = parseNumber(req.body.featuredOrder);

    if (req.body.featuredOrder === undefined) {
      delete req.body.featuredOrder;
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
