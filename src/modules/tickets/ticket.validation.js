// src/modules/tickets/ticket.validation.js

import { z } from "zod";
import { TICKET_STATUS } from "./ticket.constants.js";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(
    (value) =>
      /^[a-f\d]{24}$/i.test(value) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    "Invalid id",
  );

const ticketCodeSchema = z
  .string({
    required_error: "Ticket code is required.",
    invalid_type_error: "Ticket code must be a string.",
  })
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^TKT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/,
        "Ticket code is invalid.",
      ),
  );

export const listOwnTicketsSchema = z.object({
  params: z.object({}).default({}),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(Object.values(TICKET_STATUS)).optional(),
    eventId: idSchema.optional(),
    orderId: idSchema.optional(),
  }),
  body: z.object({}).default({}),
});

export const getOwnTicketByIdSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}).default({}),
  body: z.object({}).default({}),
});

export const getInternalTicketByIdSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}).default({}),
  body: z.object({}).default({}),
});

export const cancelInternalTicketSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}).default({}),
  body: z.object({
    reason: z.string().trim().max(1000).optional(),
  }),
});

export const setInternalTicketCheckInSchema = z.object({
  params: z.object({
    id: idSchema,
  }),

  query: z.object({}).default({}),

  body: z.object({
    checkedIn: z.boolean(),
  }),
});
export const listEventTicketsInternalSchema = z.object({
  params: z.object({
    eventId: idSchema,
  }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(Object.values(TICKET_STATUS)).optional(),
    search: z.string().trim().max(100).optional(),
    sortBy: z
      .enum(["createdAt", "checkedInAt", "ticketCode"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
  body: z.object({}).default({}),
});

export const lookupTicketForCheckInSchema = z.object({
  params: z.object({}).default({}),
  query: z.object({}).default({}),
  body: z.object({
    ticketCode: ticketCodeSchema,
  }),
});

export const confirmTicketCheckInSchema = z.object({
  params: z.object({}).default({}),
  query: z.object({}).default({}),
  body: z.object({
    ticketCode: ticketCodeSchema,
  }),
});

export const checkInTicketByQrSchema = z.object({
  params: z.object({}).default({}),
  query: z.object({}).default({}),
  body: z.object({
    payload: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? "QR code payload is required."
            : "QR code payload must be a string.",
      })
      .trim()
      .min(10, "QR code payload is invalid.")
      .max(4000, "QR code payload is too long."),
  }),
});

export const getOwnTicketQrSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}).default({}),
  body: z.object({}).default({}),
});

export const getOwnTicketDocumentSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}).default({}),
  body: z.object({}).default({}),
});

export const guestTicketAccessSchema = z.object({
  body: z.object({}).default({}),
  params: z.object({
    id: idSchema,
  }),
  query: z.object({
    accessToken: z.string().trim().min(20).max(500),
  }),
});
