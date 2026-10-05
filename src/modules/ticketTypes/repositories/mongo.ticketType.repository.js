// src/modules/ticketTypes/repositories/mongo.ticketType.repository.js

import mongoose from "mongoose";
import { TicketType } from "../ticketType.model.js";
import { TICKET_TYPE_STATUS } from "../ticketType.constants.js";

function toMongoEventIds(eventIds = []) {
  return eventIds.map((eventId) => {
    if (eventId instanceof mongoose.Types.ObjectId) {
      return eventId;
    }

    if (mongoose.Types.ObjectId.isValid(eventId)) {
      return new mongoose.Types.ObjectId(eventId);
    }

    return eventId;
  });
}

export async function insertManyTicketTypes(items, options = {}) {
  return TicketType.insertMany(items, {
    session: options.session,
  });
}

export async function findTicketTypeById(id, options = {}) {
  const query = TicketType.findById(id);

  if (options.lean) query.lean();
  if (options.session) query.session(options.session);

  return query;
}

export async function findTicketTypeByIdAndEventId(
  { ticketTypeId, eventId },
  options = {},
) {
  const query = TicketType.findOne({
    _id: ticketTypeId,
    eventId,
  });

  if (options.lean) query.lean();
  if (options.session) query.session(options.session);

  return query;
}

export async function findTicketTypesByEventId(eventId, options = {}) {
  const query = TicketType.find({ eventId }).sort({
    sortOrder: 1,
    createdAt: -1,
  });

  if (options.lean) query.lean();
  if (options.session) query.session(options.session);

  return query;
}

export async function listTicketTypes(filters = {}, options = {}) {
  const queryObject = {};

  if (filters.eventId) {
    queryObject.eventId = filters.eventId;
  } else if (Array.isArray(filters.eventIds)) {
    queryObject.eventId = {
      $in: toMongoEventIds(filters.eventIds),
    };
  }

  if (filters.status) {
    queryObject.status = filters.status;
  }

  const query = TicketType.find(queryObject).sort({
    sortOrder: 1,
    createdAt: -1,
  });

  if (options.lean !== false) query.lean();
  if (options.session) query.session(options.session);

  return query;
}

export async function aggregateTicketTypeSalesByEventIds(eventIds) {
  return TicketType.aggregate([
    {
      $match: {
        eventId: {
          $in: toMongoEventIds(eventIds),
        },
      },
    },
    {
      $group: {
        _id: "$eventId",
        ticketsSold: { $sum: { $ifNull: ["$stockSold", 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        eventId: {
          $toString: "$_id",
        },
        ticketsSold: 1,
      },
    },
  ]);
}

export async function reserveTicketTypeStock(
  { ticketTypeId, eventId, quantity, updatedByEventUserId = null },
  options = {},
) {
  const ticketType = await findTicketTypeByIdAndEventId(
    {
      ticketTypeId,
      eventId,
    },
    {
      session: options.session,
    },
  );

  if (!ticketType) {
    return null;
  }

  const stockGuard =
    ticketType.stockTotal != null
      ? {
          $expr: {
            $gte: [{ $subtract: ["$stockTotal", "$stockSold"] }, quantity],
          },
        }
      : {};

  return TicketType.findOneAndUpdate(
    {
      _id: ticketTypeId,
      eventId,
      status: TICKET_TYPE_STATUS.ACTIVE,
      ...stockGuard,
    },
    {
      $inc: {
        stockSold: quantity,
      },
      $set: {
        updatedByEventUserId,
      },
    },
    {
      new: true,
      runValidators: true,
      session: options.session,
    },
  );
}

export async function deleteTicketTypesByEventId(eventId, options = {}) {
  const query = TicketType.deleteMany({ eventId });

  if (options.session) query.session(options.session);

  return query;
}

export async function createTicketType(data, options = {}) {
  if (options.session) {
    const [ticketType] = await TicketType.create([data], {
      session: options.session,
    });

    return ticketType;
  }

  return TicketType.create(data);
}

export async function updateTicketTypeById(id, data, options = {}) {
  const updated = await TicketType.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
    session: options.session,
  });

  if (!updated) {
    return null;
  }

  if (options.lean) {
    return updated.toObject();
  }

  return updated;
}

export async function releaseTicketTypeStock(
  { ticketTypeId, quantity, updatedByEventUserId = null },
  options = {},
) {
  const update = {
    $inc: {
      stockSold: -Math.max(0, Number(quantity || 0)),
    },
    $set: {
      updatedByEventUserId,
    },
  };

  const query = TicketType.findByIdAndUpdate(ticketTypeId, update, {
    new: true,
    runValidators: true,
    session: options.session,
  });

  if (options.lean) query.lean();

  return query;
}

export async function deleteTicketTypeById(id, options = {}) {
  const ticketType = await findTicketTypeById(id, options);

  if (!ticketType) {
    return null;
  }

  await ticketType.deleteOne(
    options.session ? { session: options.session } : undefined,
  );

  return ticketType;
}
