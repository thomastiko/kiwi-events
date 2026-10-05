import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";

function getDb(options = {}) {
  return options.trx || options.knex || getDatabaseConnection();
}

function now() {
  return new Date();
}

function parseBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function mapGroupRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    discountPercent: Number(row.discount_percent),
    isActive: parseBoolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCodeRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    eventId: row.event_id,
    groupId: row.group_id,
    code: row.code,
    isActive: parseBoolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDiscountCodeGroup(data, options = {}) {
  const db = getDb(options);
  const timestamp = now();

  const row = {
    id: data.id || randomUUID(),
    event_id: data.eventId,
    name: data.name,
    discount_percent: Number(data.discountPercent),
    is_active: data.isActive === undefined ? true : Boolean(data.isActive),
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db("discount_code_groups").insert(row);

  return mapGroupRow(row);
}

export async function findDiscountCodeGroupById(id, options = {}) {
  const db = getDb(options);

  const row = await db("discount_code_groups")
    .where({
      id,
    })
    .first();

  return mapGroupRow(row);
}

export async function findDiscountCodeGroupByIdAndEventId(
  { groupId, eventId },
  options = {},
) {
  const db = getDb(options);

  const row = await db("discount_code_groups")
    .where({
      id: groupId,
      event_id: eventId,
    })
    .first();

  return mapGroupRow(row);
}

export async function listDiscountCodeGroupsByEventId(eventId, options = {}) {
  const db = getDb(options);

  const rows = await db("discount_code_groups")
    .where({
      event_id: eventId,
    })
    .orderBy("created_at", "desc");

  return rows.map(mapGroupRow);
}

export async function updateDiscountCodeGroupById(id, data, options = {}) {
  const db = getDb(options);

  const update = {
    updated_at: now(),
  };

  if ("name" in data) {
    update.name = data.name;
  }

  if ("discountPercent" in data) {
    update.discount_percent = Number(data.discountPercent);
  }

  if ("isActive" in data) {
    update.is_active = Boolean(data.isActive);
  }

  const updatedRows = await db("discount_code_groups")
    .where({
      id,
    })
    .update(update);

  if (updatedRows === 0) {
    return null;
  }

  return findDiscountCodeGroupById(id, {
    ...options,
    knex: db,
  });
}

export async function deleteDiscountCodeGroupById(id, options = {}) {
  const db = getDb(options);

  const existing = await db("discount_code_groups")
    .where({
      id,
    })
    .first();

  if (!existing) {
    return null;
  }

  await db("discount_code_groups")
    .where({
      id,
    })
    .delete();

  return mapGroupRow(existing);
}

export async function insertDiscountCodes(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const db = getDb(options);
  const timestamp = now();

  const rows = items.map((item) => ({
    id: item.id || randomUUID(),
    event_id: item.eventId,
    group_id: item.groupId,
    code: item.code,
    is_active: item.isActive === undefined ? true : Boolean(item.isActive),
    created_at: timestamp,
    updated_at: timestamp,
  }));

  await db("discount_codes").insert(rows);

  return rows.map(mapCodeRow);
}

export async function findDiscountCodeById(id, options = {}) {
  const db = getDb(options);

  const row = await db("discount_codes")
    .where({
      id,
    })
    .first();

  return mapCodeRow(row);
}

export async function findDiscountCodeByEventIdAndCode(
  { eventId, code },
  options = {},
) {
  const db = getDb(options);

  const row = await db("discount_codes")
    .where({
      event_id: eventId,
      code,
    })
    .first();

  return mapCodeRow(row);
}
export async function findDiscountCodesByEventIdAndCodes(
  { eventId, codes },
  options = {},
) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return [];
  }

  const db = getDb(options);

  const rows = await db("discount_codes")
    .where({
      event_id: eventId,
    })
    .whereIn("code", codes);

  return rows.map(mapCodeRow);
}
export async function listDiscountCodesByGroupId(groupId, options = {}) {
  const db = getDb(options);

  const rows = await db("discount_codes")
    .where({
      group_id: groupId,
    })
    .orderBy("created_at", "asc");

  return rows.map(mapCodeRow);
}

export async function updateDiscountCodeById(id, data, options = {}) {
  const db = getDb(options);

  const update = {
    updated_at: now(),
  };

  if ("code" in data) {
    update.code = data.code;
  }

  if ("isActive" in data) {
    update.is_active = Boolean(data.isActive);
  }

  const updatedRows = await db("discount_codes")
    .where({
      id,
    })
    .update(update);

  if (updatedRows === 0) {
    return null;
  }

  return findDiscountCodeById(id, {
    ...options,
    knex: db,
  });
}

export async function deleteDiscountCodeById(id, options = {}) {
  const db = getDb(options);

  const existing = await db("discount_codes")
    .where({
      id,
    })
    .first();

  if (!existing) {
    return null;
  }

  await db("discount_codes")
    .where({
      id,
    })
    .delete();

  return mapCodeRow(existing);
}

export async function deleteDiscountCodeDataByEventId(eventId, options = {}) {
  const db = getDb(options);

  await db("discount_code_groups")
    .where({
      event_id: eventId,
    })
    .delete();
}
