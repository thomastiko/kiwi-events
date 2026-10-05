import { AppError } from "../../core/errors/AppError.js";
import { EVENT_USER_ROLES } from "./eventUser.constants.js";

export const INITIAL_ADMIN_EMAIL = "admin@admin";

export function initialSetupAdminProtectedUpdateError(forbiddenKeys = []) {
  return AppError.forbidden(
    "The initial admin@admin user is protected. Only the password can be changed.",
    {
      code: "INITIAL_ADMIN_PROTECTED",
      title: "Initial admin user protected",
      action:
        "Only the password of the initial admin@admin user can be changed. Create another local admin user for editable admin accounts.",
      fields: forbiddenKeys.map((key) => ({
        path: `body.${key}`,
        message: "This field cannot be changed for the initial admin user.",
      })),
      details: {
        protectedEmail: INITIAL_ADMIN_EMAIL,
        allowedFields: ["password"],
        blockedFields: forbiddenKeys,
      },
    },
  );
}

export function initialSetupAdminDeactivateError() {
  return AppError.forbidden(
    "The initial admin@admin user cannot be deactivated.",
    {
      code: "INITIAL_ADMIN_CANNOT_BE_DEACTIVATED",
      title: "Initial admin user protected",
      action:
        "Create another local admin user first. The initial admin@admin account stays active as a safety account.",
      details: {
        protectedEmail: INITIAL_ADMIN_EMAIL,
      },
    },
  );
}

export function initialSetupAdminDeleteError() {
  return AppError.forbidden("The initial admin@admin user cannot be deleted.", {
    code: "INITIAL_ADMIN_CANNOT_BE_DELETED",
    title: "Initial admin user protected",
    action:
      "Create another local admin user first. The initial admin@admin account cannot be deleted because it protects Admin UI access.",
    details: {
      protectedEmail: INITIAL_ADMIN_EMAIL,
    },
  });
}

export function eventUserNotFoundError(details = {}) {
  return AppError.notFound("kiwi-events staff user not found.", {
    code: "EVENT_USER_NOT_FOUND",
    title: "Staff user not found",
    action: "Refresh the user list and try again.",
    details,
  });
}

export function eventUserEmailAlreadyUsedError(email) {
  return AppError.conflict(
    "This email is already used by another local or hybrid EventUser.",
    {
      code: "EVENT_USER_EMAIL_ALREADY_USED",
      title: "Email already used",
      action: "Use another email address or edit the existing EventUser.",
      fields: [
        {
          path: "body.emailSnapshot",
          message: "This email is already used by another EventUser.",
        },
      ],
      details: {
        email,
      },
    },
  );
}

export function externalIdentityAlreadyLinkedError(provider, externalUserId) {
  return AppError.conflict(
    "This external identity is already linked to another EventUser.",
    {
      code: "EXTERNAL_IDENTITY_ALREADY_LINKED",
      title: "External identity already linked",
      action:
        "Use another external provider/user id combination or edit the already linked EventUser.",
      fields: [
        {
          path: "body.externalProvider",
          message:
            "This provider is already used with the given external user ID.",
        },
        {
          path: "body.externalUserId",
          message: "This external user ID is already linked.",
        },
      ],
      details: {
        externalProvider: provider,
        externalUserId,
      },
    },
  );
}

export function externalAdminRoleError() {
  return AppError.badRequest(
    "External linked EventUsers cannot use the admin role. Create a local admin user instead.",
    {
      code: "EXTERNAL_USER_CANNOT_BE_ADMIN",
      title: "External user cannot be admin",
      action:
        "Create a local admin user for Admin UI access. External linked users can only use event roles.",
      fields: [
        {
          path: "body.role",
          message: "External users cannot use the admin role.",
        },
      ],
    },
  );
}

export function localToExternalConversionError() {
  return AppError.badRequest(
    "Local admin users cannot be converted to external linked users.",
    {
      code: "LOCAL_USER_CANNOT_BECOME_EXTERNAL",
      title: "Auth provider transition not allowed",
      action:
        "Create a new external linked EventUser instead of converting a local admin user.",
      fields: [
        {
          path: "body.authProvider",
          message: "Local users cannot be converted to external users.",
        },
      ],
    },
  );
}

export function externalToLocalConversionError() {
  return AppError.badRequest(
    "External linked users cannot be converted to local admin users. Create a new local admin user instead.",
    {
      code: "EXTERNAL_USER_CANNOT_BECOME_LOCAL",
      title: "Auth provider transition not allowed",
      action:
        "Create a new local admin user instead of converting an external linked user.",
      fields: [
        {
          path: "body.authProvider",
          message: "External linked users cannot be converted to local users.",
        },
      ],
    },
  );
}

export function unsupportedEventUserRoleError(role) {
  return AppError.badRequest(`Unsupported EventUser role: ${role}.`, {
    code: "UNSUPPORTED_EVENT_USER_ROLE",
    title: "Unsupported role",
    action: "Choose one of the available EventUser roles.",
    fields: [
      {
        path: "body.role",
        message: "Choose one of the available roles.",
      },
    ],
    details: {
      role,
      allowedRoles: Object.values(EVENT_USER_ROLES),
    },
  });
}
