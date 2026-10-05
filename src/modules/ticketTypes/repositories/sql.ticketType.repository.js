import { randomUUID } from "node:crypto";
import { getDatabaseConnection } from "../../database/database.service.js";
import { TICKET_TYPE_STATUS } from "../ticketType.constants.js";

function now() {
  return new Date();
}

function parseBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function mapTicketTypeRow(row, sessionIds = []) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    displayName: row.display_name,
    description: row.description || "",
    status: row.status,
    ticketKind: row.ticket_kind,
    pricingMode: row.pricing_mode,
    priceGross: Number(row.price_gross || 0),
    currency: row.currency || "EUR",
    stockTotal:
      row.stock_total === null || row.stock_total === undefined
        ? null
        : Number(row.stock_total),
    stockSold: Number(row.stock_sold || 0),
    minPerOrder: Number(row.min_per_order || 1),
    maxPerOrder:
      row.max_per_order === null || row.max_per_order === undefined
        ? null
        : Number(row.max_per_order),
    salesStartAt: row.sales_start_at || null,
    salesEndAt: row.sales_end_at || null,
    isPersonalized: parseBoolean(row.is_personalized),
    sessionIds,
    sortOrder: Number(row.sort_order || 0),
    createdByEventUserId: row.created_by_event_user_id,
    updatedByEventUserId: row.updated_by_event_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTicketTypeInsert(data, id = randomUUID()) {
  const timestamp = now();

  return {
    id,
    event_id: data.eventId,
    name: data.name,
    display_name: data.displayName,
    description: data.description || "",
    status: data.status || "draft",
    ticket_kind: data.ticketKind || "normal",
    pricing_mode: data.pricingMode,
    price_gross: Number(data.priceGross || 0),
    currency: data.currency || "EUR",
    stock_total: data.stockTotal ?? null,
    stock_sold: data.stockSold ?? 0,
    min_per_order: data.minPerOrder ?? 1,
    max_per_order: data.maxPerOrder ?? null,
    sales_start_at: data.salesStartAt ?? null,
    sales_end_at: data.salesEndAt ?? null,
    is_personalized: Boolean(data.isPersonalized),
    sort_order: data.sortOrder ?? 0,
    created_by_event_user_id: data.createdByEventUserId,
    updated_by_event_user_id: data.updatedByEventUserId,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function toTicketTypeUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if ("eventId" in data) update.event_id = data.eventId;
  if ("name" in data) update.name = data.name;
  if ("displayName" in data) update.display_name = data.displayName;
  if ("description" in data) update.description = data.description || "";
  if ("status" in data) update.status = data.status || "draft";
  if ("ticketKind" in data) update.ticket_kind = data.ticketKind || "normal";
  if ("pricingMode" in data) update.pricing_mode = data.pricingMode;
  if ("priceGross" in data) update.price_gross = Number(data.priceGross || 0);
  if ("currency" in data) update.currency = data.currency || "EUR";
  if ("stockTotal" in data) update.stock_total = data.stockTotal ?? null;
  if ("stockSold" in data) update.stock_sold = data.stockSold ?? 0;
  if ("minPerOrder" in data) update.min_per_order = data.minPerOrder ?? 1;
  if ("maxPerOrder" in data) update.max_per_order = data.maxPerOrder ?? null;
  if ("salesStartAt" in data) update.sales_start_at = data.salesStartAt ?? null;
  if ("salesEndAt" in data) update.sales_end_at = data.salesEndAt ?? null;
  if ("isPersonalized" in data) {
    update.is_personalized = Boolean(data.isPersonalized);
  }
  if ("sortOrder" in data) update.sort_order = data.sortOrder ?? 0;
  if ("updatedByEventUserId" in data) {
    update.updated_by_event_user_id = data.updatedByEventUserId;
  }

  return update;
}

async function loadSessionIdsForTicketTypes(db, ticketTypeIds) {
  if (!ticketTypeIds.length) {
    return new Map();
  }

  const rows = await db("ticket_type_sessions")
    .whereIn("ticket_type_id", ticketTypeIds)
    .select("ticket_type_id", "event_session_id");

  const map = new Map();

  for (const row of rows) {
    const list = map.get(row.ticket_type_id) || [];
    list.push(row.event_session_id);
    map.set(row.ticket_type_id, list);
  }

  return map;
}

async function mapTicketTypeRowsWithSessions(db, rows) {
  const sessionMap = await loadSessionIdsForTicketTypes(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => mapTicketTypeRow(row, sessionMap.get(row.id) || []));
}

async function findTicketTypeByIdWithRunner(db, id) {
  const row = await db("ticket_types").where({ id }).first();

  if (!row) {
    return null;
  }

  const [ticketType] = await mapTicketTypeRowsWithSessions(db, [row]);
  return ticketType || null;
}

async function replaceTicketTypeSessions(
  runner,
  ticketTypeId,
  sessionIds = [],
) {
  await runner("ticket_type_sessions")
    .where({ ticket_type_id: ticketTypeId })
    .delete();

  const uniqueSessionIds = [...new Set((sessionIds || []).filter(Boolean))];

  if (!uniqueSessionIds.length) {
    return;
  }

  const timestamp = now();

  await runner("ticket_type_sessions").insert(
    uniqueSessionIds.map((sessionId) => ({
      id: randomUUID(),
      ticket_type_id: ticketTypeId,
      event_session_id: sessionId,
      created_at: timestamp,
    })),
  );
}

export async function insertManyTicketTypes(items, options = {}) {
  const db = getDatabaseConnection();
  const created = [];

  async function insertWithRunner(runner) {
    for (const item of items) {
      const id = item.id || randomUUID();
      const row = toTicketTypeInsert(item, id);

      await runner("ticket_types").insert(row);
      await replaceTicketTypeSessions(runner, id, item.sessionIds || []);

      created.push(mapTicketTypeRow(row, item.sessionIds || []));
    }
  }

  if (options.trx) {
    await insertWithRunner(options.trx);
    return created;
  }

  await db.transaction(async (trx) => {
    await insertWithRunner(trx);
  });

  return created;
}

export async function findTicketTypeById(id, options = {}) {
  const db = options.trx || getDatabaseConnection();

  return findTicketTypeByIdWithRunner(db, id);
}

export async function findTicketTypeByIdAndEventId(
  { ticketTypeId, eventId },
  options = {},
) {
  const db = options.trx || getDatabaseConnection();

  const row = await db("ticket_types")
    .where({
      id: ticketTypeId,
      event_id: eventId,
    })
    .first();

  if (!row) {
    return null;
  }

  const [ticketType] = await mapTicketTypeRowsWithSessions(db, [row]);
  return ticketType || null;
}

export async function findTicketTypesByEventId(eventId, options = {}) {
  const db = options.trx || getDatabaseConnection();

  const rows = await db("ticket_types")
    .where({ event_id: eventId })
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc");

  return mapTicketTypeRowsWithSessions(db, rows);
}

export async function listTicketTypes(filters = {}, options = {}) {
  const db = options.trx || getDatabaseConnection();

  const query = db("ticket_types").select("*");

  if (filters.eventId) {
    query.where("event_id", filters.eventId);
  } else if (Array.isArray(filters.eventIds)) {
    query.whereIn("event_id", filters.eventIds);
  }

  if (filters.status) {
    query.where("status", filters.status);
  }

  const rows = await query
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc");

  return mapTicketTypeRowsWithSessions(db, rows);
}

export async function aggregateTicketTypeSalesByEventIds(eventIds) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return [];
  }

  const db = getDatabaseConnection();

  const rows = await db("ticket_types")
    .select("event_id")
    .sum({ ticketsSold: "stock_sold" })
    .whereIn("event_id", eventIds)
    .groupBy("event_id");

  return rows.map((row) => ({
    eventId: String(row.event_id),
    ticketsSold: Number(row.ticketsSold || row.ticketssold || 0),
  }));
}

