// src/modules/eventUsers/eventUser.controller.js

import { logger } from "../../config/logger.js";
import {
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_ROLES,
} from "./eventUser.constants.js";

import {
  createEventUser as createEventUserRepository,
  deleteEventUserById,
  findEventUserByEmail,
  findEventUserByExternalIdentity,
  findEventUserById,
  listEventUsers as listEventUsersRepository,
  setEventUserProfileImageAssetId,
  updateEventUserById,
  upsertEventUserByExternalIdentity,
} from "./repositories/eventUser.repository.js";

import { getMediaAssetFileUrl } from "../mediaAssets/mediaAsset.url.js";

import { getEventUserPermissions } from "../permissions/permission.service.js";
import { toEventUserDto } from "./eventUser.dto.js";
import {
  deleteMediaAssetById,
  findMediaAssetById,
  findMediaAssetsByIds,
} from "../mediaAssets/repositories/mediaAsset.repository.js";

import { uploadEventStaffProfileImageAssetService } from "../mediaAssets/internal/mediaAsset.internal.service.js";
import { deleteObject } from "../storage/storage.service.js";
import { hashPassword } from "../../core/security/password.service.js";
import { assertEventRoleExists } from "../eventRoles/eventRole.service.js";

import {
  INITIAL_ADMIN_EMAIL,
  eventUserEmailAlreadyUsedError,
  eventUserNotFoundError,
  externalAdminRoleError,
  externalIdentityAlreadyLinkedError,
  externalToLocalConversionError,
  initialSetupAdminDeactivateError,
  initialSetupAdminDeleteError,
  initialSetupAdminProtectedUpdateError,
  localToExternalConversionError,
} from "./eventUser.errors.js";

/**
 * Normalizes a string value.
 *
 * @param {unknown} value
 * @returns {string}
 */
function cleanString(value) {
  return String(value || "").trim();
}

/**
 * Normalizes an email value.
 *
 * @param {unknown} value
 * @returns {string}
 */
function cleanEmail(value) {
  return cleanString(value).toLowerCase();
}

function cleanExternalProvider(value) {
  return cleanString(value).toLowerCase();
}

function cleanExternalUserId(value) {
  return cleanString(value);
}

function isInitialSetupAdmin(eventUser) {
  if (!eventUser) return false;

  return (
    eventUser.authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL &&
    cleanEmail(eventUser.emailSnapshot) === INITIAL_ADMIN_EMAIL
  );
}

function assertInitialSetupAdminCanBeUpdated(existingEventUser, payload) {
  if (!isInitialSetupAdmin(existingEventUser)) {
    return;
  }

  const allowedKeys = new Set(["password"]);

  const requestedKeys = Object.keys(payload || {}).filter(
    (key) => payload[key] !== undefined,
  );

  const forbiddenKeys = requestedKeys.filter((key) => !allowedKeys.has(key));

  if (forbiddenKeys.length > 0) {
    throw initialSetupAdminProtectedUpdateError(forbiddenKeys);
  }
}

function assertInitialSetupAdminCanBeDeactivated(eventUser) {
  if (isInitialSetupAdmin(eventUser)) {
    throw initialSetupAdminDeactivateError();
  }
}

function assertInitialSetupAdminCanBeDeleted(eventUser) {
  if (isInitialSetupAdmin(eventUser)) {
    throw initialSetupAdminDeleteError();
  }
}

function mapProfileImageAsset(asset) {
  if (!asset) {
    return null;
  }

  return {
    id: asset.id,

    fileUrl: getMediaAssetFileUrl(asset),

    filenameOriginal: asset.filenameOriginal,

    mimeType: asset.mimeType,

    size: asset.size,
  };
}

async function buildEventUserDto(eventUser) {
  if (!eventUser) {
    return null;
  }

  const effectivePermissions = await getEventUserPermissions(eventUser);

  return toEventUserDto({
    ...eventUser,
    effectivePermissions,
  });
}

/**
 * Builds the common EventUser update payload from a validated request body.
 *
 * @param {object} payload
 * @returns {object}
 */
