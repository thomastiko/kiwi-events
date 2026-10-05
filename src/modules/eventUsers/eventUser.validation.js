import { z } from "zod";
import {
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_AUTH_PROVIDER_VALUES,
  EVENT_USER_ROLES,
} from "./eventUser.constants.js";
import { EVENT_ROLE_KEY_PATTERN } from "../eventRoles/eventRole.constants.js";

import { optionalStorageTargetQuerySchema } from "../storage/storage.validation.js";

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
    "Invalid EventUser id",
  );
const emptyObjectSchema = z.object({}).strict();
const roleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(EVENT_ROLE_KEY_PATTERN, "Invalid role key")
  .nullable();

const externalProviderSchema = z.string().trim().toLowerCase().min(1).max(100);
const externalUserIdSchema = z.string().trim().min(1).max(200);

const authProviderEnum = z.enum(EVENT_USER_AUTH_PROVIDER_VALUES);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .optional()
  .or(z.literal(""));

const passwordSchema = z.string().min(5).max(128);

const commonEventUserFields = {
  emailSnapshot: emailSchema,
  firstNameSnapshot: z.string().trim().max(100).optional(),
  lastNameSnapshot: z.string().trim().max(100).optional(),

  role: roleSchema.optional().default(EVENT_USER_ROLES.EVENT_MANAGER),

  isActive: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
  profileBio: z.string().trim().max(3000).optional(),
  mustChangePassword: z.boolean().optional(),
};

const createBodySchema = z
  .object({
    authProvider: authProviderEnum.default(EVENT_USER_AUTH_PROVIDER.EXTERNAL),
    password: passwordSchema.optional(),

    externalProvider: externalProviderSchema.optional().nullable(),
    externalUserId: externalUserIdSchema.optional().nullable(),

    ...commonEventUserFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    const authProvider = value.authProvider;

    if (authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL) {
      if (!value.emailSnapshot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["emailSnapshot"],
          message: "Email is required for local EventUsers",
        });
      }

      if (!value.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: "Password is required for local EventUsers",
        });
      }

      return;
    }

    if (authProvider === EVENT_USER_AUTH_PROVIDER.EXTERNAL) {
      if (!value.externalProvider || !value.externalUserId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["externalUserId"],
          message:
            "External EventUsers require externalProvider and externalUserId",
        });
      }

      return;
    }

    if (authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID) {
      if (!value.emailSnapshot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["emailSnapshot"],
          message: "Email is required for hybrid EventUsers",
        });
      }

      if (!value.externalProvider || !value.externalUserId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["externalUserId"],
          message:
            "Hybrid EventUsers require externalProvider and externalUserId",
        });
      }
    }
  });

const updateBodySchema = z
  .object({
    authProvider: authProviderEnum.optional(),
    password: passwordSchema.optional(),

    externalProvider: externalProviderSchema.optional().nullable(),
    externalUserId: externalUserIdSchema.optional().nullable(),

    ...Object.fromEntries(
      Object.entries(commonEventUserFields).map(([key, schema]) => [
        key,
        schema.optional(),
      ]),
    ),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field must be updated",
  );

const bridgeBodySchema = z
  .object({
    authProvider: authProviderEnum
      .optional()
      .default(EVENT_USER_AUTH_PROVIDER.EXTERNAL),
    password: passwordSchema.optional(),
    ...commonEventUserFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.authProvider === EVENT_USER_AUTH_PROVIDER.LOCAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authProvider"],
        message:
          "The external bridge cannot create authProvider=local. Use POST /api/admin/event-users for local users.",
      });
    }

    if (value.authProvider === EVENT_USER_AUTH_PROVIDER.HYBRID) {
      if (!value.emailSnapshot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["emailSnapshot"],
          message: "Email is required for hybrid EventUsers",
        });
      }
    }
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field must be provided",
  );

export const createEventUserSchema = z.object({
  body: createBodySchema,
  params: emptyObjectSchema,
  query: emptyObjectSchema,
});

export const updateEventUserSchema = z.object({
  body: updateBodySchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const getEventUserByIdSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});
export const uploadEventUserProfileImageSchema = z.object({
  body: z.unknown().optional(),

  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: optionalStorageTargetQuerySchema,
});
export const deactivateEventUserSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      id: idSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const getEventUserByExternalUserSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      provider: externalProviderSchema,
      externalUserId: externalUserIdSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const upsertEventUserByExternalUserSchema = z.object({
  body: bridgeBodySchema,
  params: z
    .object({
      provider: externalProviderSchema,
      externalUserId: externalUserIdSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});

export const toggleEventUserByExternalUserSchema = z.object({
  body: emptyObjectSchema,
  params: z
    .object({
      provider: externalProviderSchema,
      externalUserId: externalUserIdSchema,
    })
    .strict(),
  query: emptyObjectSchema,
});
