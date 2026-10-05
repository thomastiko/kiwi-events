// src/modules/orders/internal/order.internal.validation.js

import { z } from "zod";
import { ORDER_MAIL_RESEND_TYPE_VALUES } from "../order.constants.js";
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

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().trim().optional(),
  paymentStatus: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const getInternalOrderByIdSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
  body: z.object({}),
});
export const cancelInternalOrderSchema = z.object({
  params: z.object({
    id: idSchema,
  }),

  query: z.object({}),

  body: z.object({
    reason: z.string().trim().min(1).max(1000).optional(),
  }),
});
export const refundInternalOrderSchema = z.object({
  params: z.object({
    id: idSchema,
  }),

  query: z.object({}),

  body: z.object({
    reason: z.string().trim().min(1).max(1000).optional(),
  }),
});
export const listEventOrdersInternalSchema = z.object({
  params: z.object({
    eventId: idSchema,
  }),
  query: paginationQuerySchema,
  body: z.object({}),
});

export const createManualOrderForEventSchema = z.object({
  params: z.object({
    eventId: idSchema,
  }),
  query: z.object({}),
  body: z.object({
    ticketTypeId: idSchema,
    quantity: z.coerce.number().int().min(1).default(1),
    donationAmountGross: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),

    reason: z.string().trim().max(1000).optional(),

    customer: z
      .object({
        externalProvider: z.string().trim().optional(),
        externalUserId: z.string().trim().optional(),
        emailSnapshot: z.string().trim().email().optional(),
        firstNameSnapshot: z.string().trim().optional(),
        lastNameSnapshot: z.string().trim().optional(),
        displayNameSnapshot: z.string().trim().optional(),
      })
      .optional(),

    guest: z
      .object({
        email: z.string().trim().email(),
        firstName: z.string().trim().min(1),
        lastName: z.string().trim().min(1),
      })
      .optional(),

    email: z.string().trim().email().optional(),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),

    externalProvider: z.string().trim().optional(),
    externalUserId: z.string().trim().optional(),
  }),
});
export const updateInternalOrderBuyerSchema = z.object({
  params: z.object({
    id: idSchema,
  }),

  query: z.object({}),

  body: z.object({
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
  }),
});
export const resendInternalOrderMailSchema = z.object({
  params: z.object({
    id: idSchema,
  }),

  query: z.object({}),

  body: z.object({
    type: z.enum(ORDER_MAIL_RESEND_TYPE_VALUES),
  }),
});
