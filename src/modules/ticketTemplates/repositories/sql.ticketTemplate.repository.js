import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";

function getDb(options = {}) {
  return options.trx || options.knex || getDatabaseConnection();
}

function now() {
  return new Date();
}

function parseJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  return JSON.parse(value);
}

function mapRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    eventId: row.event_id,

    schemaVersion: Number(row.schema_version),

    revision: Number(row.revision),

    template: parseJson(row.template),

    createdByEventUserId: row.created_by_event_user_id || null,

    updatedByEventUserId: row.updated_by_event_user_id || null,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  };
}

export async function findTicketTemplateByEventId(eventId, options = {}) {
  const db = getDb(options);

  const row = await db("ticket_templates")
    .where({
      event_id: eventId,
    })
    .first();

  return mapRow(row);
}

export async function upsertTicketTemplateByEventId(
  eventId,
  data = {},
  options = {},
) {
  const db = getDb(options);
  const timestamp = now();

  const row = {
    id: randomUUID(),

    event_id: eventId,

    schema_version: data.schemaVersion,

    revision: 1,

    template: JSON.stringify(data.template),

    created_by_event_user_id: data.createdByEventUserId || null,

    updated_by_event_user_id: data.updatedByEventUserId || null,

    created_at: timestamp,

    updated_at: timestamp,
  };

  await db("ticket_templates")
    .insert(row)
    .onConflict("event_id")
    .merge({
      schema_version: data.schemaVersion,

      revision: db.raw("revision + 1"),

      template: JSON.stringify(data.template),

      updated_by_event_user_id: data.updatedByEventUserId || null,

      updated_at: timestamp,
    });

  return mapRow(
    await db("ticket_templates")
      .where({
        event_id: eventId,
      })
      .first(),
  );
}

export async function deleteTicketTemplateByEventId(eventId, options = {}) {
  const db = getDb(options);

  const existing = await db("ticket_templates")
    .where({
      event_id: eventId,
    })
    .first();

  if (!existing) {
    return null;
  }

  await db("ticket_templates")
    .where({
      event_id: eventId,
    })
    .delete();

  return mapRow(existing);
}
