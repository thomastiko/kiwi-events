import { describe, expect, it } from "vitest";

import { buildDefaultTicketTemplate } from "../../../src/modules/ticketTemplates/ticketTemplate.default.js";

import {
  collectTicketTemplateImageAssetIds,
  ticketTemplateSchema,
} from "../../../src/modules/ticketTemplates/ticketTemplate.schema.js";

function buildBaseTemplate(elements = []) {
  return {
    page: {
      width: 595.28,
      height: 841.89,
      backgroundColor: "#ffffff",
    },
    elements,
  };
}

describe("ticket template schema", () => {
  it("accepts the system default template", () => {
    const result = ticketTemplateSchema.safeParse(buildDefaultTicketTemplate());

    expect(result.success).toBe(true);
  });

  it("accepts declarative text, qr, image, line and rectangle elements", () => {
    const result = ticketTemplateSchema.safeParse(
      buildBaseTemplate([
        {
          id: "title",
          type: "text",
          x: 20,
          y: 20,
          width: 300,
          value: "{{event.title}} · {{ticket.code}}",
          font: "Helvetica-Bold",
          fontSize: 18,
          color: "#112233",
          align: "left",
        },
        {
          id: "qr",
          type: "qr",
          x: 400,
          y: 20,
          size: 120,
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
          condition: {
            field: "system.qrEnabled",
            operator: "truthy",
          },
        },
        {
          id: "logo",
          type: "image",
          x: 20,
          y: 100,
          width: 120,
          height: 60,
          assetId: "6a0000000000000000000001",
          fit: "contain",
          align: "center",
          valign: "center",
        },
        {
          id: "divider",
          type: "line",
          x: 20,
          y: 180,
          x2: 575,
          y2: 180,
          strokeColor: "#dddddd",
          strokeWidth: 1,
        },
        {
          id: "box",
          type: "rect",
          x: 20,
          y: 200,
          width: 200,
          height: 80,
          fillColor: "#eeeeee",
          strokeColor: "#111111",
          strokeWidth: 1,
          radius: 8,
        },
      ]),
    );

    expect(result.success).toBe(true);
  });

  it("rejects unknown dynamic fields", () => {
    const result = ticketTemplateSchema.safeParse(
      buildBaseTemplate([
        {
          id: "unsafe-field",
          type: "text",
          x: 20,
          y: 20,
          width: 300,
          value: "{{process.env.SECRET}}",
        },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Unsupported template field: process.env.SECRET.",
        }),
      ]),
    );
  });

  it("rejects duplicate element ids and elements outside the page", () => {
    const result = ticketTemplateSchema.safeParse(
      buildBaseTemplate([
        {
          id: "duplicate",
          type: "text",
          x: 20,
          y: 20,
          width: 100,
          value: "First",
        },
        {
          id: "duplicate",
          type: "text",
          x: 550,
          y: 50,
          width: 100,
          value: "Second",
        },
      ]),
    );

    expect(result.success).toBe(false);

    const messages = result.error.issues.map((issue) => issue.message);

    expect(messages).toContain("Element ids must be unique.");
    expect(messages).toContain("Element exceeds page width.");
  });

  it("requires condition values for equality operators", () => {
    const result = ticketTemplateSchema.safeParse(
      buildBaseTemplate([
        {
          id: "conditional",
          type: "text",
          x: 20,
          y: 20,
          width: 200,
          value: "Deposit",
          condition: {
            field: "ticket.kind",
            operator: "equals",
          },
        },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Condition value is required for this operator.",
        }),
      ]),
    );
  });

  it("requires rectangles to have a fill or stroke color", () => {
    const result = ticketTemplateSchema.safeParse(
      buildBaseTemplate([
        {
          id: "empty-rect",
          type: "rect",
          x: 20,
          y: 20,
          width: 100,
          height: 100,
          fillColor: null,
          strokeColor: null,
        },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Rectangle requires fillColor or strokeColor.",
        }),
      ]),
    );
  });

  it("collects unique image asset ids in first-use order", () => {
    const template = buildBaseTemplate([
      {
        id: "logo-a",
        type: "image",
        x: 20,
        y: 20,
        width: 100,
        height: 50,
        assetId: "6a0000000000000000000001",
      },
      {
        id: "title",
        type: "text",
        x: 20,
        y: 90,
        width: 200,
        value: "Ticket",
      },
      {
        id: "logo-a-again",
        type: "image",
        x: 20,
        y: 120,
        width: 100,
        height: 50,
        assetId: "6a0000000000000000000001",
      },
      {
        id: "logo-b",
        type: "image",
        x: 20,
        y: 190,
        width: 100,
        height: 50,
        assetId: "6a0000000000000000000002",
      },
    ]);

    expect(collectTicketTemplateImageAssetIds(template)).toEqual([
      "6a0000000000000000000001",
      "6a0000000000000000000002",
    ]);
  });
});
