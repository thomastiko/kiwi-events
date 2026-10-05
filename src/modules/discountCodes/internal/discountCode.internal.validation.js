import { z } from "zod";

import { apiIdSchema } from "../../../core/http/apiId.schema.js";

const emptyObjectSchema = z.object({}).strict();

const discountPercentSchema = z.number().int().min(1).max(100);

const discountCodeValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Discount codes may only contain letters, numbers, hyphens and underscores.",
  );

export const listDiscountCodeGroupsSchema = z.object({
  body: emptyObjectSchema,

  params: emptyObjectSchema,

  query: z
    .object({
      eventId: apiIdSchema,
    })
    .strict(),
});

export const createDiscountCodeGroupSchema = z.object({
  body: z
    .object({
      eventId: apiIdSchema,

      name: z.string().trim().min(1).max(150),

      discountPercent: discountPercentSchema,

      isActive: z.boolean().optional(),
    })
    .strict(),

  params: emptyObjectSchema,

  query: emptyObjectSchema,
});

export const updateDiscountCodeGroupSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(150).optional(),

      discountPercent: discountPercentSchema.optional(),

      isActive: z.boolean().optional(),
    })
    .strict()
    .refine(
      (value) => Object.keys(value).length > 0,
      "At least one field must be updated",
    ),

  params: z
    .object({
      groupId: apiIdSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});

export const deleteDiscountCodeGroupSchema = z.object({
  body: emptyObjectSchema,

  params: z
    .object({
      groupId: apiIdSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});

export const listDiscountCodesSchema = z.object({
  body: emptyObjectSchema,

  params: z
    .object({
      groupId: apiIdSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});

export const createDiscountCodesSchema = z.object({
  body: z
    .object({
      codes: z.array(discountCodeValueSchema).min(1).max(1000).optional(),

      generateCount: z.number().int().min(1).max(1000).optional(),
    })
    .strict()
    .superRefine((value, context) => {
      const hasCodes = value.codes !== undefined;

      const hasGenerateCount = value.generateCount !== undefined;

      if (hasCodes === hasGenerateCount) {
        context.addIssue({
          code: "custom",
          path: [],
          message: "Provide either codes or generateCount, but not both.",
        });
      }
    }),

  params: z
    .object({
      groupId: apiIdSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});

export const updateDiscountCodeSchema = z.object({
  body: z
    .object({
      code: discountCodeValueSchema.optional(),

      isActive: z.boolean().optional(),
    })
    .strict()
    .refine(
      (value) => Object.keys(value).length > 0,
      "At least one field must be updated",
    ),

  params: z
    .object({
      codeId: apiIdSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});

export const deleteDiscountCodeSchema = z.object({
  body: emptyObjectSchema,

  params: z
    .object({
      codeId: apiIdSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});
