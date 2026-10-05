import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";

import { getDatabaseProvider } from "../../database/database.service.js";

import * as mongoRepository from "./mongo.ticketTemplate.repository.js";
import * as sqlRepository from "./sql.ticketTemplate.repository.js";

function getContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function normalizeId(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new TypeError(`Invalid ${fieldName}.`);
  }

  return normalized;
}

function normalizeRecord(record, provider) {
  if (!record) {
    return null;
  }

  const value =
    typeof record.toObject === "function" ? record.toObject() : record;

  const id =
    provider === DATABASE_PROVIDER.MONGODB
      ? normalizeId(value._id, "ticket template id")
      : normalizeId(value.id, "ticket template id");

  const {
    _id,
    __v,
    id: ignoredId,

    eventId,

    createdByEventUserId,
    updatedByEventUserId,

    ...fields
  } = value;

  return {
    id,

    eventId: normalizeId(eventId, "event id"),

    ...fields,

    createdByEventUserId: normalizeId(
      createdByEventUserId,
      "createdByEventUserId",
    ),

    updatedByEventUserId: normalizeId(
      updatedByEventUserId,
      "updatedByEventUserId",
    ),
  };
}

export async function findTicketTemplateByEventId(eventId, options = {}) {
  const { provider, repository } = getContext();

  return normalizeRecord(
    await repository.findTicketTemplateByEventId(eventId, options),

    provider,
  );
}

export async function upsertTicketTemplateByEventId(
  eventId,
  data,
  options = {},
) {
  const { provider, repository } = getContext();

  return normalizeRecord(
    await repository.upsertTicketTemplateByEventId(eventId, data, options),

    provider,
  );
}

export async function deleteTicketTemplateByEventId(eventId, options = {}) {
  const { provider, repository } = getContext();

  return normalizeRecord(
    await repository.deleteTicketTemplateByEventId(eventId, options),

    provider,
  );
}
