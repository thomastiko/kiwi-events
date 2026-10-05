import {
  findEventRoleByKey,
  listEventRoles,
} from "../eventRoles/repositories/eventRole.repository.js";

import { EVENT_PERMISSIONS } from "./permission.constant.js";

function normalizePermission(value) {
  return String(value || "").trim();
}

function normalizePermissions(values = []) {
  return Array.from(new Set(values.map(normalizePermission).filter(Boolean)));
}

function expandEffectivePermissions(permissions = []) {
  const effective = new Set(normalizePermissions(permissions));

  if (effective.has("*")) {
    return ["*"];
  }

  /*
   * Manage all is the full event-management permission.
   *
   * It therefore also grants:
   * - everything available to an own-event manager
   * - check-in access for all events
   *
   * These implied permissions are not stored on the role.
   */
  if (effective.has(EVENT_PERMISSIONS.MANAGE_ALL)) {
    effective.add(EVENT_PERMISSIONS.MANAGE_OWN);

    effective.add(EVENT_PERMISSIONS.CHECKIN_ALL);
  }

  return Array.from(effective);
}

export async function getEventUserPermissions(eventUser) {
  if (!eventUser || eventUser.isActive === false || !eventUser.role) {
    return [];
  }

  const role = await findEventRoleByKey(eventUser.role);

  if (!role) {
    return [];
  }

  return expandEffectivePermissions(
    Array.isArray(role.permissions) ? role.permissions : [],
  );
}

export async function hasEventPermission(eventUser, permission) {
  if (!eventUser || eventUser.isActive === false) {
    return false;
  }

  const requiredPermission = normalizePermission(permission);

  if (!requiredPermission) {
    return false;
  }

  const permissions = await getEventUserPermissions(eventUser);

  if (permissions.includes("*")) {
    return true;
  }

  return permissions.includes(requiredPermission);
}

export async function getRolePermissions(roleKey) {
  if (!roleKey) {
    return [];
  }

  const role = await findEventRoleByKey(roleKey);

  if (!role) {
    return [];
  }

  return Array.isArray(role.permissions) ? role.permissions : [];
}

export async function getAllRolePermissions() {
  const roles = await listEventRoles();

  return Object.fromEntries(
    roles.map((role) => [
      role.key,
      Array.isArray(role.permissions) ? role.permissions : [],
    ]),
  );
}
