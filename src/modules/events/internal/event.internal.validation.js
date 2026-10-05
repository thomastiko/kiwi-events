import { z } from "zod";
import { apiIdSchema as idSchema } from "../../../core/http/apiId.schema.js";
import {
  EVENT_CANCELLATION_REFUND_MODE,
  EVENT_CANCELLATION_REFUND_MODE_VALUES,
  EVENT_CATEGORY_VALUES,
  EVENT_CUSTOM_MAIL_AUDIENCE,
  EVENT_CUSTOM_MAIL_AUDIENCE_VALUES,
  EVENT_STATUS_VALUES,
  EVENT_VISIBILITY_VALUES,
  SESSION_STATUS_VALUES,
} from "../event.constants.js";
import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
  TICKET_TYPE_STATUS,
} from "../../ticketTypes/ticketType.constants.js";

import { optionalStorageTargetQuerySchema } from "../../storage/storage.validation.js";

const dateSchema = z.coerce.date();
const emptyObjectSchema = z.object({}).strict();

function nonNegativeIntegerSchema(fieldName) {
  return z
    .number()
    .int(`${fieldName} must be an integer.`)
    .min(0, `${fieldName} must be greater than or equal to 0.`);
}

export const refundPreviewParamsSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

const sessionSchema = z
  .object({
    id: idSchema.optional(),
    startAt: dateSchema,
    endAt: dateSchema,
    timezone: z.string().trim().min(1).max(100).optional(),
    locationLabel: z.string().trim().max(200).optional(),
    locationDetails: z.string().trim().max(500).optional(),
    capacity: z.number().int().min(1).nullable().optional(),
    status: z.enum(SESSION_STATUS_VALUES).optional(),
  })
  .strict()
  .refine((value) => value.endAt > value.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

const faqSchema = z
  .object({
    id: idSchema.optional(),
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(5000),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

const ticketTypeSchema = z
  .object({
    id: idSchema.optional(),
    displayName: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(Object.values(TICKET_TYPE_STATUS)).optional(),
    ticketKind: z
      .enum(Object.values(TICKET_TYPE_KIND))
      .optional()
      .default(TICKET_TYPE_KIND.NORMAL),
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
  .strict()
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

const baseEventBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(
        /^[a-z0-9-]+$/,
        "Slug may only contain lowercase letters, numbers and hyphens",
      ),
    shortDescription: z.string().trim().max(500).optional(),
    description: z.string().trim().optional(),
    category: z.enum(EVENT_CATEGORY_VALUES),
    status: z.enum(EVENT_STATUS_VALUES).optional(),
    visibility: z.enum(EVENT_VISIBILITY_VALUES).optional(),
    location: z.string().trim().max(300).optional(),
    imageAssetIds: z.array(idSchema).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).optional(),
    sessions: z.array(sessionSchema).min(1),
    faqs: z.array(faqSchema).optional(),
    ticketTypes: z.array(ticketTypeSchema).optional(),
    isFree: z.boolean().optional(),
    salesStartAt: dateSchema.nullable().optional(),
    salesEndAt: dateSchema.nullable().optional(),
    isFeatured: z.boolean().optional(),
    featuredOrder: z.number().int().min(0).optional(),
    notesInternal: z.string().trim().max(5000).optional(),
  })
  .strict();

export const createEventSchema = z.object({
  body: baseEventBodySchema,
  params: emptyObjectSchema,
  query: emptyObjectSchema,
});

export const updateEventSchema = z.object({
  body: baseEventBodySchema
    .partial()
    .refine(
      (value) => Object.keys(value).length > 0,
      "At least one field must be updated",
    ),
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const getEventByIdSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});
export const uploadEventImagesSchema = z.object({
  body: z.unknown().optional(),

  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: optionalStorageTargetQuerySchema,
});
export const removeEventImageSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
      assetId: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const listEventsSchema = z.object({
  body: emptyObjectSchema,
  params: emptyObjectSchema,
  query: z
    .object({
      category: z.enum(EVENT_CATEGORY_VALUES).optional(),
      status: z.enum(EVENT_STATUS_VALUES).optional(),
      visibility: z.enum(EVENT_VISIBILITY_VALUES).optional(),
      search: z.string().trim().optional(),
      isFeatured: z.union([z.literal("true"), z.literal("false")]).optional(),
    })
    .strict(),
});

export const publishEventSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const cancelEventSchema = z.object({
  body: z
    .object({
      reason: z.string().trim().max(1000).optional(),

      refundMode: z.enum(EVENT_CANCELLATION_REFUND_MODE_VALUES),

      orderIds: z.array(idSchema).min(1).optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (
        value.refundMode === EVENT_CANCELLATION_REFUND_MODE.SELECTED &&
        !value.orderIds?.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,

          path: ["orderIds"],

          message: "orderIds is required when refundMode is selected.",
        });
      }

      if (
        value.refundMode !== EVENT_CANCELLATION_REFUND_MODE.SELECTED &&
        value.orderIds !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,

          path: ["orderIds"],

          message: "orderIds is only allowed when refundMode is selected.",
        });
      }

      if (
        value.orderIds &&
        new Set(value.orderIds.map(String)).size !== value.orderIds.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,

          path: ["orderIds"],

          message: "orderIds must not contain duplicates.",
        });
      }
    }),

  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: emptyObjectSchema,
});
export const sendCustomEventMailSchema = z.object({
  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: emptyObjectSchema,

  body: z
    .object({
      requestId: z.string().uuid(),

      audience: z.enum(EVENT_CUSTOM_MAIL_AUDIENCE_VALUES),

      orderIds: z.array(idSchema).min(1).optional(),

      subject: z.string().trim().min(1).max(300),

      html: z.string().min(1).max(200_000),

      text: z.string().max(200_000).optional().default(""),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (
        value.audience === EVENT_CUSTOM_MAIL_AUDIENCE.SELECTED &&
        !value.orderIds?.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["orderIds"],
          message: "orderIds is required when audience is selected.",
        });
      }

      if (
        value.audience === EVENT_CUSTOM_MAIL_AUDIENCE.ALL &&
        value.orderIds !== undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["orderIds"],
          message: "orderIds is only allowed when audience is selected.",
        });
      }

      if (value.orderIds) {
        const uniqueOrderIds = new Set(value.orderIds.map(String));

        if (uniqueOrderIds.size !== value.orderIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["orderIds"],
            message: "orderIds must not contain duplicates.",
          });
        }
      }
    }),
});
export const archiveEventSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const deleteEventSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const featureEventSchema = z.object({
  body: z
    .object({
      isFeatured: z.boolean(),
      featuredOrder: z.number().int().min(0).optional(),
    })
    .strict(),
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});
