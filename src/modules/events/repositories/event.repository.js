import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import * as mongoEventRepository from "./mongo.event.repository.js";
import * as sqlEventRepository from "./sql.event.repository.js";
import { getDatabaseProvider } from "../../database/database.service.js";

function getEventRepository() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return mongoEventRepository;
  }

  if (isSqlDatabaseProvider(provider)) {
    return sqlEventRepository;
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}
function normalizeRequiredEventId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot normalize Event without ${fieldName}.`);
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id || id === "[object Object]") {
    throw new TypeError(`Cannot normalize Event without ${fieldName}.`);
  }

  return id;
}

function normalizeOptionalEventId(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredEventId(value, fieldName);
}

function toCanonicalEventRelationRecord(value, provider, fieldName) {
  if (!value) {
    throw new TypeError(`Cannot normalize missing Event ${fieldName}.`);
  }

  const record =
    typeof value.toObject === "function" ? value.toObject() : value;

  const rawId = provider === DATABASE_PROVIDER.MONGODB ? record._id : record.id;

  const { _id, __v, id: ignoredId, ...fields } = record;

  return {
    id: normalizeRequiredEventId(rawId, `${fieldName} id`),
    ...fields,
  };
}
function toCanonicalEventRecord(event) {
  if (!event) {
    return null;
  }

  const record =
    typeof event.toObject === "function" ? event.toObject() : event;

  const provider = getDatabaseProvider();

  const rawId = provider === DATABASE_PROVIDER.MONGODB ? record._id : record.id;

  const { _id, __v, id: ignoredId, ...fields } = record;

  return {
    id: normalizeRequiredEventId(rawId, "id"),

    ...fields,

    ...(record.imageAssetIds !== undefined
      ? {
          imageAssetIds: (record.imageAssetIds || []).map((value) =>
            normalizeRequiredEventId(value, "image asset id"),
          ),
        }
      : {}),

    ...(record.createdByEventUserId !== undefined
      ? {
          createdByEventUserId: normalizeOptionalEventId(
            record.createdByEventUserId,
            "createdByEventUserId",
          ),
        }
      : {}),

    ...(record.updatedByEventUserId !== undefined
      ? {
          updatedByEventUserId: normalizeOptionalEventId(
            record.updatedByEventUserId,
            "updatedByEventUserId",
          ),
        }
      : {}),

    ...(record.sessions !== undefined
      ? {
          sessions: (record.sessions || []).map((session) =>
            toCanonicalEventRelationRecord(session, provider, "session"),
          ),
        }
      : {}),

    ...(record.faqs !== undefined
      ? {
          faqs: (record.faqs || []).map((faq) =>
            toCanonicalEventRelationRecord(faq, provider, "FAQ"),
          ),
        }
      : {}),
  };
}
export function startEventMongoSession() {
  return getEventRepository().startEventMongoSession();
}

export async function findEventBySlug(slug, options) {
  const event = await getEventRepository().findEventBySlug(slug, options);

  return toCanonicalEventRecord(event);
}

export async function findEventBySlugExcludingId(input, options) {
  const event = await getEventRepository().findEventBySlugExcludingId(
    input,
    options,
  );

  return toCanonicalEventRecord(event);
}

export async function createEvent(data, options) {
  const event = await getEventRepository().createEvent(data, options);

  return toCanonicalEventRecord(event);
}
export async function findEventById(id, options) {
  const event = await getEventRepository().findEventById(id, options);

  return toCanonicalEventRecord(event);
}
export async function listEventIdsByCreatedByEventUserId(
  eventUserId,
  options = {},
) {
  const eventIds =
    await getEventRepository().listEventIdsByCreatedByEventUserId(
      eventUserId,
      options,
    );

  return (eventIds || []).map((eventId) =>
    normalizeRequiredEventId(eventId, "id"),
  );
}
export async function listEvents(filters = {}, options = {}) {
  const events = await getEventRepository().listEvents(filters, options);

  return (events || []).map(toCanonicalEventRecord);
}

export async function updateEventById(id, data, options) {
  const event = await getEventRepository().updateEventById(id, data, options);

  return toCanonicalEventRecord(event);
}

export async function deleteEventById(id, options) {
  const event = await getEventRepository().deleteEventById(id, options);

  return toCanonicalEventRecord(event);
}

export async function findEventsUsingImageAsset(assetId, options) {
  const events = await getEventRepository().findEventsUsingImageAsset(
    assetId,
    options,
  );

  return (events || []).map(toCanonicalEventRecord);
}

export async function findEventsUsingImageAssets(assetIds, options) {
  const events = await getEventRepository().findEventsUsingImageAssets(
    assetIds,
    options,
  );

  return (events || []).map(toCanonicalEventRecord);
}
