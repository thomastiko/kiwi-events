import { AppError } from "../../core/errors/AppError.js";
import { EVENT_PERMISSIONS } from "../permissions/permission.constant.js";
import {
  toEventRoleDto,
  toEventRolePermissionGroupDto,
} from "./eventRole.dto.js";
import {
  ALLOWED_EVENT_ROLE_PERMISSIONS,
  DEFAULT_EVENT_ROLE_DEFINITIONS,
  EVENT_ROLE_KEYS,
  EVENT_ROLE_KEY_PATTERN,
  EVENT_ROLE_PERMISSION_GROUPS,
} from "./eventRole.constants.js";

import {
  createEventRole,
  deleteEventRoleByKey,
  findEventRoleByKey,
  listEventRoles,
  updateEventRoleByKey,
} from "./repositories/eventRole.repository.js";

import { detachEventUsersFromRole } from "../eventUsers/repositories/eventUser.repository.js";

function invalidRoleKeyError(roleKey) {
  return AppError.badRequest(
    "Invalid role key. Use lowercase letters, numbers and underscores. The key must start with a letter.",
    {
      code: "INVALID_ROLE_KEY",
      title: "Invalid role key",
      action:
        "Use lowercase letters, numbers and underscores. The key must start with a letter.",
      fields: [
        {
          path: "body.key",
          message:
            "Use lowercase letters, numbers and underscores. Start with a letter.",
        },
      ],
      details: {
        roleKey,
      },
    },
  );
}

function roleNotFoundError(roleKey) {
  return AppError.notFound("Role not found.", {
    code: "ROLE_NOT_FOUND",
    title: "Role not found",
    action: "Choose an existing role.",
    details: {
      roleKey,
    },
  });
}

function protectedAdminRoleError() {
  return AppError.forbidden(
    "The admin role is protected and cannot be edited or deleted.",
    {
      code: "ADMIN_ROLE_PROTECTED",
      title: "Admin role protected",
      action:
        "The admin role is required as a safety role and always keeps full access to the Admin UI.",
    },
  );
}

function assertValidRoleKey(roleKey) {
  if (!EVENT_ROLE_KEY_PATTERN.test(roleKey)) {
    throw invalidRoleKeyError(roleKey);
  }
}

function assertRoleCanBeManaged(role) {
  if (!role) {
    throw roleNotFoundError(null);
  }

  if (role.key === EVENT_ROLE_KEYS.ADMIN || role.isProtected) {
    throw protectedAdminRoleError();
  }
}

function normalizePermissions(permissions, roleKey) {
  const input = Array.isArray(permissions) ? permissions : [];
  const allowedPermissions = new Set(ALLOWED_EVENT_ROLE_PERMISSIONS);
  const normalized = [];

  for (const permission of input) {
    const key = String(permission || "").trim();

    if (!key) {
      continue;
    }

    if (key === "*") {
      if (roleKey === EVENT_ROLE_KEYS.ADMIN) {
        normalized.push("*");
        continue;
      }

      throw AppError.badRequest(
        "Only the protected admin role can use wildcard permissions.",
        {
          code: "WILDCARD_PERMISSION_NOT_ALLOWED",
          title: "Wildcard permission not allowed",
          action: "Select explicit permissions for custom roles.",
          fields: [
            {
              path: "body.permissions",
              message:
                "Wildcard permissions are only allowed for the protected admin role.",
            },
          ],
        },
      );
    }

    if (!allowedPermissions.has(key)) {
      throw AppError.badRequest(`Unknown event permission: ${key}.`, {
        code: "UNKNOWN_EVENT_PERMISSION",
        title: "Unknown permission",
        action: "Select one of the available event permissions.",
        fields: [
          {
            path: "body.permissions",
            message: `Unknown permission: ${key}.`,
          },
        ],
        details: {
          permission: key,
        },
      });
    }

    normalized.push(key);
  }

  const uniquePermissions = Array.from(new Set(normalized));

  if (uniquePermissions.includes(EVENT_PERMISSIONS.MANAGE_ALL)) {
    return [EVENT_PERMISSIONS.MANAGE_ALL];
  }

  return uniquePermissions;
}

