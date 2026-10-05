// src/modules/eventUsers/eventUser.seed.service.js

import {
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_ROLES,
} from "./eventUser.constants.js";

import { hashPassword } from "../../core/security/password.service.js";
import { logger } from "../../config/logger.js";

import {
  createEventUser,
  findEventUserByEmailAndAuthProviders,
  updateEventUserById,
} from "./repositories/eventUser.repository.js";

const SETUP_ADMIN_EMAIL = "admin@admin";

const SETUP_ADMIN_AUTH_PROVIDERS = [
  EVENT_USER_AUTH_PROVIDER.LOCAL,
  EVENT_USER_AUTH_PROVIDER.HYBRID,
];

function resolveSetupAdminCredentials(payload = {}) {
  const email = SETUP_ADMIN_EMAIL;

  const password = String(payload.password || "");

  if (!password.trim()) {
    throw new Error("Initial admin password is required.");
  }

  return {
    email,
    password,

    defaultPasswordUsed: password === "admin",
  };
}

function buildAdminNotes(defaultPasswordUsed, { created }) {
  if (defaultPasswordUsed) {
    return "Default local admin EventUser. Change this password before public deployment.";
  }

  return created
    ? "Initial local admin EventUser created during setup."
    : "Initial local admin EventUser password set during setup.";
}

async function updateExistingAdmin({
  eventUser,
  email,
  passwordHash,
  defaultPasswordUsed,
}) {
  const updatedEventUser = await updateEventUserById(eventUser.id, {
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot: email,

    passwordHash,

    role: EVENT_USER_ROLES.ADMIN,

    isActive: true,

    mustChangePassword: defaultPasswordUsed,

    notes: buildAdminNotes(defaultPasswordUsed, {
      created: false,
    }),
  });

  if (!updatedEventUser) {
    throw new Error("Failed to update default kiwi events admin EventUser.");
  }

  logger.warn("Default kiwi events admin EventUser updated", {
    email,
    defaultPasswordUsed,
  });

  return {
    created: false,

    passwordUpdated: true,

    eventUserId: updatedEventUser.id,

    email,
  };
}

async function createDefaultAdmin({
  email,
  passwordHash,
  defaultPasswordUsed,
}) {
  const createdAdmin = await createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot: email,

    passwordHash,

    externalProvider: null,
    externalUserId: null,

    firstNameSnapshot: "Kiwi Events",

    lastNameSnapshot: "Admin",

    profileBio: "Initial kiwi events administrator.",

    profileImageAssetId: null,

    role: EVENT_USER_ROLES.ADMIN,

    mustChangePassword: defaultPasswordUsed,

    lastLoginAt: null,

    isActive: true,

    notes: buildAdminNotes(defaultPasswordUsed, {
      created: true,
    }),
  });

  logger.warn("Default kiwi events admin EventUser created", {
    email,
    defaultPasswordUsed,
  });

  return {
    created: true,

    passwordUpdated: false,

    eventUserId: createdAdmin.id,

    email,
  };
}

/**
 * Ensures kiwi-events has one real DB-backed EventUser admin.
 */
export async function ensureDefaultKiwiEventsAdminUser(payload = {}) {
  const { email, password, defaultPasswordUsed } =
    resolveSetupAdminCredentials(payload);

  const existingAdmin = await findEventUserByEmailAndAuthProviders(
    email,
    SETUP_ADMIN_AUTH_PROVIDERS,
    {
      lean: true,
    },
  );

  const passwordHash = await hashPassword(password);

  if (existingAdmin) {
    return updateExistingAdmin({
      eventUser: existingAdmin,

      email,

      passwordHash,

      defaultPasswordUsed,
    });
  }

  return createDefaultAdmin({
    email,
    passwordHash,
    defaultPasswordUsed,
  });
}
