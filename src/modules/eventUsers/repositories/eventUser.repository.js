import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import { getDatabaseProvider } from "../../database/database.service.js";
import * as mongoEventUserRepository from "./mongo.eventUser.repository.js";
import * as sqlEventUserRepository from "./sql.eventUser.repository.js";

function getEventUserRepositoryContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoEventUserRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlEventUserRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function toPlainEventUserRecord(eventUser) {
  if (!eventUser) {
    return null;
  }

  if (typeof eventUser.toObject === "function") {
    return eventUser.toObject();
  }

  return eventUser;
}

function normalizeRequiredId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot normalize an EventUser without ${fieldName}.`);
  }

  if (typeof value === "string") {
    const id = value.trim();

    if (!id) {
      throw new TypeError(
        `Cannot normalize an EventUser without ${fieldName}.`,
      );
    }

    return id;
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id) {
    throw new TypeError(`Cannot normalize an EventUser without ${fieldName}.`);
  }

  return id;
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredId(value, "referenced id");
}

function toCanonicalEventUserRecord(eventUser, provider) {
  const record = toPlainEventUserRecord(eventUser);

  if (!record) {
    return null;
  }

  const id =
    provider === DATABASE_PROVIDER.MONGODB
      ? normalizeRequiredId(record._id, "MongoDB _id")
      : normalizeRequiredId(record.id, "SQL id");

  return {
    id,

    authProvider: record.authProvider || null,

    emailSnapshot: record.emailSnapshot || "",

    externalProvider: record.externalProvider || null,
    externalUserId: record.externalUserId || null,

    firstNameSnapshot: record.firstNameSnapshot || "",
    lastNameSnapshot: record.lastNameSnapshot || "",

    profileBio: record.profileBio || "",
    profileImageAssetId: normalizeOptionalId(record.profileImageAssetId),

    mustChangePassword: Boolean(record.mustChangePassword),
    lastLoginAt: record.lastLoginAt || null,

    role: record.role || null,

    isActive: record.isActive !== false,
    notes: record.notes || "",

    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
  };
}

export async function findEventUserById(id, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.findEventUserById(id, options);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function findActiveEventUserById(id, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.findActiveEventUserById(id, options);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function findEventUserByEmail(email, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.findEventUserByEmail(email, options);

  return toCanonicalEventUserRecord(eventUser, provider);
}
export async function findEventUserByEmailAndAuthProviders(
  email,
  authProviders,
  options = {},
) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.findEventUserByEmailAndAuthProviders(
    email,
    authProviders,
    options,
  );

  return toCanonicalEventUserRecord(eventUser, provider);
}
export async function findEventUserByExternalIdentity(input, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.findEventUserByExternalIdentity(
    input,
    options,
  );

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function findActiveEventUserByExternalIdentity(
  input,
  options = {},
) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.findActiveEventUserByExternalIdentity(
    input,
    options,
  );

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function listEventUsers(input = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUsers = await repository.listEventUsers(input);

  return eventUsers.map((eventUser) =>
    toCanonicalEventUserRecord(eventUser, provider),
  );
}

export async function createEventUser(data) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.createEventUser(data);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function updateEventUserById(id, data, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.updateEventUserById(id, data, options);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function upsertEventUserByExternalIdentity(
  input,
  data,
  options = {},
) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.upsertEventUserByExternalIdentity(
    input,
    data,
    options,
  );

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function deactivateEventUserById(id, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.deactivateEventUserById(id, options);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function reactivateEventUserById(id, options = {}) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.reactivateEventUserById(id, options);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function deleteEventUserById(id) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.deleteEventUserById(id);

  return toCanonicalEventUserRecord(eventUser, provider);
}

export async function setEventUserProfileImageAssetId(
  id,
  profileImageAssetId,
  options = {},
) {
  const { provider, repository } = getEventUserRepositoryContext();

  const eventUser = await repository.setEventUserProfileImageAssetId(
    id,
    profileImageAssetId,
    options,
  );

  return toCanonicalEventUserRecord(eventUser, provider);
}

export function detachEventUsersFromRole(roleKey) {
  const { repository } = getEventUserRepositoryContext();

  return repository.detachEventUsersFromRole(roleKey);
}
