// src/modules/adminAuth/adminAuth.repository.js

import { EventUser } from "../eventUsers/eventUser.model.js";
import { EVENT_USER_AUTH_PROVIDER } from "../eventUsers/eventUser.constants.js";
import {
  getDatabaseConnection,
  isMongoDatabase,
  isSqlDatabase,
} from "../database/database.service.js";

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeRequiredId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(
      `Cannot normalize admin EventUser without ${fieldName}.`,
    );
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id || id === "[object Object]") {
    throw new TypeError(
      `Cannot normalize admin EventUser without ${fieldName}.`,
    );
  }

  return id;
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredId(value, "referenced id");
}

function normalizeAdminEventUser(record, rawId) {
  if (!record) {
    return null;
  }

  return {
    id: normalizeRequiredId(rawId, "id"),

    authProvider: record.authProvider ?? null,

    emailSnapshot: record.emailSnapshot ?? "",

    passwordHash: record.passwordHash ?? null,

    externalProvider: record.externalProvider ?? null,

    externalUserId: record.externalUserId ?? null,

    firstNameSnapshot: record.firstNameSnapshot ?? "",

    lastNameSnapshot: record.lastNameSnapshot ?? "",

    profileBio: record.profileBio ?? "",

    profileImageAssetId: normalizeOptionalId(record.profileImageAssetId),

    role: record.role ?? null,

    mustChangePassword: Boolean(record.mustChangePassword),

    lastLoginAt: record.lastLoginAt ?? null,

    isActive: record.isActive !== false,

    notes: record.notes ?? "",

    createdAt: record.createdAt ?? null,

    updatedAt: record.updatedAt ?? null,
  };
}

function normalizeSqlEventUser(row) {
  if (!row) {
    return null;
  }

  return normalizeAdminEventUser(
    {
      authProvider: row.auth_provider,

      emailSnapshot: row.email_snapshot,

      passwordHash: row.password_hash,

      externalProvider: row.external_provider,

      externalUserId: row.external_user_id,

      firstNameSnapshot: row.first_name_snapshot,

      lastNameSnapshot: row.last_name_snapshot,

      profileBio: row.profile_bio,

      profileImageAssetId: row.profile_image_asset_id,

      role: row.role,

      mustChangePassword: row.must_change_password,

      lastLoginAt: row.last_login_at,

      isActive: row.is_active,

      notes: row.notes,

      createdAt: row.created_at,

      updatedAt: row.updated_at,
    },
    row.id,
  );
}

export async function findAdminEventUserByEmail(email) {
  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  if (isMongoDatabase()) {
    const eventUser = await EventUser.findOne({
      emailSnapshot: normalizedEmail,

      authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

      isActive: true,
    })
      .select("+passwordHash")
      .lean();

    if (!eventUser) {
      return null;
    }

    return normalizeAdminEventUser(eventUser, eventUser._id);
  }

  if (isSqlDatabase()) {
    const db = getDatabaseConnection();

    const row = await db("event_users")
      .where({
        email_snapshot: normalizedEmail,

        auth_provider: EVENT_USER_AUTH_PROVIDER.LOCAL,

        is_active: true,
      })
      .first();

    return normalizeSqlEventUser(row);
  }

  return null;
}

export async function updateAdminEventUserLastLogin(eventUserId) {
  if (!eventUserId) {
    return;
  }

  if (isMongoDatabase()) {
    await EventUser.updateOne(
      {
        _id: eventUserId,
      },
      {
        $set: {
          lastLoginAt: new Date(),
        },
      },
    );

    return;
  }

  if (isSqlDatabase()) {
    const db = getDatabaseConnection();

    await db("event_users")
      .where({
        id: eventUserId,
      })
      .update({
        last_login_at: db.fn.now(),

        updated_at: db.fn.now(),
      });
  }
}
