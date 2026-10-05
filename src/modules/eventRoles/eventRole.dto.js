import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize an event role without ${fieldName}.`);
  }

  return id;
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(`Cannot serialize an event role without ${fieldName}.`);
  }

  return date;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`Cannot serialize an event role without ${fieldName}.`);
  }

  return normalized;
}

function normalizeOptionalString(value) {
  return String(value ?? "").trim();
}

function normalizePermissions(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Cannot serialize an event role without ${fieldName}.`);
  }

  return Array.from(
    new Set(
      value
        .map((permission) => String(permission ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Cannot serialize an event role without boolean ${fieldName}.`,
    );
  }

  return value;
}

function normalizeSortOrder(value) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(
      "Cannot serialize an event role with invalid sortOrder.",
    );
  }

  return normalized;
}

export function toEventRoleDto(role) {
  if (!role) {
    throw new TypeError("Cannot serialize a missing event role.");
  }

  const id = requireApiId(role.id, "id");
  const key = normalizeRequiredString(role.key, "key");

  if (id !== key) {
    throw new TypeError(
      "Cannot serialize an event role whose id differs from its key.",
    );
  }

  return {
    id,
    key,

    name: normalizeRequiredString(role.name, "name"),
    description: normalizeOptionalString(role.description),

    permissions: normalizePermissions(role.permissions, "permissions"),

    isProtected: normalizeBoolean(role.isProtected, "isProtected"),

    sortOrder: normalizeSortOrder(role.sortOrder),

    createdAt: requireApiDate(role.createdAt, "createdAt"),

    updatedAt: requireApiDate(role.updatedAt, "updatedAt"),
  };
}

export function toEventRolePermissionGroupDto(group) {
  if (!group) {
    throw new TypeError(
      "Cannot serialize a missing event role permission group.",
    );
  }

  return {
    key: normalizeRequiredString(group.key, "permission group key"),

    label: normalizeRequiredString(group.label, "permission group label"),

    description: normalizeOptionalString(group.description),

    permissions: normalizePermissions(
      group.permissions,
      "permission group permissions",
    ),
  };
}
