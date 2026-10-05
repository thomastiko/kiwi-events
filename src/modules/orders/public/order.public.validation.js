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
const guestAccessTokenSchema = z.string().trim().min(20).max(500);
const orderNumberSchema = z
  .string()
  .trim()
  .regex(
    /^ORD-\d{8}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
    "Invalid order number",
  );
const checkoutGuestSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(320),
});

const checkoutCustomerSchema = z
  .object({
    externalProvider: z.string().trim().min(1).max(100),
    externalUserId: z.string().trim().min(1).max(200),

    email: z.string().trim().email("Invalid email address").max(320),

    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    displayName: z.string().trim().max(200).optional(),

    rawExternalSnapshot: z.record(z.unknown()).optional(),
  })
  .strict();
const donationAmountGrossSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const checkoutDiscountCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Discount codes may only contain letters, numbers, hyphens and underscores.",
  )
  .transform((value) => value.toUpperCase());

export const checkoutPublicOrderSchema = z.object({
  body: z
    .object({
      eventId: idSchema,
      discountCode: checkoutDiscountCodeSchema.optional(),
      items: z
        .array(
          z.object({
            ticketTypeId: idSchema,
            quantity: z.number().int().positive(),
            donationAmountGross: donationAmountGrossSchema.optional(),
          }),
        )
        .min(1, "At least one item is required"),

      guest: checkoutGuestSchema.optional(),
      customer: checkoutCustomerSchema.optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      if (body.guest && body.customer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customer"],
          message: "Use either guest or customer, not both.",
        });
      }
    }),
  params: z.object({}),
  query: z.object({}),
});

export const listOwnOrdersQuerySchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(["pending", "confirmed", "cancelled", "expired"]).optional(),
    paymentStatus: z
      .enum([
        "not_required",
        "pending",
        "paid",
        "failed",
        "refunded",
        "cancelled",
      ])
      .optional(),
  }),
});

export const ownOrderIdParamSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
});

export const cancelOwnOrderSchema = z.object({
  body: z.object({
    reason: z.string().trim().max(1000).optional(),
  }),
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
});

export const guestOrderAccessSchema = z.object({
  body: z.object({}).default({}),

  params: z.object({
    id: idSchema,
  }),

  query: z.object({
    accessToken: guestAccessTokenSchema,
  }),
});
export const cancelGuestOrderSchema = z.object({
  body: z
    .object({
      accessToken: guestAccessTokenSchema,

      reason: z.string().trim().max(1000).optional(),
    })
    .strict(),

  params: z.object({
    id: idSchema,
  }),

  query: z.object({}),
});
export const reissueGuestAccessSchema = z.object({
  body: z
    .object({
      orderNumber: orderNumberSchema,
      email: z.string().trim().email("Invalid email address").max(320),
    })
    .strict(),

  params: z.object({}),
  query: z.object({}),
});
