import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import * as mongoTicketTypeRepository from "./mongo.ticketType.repository.js";
import * as sqlTicketTypeRepository from "./sql.ticketType.repository.js";
import { getDatabaseProvider } from "../../database/database.service.js";

function getTicketTypeRepositoryContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoTicketTypeRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlTicketTypeRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function normalizeRequiredTicketTypeId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot normalize TicketType without ${fieldName}.`);
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id || id === "[object Object]") {
    throw new TypeError(`Cannot normalize TicketType without ${fieldName}.`);
  }

  return id;
}

function normalizeOptionalTicketTypeId(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredTicketTypeId(value, fieldName);
}

function toCanonicalTicketTypeRecord(ticketType, provider) {
  if (!ticketType) {
    return null;
  }

  const record =
    typeof ticketType.toObject === "function"
      ? ticketType.toObject()
      : ticketType;

  const rawId = provider === DATABASE_PROVIDER.MONGODB ? record._id : record.id;

  const {
    _id,
    __v,
    id: ignoredId,
    eventId,
    sessionIds,
    createdByEventUserId,
    updatedByEventUserId,
    ...fields
  } = record;

  return {
    id: normalizeRequiredTicketTypeId(rawId, "id"),

    ...fields,

    eventId: normalizeRequiredTicketTypeId(eventId, "eventId"),

    sessionIds: (sessionIds || []).map((sessionId) =>
      normalizeRequiredTicketTypeId(sessionId, "sessionId"),
    ),

    ...(createdByEventUserId !== undefined
      ? {
          createdByEventUserId: normalizeOptionalTicketTypeId(
            createdByEventUserId,
            "createdByEventUserId",
          ),
        }
      : {}),

    ...(updatedByEventUserId !== undefined
      ? {
          updatedByEventUserId: normalizeOptionalTicketTypeId(
            updatedByEventUserId,
            "updatedByEventUserId",
          ),
        }
      : {}),
  };
}

export async function insertManyTicketTypes(items, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketTypes = await repository.insertManyTicketTypes(items, options);

  return (ticketTypes || []).map((ticketType) =>
    toCanonicalTicketTypeRecord(ticketType, provider),
  );
}

export async function findTicketTypeById(id, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.findTicketTypeById(id, options);

  return toCanonicalTicketTypeRecord(ticketType, provider);
}

export async function findTicketTypeByIdAndEventId(input, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.findTicketTypeByIdAndEventId(
    input,
    options,
  );

  return toCanonicalTicketTypeRecord(ticketType, provider);
}

export async function findTicketTypesByEventId(eventId, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketTypes = await repository.findTicketTypesByEventId(
    eventId,
    options,
  );

  return (ticketTypes || []).map((ticketType) =>
    toCanonicalTicketTypeRecord(ticketType, provider),
  );
}

export async function listTicketTypes(filters, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketTypes = await repository.listTicketTypes(filters, options);

  return (ticketTypes || []).map((ticketType) =>
    toCanonicalTicketTypeRecord(ticketType, provider),
  );
}

export async function aggregateTicketTypeSalesByEventIds(eventIds) {
  const { repository } = getTicketTypeRepositoryContext();

  const rows = await repository.aggregateTicketTypeSalesByEventIds(eventIds);

  return (rows || []).map((row) => ({
    eventId: normalizeRequiredTicketTypeId(row.eventId, "eventId"),
    ticketsSold: Number(row.ticketsSold || 0),
  }));
}

export async function reserveTicketTypeStock(input, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.reserveTicketTypeStock(input, options);

  return toCanonicalTicketTypeRecord(ticketType, provider);
}

export async function deleteTicketTypesByEventId(eventId, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const result = await repository.deleteTicketTypesByEventId(eventId, options);

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return Number(result?.deletedCount || 0);
  }

  return Number(result || 0);
}

export async function createTicketType(data, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.createTicketType(data, options);

  return toCanonicalTicketTypeRecord(ticketType, provider);
}

export async function updateTicketTypeById(id, data, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.updateTicketTypeById(id, data, options);

  return toCanonicalTicketTypeRecord(ticketType, provider);
}

export async function deleteTicketTypeById(id, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.deleteTicketTypeById(id, options);

  return toCanonicalTicketTypeRecord(ticketType, provider);
}

export async function releaseTicketTypeStock(input, options) {
  const { provider, repository } = getTicketTypeRepositoryContext();

  const ticketType = await repository.releaseTicketTypeStock(input, options);

  return toCanonicalTicketTypeRecord(ticketType, provider);
}