function normalizeStockQuantity(quantity) {
  const normalizedQuantity = Number(quantity || 0);

  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new Error("INVALID_STOCK_QUANTITY");
  }

  return normalizedQuantity;
}

async function reserveTicketTypeStockWithRunner(
  runner,
  { ticketTypeId, eventId, quantity, updatedByEventUserId = null },
) {
  const reserveQuantity = normalizeStockQuantity(quantity);
  const timestamp = now();

  const updatedRows = await runner("ticket_types")
    .where({
      id: ticketTypeId,
      event_id: eventId,
      status: TICKET_TYPE_STATUS.ACTIVE,
    })
    .andWhere((builder) => {
      builder
        .whereNull("stock_total")
        .orWhereRaw("stock_total - stock_sold >= ?", [reserveQuantity]);
    })
    .update({
      stock_sold: runner.raw("stock_sold + ?", [reserveQuantity]),
      updated_by_event_user_id: updatedByEventUserId,
      updated_at: timestamp,
    });

  if (updatedRows === 0) {
    return null;
  }

  return findTicketTypeByIdWithRunner(runner, ticketTypeId);
}

export async function reserveTicketTypeStock(input, options = {}) {
  if (options.trx) {
    return reserveTicketTypeStockWithRunner(options.trx, input);
  }

  const db = getDatabaseConnection();

  return db.transaction(async (trx) =>
    reserveTicketTypeStockWithRunner(trx, input),
  );
}

