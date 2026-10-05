import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize an EventUser without ${fieldName}.`);
  }

  return id;
}

function optionalApiId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return toApiId(value);
}

function optionalApiDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return toApiDate(value);
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(`Cannot serialize an EventUser without ${fieldName}.`);
  }

  return date;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);

  return normalized || null;
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.map((permission) => normalizeString(permission)).filter(Boolean),
    ),
  );
}

function toEventUserProfileImageAssetDto(asset) {
  if (!asset) {
    return null;
  }

  return {
    id: requireApiId(asset.id, "profileImageAsset.id"),

    fileUrl: normalizeString(asset.fileUrl),

    filenameOriginal: normalizeString(asset.filenameOriginal),

    mimeType: normalizeString(asset.mimeType),

    size: Number(asset.size ?? 0),
  };
}

export function toEventUserDto(eventUser) {
  if (!eventUser) {
    return null;
  }

  return {
    id: requireApiId(eventUser.id, "id"),

    authProvider: normalizeString(eventUser.authProvider),

    emailSnapshot: normalizeString(eventUser.emailSnapshot),

    externalProvider: normalizeNullableString(eventUser.externalProvider),

    externalUserId: normalizeNullableString(eventUser.externalUserId),

    firstNameSnapshot: normalizeString(eventUser.firstNameSnapshot),

    lastNameSnapshot: normalizeString(eventUser.lastNameSnapshot),

    profileBio: normalizeString(eventUser.profileBio),

    profileImageAssetId: optionalApiId(eventUser.profileImageAssetId),

    profileImageAsset: toEventUserProfileImageAssetDto(
      eventUser.profileImageAsset,
    ),

    role: normalizeNullableString(eventUser.role),

    effectivePermissions: normalizePermissions(eventUser.effectivePermissions),

    mustChangePassword: Boolean(eventUser.mustChangePassword),

    lastLoginAt: optionalApiDate(eventUser.lastLoginAt),

    isActive: eventUser.isActive !== false,

    notes: normalizeString(eventUser.notes),

    createdAt: requireApiDate(eventUser.createdAt, "createdAt"),

    updatedAt: requireApiDate(eventUser.updatedAt, "updatedAt"),
  };
}
