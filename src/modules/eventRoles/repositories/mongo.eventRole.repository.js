import { EventRole } from "../eventRole.model.js";

function applyQueryOptions(query, options = {}) {
  if (options.select) {
    query.select(options.select);
  }

  if (options.session) {
    query.session(options.session);
  }

  if (options.lean !== false) {
    query.lean();
  }

  return query;
}

function toObject(document) {
  if (!document) return null;
  return document.toObject ? document.toObject() : document;
}

export async function listEventRoles(options = {}) {
  const query = EventRole.find({}).sort({
    sortOrder: 1,
    name: 1,
    key: 1,
  });

  return applyQueryOptions(query, options);
}

export async function findEventRoleByKey(key, options = {}) {
  const query = EventRole.findOne({
    key: String(key || "")
      .trim()
      .toLowerCase(),
  });

  return applyQueryOptions(query, options);
}

export async function createEventRole(data) {
  const document = await EventRole.create(data);
  return toObject(document);
}

export async function updateEventRoleByKey(key, data, options = {}) {
  const document = await EventRole.findOneAndUpdate(
    {
      key: String(key || "")
        .trim()
        .toLowerCase(),
    },
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (options.lean === false) {
    return document;
  }

  return toObject(document);
}

export async function deleteEventRoleByKey(key) {
  const document = await EventRole.findOneAndDelete({
    key: String(key || "")
      .trim()
      .toLowerCase(),
  });

  return toObject(document);
}
