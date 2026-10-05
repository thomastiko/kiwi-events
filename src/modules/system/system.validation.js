import { z } from "zod";
import { DATABASE_PROVIDER_VALUES } from "../database/database.constants.js";

const databaseProviderSchema = z
  .string()
  .refine((value) => DATABASE_PROVIDER_VALUES.includes(value), {
    message: `Database provider must be one of: ${DATABASE_PROVIDER_VALUES.join(", ")}`,
  });

const databaseConfigBodySchema = z.object({
  provider: databaseProviderSchema,
  uri: z.string().trim().min(1),
});

export const testDatabaseConfigSchema = z.object({
  body: databaseConfigBodySchema,
  params: z.object({}),
  query: z.object({}),
});

export const switchDatabaseConfigSchema = z.object({
  body: databaseConfigBodySchema.extend({
    confirmation: z.literal("SWITCH DATABASE"),

    setupAdmin: z
      .object({
        email: z.string().trim().email().optional(),
        password: z.string().trim().min(1).optional(),
      })
      .optional(),

    adminPassword: z.string().trim().min(1).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});
export const resetSystemSchema = z.object({
  body: z
    .object({
      confirmation: z.literal("reset kiwi-events"),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});