function buildEventUserUpdatePayload(payload) {
  const update = {};

  if (payload.authProvider !== undefined) {
    update.authProvider = payload.authProvider;
  }

  if (payload.emailSnapshot !== undefined) {
    update.emailSnapshot = cleanEmail(payload.emailSnapshot);
  }

  if (payload.externalProvider !== undefined) {
    const value = cleanExternalProvider(payload.externalProvider);
    update.externalProvider = value || null;
  }

  if (payload.externalUserId !== undefined) {
    const value = cleanExternalUserId(payload.externalUserId);
    update.externalUserId = value || null;
  }

  if (payload.firstNameSnapshot !== undefined) {
    update.firstNameSnapshot = cleanString(payload.firstNameSnapshot);
  }

  if (payload.lastNameSnapshot !== undefined) {
    update.lastNameSnapshot = cleanString(payload.lastNameSnapshot);
  }

  if (payload.profileBio !== undefined) {
    update.profileBio = cleanString(payload.profileBio);
  }

  if (payload.mustChangePassword !== undefined) {
    update.mustChangePassword = Boolean(payload.mustChangePassword);
  }

  if (payload.isActive !== undefined) {
    update.isActive = payload.isActive;
  }

  if (payload.notes !== undefined) {
    update.notes = cleanString(payload.notes);
  }

  return update;
}

/**
 * Loads all profile image assets for a list of EventUsers.
 *
 * @param {object[]} eventUsers
 * @returns {Promise<Map<string, object>>}
 */
async function loadProfileImageMap(eventUsers) {
  const profileImageIds = eventUsers
    .map((eventUser) => eventUser.profileImageAssetId)
    .filter(Boolean);

  if (profileImageIds.length === 0) {
    return new Map();
  }

  const profileImages = await findMediaAssetsByIds(profileImageIds, {
    select: "key storageTarget filenameOriginal mimeType size",
    lean: true,
  });

  return new Map(
    profileImages.map((asset) => [asset.id, mapProfileImageAsset(asset)]),
  );
}

/**
 * Ensures email login uniqueness for local/hybrid EventUsers.
 *
 * @param {{ email: string, excludeEventUser?: object|null }} input
 */
async function assertEmailAvailable({ email, excludeEventUser = null }) {
  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) {
    return;
  }

  const duplicate = await findEventUserByEmail(normalizedEmail, {
    lean: true,
  });

  if (!duplicate) {
    return;
  }

  if (excludeEventUser?.id && duplicate.id === excludeEventUser.id) {
    return;
  }

  throw eventUserEmailAlreadyUsedError(normalizedEmail);
}

/**
 * Ensures external identity uniqueness.
 *
 * @param {{ provider: string, externalUserId: string, excludeEventUser?: object|null }} input
 */
async function assertExternalIdentityAvailable({
  provider,
  externalUserId,
  excludeEventUser = null,
}) {
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);

  if (!cleanProvider || !cleanUserId) {
    return;
  }

  const duplicate = await findEventUserByExternalIdentity(
    {
      provider: cleanProvider,
      externalUserId: cleanUserId,
    },
    {
      lean: true,
    },
  );

  if (!duplicate) {
    return;
  }

  if (excludeEventUser?.id && duplicate.id === excludeEventUser.id) {
    return;
  }

  throw externalIdentityAlreadyLinkedError(cleanProvider, cleanUserId);
}

/**
 * Returns true if this authProvider needs a local kiwi-events password.
 *
 * @param {string} authProvider
 * @returns {boolean}
 */
function usesLocalPassword(authProvider) {
  return (
    authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL ||
    authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID
  );
}

/**
 * Returns true if this authProvider needs an external identity link.
 *
 * @param {string} authProvider
 * @returns {boolean}
 */
function usesExternalIdentity(authProvider) {
  return (
    authProvider === EVENT_USER_AUTH_PROVIDER.EXTERNAL ||
    authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID
  );
}

