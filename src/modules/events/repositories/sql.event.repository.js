import { randomUUID } from "node:crypto";
import { getDatabaseConnection } from "../../database/database.service.js";

function now() {
  return new Date();
}

function parseBoolean(value) {
  return value === true || value === 1 || value === "1";
}
function parseJsonArray(value) {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeIdList(values = []) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function stringifyJsonArray(value = []) {
  return JSON.stringify(normalizeIdList(value));
}
function mapEventRow(row, { sessions = [], faqs = [], tags = [] } = {}) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    title: row.title,
    slug: row.slug,

    shortDescription: row.short_description || "",
    description: row.description || "",

    category: row.category,
    status: row.status,
    visibility: row.visibility,

    location: row.location || "",

    imageAssetIds: normalizeIdList(parseJsonArray(row.image_asset_ids)),

    tags,
    sessions,
    faqs,

    isFree: parseBoolean(row.is_free),
    salesStartAt: row.sales_start_at || null,
    salesEndAt: row.sales_end_at || null,

    isFeatured: parseBoolean(row.is_featured),
    featuredOrder: Number(row.featured_order || 0),

    notesInternal: row.notes_internal || "",

    createdByEventUserId: row.created_by_event_user_id,
    updatedByEventUserId: row.updated_by_event_user_id,

    publishedAt: row.published_at || null,
    cancelledAt: row.cancelled_at || null,
    cancellationReason: row.cancellation_reason || null,

    isCancellationFinalized: parseBoolean(row.is_cancellation_finalized),
    cancellationFinalizedAt: row.cancellation_finalized_at || null,

    archivedAt: row.archived_at || null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionRow(row) {
  return {
    id: row.id,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone || "Europe/Vienna",
    locationLabel: row.location_label || "",
    locationDetails: row.location_details || "",
    capacity:
      row.capacity === null || row.capacity === undefined
        ? null
        : Number(row.capacity),
    status: row.status || "scheduled",
  };
}

function mapFaqRow(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sortOrder: Number(row.sort_order || 0),
  };
}

function toEventInsert(data, id = randomUUID()) {
  const timestamp = now();

  return {
    id,

    title: data.title,
    slug: data.slug,

    short_description: data.shortDescription || "",
    description: data.description || "",

    category: data.category,
    status: data.status || "draft",
    visibility: data.visibility || "public",

    location: data.location || "",

    image_asset_ids: stringifyJsonArray(data.imageAssetIds || []),

    is_free: data.isFree ?? true,
    sales_start_at: data.salesStartAt || null,
    sales_end_at: data.salesEndAt || null,

    is_featured: data.isFeatured ?? false,
    featured_order: data.featuredOrder ?? 0,

    notes_internal: data.notesInternal || "",

    created_by_event_user_id: data.createdByEventUserId,
    updated_by_event_user_id: data.updatedByEventUserId,

    published_at: data.publishedAt || null,
    cancelled_at: data.cancelledAt || null,
    cancellation_reason: data.cancellationReason || null,

    is_cancellation_finalized: data.isCancellationFinalized ?? false,
    cancellation_finalized_at: data.cancellationFinalizedAt || null,

    archived_at: data.archivedAt || null,

    created_at: timestamp,
    updated_at: timestamp,
  };
}

function toEventUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if ("title" in data) update.title = data.title;
  if ("slug" in data) update.slug = data.slug;
  if ("shortDescription" in data) {
    update.short_description = data.shortDescription || "";
  }
  if ("description" in data) update.description = data.description || "";
  if ("category" in data) update.category = data.category;
  if ("status" in data) update.status = data.status;
  if ("visibility" in data) update.visibility = data.visibility;
  if ("location" in data) update.location = data.location || "";
  if ("imageAssetIds" in data) {
    update.image_asset_ids = stringifyJsonArray(data.imageAssetIds || []);
  }
  if ("isFree" in data) update.is_free = Boolean(data.isFree);
  if ("salesStartAt" in data) update.sales_start_at = data.salesStartAt || null;
  if ("salesEndAt" in data) update.sales_end_at = data.salesEndAt || null;
  if ("isFeatured" in data) update.is_featured = Boolean(data.isFeatured);
  if ("featuredOrder" in data) update.featured_order = data.featuredOrder ?? 0;
  if ("notesInternal" in data) update.notes_internal = data.notesInternal || "";

  if ("updatedByEventUserId" in data) {
    update.updated_by_event_user_id = data.updatedByEventUserId;
  }

  if ("publishedAt" in data) update.published_at = data.publishedAt || null;
  if ("cancelledAt" in data) update.cancelled_at = data.cancelledAt || null;

  if ("cancellationReason" in data) {
    update.cancellation_reason = data.cancellationReason || null;
  }

  if ("isCancellationFinalized" in data) {
    update.is_cancellation_finalized = Boolean(data.isCancellationFinalized);
  }

  if ("cancellationFinalizedAt" in data) {
    update.cancellation_finalized_at = data.cancellationFinalizedAt || null;
  }

  if ("archivedAt" in data) update.archived_at = data.archivedAt || null;

  return update;
}

