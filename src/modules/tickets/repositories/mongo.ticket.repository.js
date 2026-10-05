// src/modules/tickets/repositories/mongo.ticket.repository.js

import { Types } from "mongoose";

import { Ticket } from "../ticket.model.js";
import { TICKET_STATUS } from "../ticket.constants.js";

function applyOptions(query, options = {}) {
  if (options.session) query.session(options.session);
  if (options.select) query.select(options.select);
  if (options.lean) query.lean();
  return query;
}

function getSession(options = {}) {
  return options?.session || options?.trx?.session || null;
}
function applySecretSelection(query, options = {}) {
  if (options.includeSecrets) {
    query.select("+checkInTokenHash +encryptedCheckInToken");
  }

  return query;
}
function cleanExternal(value) {
  return String(value || "").trim();
}

export async function ensureTicketForOrderSlot(data, options = {}) {
  const query = Ticket.findOneAndUpdate(
    {
      orderId: data.orderId,
      orderItemIndex: data.orderItemIndex,
      orderItemUnitIndex: data.orderItemUnitIndex,
    },
    {
      $setOnInsert: data,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}

export async function findTicketById(id, options = {}) {
  const query = applySecretSelection(Ticket.findById(id), options);
  return applyOptions(query, options);
}

export async function findTicketByCode(ticketCode, options = {}) {
  const query = Ticket.findOne({ ticketCode });
  return applyOptions(query, options);
}

export async function findTicketByCheckInTokenHash(
  checkInTokenHash,
  options = {},
) {
  const query = Ticket.findOne({
    checkInTokenHash,
  });

  return applyOptions(query, options);
}

export async function findTicketsByOrderId(orderId, options = {}) {
  const query = applySecretSelection(
    Ticket.find({ orderId }).sort({ createdAt: 1 }),
    options,
  );

  return applyOptions(query, options);
}

export async function findTicketsByOrderIdAndBuyerIdentity(
  { orderId, buyerType, externalProvider, externalUserId },
  options = {},
) {
  const query = applySecretSelection(
    Ticket.find({
      orderId,

      buyerType,

      buyerExternalProvider: cleanExternal(externalProvider) || null,

      buyerExternalUserId: cleanExternal(externalUserId) || null,
    }).sort({
      createdAt: 1,
    }),
    options,
  );

  return applyOptions(query, options);
}

export async function findTicketByIdAndExternalBuyer(
  { ticketId, externalProvider, externalUserId },
  options = {},
) {
  const query = applySecretSelection(
    Ticket.findOne({
      _id: ticketId,
      buyerExternalProvider: cleanExternal(externalProvider),
      buyerExternalUserId: cleanExternal(externalUserId),
    }),
    options,
  );

  return applyOptions(query, options);
}

export async function listTicketsByExternalBuyer(
  {
    externalProvider,
    externalUserId,
    page = 1,
    limit = 20,
    status,
    eventId,
    orderId,
  },
  options = {},
) {
  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);

  const query = {
    buyerExternalProvider: cleanExternal(externalProvider),
    buyerExternalUserId: cleanExternal(externalUserId),
  };

  if (status) query.status = status;
  if (eventId) query.eventId = eventId;
  if (orderId) query.orderId = orderId;
  const [items, total] = await Promise.all([
    applyOptions(
      Ticket.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),
      {
        ...options,
        lean: options.lean !== false,
      },
    ),
    Ticket.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
  };
}
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTicketListQuery(input = {}) {
  const queryObject = {};

  if (input.eventId) queryObject.eventId = input.eventId;
  if (input.orderId) queryObject.orderId = input.orderId;
  if (input.ticketTypeId) queryObject.ticketTypeId = input.ticketTypeId;
  if (input.status) queryObject.status = input.status;

  if (input.externalProvider && input.externalUserId) {
    queryObject.buyerExternalProvider = cleanExternal(input.externalProvider);
    queryObject.buyerExternalUserId = cleanExternal(input.externalUserId);
  }

  const cleanSearch = String(input.search || "").trim();

  if (cleanSearch) {
    const regex = new RegExp(escapeRegex(cleanSearch), "i");

    queryObject.$or = [
      { ticketCode: regex },
      { buyerEmailSnapshot: regex },
      { buyerFirstNameSnapshot: regex },
      { buyerLastNameSnapshot: regex },
      { buyerDisplayNameSnapshot: regex },
      { buyerExternalUserId: regex },
    ];
  }

  return queryObject;
}
function toAggregateObjectId(value, fieldName) {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  const normalized = String(value ?? "").trim();

  if (!Types.ObjectId.isValid(normalized)) {
    throw new TypeError(
      `Cannot build ticket aggregation with invalid ${fieldName}.`,
    );
  }

  return new Types.ObjectId(normalized);
}

function buildTicketAggregateMatch(input = {}) {
  const match = buildTicketListQuery(input);

  for (const fieldName of ["eventId", "orderId", "ticketTypeId"]) {
    if (match[fieldName] !== undefined) {
      match[fieldName] = toAggregateObjectId(match[fieldName], fieldName);
    }
  }

  return match;
}
function normalizeTicketSort({
  sortBy = "createdAt",
  sortOrder = "desc",
} = {}) {
  const allowedSortFields = new Set([
    "createdAt",
    "checkedInAt",
    "ticketCode",
    "buyerEmailSnapshot",
    "status",
  ]);

  const field = allowedSortFields.has(sortBy) ? sortBy : "createdAt";
  const direction = sortOrder === "asc" ? 1 : -1;

  return {
    [field]: direction,
    _id: direction,
  };
}

function mapStatusSummary(rows = []) {
  return rows.reduce(
    (summary, row) => {
      const status = row?._id;
      const count = Number(row?.count || 0);

      if (status === TICKET_STATUS.ACTIVE) {
        summary.active = count;
      }

      if (status === TICKET_STATUS.CHECKED_IN) {
        summary.checkedIn = count;
      }

      if (status === TICKET_STATUS.CANCELLED) {
        summary.cancelled = count;
      }

      if (status === TICKET_STATUS.REFUNDED) {
        summary.refunded = count;
      }

      return summary;
    },
    {
      active: 0,
      checkedIn: 0,
      cancelled: 0,
      refunded: 0,
    },
  );
}

export async function listTickets(input = {}, options = {}) {
  const queryObject = {};

  if (input.eventId) queryObject.eventId = input.eventId;
  if (input.orderId) queryObject.orderId = input.orderId;
  if (input.ticketTypeId) queryObject.ticketTypeId = input.ticketTypeId;
  if (input.status) queryObject.status = input.status;

  if (input.externalProvider && input.externalUserId) {
    queryObject.buyerExternalProvider = cleanExternal(input.externalProvider);
    queryObject.buyerExternalUserId = cleanExternal(input.externalUserId);
  }

  const query = Ticket.find(queryObject).sort({ createdAt: -1 });

  return applyOptions(query, {
    ...options,
    lean: options.lean !== false,
  });
}

export async function listTicketsPaginated(input = {}, options = {}) {
  const numericPage = Math.max(1, Number(input.page) || 1);
  const numericLimit = Math.min(100, Math.max(1, Number(input.limit) || 20));

  const queryObject = buildTicketListQuery(input);

  const aggregateMatch = buildTicketAggregateMatch(input);

  const sort = normalizeTicketSort(input);

  const [items, total, summaryRows] = await Promise.all([
    applyOptions(
      Ticket.find(queryObject)
        .sort(sort)
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),
      {
        ...options,
        lean: options.lean !== false,
      },
    ),
    Ticket.countDocuments(queryObject),
    Ticket.aggregate([
      { $match: aggregateMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
    summary: {
      total,
      ...mapStatusSummary(summaryRows),
    },
  };
}
export async function countTicketsByEventId(eventId, options = {}) {
  const query = Ticket.countDocuments({ eventId });

  if (options.session) {
    query.session(options.session);
  }

  return query;
}
export async function updateTicketById(id, data, options = {}) {
  const query = Ticket.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function updateTicketBuyerSnapshotsByOrderId(
  orderId,
  data = {},
  options = {},
) {
  const update = {
    buyerEmailSnapshot: data.buyerEmailSnapshot || "",
    buyerFirstNameSnapshot: data.buyerFirstNameSnapshot || "",
    buyerLastNameSnapshot: data.buyerLastNameSnapshot || "",
    buyerDisplayNameSnapshot: data.buyerDisplayNameSnapshot || "",
    ticketPdfStorageKey: null,
    ticketPdfStorageTarget: null,
    ticketPdfGeneratedAt: null,
    updatedByEventUserId: data.updatedByEventUserId || null,
  };

  const buyerResult = await Ticket.updateMany(
    {
      orderId,
    },
    {
      $set: update,
    },
    {
      session: getSession(options),
      runValidators: true,
    },
  );

  const holderResult = await Ticket.updateMany(
    {
      orderId,
      holderType: "buyer",
    },
    {
      $set: {
        holderEmailSnapshot: data.buyerEmailSnapshot || "",
        holderFirstNameSnapshot: data.buyerFirstNameSnapshot || "",
        holderLastNameSnapshot: data.buyerLastNameSnapshot || "",
        holderDisplayNameSnapshot: data.buyerDisplayNameSnapshot || "",
        updatedByEventUserId: data.updatedByEventUserId || null,
      },
    },
    {
      session: getSession(options),
      runValidators: true,
    },
  );

  return {
    matchedTickets: buyerResult.matchedCount || 0,
    updatedTickets: buyerResult.modifiedCount || 0,
    updatedBuyerHolders: holderResult.modifiedCount || 0,
  };
}
export async function cancelTicketByIdIfActive(id, data = {}, options = {}) {
  const query = Ticket.findOneAndUpdate(
    {
      _id: id,
      status: {
        $ne: TICKET_STATUS.CANCELLED,
      },
    },
    {
      $set: {
        status: TICKET_STATUS.CANCELLED,
        cancelledAt: data.cancelledAt || new Date(),
        cancellationReason: data.cancellationReason || null,
        updatedByEventUserId: data.updatedByEventUserId || null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function cancelTicketsByOrderId(orderId, data = {}, options = {}) {
  return Ticket.updateMany(
    {
      orderId,
      status: {
        $ne: TICKET_STATUS.CANCELLED,
      },
    },
    {
      $set: {
        status: data.status || TICKET_STATUS.CANCELLED,
        cancelledAt: data.cancelledAt || new Date(),
        cancellationReason: data.cancellationReason || null,
        updatedByEventUserId: data.updatedByEventUserId || null,
      },
    },
    {
      session: getSession(options),
    },
  );
}

export async function markTicketCheckedIn(id, data = {}, options = {}) {
  return updateTicketById(
    id,
    {
      status: TICKET_STATUS.CHECKED_IN,
      checkedInAt: data.checkedInAt || new Date(),
      checkedInByEventUserId: data.checkedInByEventUserId || null,
      checkInTokenLastUsedAt: data.checkInTokenLastUsedAt || new Date(),
      updatedByEventUserId: data.updatedByEventUserId || null,
    },
    options,
  );
}

export async function markTicketCheckedOut(id, data = {}, options = {}) {
  return updateTicketById(
    id,
    {
      status: TICKET_STATUS.ACTIVE,
      checkedInAt: null,
      checkedInByEventUserId: null,
      updatedByEventUserId: data.updatedByEventUserId || null,
    },
    options,
  );
}
export async function invalidateTicketPdfDocumentsByEventId(
  eventId,
  data = {},
  options = {},
) {
  const result = await Ticket.updateMany(
    {
      eventId,

      $or: [
        {
          ticketPdfStorageKey: {
            $ne: null,
          },
        },
        {
          ticketPdfStorageTarget: {
            $ne: null,
          },
        },
        {
          ticketPdfGeneratedAt: {
            $ne: null,
          },
        },
      ],
    },
    {
      $set: {
        ticketPdfStorageKey: null,
        ticketPdfStorageTarget: null,
        ticketPdfGeneratedAt: null,
        updatedByEventUserId: data.updatedByEventUserId || null,
      },
    },
    {
      session: getSession(options),
      runValidators: true,
    },
  );

  return {
    matchedTickets: Number(result.matchedCount || 0),
    invalidatedTickets: Number(result.modifiedCount || 0),
  };
}
export async function setTicketPdfDocument(id, data = {}, options = {}) {
  return updateTicketById(
    id,
    {
      ticketPdfStorageKey: data.ticketPdfStorageKey || null,

      ticketPdfStorageTarget: data.ticketPdfStorageTarget || null,

      ticketPdfGeneratedAt: data.ticketPdfGeneratedAt || new Date(),

      updatedByEventUserId: data.updatedByEventUserId || null,
    },
    options,
  );
}

export async function updateTicketDepositRefund(id, data = {}, options = {}) {
  return updateTicketById(id, data, options);
}
export async function findDistinctOrderIdsForActiveTicketsByEventId(
  eventId,
  options = {},
) {
  const orderIds = await Ticket.distinct("orderId", {
    eventId,
    status: TICKET_STATUS.ACTIVE,
  }).session(getSession(options));

  return orderIds.filter(Boolean);
}
export async function findDistinctOrderIdsForParticipantTicketsByEventId(
  eventId,
  options = {},
) {
  const orderIds = await Ticket.distinct("orderId", {
    eventId,

    status: {
      $in: [TICKET_STATUS.ACTIVE, TICKET_STATUS.CHECKED_IN],
    },
  }).session(getSession(options));

  return orderIds.filter(Boolean);
}
