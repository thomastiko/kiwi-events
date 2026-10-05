import { getPublicSetupStatus } from "../../config/kiwi-events/kiwi-events.config.store.js";
import { AppError } from "../errors/AppError.js";

const SETUP_ALLOWED_PREFIXES = ["/api/setup", "/api/health"];

function isSetupAllowedPath(req) {
  return SETUP_ALLOWED_PREFIXES.some((prefix) =>
    req.originalUrl.startsWith(prefix),
  );
}

export function setupModeMiddleware(req, _res, next) {
  const setupStatus = getPublicSetupStatus();

  if (setupStatus.initialized) {
    return next();
  }

  if (isSetupAllowedPath(req)) {
    return next();
  }

  return next(
    AppError.serviceUnavailable("kiwi-events is not initialized yet.", {
      code: "KIWI_EVENTS_SETUP_REQUIRED",
      title: "Setup required",
      action:
        "Open the kiwi-events setup page and complete the initial configuration.",
      details: {
        setup: setupStatus,
      },
    }),
  );
}
