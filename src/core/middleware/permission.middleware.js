import { hasEventPermission } from "../../modules/permissions/permission.service.js";
import { AppError } from "../errors/AppError.js";

function normalizePermissions(permissions) {
  return (Array.isArray(permissions) ? permissions : [permissions])
    .map((permission) => String(permission || "").trim())
    .filter(Boolean);
}

function eventUserContextMissingError() {
  return AppError.forbidden("Event user context is missing.", {
    code: "EVENT_USER_CONTEXT_MISSING",
    title: "Event user context missing",
    action: "Log in again and retry the action.",
  });
}

function insufficientEventPermissionsError(requiredPermissions, mode) {
  const isSinglePermission = requiredPermissions.length === 1;

  return AppError.forbidden("Insufficient event permissions.", {
    code: "INSUFFICIENT_EVENT_PERMISSIONS",
    title: "Insufficient permissions",
    action: isSinglePermission
      ? "Ask an admin to assign the required permission for this action."
      : mode === "all"
        ? "Ask an admin to assign all required permissions for this action."
        : "Ask an admin to assign one of the required permissions for this action.",
    details: isSinglePermission
      ? {
          permission: requiredPermissions[0],
        }
      : {
          permissions: requiredPermissions,
          mode,
        },
  });
}

async function hasRequiredPermissions(eventUser, requiredPermissions, mode) {
  const permissionResults = await Promise.all(
    requiredPermissions.map((permission) =>
      hasEventPermission(eventUser, permission),
    ),
  );

  if (mode === "all") {
    return permissionResults.every(Boolean);
  }

  return permissionResults.some(Boolean);
}

export function requireEventPermissions(permissions, options = {}) {
  const requiredPermissions = normalizePermissions(permissions);
  const mode = options.mode === "all" ? "all" : "any";

  return async (req, _res, next) => {
    try {
      const { eventUser } = req;

      if (!eventUser) {
        return next(eventUserContextMissingError());
      }

      if (requiredPermissions.length === 0) {
        return next(
          AppError.forbidden("No event permissions configured.", {
            code: "EVENT_PERMISSIONS_NOT_CONFIGURED",
            title: "Permission check misconfigured",
            action:
              "Configure at least one permission for this protected route.",
          }),
        );
      }

      const allowed = await hasRequiredPermissions(
        eventUser,
        requiredPermissions,
        mode,
      );

      if (!allowed) {
        return next(
          insufficientEventPermissionsError(requiredPermissions, mode),
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
