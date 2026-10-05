import { TicketTemplate } from "../ticketTemplate.model.js";

function getSession(options = {}) {
  return options?.session || options?.trx?.session || null;
}

function applyOptions(query, options = {}) {
  if (options.lean) {
    query.lean();
  }

  return query;
}

export function findTicketTemplateByEventId(eventId, options = {}) {
  const query = TicketTemplate.findOne({
    eventId,
  }).session(getSession(options));

  return applyOptions(query, options);
}

export function upsertTicketTemplateByEventId(
  eventId,
  data = {},
  options = {},
) {
  const query = TicketTemplate.findOneAndUpdate(
    {
      eventId,
    },

    {
      $set: {
        schemaVersion: data.schemaVersion,

        template: data.template,

        updatedByEventUserId: data.updatedByEventUserId || null,
      },

      $setOnInsert: {
        createdByEventUserId: data.createdByEventUserId || null,
      },

      $inc: {
        revision: 1,
      },
    },

    {
      new: true,
      upsert: true,
      runValidators: true,

      setDefaultsOnInsert: false,

      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}

export function deleteTicketTemplateByEventId(eventId, options = {}) {
  const query = TicketTemplate.findOneAndDelete({
    eventId,
  }).session(getSession(options));

  return applyOptions(query, options);
}
