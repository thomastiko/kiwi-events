import { AppError } from "../../core/errors/AppError.js";

let maintenanceMode = false;
let maintenanceReason = null;

export function enableMaintenanceMode(reason = "maintenance") {
  maintenanceMode = true;
  maintenanceReason = reason;
}

export function disableMaintenanceMode() {
  maintenanceMode = false;
  maintenanceReason = null;
}

export function getMaintenanceState() {
  return {
    enabled: maintenanceMode,
    reason: maintenanceReason,
  };
}

function isMaintenanceAllowedPath(req) {
  return (
    req.originalUrl.startsWith("/api/health") ||
    req.originalUrl.startsWith("/api/setup") ||
    req.originalUrl.startsWith("/api/admin/system")
  );
}

export function maintenanceMiddleware(req, _res, next) {
  if (!maintenanceMode) {
    return next();
  }

  if (isMaintenanceAllowedPath(req)) {
    return next();
  }

  return next(
    AppError.serviceUnavailable(
      "kiwi-events is temporarily in maintenance mode.",
      {
        code: "KIWI_EVENTS_MAINTENANCE_MODE",
        title: "Maintenance mode",
        action: "Try again after the maintenance operation has finished.",
        details: {
          reason: maintenanceReason,
        },
      },
    ),
  );
}
