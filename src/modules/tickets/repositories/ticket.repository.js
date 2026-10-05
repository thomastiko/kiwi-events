// src/modules/tickets/repositories/ticket.repository.js

import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import * as mongoTicketRepository from "./mongo.ticket.repository.js";
import * as sqlTicketRepository from "./sql.ticket.repository.js";
import { getDatabaseProvider } from "../../database/database.service.js";

function toPlainTicketRecord(ticket) {
  if (!ticket) {
    throw new TypeError("Cannot normalize a missing ticket repository result.");
  }

  if (typeof ticket.toObject === "function") {
    return ticket.toObject();
  }

  return ticket;
}

function normalizeRepositoryTicketId(value, provider) {
  const id = String(value ?? "").trim();

  if (!id || id === "[object Object]") {
    throw new TypeError(`Cannot normalize an invalid ${provider} ticket id.`);
  }

  return id;
}

function toCanonicalTicketRecord(ticket, provider) {
  const record = toPlainTicketRecord(ticket);

  if (provider === DATABASE_PROVIDER.MONGODB) {
    const { _id, __v, id: ignoredId, ...fields } = record;

    return {
      ...fields,

      id: normalizeRepositoryTicketId(_id, "MongoDB"),
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    const { _id, __v, ...fields } = record;

    return {
      ...fields,

      id: normalizeRepositoryTicketId(fields.id, "SQL"),
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}
async function normalizeOptionalTicketResult(operation) {
  const provider = getDatabaseProvider();
  const ticket = await operation();

  if (!ticket) {
    return null;
  }

  return toCanonicalTicketRecord(ticket, provider);
}
function getTicketRepository() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return mongoTicketRepository;
  }

  if (isSqlDatabaseProvider(provider)) {
    return sqlTicketRepository;
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

export async function ensureTicketForOrderSlot(data, options = {}) {
  const provider = getDatabaseProvider();

  const ticket = await getTicketRepository().ensureTicketForOrderSlot(
    data,
    options,
  );

  if (!ticket) {
    return null;
  }

  return toCanonicalTicketRecord(ticket, provider);
}

export async function findTicketById(id, options = {}) {
  const provider = getDatabaseProvider();

  const ticket = await getTicketRepository().findTicketById(id, options);

  if (!ticket) {
    return null;
  }

  return toCanonicalTicketRecord(ticket, provider);
}

export function findTicketByCode(ticketCode, options = {}) {
  return normalizeOptionalTicketResult(() =>
    getTicketRepository().findTicketByCode(ticketCode, options),
  );
}

export function findTicketByCheckInTokenHash(checkInTokenHash, options = {}) {
  return normalizeOptionalTicketResult(() =>
    getTicketRepository().findTicketByCheckInTokenHash(
      checkInTokenHash,
      options,
    ),
  );
}

export async function findTicketsByOrderId(orderId, options = {}) {
  const provider = getDatabaseProvider();

  const tickets = await getTicketRepository().findTicketsByOrderId(
    orderId,
    options,
  );

  return (tickets || []).map((ticket) =>
    toCanonicalTicketRecord(ticket, provider),
  );
}

export async function findTicketsByOrderIdAndBuyerIdentity(
  input,
  options = {},
) {
  const provider = getDatabaseProvider();

  const tickets =
    await getTicketRepository().findTicketsByOrderIdAndBuyerIdentity(
      input,
      options,
    );

  return (tickets || []).map((ticket) =>
    toCanonicalTicketRecord(ticket, provider),
  );
}

export async function findTicketByIdAndExternalBuyer(input, options = {}) {
  const provider = getDatabaseProvider();

  const ticket = await getTicketRepository().findTicketByIdAndExternalBuyer(
    input,
    options,
  );

  if (!ticket) {
    return null;
  }

  return toCanonicalTicketRecord(ticket, provider);
}

export async function listTicketsByExternalBuyer(input, options = {}) {
  const provider = getDatabaseProvider();

  const result = await getTicketRepository().listTicketsByExternalBuyer(
    input,
    options,
  );

  return {
    ...result,

    items: (result.items || []).map((ticket) =>
      toCanonicalTicketRecord(ticket, provider),
    ),
  };
}
export async function listTicketsPaginated(input = {}, options = {}) {
  const provider = getDatabaseProvider();

  const result = await getTicketRepository().listTicketsPaginated(
    input,
    options,
  );

  return {
    ...result,

    items: (result.items || []).map((ticket) =>
      toCanonicalTicketRecord(ticket, provider),
    ),
  };
}
export function listTickets(input = {}, options = {}) {
  return getTicketRepository().listTickets(input, options);
}

export function countTicketsByEventId(eventId, options = {}) {
  return getTicketRepository().countTicketsByEventId(eventId, options);
}
export function updateTicketById(id, data, options = {}) {
  return getTicketRepository().updateTicketById(id, data, options);
}
export function updateTicketBuyerSnapshotsByOrderId(
  orderId,
  data = {},
  options = {},
) {
  return getTicketRepository().updateTicketBuyerSnapshotsByOrderId(
    orderId,
    data,
    options,
  );
}
export function cancelTicketByIdIfActive(id, data = {}, options = {}) {
  return normalizeOptionalTicketResult(() =>
    getTicketRepository().cancelTicketByIdIfActive(id, data, options),
  );
}
export function cancelTicketsByOrderId(orderId, data = {}, options = {}) {
  return getTicketRepository().cancelTicketsByOrderId(orderId, data, options);
}

export function markTicketCheckedIn(id, data = {}, options = {}) {
  return normalizeOptionalTicketResult(() =>
    getTicketRepository().markTicketCheckedIn(id, data, options),
  );
}

export function markTicketCheckedOut(id, data = {}, options = {}) {
  return normalizeOptionalTicketResult(() =>
    getTicketRepository().markTicketCheckedOut(id, data, options),
  );
}
export function invalidateTicketPdfDocumentsByEventId(
  eventId,
  data = {},
  options = {},
) {
  return getTicketRepository().invalidateTicketPdfDocumentsByEventId(
    eventId,
    data,
    options,
  );
}
export function setTicketPdfDocument(id, data = {}, options = {}) {
  return getTicketRepository().setTicketPdfDocument(id, data, options);
}

export function updateTicketDepositRefund(id, data = {}, options = {}) {
  return normalizeOptionalTicketResult(() =>
    getTicketRepository().updateTicketDepositRefund(id, data, options),
  );
}
export function findDistinctOrderIdsForActiveTicketsByEventId(
  eventId,
  options = {},
) {
  return getTicketRepository().findDistinctOrderIdsForActiveTicketsByEventId(
    eventId,
    options,
  );
}
export function findDistinctOrderIdsForParticipantTicketsByEventId(
  eventId,
  options = {},
) {
  return getTicketRepository().findDistinctOrderIdsForParticipantTicketsByEventId(
    eventId,
    options,
  );
}
