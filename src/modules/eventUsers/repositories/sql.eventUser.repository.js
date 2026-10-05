import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";
import {
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_ROLES,
} from "../eventUser.constants.js";

function now() {
  return new Date();
}

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function isLocalEmailUniqueProvider(authProvider) {
  return [
    EVENT_USER_AUTH_PROVIDER.LOCAL,
    EVENT_USER_AUTH_PROVIDER.HYBRID,
  ].includes(authProvider);
}

function getLocalEmailUniqueKey({ authProvider, emailSnapshot }) {
  const clean = cleanEmail(emailSnapshot);

  if (!clean || !isLocalEmailUniqueProvider(authProvider)) {
    return null;
  }

  return clean;
}
function cleanExternalProvider(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cleanExternalUserId(value) {
  return String(value || "").trim();
}

function mapEventUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    authProvider: row.auth_provider || "external",

    emailSnapshot: row.email_snapshot || "",
    passwordHash: row.password_hash || null,

    externalProvider: row.external_provider || null,
    externalUserId: row.external_user_id || null,

    firstNameSnapshot: row.first_name_snapshot || "",
    lastNameSnapshot: row.last_name_snapshot || "",

    profileBio: row.profile_bio || "",
    profileImageAssetId: row.profile_image_asset_id || null,

    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: row.last_login_at || null,

    role: row.role || null,

    isActive: Boolean(row.is_active),
    notes: row.notes || "",

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEventUserInsert(data) {
  const timestamp = now();
  const authProvider = data.authProvider || EVENT_USER_AUTH_PROVIDER.EXTERNAL;
  const emailSnapshot = cleanEmail(data.emailSnapshot);

  return {
    id: randomUUID(),

    auth_provider: authProvider,

    email_snapshot: emailSnapshot,
    local_email_unique_key: getLocalEmailUniqueKey({
      authProvider,
      emailSnapshot,
    }),
    password_hash: data.passwordHash || null,

    external_provider: data.externalProvider
      ? cleanExternalProvider(data.externalProvider)
      : null,
    external_user_id: data.externalUserId
      ? cleanExternalUserId(data.externalUserId)
      : null,

    first_name_snapshot: data.firstNameSnapshot || "",
    last_name_snapshot: data.lastNameSnapshot || "",

    profile_bio: data.profileBio || "",
    profile_image_asset_id: data.profileImageAssetId || null,

    must_change_password: Boolean(data.mustChangePassword),
    last_login_at: data.lastLoginAt || null,

    role: data.role === undefined ? EVENT_USER_ROLES.EVENT_MANAGER : data.role,

    is_active: data.isActive ?? true,
    notes: data.notes || "",

    created_at: timestamp,
    updated_at: timestamp,
  };
}

function toEventUserUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if ("authProvider" in data) {
    update.auth_provider = data.authProvider || "external";
  }

  if ("emailSnapshot" in data) {
    update.email_snapshot = cleanEmail(data.emailSnapshot);
  }

  if ("passwordHash" in data) {
    update.password_hash = data.passwordHash || null;
  }

  if ("externalProvider" in data) {
    update.external_provider = data.externalProvider
      ? cleanExternalProvider(data.externalProvider)
      : null;
  }

  if ("externalUserId" in data) {
    update.external_user_id = data.externalUserId
      ? cleanExternalUserId(data.externalUserId)
      : null;
  }

  if ("firstNameSnapshot" in data) {
    update.first_name_snapshot = data.firstNameSnapshot || "";
  }

  if ("lastNameSnapshot" in data) {
    update.last_name_snapshot = data.lastNameSnapshot || "";
  }

  if ("profileBio" in data) {
    update.profile_bio = data.profileBio || "";
  }

  if ("profileImageAssetId" in data) {
    update.profile_image_asset_id = data.profileImageAssetId || null;
  }

  if ("mustChangePassword" in data) {
    update.must_change_password = Boolean(data.mustChangePassword);
  }

  if ("lastLoginAt" in data) {
    update.last_login_at = data.lastLoginAt || null;
  }

  if ("role" in data) {
    update.role = data.role || null;
  }

  if ("isActive" in data) {
    update.is_active = Boolean(data.isActive);
  }

  if ("notes" in data) {
    update.notes = data.notes || "";
  }

  return update;
}

export async function findEventUserById(id, options = {}) {
  const db = options.trx || getDatabaseConnection();

  const row = await db("event_users").where({ id }).first();

  return mapEventUserRow(row);
}

export async function findActiveEventUserById(id, options = {}) {
  const db = options.trx || getDatabaseConnection();

  const row = await db("event_users")
    .where({
      id,
      is_active: true,
    })
    .first();

  return mapEventUserRow(row);
}

