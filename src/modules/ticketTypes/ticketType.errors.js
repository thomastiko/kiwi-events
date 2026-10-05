import { AppError } from "../../core/errors/AppError.js";

export function ticketTypeFeatureDisabledError({
  code,
  message,
  featureName,
  field = null,
}) {
  return AppError.forbidden(message, {
    code,
    title: "Ticket feature disabled",
    action:
      "Enable the required ticketing feature in the kiwi-events settings before using this ticket type configuration.",
    fields: field
      ? [
          {
            path: `body.${field}`,
            message,
          },
        ]
      : [],
    details: {
      featureName,
    },
  });
}

export function ticketTypeAccessRequiredError() {
  return AppError.forbidden(
    "No active kiwi-events user was found for this ticket type action.",
    {
      code: "TICKET_TYPE_ACCESS_REQUIRED",

      title: "Ticket type access required",

      action:
        "Log in with an active kiwi-events user that has event management access.",
    },
  );
}

export function ticketTypeManageForbiddenError() {
  return AppError.forbidden(
    "You do not have permission to manage ticket types for this event.",
    {
      code: "TICKET_TYPE_MANAGE_FORBIDDEN",

      title: "Ticket type management not allowed",

      action: "Ask an admin to grant event management access for this event.",
    },
  );
}

export function ticketTypeDeleteBlockedBySalesError({
  ticketTypeId,
  eventId,
  stockSold,
} = {}) {
  return AppError.conflict(
    "Ticket type cannot be deleted because tickets have already been sold.",
    {
      code: "TICKET_TYPE_DELETE_BLOCKED_BY_SALES",
      title: "Ticket type cannot be deleted",
      action: "Set the ticket type status to inactive instead of deleting it.",
      fields: [
        {
          path: "params.id",
          message: "This ticket type has sales and cannot be deleted.",
        },
      ],
      details: {
        ticketTypeId,
        eventId,
        stockSold: Number(stockSold || 0),
      },
    },
  );
}
export function relatedEventNotFoundError(eventId) {
  return AppError.notFound("Related event not found.", {
    code: "TICKET_TYPE_EVENT_NOT_FOUND",
    title: "Related event not found",
    action: "Choose an existing event and try again.",
    fields: [
      {
        path: "body.eventId",
        message: "Choose an existing event.",
      },
    ],
    details: {
      eventId,
    },
  });
}

export function ticketTypeNotFoundError(ticketTypeId) {
  return AppError.notFound("Ticket type not found.", {
    code: "TICKET_TYPE_NOT_FOUND",
    title: "Ticket type not found",
    action: "Refresh the ticket type list and try again.",
    details: {
      ticketTypeId,
    },
  });
}

export function publicEventIdRequiredError() {
  return AppError.badRequest("eventId is required.", {
    code: "PUBLIC_TICKET_TYPES_EVENT_ID_REQUIRED",
    title: "Event ID required",
    action: "Provide an eventId query parameter.",
    fields: [
      {
        path: "query.eventId",
        message: "eventId is required.",
      },
    ],
  });
}

export function publicEventNotFoundError(eventId) {
  return AppError.notFound("Event not found.", {
    code: "PUBLIC_EVENT_NOT_FOUND",
    title: "Event not found",
    action: "Check the event id and try again.",
    details: {
      eventId,
    },
  });
}

export function publicEventUnavailableError(eventId) {
  return AppError.badRequest("Event is not publicly available.", {
    code: "PUBLIC_EVENT_UNAVAILABLE",
    title: "Event unavailable",
    action: "Choose a published public event.",
    details: {
      eventId,
    },
  });
}

export function publicEventCancelledError(eventId) {
  return AppError.badRequest("Event is cancelled.", {
    code: "PUBLIC_EVENT_CANCELLED",
    title: "Event cancelled",
    action: "Choose another event.",
    details: {
      eventId,
    },
  });
}

export function publicTicketTypeNotFoundError(ticketTypeId) {
  return AppError.notFound("Ticket type not found.", {
    code: "PUBLIC_TICKET_TYPE_NOT_FOUND",
    title: "Ticket type not found",
    action: "Check the ticket type id and try again.",
    details: {
      ticketTypeId,
    },
  });
}

export function publicTicketTypeUnavailableError(ticketTypeId) {
  return AppError.notFound("Ticket type is not publicly available.", {
    code: "PUBLIC_TICKET_TYPE_UNAVAILABLE",
    title: "Ticket type unavailable",
    action: "Choose an active public ticket type.",
    details: {
      ticketTypeId,
    },
  });
}
export function ticketTypeStockTotalBelowSoldError({
  stockTotal,
  stockSold,
  field = "stockTotal",
} = {}) {
  return AppError.badRequest("stockTotal must not be smaller than stockSold.", {
    code: "TICKET_TYPE_STOCK_TOTAL_BELOW_SOLD",
    title: "Invalid ticket stock",
    action:
      "Set stockTotal to null for unlimited stock or to a value greater than or equal to the already sold amount.",
    fields: [
      {
        path: `body.${field}`,
        message: "stockTotal must not be smaller than stockSold.",
      },
    ],
    details: {
      stockTotal,
      stockSold,
    },
  });
}

export function ticketTypeStockInvalidError({
  field = "stockTotal",
  value,
} = {}) {
  return AppError.badRequest("Ticket stock must be a non-negative integer.", {
    code: "TICKET_TYPE_STOCK_INVALID",
    title: "Invalid ticket stock",
    action:
      "Send stock values as non-negative integers. Use null for unlimited stockTotal.",
    fields: [
      {
        path: `body.${field}`,
        message: "Ticket stock must be a non-negative integer.",
      },
    ],
    details: {
      field,
      value,
    },
  });
}
