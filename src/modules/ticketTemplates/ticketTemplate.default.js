import {
  TICKET_TEMPLATE_CONDITION_OPERATOR,
  TICKET_TEMPLATE_ELEMENT_TYPE,
  TICKET_TEMPLATE_FONT,
} from "./ticketTemplate.constants.js";

const defaultTemplate = {
  page: {
    width: 595.28,
    height: 841.89,
    backgroundColor: "#ffffff",
  },

  elements: [
    {
      id: "ticket-title",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 48,
      width: 499.28,
      value: "{{system.ticketTitle}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 20,
      color: "#000000",
      align: "left",
    },

    {
      id: "ticket-subtitle",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 78,
      width: 499.28,
      value: "{{system.ticketSubtitle}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#555555",
      align: "left",
    },

    {
      id: "header-divider",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.LINE,
      x: 48,
      y: 112,
      x2: 547.28,
      y2: 112,
      strokeColor: "#dddddd",
      strokeWidth: 1,
    },

    {
      id: "event-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 136,
      width: 300,
      value: "Event",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 12,
      color: "#000000",
    },

    {
      id: "event-title",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 158,
      width: 300,
      value: "{{event.title}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 12,
      color: "#000000",
    },

    {
      id: "date-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 198,
      width: 76,
      value: "Date:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "date-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 104,
      y: 198,
      width: 244,
      value: "{{event.date}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "location-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 218,
      width: 76,
      value: "Location:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "location-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 104,
      y: 218,
      width: 244,
      value: "{{event.location}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "ticket-type-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 238,
      width: 76,
      value: "Ticket type:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "ticket-type-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 112,
      y: 238,
      width: 236,
      value: "{{ticket.typeName}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "ticket-code-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 258,
      width: 80,
      value: "Ticket number:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "ticket-code-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 124,
      y: 258,
      width: 224,
      value: "{{ticket.code}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "holder-name-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 278,
      width: 76,
      value: "Name:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "holder-name-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 90,
      y: 278,
      width: 258,
      value: "{{holder.name}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "holder-email-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 298,
      width: 76,
      value: "Email:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "holder-email-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 90,
      y: 298,
      width: 258,
      value: "{{holder.email}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "price-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 318,
      width: 76,
      value: "Price:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#333333",
    },

    {
      id: "price-value",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 88,
      y: 318,
      width: 260,
      value: "{{ticket.price}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#000000",
    },

    {
      id: "external-buyer",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 346,
      width: 300,
      value: "External buyer: {{buyer.externalIdentity}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 8,
      color: "#666666",

      condition: {
        field: "buyer.externalIdentity",
        operator: TICKET_TEMPLATE_CONDITION_OPERATOR.NOT_EMPTY,
      },
    },

    {
      id: "deposit-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 376,
      width: 300,
      value: "Deposit ticket note:",
      font: TICKET_TEMPLATE_FONT.HELVETICA_BOLD,
      fontSize: 10,
      color: "#000000",

      condition: {
        field: "ticket.kind",
        operator: TICKET_TEMPLATE_CONDITION_OPERATOR.EQUALS,
        value: "deposit",
      },
    },

    {
      id: "deposit-note",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 396,
      width: 300,
      value:
        "After a successful check-in, a deposit refund may be initiated automatically if deposit tickets are enabled.",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#333333",

      condition: {
        field: "ticket.kind",
        operator: TICKET_TEMPLATE_CONDITION_OPERATOR.EQUALS,
        value: "deposit",
      },
    },

    {
      id: "check-in-qr",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.QR,
      x: 378,
      y: 136,
      size: 150,
      foregroundColor: "#000000",
      backgroundColor: "#ffffff",

      condition: {
        field: "system.qrEnabled",
        operator: TICKET_TEMPLATE_CONDITION_OPERATOR.TRUTHY,
      },
    },

    {
      id: "check-in-qr-label",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 378,
      y: 294,
      width: 150,
      value: "QR code for check-in",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 9,
      color: "#555555",
      align: "center",

      condition: {
        field: "system.qrEnabled",
        operator: TICKET_TEMPLATE_CONDITION_OPERATOR.TRUTHY,
      },
    },

    {
      id: "qr-disabled-note",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 378,
      y: 136,
      width: 150,
      value: "QR code is disabled for this kiwi-events instance.",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 10,
      color: "#666666",
      align: "center",

      condition: {
        field: "system.qrEnabled",
        operator: TICKET_TEMPLATE_CONDITION_OPERATOR.FALSY,
      },
    },

    {
      id: "footer-divider",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.LINE,
      x: 48,
      y: 650,
      x2: 547.28,
      y2: 650,
      strokeColor: "#dddddd",
      strokeWidth: 1,
    },

    {
      id: "validity-note",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 670,
      width: 499.28,
      value:
        "This ticket is valid only for the specified event. The QR code may be scanned at check-in and the ticket may then be marked as used.",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 9,
      color: "#555555",
    },

    {
      id: "generated-note",
      type: TICKET_TEMPLATE_ELEMENT_TYPE.TEXT,
      x: 48,
      y: 730,
      width: 499.28,
      value:
        "Generated on {{generatedAt}} · Document version {{document.version}}",
      font: TICKET_TEMPLATE_FONT.HELVETICA,
      fontSize: 8,
      color: "#888888",
      align: "center",
    },
  ],
};

export function buildDefaultTicketTemplate() {
  return structuredClone(defaultTemplate);
}