export async function findEventUserByEmail(email, options = {}) {
  const db = options.trx || getDatabaseConnection();
  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const row = await db("event_users")
    .where({
      email_snapshot: normalizedEmail,
    })
    .first();

  return mapEventUserRow(row);
}
export async function findEventUserByEmailAndAuthProviders(
  email,
  authProviders = [],
  options = {},
) {
  const db = options.trx || getDatabaseConnection();

  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const normalizedAuthProviders = [
    ...new Set(
      (authProviders || [])
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];

  const query = db("event_users").where({
    email_snapshot: normalizedEmail,
  });

  if (normalizedAuthProviders.length) {
    query.whereIn("auth_provider", normalizedAuthProviders);
  }

  const row = await query.first();

  return mapEventUserRow(row);
}
export async function findEventUserByExternalIdentity(
  { provider, externalUserId },
  options = {},
) {
  const db = options.trx || getDatabaseConnection();
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);

  if (!cleanProvider || !cleanUserId) {
    return null;
  }

  const row = await db("event_users")
    .where({
      external_provider: cleanProvider,
      external_user_id: cleanUserId,
    })
    .first();

  return mapEventUserRow(row);
}

export async function findActiveEventUserByExternalIdentity(
  { provider, externalUserId },
  options = {},
) {
  const db = options.trx || getDatabaseConnection();
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);

  if (!cleanProvider || !cleanUserId) {
    return null;
  }

  const row = await db("event_users")
    .where({
      external_provider: cleanProvider,
      external_user_id: cleanUserId,
      is_active: true,
    })
    .first();

  return mapEventUserRow(row);
}

export async function listEventUsers() {
  const db = getDatabaseConnection();

  const rows = await db("event_users")
    .select("*")
    .orderBy("role", "asc")
    .orderBy("last_name_snapshot", "asc")
    .orderBy("first_name_snapshot", "asc")
    .orderBy("created_at", "desc");

  return rows.map(mapEventUserRow);
}

export async function createEventUser(data) {
  const db = getDatabaseConnection();
  const row = toEventUserInsert(data);

  await db("event_users").insert(row);

  return mapEventUserRow(row);
}

export async function updateEventUserById(id, data) {
  const db = getDatabaseConnection();

  const existing = await db("event_users").where({ id }).first();

  if (!existing) {
    return null;
  }

  const update = toEventUserUpdate(data);

  const nextAuthProvider =
    "authProvider" in data
      ? data.authProvider || EVENT_USER_AUTH_PROVIDER.EXTERNAL
      : existing.auth_provider || EVENT_USER_AUTH_PROVIDER.EXTERNAL;

  const nextEmailSnapshot =
    "emailSnapshot" in data
      ? cleanEmail(data.emailSnapshot)
      : cleanEmail(existing.email_snapshot);

  update.local_email_unique_key = getLocalEmailUniqueKey({
    authProvider: nextAuthProvider,
    emailSnapshot: nextEmailSnapshot,
  });

  await db("event_users").where({ id }).update(update);

  const row = await db("event_users").where({ id }).first();

  return mapEventUserRow(row);
}

export async function upsertEventUserByExternalIdentity(
  { provider, externalUserId },
  data,
) {
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);
  const existing = await findEventUserByExternalIdentity({
    provider: cleanProvider,
    externalUserId: cleanUserId,
  });

  if (existing) {
    return updateEventUserById(existing.id, {
      ...data,
      externalProvider: cleanProvider,
      externalUserId: cleanUserId,
    });
  }

  return createEventUser({
    ...data,
    externalProvider: cleanProvider,
    externalUserId: cleanUserId,
  });
}

export async function detachEventUsersFromRole(roleKey) {
  const db = getDatabaseConnection();

  const result = await db("event_users").where({ role: roleKey }).update({
    role: null,
    updated_at: db.fn.now(),
  });

  return Number(result || 0);
}

export async function deleteEventUserById(id) {
  const db = getDatabaseConnection();

  const existing = await findEventUserById(id);

  if (!existing) {
    return null;
  }

  await db("event_users").where({ id }).delete();

  return existing;
}

export async function setEventUserProfileImageAssetId(id, profileImageAssetId) {
  return updateEventUserById(id, {
    profileImageAssetId: profileImageAssetId || null,
  });
}

export async function deactivateEventUserById(id) {
  return updateEventUserById(id, { isActive: false });
}

export async function reactivateEventUserById(id) {
  return updateEventUserById(id, { isActive: true });
}