async function loadEventRelations(runner, eventIds) {
  if (!eventIds.length) {
    return {
      sessionsByEventId: new Map(),
      faqsByEventId: new Map(),
      tagsByEventId: new Map(),
    };
  }

  const [sessionRows, faqRows, tagRows] = await Promise.all([
    runner("event_sessions")
      .whereIn("event_id", eventIds)
      .orderBy("sort_order", "asc")
      .orderBy("start_at", "asc"),
    runner("event_faqs")
      .whereIn("event_id", eventIds)
      .orderBy("sort_order", "asc"),
    runner("event_tags").whereIn("event_id", eventIds).orderBy("tag", "asc"),
  ]);

  const sessionsByEventId = new Map();
  const faqsByEventId = new Map();
  const tagsByEventId = new Map();

  for (const row of sessionRows) {
    const list = sessionsByEventId.get(row.event_id) || [];
    list.push(mapSessionRow(row));
    sessionsByEventId.set(row.event_id, list);
  }

  for (const row of faqRows) {
    const list = faqsByEventId.get(row.event_id) || [];
    list.push(mapFaqRow(row));
    faqsByEventId.set(row.event_id, list);
  }

  for (const row of tagRows) {
    const list = tagsByEventId.get(row.event_id) || [];
    list.push(row.tag);
    tagsByEventId.set(row.event_id, list);
  }

  return {
    sessionsByEventId,
    faqsByEventId,
    tagsByEventId,
  };
}

async function replaceEventRelations(runner, eventId, data) {
  const timestamp = now();

  if ("sessions" in data) {
    await runner("event_sessions").where({ event_id: eventId }).delete();

    const sessions = Array.isArray(data.sessions) ? data.sessions : [];

    if (sessions.length) {
      await runner("event_sessions").insert(
        sessions.map((session, index) => ({
          id: session.id || randomUUID(),
          event_id: eventId,
          start_at: session.startAt,
          end_at: session.endAt,
          timezone: session.timezone || "Europe/Vienna",
          location_label: session.locationLabel || "",
          location_details: session.locationDetails || "",
          capacity: session.capacity ?? null,
          status: session.status || "scheduled",
          sort_order: index,
          created_at: timestamp,
          updated_at: timestamp,
        })),
      );
    }
  }

  if ("faqs" in data) {
    await runner("event_faqs").where({ event_id: eventId }).delete();

    const faqs = Array.isArray(data.faqs) ? data.faqs : [];

    if (faqs.length) {
      await runner("event_faqs").insert(
        faqs.map((faq, index) => ({
          id: faq.id || randomUUID(),
          event_id: eventId,
          question: faq.question,
          answer: faq.answer,
          sort_order: faq.sortOrder ?? index,
          created_at: timestamp,
          updated_at: timestamp,
        })),
      );
    }
  }

  if ("tags" in data) {
    await runner("event_tags").where({ event_id: eventId }).delete();

    const tags = Array.isArray(data.tags) ? data.tags : [];

    if (tags.length) {
      await runner("event_tags").insert(
        [...new Set(tags.filter(Boolean))].map((tag) => ({
          id: randomUUID(),
          event_id: eventId,
          tag,
          created_at: timestamp,
        })),
      );
    }
  }
}

async function findEventByIdWithRunner(runner, id) {
  const row = await runner("events").where({ id }).first();

  if (!row) {
    return null;
  }

  const relations = await loadEventRelations(runner, [row.id]);

  return mapEventRow(row, {
    sessions: relations.sessionsByEventId.get(row.id) || [],
    faqs: relations.faqsByEventId.get(row.id) || [],
    tags: relations.tagsByEventId.get(row.id) || [],
  });
}

export function startEventMongoSession() {
  throw new Error(
    "Mongo sessions are not available for SQL database providers",
  );
}

export async function findEventBySlug(slug) {
  const db = getDatabaseConnection();

  const row = await db("events").where({ slug }).first();

  if (!row) {
    return null;
  }

  const relations = await loadEventRelations(db, [row.id]);

  return mapEventRow(row, {
    sessions: relations.sessionsByEventId.get(row.id) || [],
    faqs: relations.faqsByEventId.get(row.id) || [],
    tags: relations.tagsByEventId.get(row.id) || [],
  });
}

