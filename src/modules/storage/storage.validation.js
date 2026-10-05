import { z } from "zod";

import { STORAGE_TARGET_VALUES } from "./storage.constants.js";

export const storageTargetSchema = z.enum([...STORAGE_TARGET_VALUES]);

export const optionalStorageTargetQuerySchema = z
  .object({
    storageTarget: storageTargetSchema.optional(),
  })
  .strict();
