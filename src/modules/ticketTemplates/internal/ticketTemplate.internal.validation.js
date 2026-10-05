import { z } from "zod";

import { apiIdSchema as idSchema } from "../../../core/http/apiId.schema.js";

import { ticketTemplateSchema } from "../ticketTemplate.schema.js";

import { optionalStorageTargetQuerySchema } from "../../storage/storage.validation.js";

const emptyObjectSchema = z.object({}).strict();

export const getTicketTemplateSchema = z.object({
  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: emptyObjectSchema,

  body: emptyObjectSchema,
});

export const saveTicketTemplateSchema = z.object({
  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: emptyObjectSchema,

  body: z
    .object({
      template: ticketTemplateSchema,
    })
    .strict(),
});

export const resetTicketTemplateSchema = getTicketTemplateSchema;

export const uploadTicketTemplateImageSchema = z.object({
  params: z
    .object({
      id: idSchema,
    })
    .strict(),

  query: optionalStorageTargetQuerySchema,

  body: z.unknown().optional(),
});

export const deleteTicketTemplateImageSchema = z.object({
  params: z
    .object({
      id: idSchema,

      assetId: idSchema,
    })
    .strict(),

  query: emptyObjectSchema,

  body: emptyObjectSchema,
});
