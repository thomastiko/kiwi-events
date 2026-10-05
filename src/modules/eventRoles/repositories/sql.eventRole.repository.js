import { getDatabaseConnection } from "../../database/database.service.js";

function now() {
  return new Date();
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }

  return [];
}

function mapEventRoleRow(row) {
  if (!row) return null;

  return {
    id: row.key,
    id: row.key,
    key: row.key,
    name: row.name,
    description: row.description || "",
    permissions: parseJsonArray(row.permissions),
    isProtected: Boolean(row.is_protected),
    sortOrder: Number(row.sort_order ?? 100),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEventRoleInsert(data) {
  const timestamp = now();

  return {
    key: data.key,
    name: data.name,
    description: data.description || "",
    permissions: JSON.stringify(data.permissions || []),
    is_protected: Boolean(data.isProtected),
    sort_order: Number(data.sortOrder ?? 100),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function toEventRoleUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if ("name" in data) update.name = data.name;
  if ("description" in data) update.description = data.description || "";
  if ("permissions" in data) {
    update.permissions = JSON.stringify(data.permissions || []);
  }
  if ("isProtected" in data) update.is_protected = Boolean(data.isProtected);
  if ("sortOrder" in data) update.sort_order = Number(data.sortOrder ?? 100);

  return update;
}

export async function listEventRoles() {
  const db = getDatabaseConnection();

  const rows = await db("event_roles")
    .select("*")
    .orderBy("sort_order", "asc")
    .orderBy("name", "asc")
    .orderBy("key", "asc");

  return rows.map(mapEventRoleRow);
}

export async function findEventRoleByKey(key) {
  const db = getDatabaseConnection();

  const row = await db("event_roles").where({ key }).first();

  return mapEventRoleRow(row);
}

export async function createEventRole(data) {
  const db = getDatabaseConnection();
  const row = toEventRoleInsert(data);

  await db("event_roles").insert(row);

  return mapEventRoleRow(row);
}

export async function updateEventRoleByKey(key, data) {
  const db = getDatabaseConnection();

  await db("event_roles").where({ key }).update(toEventRoleUpdate(data));

  return findEventRoleByKey(key);
}

export async function deleteEventRoleByKey(key) {
  const db = getDatabaseConnection();

  const existing = await findEventRoleByKey(key);

  if (!existing) {
    return null;
  }

  await db("event_roles").where({ key }).delete();

  return existing;
}
