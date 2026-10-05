// src/modules/ticketTypes/public/ticketType.public.validation.js

import { z } from "zod";

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

export const listPublicTicketTypesSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    eventId: idSchema,
    onlyBookable: z.coerce.boolean().optional(),
  }),
});

export const getPublicTicketTypeByIdSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
});
