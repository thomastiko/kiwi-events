import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import { getDatabaseProvider } from "../../database/database.service.js";
import * as mongoEventRoleRepository from "./mongo.eventRole.repository.js";
import * as sqlEventRoleRepository from "./sql.eventRole.repository.js";

function getEventRoleRepository() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return mongoEventRoleRepository;
  }

  if (isSqlDatabaseProvider(provider)) {
    return sqlEventRoleRepository;
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function toPlainEventRoleRecord(role) {
  if (!role) {
    return null;
  }

  if (typeof role.toObject === "function") {
    return role.toObject();
  }

  return role;
}

function normalizeEventRoleKey(value) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!key) {
    throw new TypeError("Cannot normalize an event role without key.");
  }

  return key;
}

function toCanonicalEventRoleRecord(role) {
  const record = toPlainEventRoleRecord(role);

  if (!record) {
    return null;
  }

  const { _id, __v, id: ignoredId, ...fields } = record;

  const key = normalizeEventRoleKey(fields.key);

  return {
    ...fields,
    id: key,
    key,
  };
}

export async function listEventRoles(options = {}) {
  const roles = await getEventRoleRepository().listEventRoles(options);

  return roles.map(toCanonicalEventRoleRecord);
}

export async function findEventRoleByKey(key, options = {}) {
  const role = await getEventRoleRepository().findEventRoleByKey(key, options);

  return toCanonicalEventRoleRecord(role);
}

export async function createEventRole(data) {
  const role = await getEventRoleRepository().createEventRole(data);

  return toCanonicalEventRoleRecord(role);
}

export async function updateEventRoleByKey(key, data, options = {}) {
  const role = await getEventRoleRepository().updateEventRoleByKey(
    key,
    data,
    options,
  );

  return toCanonicalEventRoleRecord(role);
}

export async function deleteEventRoleByKey(key) {
  const role = await getEventRoleRepository().deleteEventRoleByKey(key);

  return toCanonicalEventRoleRecord(role);
}