export async function deleteTicketTypesByEventId(eventId, options = {}) {
  const db = options.trx || getDatabaseConnection();

  return db("ticket_types").where({ event_id: eventId }).delete();
}

export async function createTicketType(data, options = {}) {
  const db = getDatabaseConnection();
  const id = data.id || randomUUID();
  const row = toTicketTypeInsert(data, id);

  async function createWithRunner(runner) {
    await runner("ticket_types").insert(row);
    await replaceTicketTypeSessions(runner, id, data.sessionIds || []);
  }

  if (options.trx) {
    await createWithRunner(options.trx);
    return mapTicketTypeRow(row, data.sessionIds || []);
  }

  await db.transaction(async (trx) => {
    await createWithRunner(trx);
  });

  return mapTicketTypeRow(row, data.sessionIds || []);
}

export async function updateTicketTypeById(id, data, options = {}) {
  const db = getDatabaseConnection();

  async function updateWithRunner(runner) {
    await runner("ticket_types").where({ id }).update(toTicketTypeUpdate(data));

    if ("sessionIds" in data) {
      await replaceTicketTypeSessions(runner, id, data.sessionIds || []);
    }
  }

  if (options.trx) {
    await updateWithRunner(options.trx);
    return findTicketTypeByIdWithRunner(options.trx, id);
  }

  return db.transaction(async (trx) => {
    await updateWithRunner(trx);
    return findTicketTypeByIdWithRunner(trx, id);
  });
}

export async function deleteTicketTypeById(id, options = {}) {
  const db = options.trx || getDatabaseConnection();

  const existing = await findTicketTypeByIdWithRunner(db, id);

  if (!existing) {
    return null;
  }

  await db("ticket_types").where({ id }).delete();

  return existing;
}

async function releaseTicketTypeStockWithRunner(
  runner,
  { ticketTypeId, quantity, updatedByEventUserId = null },
) {
  const releaseQuantity = normalizeStockQuantity(quantity);
  const timestamp = now();

  const updatedRows = await runner("ticket_types")
    .where({ id: ticketTypeId })
    .update({
      stock_sold: runner.raw(
        "CASE WHEN stock_sold - ? < 0 THEN 0 ELSE stock_sold - ? END",
        [releaseQuantity, releaseQuantity],
      ),
      updated_by_event_user_id: updatedByEventUserId,
      updated_at: timestamp,
    });

  if (updatedRows === 0) {
    return null;
  }

  return findTicketTypeByIdWithRunner(runner, ticketTypeId);
}

export async function releaseTicketTypeStock(input, options = {}) {
  if (options.trx) {
    return releaseTicketTypeStockWithRunner(options.trx, input);
  }

  const db = getDatabaseConnection();

  return db.transaction(async (trx) =>
    releaseTicketTypeStockWithRunner(trx, input),
  );
}
