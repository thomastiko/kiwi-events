import {
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_ROLES,
} from "../../modules/eventUsers/eventUser.constants.js";
import { AppError } from "../errors/AppError.js";

function isActiveEventUser(eventUser) {
  return eventUser && eventUser.isActive !== false;
}

function isAdmin(eventUser) {
  return (
    eventUser?.authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL &&
    eventUser?.role === EVENT_USER_ROLES.ADMIN
  );
}

function adminAccessRequiredError() {
  return AppError.forbidden("Admin access is required.", {
    code: "ADMIN_ACCESS_REQUIRED",
    title: "Admin access required",
    action: "Log in with a local admin account.",
  });
}

export function requireAdmin(req, _res, next) {
  const eventUser = req.eventUser;

  if (!isActiveEventUser(eventUser) || !isAdmin(eventUser)) {
    return next(adminAccessRequiredError());
  }

  return next();
}

export function requireSystemAdmin(req, _res, next) {
  const eventUser = req.eventUser;

  if (!isActiveEventUser(eventUser) || !isAdmin(eventUser)) {
    return next(
      AppError.forbidden("System admin access is required.", {
        code: "SYSTEM_ADMIN_ACCESS_REQUIRED",
        title: "System admin access required",
        action: "Log in with a local admin account.",
      }),
    );
  }

  return next();
}
