// src/modules/ticketTypes/internal/ticketType.internal.validation.js

import { z } from "zod";
import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
  TICKET_TYPE_STATUS,
} from "../ticketType.constants.js";

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

const dateSchema = z.coerce.date();
const emptyObjectSchema = z.object({}).strict();

function nonNegativeIntegerSchema(fieldName) {
  return z
    .number()
    .int(`${fieldName} must be an integer.`)
    .min(0, `${fieldName} must be greater than or equal to 0.`);
}

const ticketTypeBodyObject = z
  .object({
    eventId: idSchema,
    displayName: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(Object.values(TICKET_TYPE_STATUS)).optional(),
    ticketKind: z.enum(Object.values(TICKET_TYPE_KIND)).optional(),
    pricingMode: z.enum(Object.values(TICKET_TYPE_PRICING_MODE)),
    priceGross: nonNegativeIntegerSchema("priceGross"),
    currency: z.string().trim().min(1).max(10).optional(),
    stockTotal: nonNegativeIntegerSchema("stockTotal").nullable().optional(),
    minPerOrder: z.number().int().min(1).optional(),
    maxPerOrder: z.number().int().min(1).nullable().optional(),
    salesStartAt: dateSchema.nullable().optional(),
    salesEndAt: dateSchema.nullable().optional(),
    isPersonalized: z.boolean().optional(),
    sessionIds: z.array(idSchema).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

function withTicketTypeRefinements(schema) {
  return schema
    .refine(
      (value) => {
        if (value.salesStartAt && value.salesEndAt) {
          return value.salesEndAt > value.salesStartAt;
        }

        return true;
      },
      {
        message: "salesEndAt must be after salesStartAt",
        path: ["salesEndAt"],
      },
    )
    .refine(
      (value) => {
        if (
          value.minPerOrder !== undefined &&
          value.maxPerOrder !== undefined &&
          value.maxPerOrder !== null
        ) {
          return value.maxPerOrder >= value.minPerOrder;
        }

        return true;
      },
      {
        message: "maxPerOrder must be greater than or equal to minPerOrder",
        path: ["maxPerOrder"],
      },
    );
}

const createTicketTypeBodySchema =
  withTicketTypeRefinements(ticketTypeBodyObject);

const updateTicketTypeBodySchema = withTicketTypeRefinements(
  ticketTypeBodyObject.partial(),
).refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be updated",
);

export const createTicketTypeSchema = z.object({
  body: createTicketTypeBodySchema,
  params: emptyObjectSchema,
  query: emptyObjectSchema,
});

export const updateTicketTypeSchema = z.object({
  body: updateTicketTypeBodySchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const getTicketTypeByIdSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const deleteTicketTypeSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const listTicketTypesSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z
    .object({
      eventId: idSchema.optional(),
      status: z.enum(Object.values(TICKET_TYPE_STATUS)).optional(),
    })
    .strict(),
});
