import { z } from "zod";

const MONGODB_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const apiIdSchema = z
  .string()
  .trim()
  .min(1, "ID is required.")
  .max(100, "ID must not exceed 100 characters.")
  .refine(
    (value) =>
      MONGODB_OBJECT_ID_PATTERN.test(value) || UUID_PATTERN.test(value),
    "Invalid ID.",
  );
