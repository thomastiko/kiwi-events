import mongoose from "mongoose";
import { Event } from "../event.model.js";

function applyQueryOptions(query, options = {}) {
  if (options.session) {
    query.session(options.session);
  }

  if (options.select) {
    query.select(options.select);
  }

  if (options.lean) {
    query.lean();
  }

  return query;
}
function normalizeEmbeddedEventEntityForMongo(entity) {
  if (!entity || typeof entity !== "object") {
    return entity;
  }

  const { id, ...fields } = entity;

  if (!id) {
    return fields;
  }

  return {
    ...fields,
    _id: id,
  };
}

function normalizeEventWriteDataForMongo(data = {}) {
  const normalized = {
    ...data,
  };

  if (data.sessions !== undefined) {
    normalized.sessions = (data.sessions || []).map(
      normalizeEmbeddedEventEntityForMongo,
    );
  }

  if (data.faqs !== undefined) {
    normalized.faqs = (data.faqs || []).map(
      normalizeEmbeddedEventEntityForMongo,
    );
  }

  return normalized;
}
function buildEventQuery(filters = {}) {
  const query = {};

  if (filters.category) {
    query.category = filters.category;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.visibility) {
    query.visibility = filters.visibility;
  }
  if (filters.createdByEventUserId) {
    query.createdByEventUserId = filters.createdByEventUserId;
  }
  if (filters.isFeatured === "true" || filters.isFeatured === true) {
    query.isFeatured = true;
  }

  if (filters.isFeatured === "false" || filters.isFeatured === false) {
    query.isFeatured = false;
  }

  if (filters.featuredOnly) {
    query.isFeatured = true;
  }

  if (Object.prototype.hasOwnProperty.call(filters, "archivedAt")) {
    query.archivedAt = filters.archivedAt;
  }

  if (filters.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: "i" } },
      { shortDescription: { $regex: filters.search, $options: "i" } },
      { description: { $regex: filters.search, $options: "i" } },
      { location: { $regex: filters.search, $options: "i" } },
    ];
  }

  if (filters.upcomingOnly) {
    query["sessions.endAt"] = { $gte: new Date() };
  }

  if (filters.startsInRange?.from && filters.startsInRange?.to) {
    query.sessions = {
      $elemMatch: {
        startAt: {
          $gte: filters.startsInRange.from,
          $lt: filters.startsInRange.to,
        },
      },
    };
  }

  return query;
}

export function startEventMongoSession() {
  return mongoose.startSession();
}

export async function findEventBySlug(slug, options = {}) {
  const query = Event.findOne({ slug });

  return applyQueryOptions(query, options);
}

export async function findEventBySlugExcludingId(
  { slug, excludeId },
  options = {},
) {
  const query = Event.findOne({
    slug,
    _id: { $ne: excludeId },
  });

  return applyQueryOptions(query, options);
}

export async function createEvent(data, options = {}) {
  const createOptions = {};

  if (options.session) {
    createOptions.session = options.session;
  }

  const [event] = await Event.create(
    [normalizeEventWriteDataForMongo(data)],
    createOptions,
  );

  return options.lean ? event.toObject() : event;
}

export async function findEventById(id, options = {}) {
  const query = Event.findById(id);

  return applyQueryOptions(query, options);
}
export async function listEventIdsByCreatedByEventUserId(
  eventUserId,
  options = {},
) {
  const query = Event.find({
    createdByEventUserId: eventUserId,
  })
    .select("_id")
    .sort({ createdAt: -1 });

  const rows = await applyQueryOptions(query, {
    lean: true,
    ...options,
  });

  return rows.map((row) => row._id);
}
export async function listEvents(filters = {}, options = {}) {
  const query = Event.find(buildEventQuery(filters)).sort({
    isFeatured: -1,
    featuredOrder: 1,
    createdAt: -1,
  });

  if (filters.limit || options.limit) {
    query.limit(Number(filters.limit || options.limit));
  }

  return applyQueryOptions(query, {
    lean: true,
    ...options,
  });
}

export async function updateEventById(id, data, options = {}) {
  const query = Event.findByIdAndUpdate(
    id,
    {
      $set: normalizeEventWriteDataForMongo(data),
    },
    {
      new: true,
      runValidators: true,
      ...(options.session ? { session: options.session } : {}),
    },
  );

  return applyQueryOptions(query, options);
}

export async function deleteEventById(id, options = {}) {
  const query = Event.findByIdAndDelete(id);

  return applyQueryOptions(query, options);
}

export async function findEventsUsingImageAsset(assetId, options = {}) {
  const query = Event.find({
    imageAssetIds: assetId,
  })
    .select("_id title slug status imageAssetIds")
    .sort({ createdAt: -1 });

  return applyQueryOptions(query, {
    lean: true,
    ...options,
  });
}

export async function findEventsUsingImageAssets(assetIds = [], options = {}) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return [];
  }

  const query = Event.find({
    imageAssetIds: { $in: assetIds },
  }).select("_id title slug status imageAssetIds");

  return applyQueryOptions(query, {
    lean: true,
    ...options,
  });
}
