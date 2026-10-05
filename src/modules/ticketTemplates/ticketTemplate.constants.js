export const TICKET_TEMPLATE_SCHEMA_VERSION = 1;

export const TICKET_TEMPLATE_SOURCE = Object.freeze({
  DEFAULT: "default",
  CUSTOM: "custom",
});

export const TICKET_TEMPLATE_ELEMENT_TYPE = Object.freeze({
  TEXT: "text",
  QR: "qr",
  IMAGE: "image",
  LINE: "line",
  RECT: "rect",
});

export const TICKET_TEMPLATE_ELEMENT_TYPE_VALUES = Object.freeze(
  Object.values(TICKET_TEMPLATE_ELEMENT_TYPE),
);

export const TICKET_TEMPLATE_FONT = Object.freeze({
  HELVETICA: "Helvetica",
  HELVETICA_BOLD: "Helvetica-Bold",
  HELVETICA_OBLIQUE: "Helvetica-Oblique",
  HELVETICA_BOLD_OBLIQUE: "Helvetica-BoldOblique",

  TIMES: "Times-Roman",
  TIMES_BOLD: "Times-Bold",
  TIMES_ITALIC: "Times-Italic",
  TIMES_BOLD_ITALIC: "Times-BoldItalic",

  COURIER: "Courier",
  COURIER_BOLD: "Courier-Bold",
  COURIER_OBLIQUE: "Courier-Oblique",
  COURIER_BOLD_OBLIQUE: "Courier-BoldOblique",
});

export const TICKET_TEMPLATE_FONT_VALUES = Object.freeze(
  Object.values(TICKET_TEMPLATE_FONT),
);

export const TICKET_TEMPLATE_TEXT_ALIGN_VALUES = Object.freeze([
  "left",
  "center",
  "right",
  "justify",
]);

export const TICKET_TEMPLATE_IMAGE_FIT_VALUES = Object.freeze([
  "contain",
  "cover",
  "stretch",
]);

export const TICKET_TEMPLATE_IMAGE_ALIGN_VALUES = Object.freeze([
  "left",
  "center",
  "right",
]);

export const TICKET_TEMPLATE_IMAGE_VALIGN_VALUES = Object.freeze([
  "top",
  "center",
  "bottom",
]);

export const TICKET_TEMPLATE_CONDITION_OPERATOR = Object.freeze({
  EQUALS: "equals",
  NOT_EQUALS: "not_equals",
  EMPTY: "empty",
  NOT_EMPTY: "not_empty",
  TRUTHY: "truthy",
  FALSY: "falsy",
});

export const TICKET_TEMPLATE_CONDITION_OPERATOR_VALUES = Object.freeze(
  Object.values(TICKET_TEMPLATE_CONDITION_OPERATOR),
);

export const TICKET_TEMPLATE_FIELDS = Object.freeze({
  SYSTEM_BRAND_NAME: "system.brandName",
  SYSTEM_TICKET_TITLE: "system.ticketTitle",
  SYSTEM_TICKET_SUBTITLE: "system.ticketSubtitle",
  SYSTEM_QR_ENABLED: "system.qrEnabled",

  EVENT_TITLE: "event.title",
  EVENT_DATE: "event.date",
  EVENT_LOCATION: "event.location",
  EVENT_SLUG: "event.slug",
  EVENT_CATEGORY: "event.category",

  TICKET_CODE: "ticket.code",
  TICKET_TYPE_NAME: "ticket.typeName",
  TICKET_TYPE_DESCRIPTION: "ticket.typeDescription",
  TICKET_PRICE: "ticket.price",
  TICKET_CURRENCY: "ticket.currency",
  TICKET_KIND: "ticket.kind",

  BUYER_NAME: "buyer.name",
  BUYER_EMAIL: "buyer.email",
  BUYER_EXTERNAL_IDENTITY: "buyer.externalIdentity",

  HOLDER_NAME: "holder.name",
  HOLDER_EMAIL: "holder.email",

  GENERATED_AT: "generatedAt",
  DOCUMENT_VERSION: "document.version",
  TEMPLATE_REVISION: "template.revision",
});

export const TICKET_TEMPLATE_FIELD_DEFINITIONS = Object.freeze([
  { key: TICKET_TEMPLATE_FIELDS.SYSTEM_BRAND_NAME, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.SYSTEM_TICKET_TITLE, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.SYSTEM_TICKET_SUBTITLE, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.SYSTEM_QR_ENABLED, type: "boolean" },

  { key: TICKET_TEMPLATE_FIELDS.EVENT_TITLE, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.EVENT_DATE, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.EVENT_LOCATION, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.EVENT_SLUG, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.EVENT_CATEGORY, type: "string" },

  { key: TICKET_TEMPLATE_FIELDS.TICKET_CODE, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.TICKET_TYPE_NAME, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.TICKET_TYPE_DESCRIPTION, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.TICKET_PRICE, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.TICKET_CURRENCY, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.TICKET_KIND, type: "string" },

  { key: TICKET_TEMPLATE_FIELDS.BUYER_NAME, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.BUYER_EMAIL, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.BUYER_EXTERNAL_IDENTITY, type: "string" },

  { key: TICKET_TEMPLATE_FIELDS.HOLDER_NAME, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.HOLDER_EMAIL, type: "string" },

  { key: TICKET_TEMPLATE_FIELDS.GENERATED_AT, type: "string" },
  { key: TICKET_TEMPLATE_FIELDS.DOCUMENT_VERSION, type: "number" },
  { key: TICKET_TEMPLATE_FIELDS.TEMPLATE_REVISION, type: "number" },
]);

export const TICKET_TEMPLATE_FIELD_KEYS = Object.freeze(
  TICKET_TEMPLATE_FIELD_DEFINITIONS.map((field) => field.key),
);