export async function findEventBySlugExcludingId({ slug, excludeId }) {
  const db = getDatabaseConnection();

  const row = await db("events")
    .where({ slug })
    .whereNot({ id: excludeId })
    .first();

  if (!row) {
    return null;
  }

  const relations = await loadEventRelations(db, [row.id]);

  return mapEventRow(row, {
    sessions: relations.sessionsByEventId.get(row.id) || [],
    faqs: relations.faqsByEventId.get(row.id) || [],
    tags: relations.tagsByEventId.get(row.id) || [],
  });
}

export async function createEvent(data, options = {}) {
  const db = getDatabaseConnection();
  const eventId = data.id || randomUUID();
  const row = toEventInsert(data, eventId);

  async function createWithRunner(runner) {
    await runner("events").insert(row);
    await replaceEventRelations(runner, eventId, data);

    return findEventByIdWithRunner(runner, eventId);
  }

  if (options.trx) {
    return createWithRunner(options.trx);
  }

  return db.transaction(async (trx) => {
    return createWithRunner(trx);
  });
}

export async function findEventById(id) {
  const db = getDatabaseConnection();

  return findEventByIdWithRunner(db, id);
}
export async function listEventIdsByCreatedByEventUserId(
  eventUserId,
  options = {},
) {
  const db = options.trx || getDatabaseConnection();

  const rows = await db("events")
    .select("id")
    .where("created_by_event_user_id", eventUserId)
    .orderBy("created_at", "desc");

  return rows.map((row) => row.id);
}
export async function listEvents(filters = {}) {
  const db = getDatabaseConnection();

  const query = db("events").select("*");

  if (filters.category) {
    query.where("category", filters.category);
  }

  if (filters.status) {
    query.where("status", filters.status);
  }

  if (filters.visibility) {
    query.where("visibility", filters.visibility);
  }
  if (filters.createdByEventUserId) {
    query.where("created_by_event_user_id", filters.createdByEventUserId);
  }
  if (filters.isFeatured === "true") {
    query.where("is_featured", true);
  }

  if (filters.isFeatured === "false") {
    query.where("is_featured", false);
  }

  if (filters.search) {
    const search = `%${filters.search}%`;

    query.where((builder) => {
      builder
        .where("title", "like", search)
        .orWhere("short_description", "like", search)
        .orWhere("description", "like", search)
        .orWhere("location", "like", search);
    });
  }

  const rows = await query
    .orderBy("is_featured", "desc")
    .orderBy("featured_order", "asc")
    .orderBy("created_at", "desc");

  const eventIds = rows.map((row) => row.id);
  const relations = await loadEventRelations(db, eventIds);

  return rows.map((row) =>
    mapEventRow(row, {
      sessions: relations.sessionsByEventId.get(row.id) || [],
      faqs: relations.faqsByEventId.get(row.id) || [],
      tags: relations.tagsByEventId.get(row.id) || [],
    }),
  );
}

export async function updateEventById(id, data, options = {}) {
  const db = getDatabaseConnection();

  async function updateWithRunner(runner) {
    await runner("events").where({ id }).update(toEventUpdate(data));
    await replaceEventRelations(runner, id, data);

    return findEventByIdWithRunner(runner, id);
  }

  if (options.trx) {
    return updateWithRunner(options.trx);
  }

  return db.transaction(async (trx) => {
    return updateWithRunner(trx);
  });
}

export async function deleteEventById(id, options = {}) {
  const db = options.trx || getDatabaseConnection();

  const existing = await findEventByIdWithRunner(db, id);

  if (!existing) {
    return null;
  }

  await db("events").where({ id }).delete();

  return existing;
}

export async function findEventsUsingImageAsset(assetId) {
  const db = getDatabaseConnection();

  const rows = await db("events")
    .select("id", "title", "slug", "status", "image_asset_ids")
    .orderBy("created_at", "desc");

  return rows
    .filter((row) =>
      normalizeIdList(parseJsonArray(row.image_asset_ids)).includes(
        String(assetId),
      ),
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
    }));
}

export async function findEventsUsingImageAssets(assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return [];
  }

  const normalizedAssetIds = new Set(assetIds.map(String));

  const db = getDatabaseConnection();

  const rows = await db("events").select(
    "id",
    "title",
    "slug",
    "status",
    "image_asset_ids",
  );

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      imageAssetIds: normalizeIdList(parseJsonArray(row.image_asset_ids)),
    }))
    .filter((event) =>
      event.imageAssetIds.some((assetId) =>
        normalizedAssetIds.has(String(assetId)),
      ),
    );
}