/**
 * Normalizes authProvider.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAuthProvider(value) {
  return value || EVENT_USER_AUTH_PROVIDER.EXTERNAL;
}

function isLocalAuthProvider(authProvider) {
  return authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL;
}

function isLinkedAuthProvider(authProvider) {
  return (
    authProvider === EVENT_USER_AUTH_PROVIDER.EXTERNAL ||
    authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID
  );
}

function assertLinkedEventUserCannotUseAdminRole(authProvider, role) {
  if (isLinkedAuthProvider(authProvider) && role === EVENT_USER_ROLES.ADMIN) {
    throw externalAdminRoleError();
  }
}

function assertEventUserAuthProviderTransitionAllowed(
  existingEventUser,
  payload,
) {
  if (!payload.authProvider) {
    return;
  }

  const currentAuthProvider =
    existingEventUser.authProvider || EVENT_USER_AUTH_PROVIDER.EXTERNAL;

  const nextAuthProvider = normalizeAuthProvider(payload.authProvider);

  if (
    currentAuthProvider === EVENT_USER_AUTH_PROVIDER.LOCAL &&
    nextAuthProvider !== EVENT_USER_AUTH_PROVIDER.LOCAL
  ) {
    throw localToExternalConversionError();
  }

  if (
    currentAuthProvider !== EVENT_USER_AUTH_PROVIDER.LOCAL &&
    nextAuthProvider === EVENT_USER_AUTH_PROVIDER.LOCAL
  ) {
    throw externalToLocalConversionError();
  }
}

async function resolveCreateEventUserRole(authProvider, requestedRole) {
  if (isLocalAuthProvider(authProvider)) {
    return assertEventRoleExists(EVENT_USER_ROLES.ADMIN);
  }

  const role = requestedRole ?? EVENT_USER_ROLES.EVENT_MANAGER;

  assertLinkedEventUserCannotUseAdminRole(authProvider, role);

  return assertEventRoleExists(role);
}

async function resolveUpdateEventUserRole({
  nextAuthProvider,
  requestedRole,
  existingRole,
}) {
  if (isLocalAuthProvider(nextAuthProvider)) {
    return assertEventRoleExists(EVENT_USER_ROLES.ADMIN);
  }

  const effectiveRole =
    requestedRole !== undefined ? requestedRole : existingRole;

  assertLinkedEventUserCannotUseAdminRole(nextAuthProvider, effectiveRole);

  if (requestedRole === undefined) {
    return undefined;
  }

  return assertEventRoleExists(requestedRole);
}

async function deleteStorageObjectSafe(asset, context = {}) {
  if (!asset?.key) {
    return;
  }

  try {
    await deleteObject({
      key: asset.key,

      storageTarget: asset.storageTarget,
    });
  } catch (error) {
    logger.warn("event_user.profile_image_storage_delete_failed", {
      key: asset.key,

      storageTarget: asset.storageTarget || null,

      ...context,

      error,
    });
  }
}
async function deleteProfileImageAssetSafe(asset, context = {}) {
  if (!asset?.id) {
    return;
  }

  let deletedAsset;

  try {
    deletedAsset = (await deleteMediaAssetById(asset.id)) || asset;
  } catch (error) {
    logger.warn("event_user.profile_image_asset_delete_failed", {
      assetId: asset.id,
      ...context,
      error,
    });

    return;
  }

  await deleteStorageObjectSafe(deletedAsset, context);
}
/**
 * Lists kiwi-events staff users.
 */
export async function listEventUsers(req, res) {
  const eventUsers = await listEventUsersRepository();

  const imageMap = await loadProfileImageMap(eventUsers);

  return res.status(200).json({
    success: true,
    data: await Promise.all(
      eventUsers.map((eventUser) =>
        buildEventUserDto({
          ...eventUser,
          profileImageAsset: eventUser.profileImageAssetId
            ? imageMap.get(String(eventUser.profileImageAssetId)) || null
            : null,
        }),
      ),
    ),
  });
}

/**
 * Returns a single kiwi-events staff user by EventUser id.
 */
