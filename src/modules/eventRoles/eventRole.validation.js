import { z } from "zod";

import { EVENT_ROLE_KEY_PATTERN } from "./eventRole.constants.js";

const roleKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(EVENT_ROLE_KEY_PATTERN, "Invalid role key");

const permissionSchema = z.string().trim().min(1).max(160);

const createBodySchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  permissions: z.array(permissionSchema).optional().default([]),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    permissions: z.array(permissionSchema).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field must be updated",
  );

export const listEventRolesSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({}),
});

export const getEventRoleByKeySchema = z.object({
  body: z.object({}),
  params: z.object({
    key: roleKeySchema,
  }),
  query: z.object({}),
});

export const createEventRoleSchema = z.object({
  body: createBodySchema,
  params: z.object({}),
  query: z.object({}),
});

export const updateEventRoleSchema = z.object({
  body: updateBodySchema,
  params: z.object({
    key: roleKeySchema,
  }),
  query: z.object({}),
});

export const deleteEventRoleSchema = z.object({
  body: z.object({}),
  params: z.object({
    key: roleKeySchema,
  }),
  query: z.object({}),
});