export async function ensureDefaultEventRoles() {
  const results = [];

  for (const definition of DEFAULT_EVENT_ROLE_DEFINITIONS) {
    const existing = await findEventRoleByKey(definition.key);

    if (existing) {
      results.push({
        key: definition.key,
        created: false,
        role: toEventRoleDto(existing),
      });

      continue;
    }

    const created = await createEventRole({
      ...definition,
      permissions: normalizePermissions(definition.permissions, definition.key),
    });

    results.push({
      key: definition.key,
      created: true,
      role: toEventRoleDto(created),
    });
  }

  return results;
}

export async function listEventRolesService() {
  const roles = await listEventRoles();

  return roles.map(toEventRoleDto);
}

export async function getEventRoleByKeyService(key) {
  assertValidRoleKey(key);

  const role = await findEventRoleByKey(key);

  if (!role) {
    throw roleNotFoundError(key);
  }

  return toEventRoleDto(role);
}

export function listEventRolePermissionGroupsService() {
  return EVENT_ROLE_PERMISSION_GROUPS.map(toEventRolePermissionGroupDto);
}

export async function createEventRoleService(payload = {}) {
  const roleKey = payload.key;

  assertValidRoleKey(roleKey);

  if (roleKey === EVENT_ROLE_KEYS.ADMIN) {
    throw protectedAdminRoleError();
  }

  const existing = await findEventRoleByKey(roleKey);

  if (existing) {
    throw AppError.conflict("Role key already exists.", {
      code: "ROLE_KEY_ALREADY_EXISTS",
      title: "Role key already exists",
      action: "Choose another unique role key.",
      fields: [
        {
          path: "body.key",
          message: "This role key is already used.",
        },
      ],
      details: {
        roleKey,
      },
    });
  }

  const role = await createEventRole({
    key: roleKey,
    name: payload.name,
    description: payload.description || "",
    permissions: normalizePermissions(payload.permissions, roleKey),
    isProtected: false,
    sortOrder: Number(payload.sortOrder ?? 100),
  });

  return toEventRoleDto(role);
}

export async function updateEventRoleService(key, payload = {}) {
  assertValidRoleKey(key);

  const existing = await findEventRoleByKey(key);

  assertRoleCanBeManaged(existing);

  const update = {};

  if (payload.name !== undefined) {
    update.name = payload.name;
  }

  if (payload.description !== undefined) {
    update.description = payload.description || "";
  }

  if (payload.permissions !== undefined) {
    update.permissions = normalizePermissions(payload.permissions, key);
  }

  if (payload.sortOrder !== undefined) {
    update.sortOrder = Number(payload.sortOrder ?? 100);
  }

  const updated = await updateEventRoleByKey(key, update);

  return toEventRoleDto(updated);
}

export async function deleteEventRoleService(key) {
  assertValidRoleKey(key);

  const existing = await findEventRoleByKey(key);

  assertRoleCanBeManaged(existing);

  const affectedUsers = await detachEventUsersFromRole(key);
  const deleted = await deleteEventRoleByKey(key);

  return {
    deleted: Boolean(deleted),
    role: toEventRoleDto(deleted),
    affectedUsers,
  };
}

export async function assertEventRoleExists(roleKey) {
  if (roleKey === null || roleKey === undefined || roleKey === "") {
    return null;
  }

  assertValidRoleKey(roleKey);

  const role = await findEventRoleByKey(roleKey);

  if (!role) {
    throw AppError.badRequest(`Role does not exist: ${roleKey}.`, {
      code: "ROLE_DOES_NOT_EXIST",
      title: "Role does not exist",
      action: "Choose an existing role.",
      fields: [
        {
          path: "body.role",
          message: "Choose an existing role.",
        },
      ],
      details: {
        roleKey,
      },
    });
  }

  return roleKey;
}