export async function getEventUserById(req, res) {
  const { id } = req.validated.params;

  const eventUser = await findEventUserById(id, {
    lean: true,
  });

  if (!eventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Creates a kiwi-events staff user.
 *
 * local:
 * - emailSnapshot + password
 *
 * external:
 * - externalProvider + externalUserId
 *
 * hybrid:
 * - emailSnapshot + password
 * - externalProvider + externalUserId
 */
export async function createEventUser(req, res) {
  const payload = req.validated.body;
  const authProvider = normalizeAuthProvider(payload.authProvider);

  let passwordHash = null;

  if (usesLocalPassword(authProvider)) {
    await assertEmailAvailable({
      email: payload.emailSnapshot,
    });

    if (payload.password) {
      passwordHash = await hashPassword(payload.password);
    }
  }

  if (usesExternalIdentity(authProvider)) {
    await assertExternalIdentityAvailable({
      provider: payload.externalProvider,
      externalUserId: payload.externalUserId,
    });
  }

  const role = await resolveCreateEventUserRole(authProvider, payload.role);

  const eventUser = await createEventUserRepository({
    authProvider,

    emailSnapshot: cleanEmail(payload.emailSnapshot),
    passwordHash,

    externalProvider: usesExternalIdentity(authProvider)
      ? cleanExternalProvider(payload.externalProvider)
      : null,
    externalUserId: usesExternalIdentity(authProvider)
      ? cleanExternalUserId(payload.externalUserId)
      : null,

    firstNameSnapshot: cleanString(payload.firstNameSnapshot),
    lastNameSnapshot: cleanString(payload.lastNameSnapshot),

    profileBio: cleanString(payload.profileBio),
    profileImageAssetId: null,

    role,
    mustChangePassword: Boolean(payload.mustChangePassword),
    lastLoginAt: null,

    isActive: payload.isActive ?? true,
    notes: cleanString(payload.notes),
  });

  return res.status(201).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Updates a kiwi-events staff user by EventUser id.
 */
export async function updateEventUser(req, res) {
  const { id } = req.validated.params;
  const payload = req.validated.body;

  const existingEventUser = await findEventUserById(id, {
    lean: true,
  });

  if (!existingEventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  assertInitialSetupAdminCanBeUpdated(existingEventUser, payload);

  assertEventUserAuthProviderTransitionAllowed(existingEventUser, payload);

  const nextAuthProvider =
    payload.authProvider ||
    existingEventUser.authProvider ||
    EVENT_USER_AUTH_PROVIDER.EXTERNAL;

  const update = buildEventUserUpdatePayload(payload);

  const resolvedRole = await resolveUpdateEventUserRole({
    nextAuthProvider,
    requestedRole: payload.role,
    existingRole: existingEventUser.role,
  });

  if (resolvedRole !== undefined) {
    update.role = resolvedRole;
  }

  if (
    payload.emailSnapshot !== undefined &&
    usesLocalPassword(nextAuthProvider)
  ) {
    await assertEmailAvailable({
      email: payload.emailSnapshot,
      excludeEventUser: existingEventUser,
    });
  }

  if (
    (payload.externalProvider !== undefined ||
      payload.externalUserId !== undefined ||
      payload.authProvider !== undefined) &&
    usesExternalIdentity(nextAuthProvider)
  ) {
    const nextExternalProvider =
      payload.externalProvider !== undefined
        ? payload.externalProvider
        : existingEventUser.externalProvider;

    const nextExternalUserId =
      payload.externalUserId !== undefined
        ? payload.externalUserId
        : existingEventUser.externalUserId;

    await assertExternalIdentityAvailable({
      provider: nextExternalProvider,
      externalUserId: nextExternalUserId,
      excludeEventUser: existingEventUser,
    });
  }

  if (payload.password) {
    update.passwordHash = await hashPassword(payload.password);
    update.mustChangePassword = false;

    if (nextAuthProvider === EVENT_USER_AUTH_PROVIDER.EXTERNAL) {
      update.authProvider = EVENT_USER_AUTH_PROVIDER.HYBRID;
    }
  }

  if (!usesExternalIdentity(update.authProvider || nextAuthProvider)) {
    update.externalProvider = null;
    update.externalUserId = null;
  }

  const eventUser = await updateEventUserById(id, update, {
    lean: true,
  });

  if (!eventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Deactivates a kiwi-events staff user by EventUser id.
 */
export async function deactivateEventUser(req, res) {
  const { id } = req.validated.params;

  const existingEventUser = await findEventUserById(id, {
    lean: true,
  });

  if (!existingEventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  assertInitialSetupAdminCanBeDeactivated(existingEventUser);

  const eventUser = await updateEventUserById(
    id,
    {
      isActive: false,
    },
    {
      lean: true,
    },
  );

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Reactivates a kiwi-events staff user by EventUser id.
 */
export async function reactivateEventUser(req, res) {
  const { id } = req.validated.params;

  const eventUser = await updateEventUserById(
    id,
    {
      isActive: true,
    },
    {
      lean: true,
    },
  );

  if (!eventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Deletes a kiwi-events staff user by EventUser id.
 */
export async function deleteEventUser(req, res) {
  const { id } = req.validated.params;

  const existingEventUser = await findEventUserById(id, {
    lean: true,
  });

  if (!existingEventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  assertInitialSetupAdminCanBeDeleted(existingEventUser);

  const eventUser = await deleteEventUserById(id);

  if (!eventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  return res.status(200).json({
    success: true,
    data: {
      deleted: true,
    },
  });
}

export async function getMyEventUser(req, res) {
  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(req.eventUser || null),
  });
}

/**
 * Finds a kiwi-events staff user by an external host-system identity.
 */
export async function getEventUserByExternalUser(req, res) {
  const { provider, externalUserId } = req.validated.params;

  const eventUser = await findEventUserByExternalIdentity(
    {
      provider,
      externalUserId,
    },
    {
      lean: true,
    },
  );

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Creates or updates a kiwi-events staff user from an external host-system user.
 *
 * This no longer creates/syncs a kiwi-events User document.
 * The EventUser itself stores the external identity link.
 */
export async function upsertEventUserByExternalUser(req, res) {
  const { provider, externalUserId } = req.validated.params;
  const payload = req.validated.body;
  const authProvider = normalizeAuthProvider(payload.authProvider);

  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);
  const existingEventUser = await findEventUserByExternalIdentity(
    {
      provider: cleanProvider,
      externalUserId: cleanUserId,
    },
    {
      lean: true,
    },
  );

  let passwordHash;

  if (authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID) {
    await assertEmailAvailable({
      email: payload.emailSnapshot,
      excludeEventUser: existingEventUser,
    });

    if (payload.password) {
      passwordHash = await hashPassword(payload.password);
    }
  }

  const role = await resolveCreateEventUserRole(
    authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID
      ? EVENT_USER_AUTH_PROVIDER.HYBRID
      : EVENT_USER_AUTH_PROVIDER.EXTERNAL,
    payload.role,
  );

  const update = {
    ...buildEventUserUpdatePayload({
      ...payload,
      isActive: payload.isActive ?? true,
    }),

    role,

    authProvider:
      authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID
        ? EVENT_USER_AUTH_PROVIDER.HYBRID
        : EVENT_USER_AUTH_PROVIDER.EXTERNAL,

    externalProvider: cleanProvider,
    externalUserId: cleanUserId,

    ...(passwordHash ? { passwordHash } : {}),
  };

  const eventUser = await upsertEventUserByExternalIdentity(
    {
      provider: cleanProvider,
      externalUserId: cleanUserId,
    },
    update,
    {
      lean: true,
    },
  );

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Deactivates a kiwi-events staff user linked to an external host-system user.
 */
export async function deactivateEventUserByExternalUser(req, res) {
  const { provider, externalUserId } = req.validated.params;

  const existingEventUser = await findEventUserByExternalIdentity(
    {
      provider,
      externalUserId,
    },
    {
      lean: true,
    },
  );

  if (!existingEventUser) {
    throw eventUserNotFoundError({
      externalProvider: provider,
      externalUserId,
    });
  }

  const eventUser = await updateEventUserById(existingEventUser.id, {
    isActive: false,
  });

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Reactivates a kiwi-events staff user linked to an external host-system user.
 */
export async function reactivateEventUserByExternalUser(req, res) {
  const { provider, externalUserId } = req.validated.params;

  const existingEventUser = await findEventUserByExternalIdentity(
    {
      provider,
      externalUserId,
    },
    {
      lean: true,
    },
  );

  if (!existingEventUser) {
    throw eventUserNotFoundError({
      externalProvider: provider,
      externalUserId,
    });
  }

  const eventUser = await updateEventUserById(
    existingEventUser.id,
    {
      isActive: true,
    },
    {
      lean: true,
    },
  );

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(eventUser),
  });
}

/**
 * Uploads and replaces the profile image of a kiwi-events staff user.
 */
export async function uploadEventUserProfileImage(req, res) {
  const { id } = req.validated.params;

  const eventUser = await findEventUserById(id, {
    lean: true,
  });

  if (!eventUser) {
    throw eventUserNotFoundError({ eventUserId: id });
  }

  const oldAssetId = eventUser.profileImageAssetId || null;

  const oldAsset = oldAssetId
    ? await findMediaAssetById(oldAssetId, {
        lean: true,
      })
    : null;

  const asset = await uploadEventStaffProfileImageAssetService({
    file: req.file,

    storageTarget: req.validated.query.storageTarget,

    actor: {
      eventUserId: req.eventUser?.id || null,
    },
  });

  let updatedEventUser;

  try {
    updatedEventUser = await setEventUserProfileImageAssetId(id, asset.id, {
      lean: true,
    });
  } catch (error) {
    await deleteProfileImageAssetSafe(asset, {
      eventUserId: id,
      action: "rollback_profile_image_upload",
    });

    throw error;
  }

  await deleteProfileImageAssetSafe(oldAsset, {
    eventUserId: id,
    action: "replace_profile_image",
  });

  const plain = {
    ...updatedEventUser,
    profileImageAsset: mapProfileImageAsset(asset),
  };

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(plain),
  });
}

/**
 * Deletes the profile image of a kiwi-events staff user.
 */
export async function deleteEventUserProfileImage(req, res) {
  const { id } = req.validated.params;

  const eventUser = await findEventUserById(id, {
    lean: true,
  });

  if (!eventUser) {
    throw eventUserNotFoundError({
      eventUserId: id,
    });
  }

  const oldAssetId = eventUser.profileImageAssetId || null;

  const oldAsset = oldAssetId
    ? await findMediaAssetById(oldAssetId, {
        lean: true,
      })
    : null;

  const updatedEventUser = await setEventUserProfileImageAssetId(id, null, {
    lean: true,
  });

  await deleteProfileImageAssetSafe(oldAsset, {
    eventUserId: id,
    action: "delete_profile_image",
  });

  return res.status(200).json({
    success: true,
    data: await buildEventUserDto(updatedEventUser),
  });
}
