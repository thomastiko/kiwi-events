import { z } from "zod";

import { apiIdSchema } from "../../../core/http/apiId.schema.js";

const emptyObjectSchema = z.object({}).strict();

export const listEventImageAssetsSchema = z.object({
  params: emptyObjectSchema,
  query: emptyObjectSchema,
  body: emptyObjectSchema,
});

export const deleteEventImageAssetSchema = z.object({
  params: z
    .object({
      id: apiIdSchema,
    })
    .strict(),
  query: emptyObjectSchema,
  body: emptyObjectSchema,
});
