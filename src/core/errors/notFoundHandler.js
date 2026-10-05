import { AppError } from "./AppError.js";
import { ERROR_CODES } from "./errorCodes.js";

export const notFoundHandler = (req, res, next) => {
  next(
    new AppError({
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      title: "Route not found",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
      action: "Check the HTTP method and URL path.",
    }),
  );
};
