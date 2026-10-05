import { AppError } from "../errors/AppError.js";

function parseJsonField(value, fieldName) {
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

export function parseCustomMailMultipartBody(req, res, next) {
  try {
    if (!req.body || typeof req.body !== "object") {
      return next();
    }

    req.body.orderIds = parseJsonField(req.body.orderIds, "orderIds");

    if (req.body.orderIds === undefined) {
      delete req.body.orderIds;
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
