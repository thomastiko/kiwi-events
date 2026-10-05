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

const recipientSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(320),
  name: z.string().trim().max(200).optional().default(""),
});

export const listMailTemplatesSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    q: z.string().trim().max(100).optional(),
    module: z.string().trim().max(100).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  }),
});

export const mailTemplateIdParamSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
});

export const createMailTemplateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({
    key: z.string().trim().min(1).max(150),
    module: z.string().trim().min(1).max(100),
    category: z.string().trim().max(100).optional().default(""),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().default(""),
    subject: z.string().trim().min(1).max(300),
    html: z.string().min(1),
    text: z.string().optional().default(""),
    variables: z
      .array(z.string().trim().min(1).max(100))
      .optional()
      .default([]),
    fromName: z.string().trim().max(200).optional().default(""),
    fromEmail: z.string().trim().max(320).optional().default(""),
    replyTo: z.string().trim().max(320).optional().default(""),
    status: z.enum(["active", "inactive"]).optional().default("active"),
  }),
});

export const updateMailTemplateSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
  body: z.object({
    key: z.string().trim().min(1).max(150).optional(),
    module: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().max(100).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    subject: z.string().trim().min(1).max(300).optional(),
    html: z.string().min(1).optional(),
    text: z.string().optional(),
    variables: z.array(z.string().trim().min(1).max(100)).optional(),
    fromName: z.string().trim().max(200).optional(),
    fromEmail: z.string().trim().max(320).optional(),
    replyTo: z.string().trim().max(320).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }),
});

export const testMailTemplateSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
  body: z.object({
    to: recipientSchema,

    variables: z.record(z.string(), z.unknown()).optional().default({}),
  }),
});

export const listMailLogsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    q: z.string().trim().max(100).optional(),
    templateKey: z.string().trim().max(150).optional(),
    module: z.string().trim().max(100).optional(),
    status: z
      .enum(["queued", "sending", "sent", "failed", "skipped", "unknown"])
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  }),
});

export const mailLogIdParamSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: idSchema,
  }),
  query: z.object({}),
});
