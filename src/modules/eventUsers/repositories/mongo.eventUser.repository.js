import { EventUser } from "../eventUser.model.js";

function applyQueryOptions(query, options = {}) {
  if (options.select) {
    query.select(options.select);
  }

  if (options.session) {
    query.session(options.session);
  }

  if (options.lean) {
    query.lean();
  }

  return query;
}

function toObjectIfNeeded(document, options = {}) {
  if (!document) return null;

  if (options.lean && typeof document.toObject === "function") {
    return document.toObject();
  }

  return document;
}

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cleanExternalProvider(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cleanExternalUserId(value) {
  return String(value || "").trim();
}

export async function findEventUserById(id, options = {}) {
  const query = EventUser.findById(id);
  return applyQueryOptions(query, options);
}

export async function findActiveEventUserById(id, options = {}) {
  const query = EventUser.findOne({
    _id: id,
    isActive: true,
  });

  return applyQueryOptions(query, {
    lean: true,
    ...options,
  });
}

export async function findEventUserByEmail(email, options = {}) {
  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const query = EventUser.findOne({
    emailSnapshot: normalizedEmail,
  });

  return applyQueryOptions(query, options);
}
export async function findEventUserByEmailAndAuthProviders(
  email,
  authProviders = [],
  options = {},
) {
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

  const query = EventUser.findOne({
    emailSnapshot: normalizedEmail,

    ...(normalizedAuthProviders.length
      ? {
          authProvider: {
            $in: normalizedAuthProviders,
          },
        }
      : {}),
  });

  return applyQueryOptions(query, options);
}
export async function findEventUserByExternalIdentity(
  { provider, externalUserId },
  options = {},
) {
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);

  if (!cleanProvider || !cleanUserId) {
    return null;
  }

  const query = EventUser.findOne({
    externalProvider: cleanProvider,
    externalUserId: cleanUserId,
  });

  return applyQueryOptions(query, options);
}

export async function findActiveEventUserByExternalIdentity(
  { provider, externalUserId },
  options = {},
) {
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);

  if (!cleanProvider || !cleanUserId) {
    return null;
  }

  const query = EventUser.findOne({
    externalProvider: cleanProvider,
    externalUserId: cleanUserId,
    isActive: true,
  });

  return applyQueryOptions(query, {
    lean: true,
    ...options,
  });
}

export async function listEventUsers() {
  return EventUser.find({})
    .sort({
      role: 1,
      lastNameSnapshot: 1,
      firstNameSnapshot: 1,
      createdAt: -1,
    })
    .lean();
}

export async function createEventUser(data) {
  return EventUser.create(data);
}

export async function updateEventUserById(id, data, options = {}) {
  const document = await EventUser.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return toObjectIfNeeded(document, options);
}

export async function upsertEventUserByExternalIdentity(
  { provider, externalUserId },
  data,
  options = {},
) {
  const cleanProvider = cleanExternalProvider(provider);
  const cleanUserId = cleanExternalUserId(externalUserId);

  const document = await EventUser.findOneAndUpdate(
    {
      externalProvider: cleanProvider,
      externalUserId: cleanUserId,
    },
    {
      $set: {
        ...data,
        externalProvider: cleanProvider,
        externalUserId: cleanUserId,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  return toObjectIfNeeded(document, options);
}

export async function deactivateEventUserById(id, options = {}) {
  return updateEventUserById(id, { isActive: false }, options);
}

export async function reactivateEventUserById(id, options = {}) {
  return updateEventUserById(id, { isActive: true }, options);
}

export async function deleteEventUserById(id) {
  const eventUser = await EventUser.findById(id);

  if (!eventUser) {
    return null;
  }

  await eventUser.deleteOne();

  return eventUser;
}

export async function setEventUserProfileImageAssetId(
  id,
  profileImageAssetId,
  options = {},
) {
  return updateEventUserById(
    id,
    {
      profileImageAssetId: profileImageAssetId || null,
    },
    options,
  );
}
export async function detachEventUsersFromRole(roleKey) {
  const result = await EventUser.updateMany(
    {
      role: roleKey,
    },
    {
      $set: {
        role: null,
      },
    },
  );

  return result.modifiedCount || result.nModified || 0;
}
