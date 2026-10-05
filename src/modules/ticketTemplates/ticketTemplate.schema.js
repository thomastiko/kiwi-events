import { z } from "zod";
import { apiIdSchema as idSchema } from "../../core/http/apiId.schema.js";

import {
  TICKET_TEMPLATE_CONDITION_OPERATOR,
  TICKET_TEMPLATE_CONDITION_OPERATOR_VALUES,
  TICKET_TEMPLATE_ELEMENT_TYPE,
  TICKET_TEMPLATE_FIELD_KEYS,
  TICKET_TEMPLATE_FONT_VALUES,
  TICKET_TEMPLATE_IMAGE_ALIGN_VALUES,
  TICKET_TEMPLATE_IMAGE_FIT_VALUES,
  TICKET_TEMPLATE_IMAGE_VALIGN_VALUES,
  TICKET_TEMPLATE_TEXT_ALIGN_VALUES,
} from "./ticketTemplate.constants.js";

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a six-digit hex color.");

const elementIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/, "Element id contains invalid characters.");

const coordinateSchema = z.number().finite().min(0).max(2000);
const dimensionSchema = z.number().finite().gt(0).max(2000);

const opacitySchema = z.number().finite().min(0).max(1).optional();

const rotationSchema = z.number().finite().min(-360).max(360).optional();

const conditionSchema = z
  .object({
    field: z.enum(TICKET_TEMPLATE_FIELD_KEYS),

    operator: z.enum(TICKET_TEMPLATE_CONDITION_OPERATOR_VALUES),

    value: z.union([z.string().max(1000), z.number(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((condition, ctx) => {
    const requiresValue = [
      TICKET_TEMPLATE_CONDITION_OPERATOR.EQUALS,
      TICKET_TEMPLATE_CONDITION_OPERATOR.NOT_EQUALS,
    ].includes(condition.operator);

    if (requiresValue && condition.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Condition value is required for this operator.",
      });
    }
  });

const commonElementShape = {
  id: elementIdSchema,

  x: coordinateSchema,
  y: coordinateSchema,

  opacity: opacitySchema,
  rotation: rotationSchema,

  condition: conditionSchema.optional(),
};

const textElementSchema = z
  .object({
    ...commonElementShape,

    type: z.literal(TICKET_TEMPLATE_ELEMENT_TYPE.TEXT),

    width: dimensionSchema,
    height: dimensionSchema.optional(),

    value: z.string().max(5000),

    font: z.enum(TICKET_TEMPLATE_FONT_VALUES).default("Helvetica"),

    fontSize: z.number().finite().min(4).max(144).default(10),

    color: colorSchema.default("#000000"),

    align: z.enum(TICKET_TEMPLATE_TEXT_ALIGN_VALUES).default("left"),

    lineGap: z.number().finite().min(0).max(100).optional(),

    characterSpacing: z.number().finite().min(0).max(50).optional(),

    underline: z.boolean().optional(),
  })
  .strict();

const qrElementSchema = z
  .object({
    ...commonElementShape,

    type: z.literal(TICKET_TEMPLATE_ELEMENT_TYPE.QR),

    size: dimensionSchema,

    foregroundColor: colorSchema.default("#000000"),

    backgroundColor: colorSchema.default("#ffffff"),
  })
  .strict();

const imageElementSchema = z
  .object({
    ...commonElementShape,

    type: z.literal(TICKET_TEMPLATE_ELEMENT_TYPE.IMAGE),

    assetId: idSchema,

    width: dimensionSchema,
    height: dimensionSchema,

    fit: z.enum(TICKET_TEMPLATE_IMAGE_FIT_VALUES).default("contain"),

    align: z.enum(TICKET_TEMPLATE_IMAGE_ALIGN_VALUES).default("center"),

    valign: z.enum(TICKET_TEMPLATE_IMAGE_VALIGN_VALUES).default("center"),
  })
  .strict();

const lineElementSchema = z
  .object({
    id: elementIdSchema,

    type: z.literal(TICKET_TEMPLATE_ELEMENT_TYPE.LINE),

    x: coordinateSchema,
    y: coordinateSchema,

    x2: coordinateSchema,
    y2: coordinateSchema,

    opacity: opacitySchema,
    rotation: rotationSchema,

    condition: conditionSchema.optional(),

    strokeColor: colorSchema.default("#000000"),

    strokeWidth: z.number().finite().gt(0).max(50).default(1),
  })
  .strict();

const rectElementSchema = z
  .object({
    ...commonElementShape,

    type: z.literal(TICKET_TEMPLATE_ELEMENT_TYPE.RECT),

    width: dimensionSchema,
    height: dimensionSchema,

    fillColor: colorSchema.nullable().optional(),

    strokeColor: colorSchema.nullable().optional(),

    strokeWidth: z.number().finite().gt(0).max(50).default(1),

    radius: z.number().finite().min(0).max(500).default(0),
  })
  .strict()
  .refine((element) => element.fillColor || element.strokeColor, {
    message: "Rectangle requires fillColor or strokeColor.",
  });

const elementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  qrElementSchema,
  imageElementSchema,
  lineElementSchema,
  rectElementSchema,
]);

const pageSchema = z
  .object({
    width: z.number().finite().min(100).max(2000),

    height: z.number().finite().min(100).max(2000),

    backgroundColor: colorSchema.default("#ffffff"),
  })
  .strict();

function collectTemplateFields(value) {
  return [
    ...String(value || "").matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g),
  ].map((match) => match[1]);
}

function checkElementBounds(element, page, ctx, index) {
  const addIssue = (message) => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["elements", index],
      message,
    });
  };

  if (element.x > page.width || element.y > page.height) {
    addIssue("Element origin must be inside the page.");

    return;
  }

  if (element.type === TICKET_TEMPLATE_ELEMENT_TYPE.LINE) {
    if (element.x2 > page.width || element.y2 > page.height) {
      addIssue("Line endpoint must be inside the page.");
    }

    return;
  }

  const width =
    element.type === TICKET_TEMPLATE_ELEMENT_TYPE.QR
      ? element.size
      : element.width;

  const height =
    element.type === TICKET_TEMPLATE_ELEMENT_TYPE.QR
      ? element.size
      : element.height;

  if (width && element.x + width > page.width) {
    addIssue("Element exceeds page width.");
  }

  if (height && element.y + height > page.height) {
    addIssue("Element exceeds page height.");
  }
}

export const ticketTemplateSchema = z
  .object({
    page: pageSchema,

    elements: z.array(elementSchema).max(200),
  })
  .strict()
  .superRefine((template, ctx) => {
    const ids = new Set();

    const allowedFields = new Set(TICKET_TEMPLATE_FIELD_KEYS);

    template.elements.forEach((element, index) => {
      if (ids.has(element.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,

          path: ["elements", index, "id"],

          message: "Element ids must be unique.",
        });
      }

      ids.add(element.id);

      checkElementBounds(element, template.page, ctx, index);

      if (element.type === TICKET_TEMPLATE_ELEMENT_TYPE.TEXT) {
        for (const field of collectTemplateFields(element.value)) {
          if (!allowedFields.has(field)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,

              path: ["elements", index, "value"],

              message: `Unsupported template field: ${field}.`,
            });
          }
        }
      }
    });
  });

export function collectTicketTemplateImageAssetIds(template) {
  return [
    ...new Set(
      (template?.elements || [])
        .filter(
          (element) => element.type === TICKET_TEMPLATE_ELEMENT_TYPE.IMAGE,
        )
        .map((element) => String(element.assetId || "").trim())
        .filter(Boolean),
    ),
  ];
}
