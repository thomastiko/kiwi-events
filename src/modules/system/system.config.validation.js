import { z } from "zod";

import {
  getKiwiEventsSecretDefinition,
  isKiwiEventsSystemConfigSecretPath,
} from "../../config/kiwi-events/kiwi-events.secret.constants.js";

const optionalString = z.string().trim().optional();

const systemConfigPatchSchema = z
  .object({
    server: z
      .object({
        nodeEnv: optionalString,

        port: z.coerce.number().int().min(1).max(65535).optional(),

        appUrl: optionalString,
        adminFrontendUrl: optionalString,
        publicFrontendUrl: optionalString,

        corsOrigin: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),

    auth: z
      .object({
        provider: z.enum(["local", "external-jwt", "hybrid"]).optional(),
      })
      .strict()
      .optional(),

    features: z
      .object({
        ticketing: z.boolean().optional(),
        guestCheckout: z.boolean().optional(),
        depositTickets: z.boolean().optional(),
        discountCodes: z.boolean().optional(),
        ticketPdf: z.boolean().optional(),
        ticketQr: z.boolean().optional(),
        mail: z.boolean().optional(),

        mailOrderConfirmation: z.boolean().optional(),

        mailOrderCancellation: z.boolean().optional(),

        mailOrderRefunded: z.boolean().optional(),

        mailEventCancellation: z.boolean().optional(),

        mailEventReminder: z.boolean().optional(),

        mailEventCustom: z.boolean().optional(),

        media: z.boolean().optional(),
      })
      .strict()
      .optional(),

    orders: z
      .object({
        customerSelfServiceCancellation: z
          .object({
            enabled: z.boolean().optional(),

            refundDeadlineDaysBeforeSession: z
              .union([z.null(), z.coerce.number().int().min(0).max(3650)])
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    payments: z
      .object({
        provider: z.enum(["disabled", "mollie", "stripe"]).optional(),

        currency: optionalString,

        stripe: z
          .object({
            successUrl: optionalString,
            cancelUrl: optionalString,
          })
          .strict()
          .optional(),

        mollie: z
          .object({
            webhookUrl: optionalString,
            redirectUrl: optionalString,
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    mail: z
      .object({
        provider: z.enum(["disabled", "smtp", "resend"]).optional(),

        defaultFromName: optionalString,
        defaultFromEmail: optionalString,
        defaultReplyTo: optionalString,

        smtp: z
          .object({
            host: optionalString,

            port: z.coerce.number().int().min(1).max(65535).optional(),

            secure: z.boolean().optional(),
            user: optionalString,
          })
          .strict()
          .optional(),

        resend: z
          .object({
            timeoutMs: z.coerce.number().int().min(1000).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    storage: z
      .object({
        local: z
          .object({
            dir: optionalString,
          })
          .strict()
          .optional(),

        public: z
          .object({
            enabled: z.boolean().optional(),
            endpoint: optionalString,
            region: optionalString,
            bucket: optionalString,
            publicBaseUrl: optionalString,
            forcePathStyle: z.boolean().optional(),
          })
          .strict()
          .optional(),

        private: z
          .object({
            enabled: z.boolean().optional(),
            endpoint: optionalString,
            region: optionalString,
            bucket: optionalString,
            forcePathStyle: z.boolean().optional(),
          })
          .strict()
          .optional(),

        generated: z
          .object({
            ticketPdfTarget: z.enum(["local", "public", "private"]).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    branding: z
      .object({
        appName: optionalString,
        ticketTitle: optionalString,
        ticketSubtitle: optionalString,
        locale: optionalString,
        defaultCurrency: optionalString,
      })
      .strict()
      .optional(),
  })
  .strict();

const secretMutationValueSchema = z.union([
  z.string().refine((value) => value.trim().length > 0, {
    message: "Secret must not be empty or contain only whitespace.",
  }),

  z.null(),
]);

const systemConfigSecretsPatchSchema = z
  .record(z.string().min(1), secretMutationValueSchema)
  .superRefine((secrets, context) => {
    for (const [secretPath, value] of Object.entries(secrets)) {
      if (!isKiwiEventsSystemConfigSecretPath(secretPath)) {
        context.addIssue({
          code: "custom",
          path: [secretPath],
          message:
            `Secret "${secretPath}" cannot be managed ` +
            "through the system config API.",
        });

        continue;
      }

      if (typeof value !== "string") {
        continue;
      }

      const definition = getKiwiEventsSecretDefinition(secretPath);

      if (definition.minimumLength && value.length < definition.minimumLength) {
        context.addIssue({
          code: "custom",
          path: [secretPath],
          message:
            `Secret must be at least ` +
            `${definition.minimumLength} characters long.`,
        });
      }
    }
  });

function hasPatchValue(value) {
  if (value === null || typeof value !== "object") {
    return value !== undefined;
  }

  if (Array.isArray(value)) {
    return true;
  }

  return Object.values(value).some(hasPatchValue);
}

const updateSystemConfigBodySchema = z
  .object({
    config: systemConfigPatchSchema.optional(),

    secrets: systemConfigSecretsPatchSchema.optional(),
  })
  .strict()
  .superRefine((body, context) => {
    const hasConfigChanges = hasPatchValue(body.config);

    const hasSecretChanges =
      body.secrets && Object.keys(body.secrets).length > 0;

    if (hasConfigChanges || hasSecretChanges) {
      return;
    }

    context.addIssue({
      code: "custom",
      path: [],
      message: "At least one config or secret change is required.",
    });
  });

export const updateSystemConfigSchema = z.object({
  body: updateSystemConfigBodySchema,
  params: z.object({}).strict(),
  query: z.object({}).strict(),
});
