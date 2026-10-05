// src/modules/events/public/event.public.validation.js

import { z } from "zod";
import { apiIdSchema } from "../../../core/http/apiId.schema.js";
import { EVENT_CATEGORY_VALUES } from "../event.constants.js";

export const listPublicEventsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    category: z.enum(EVENT_CATEGORY_VALUES).optional(),
    search: z.string().trim().optional(),
    featuredOnly: z.coerce.boolean().optional(),
    upcomingOnly: z.coerce.boolean().optional(),
    includeTicketTypes: z.coerce.boolean().optional(),
  }),
});

export const getPublicEventBySlugSchema = z.object({
  body: z.object({}),
  params: z.object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9-]+$/, "Invalid slug"),
  }),
  query: z.object({}),
});

export const getPublicEventByIdSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: apiIdSchema,
  }),
  query: z.object({}),
});
