import { describe, expect, it } from "vitest";

import { renderTicketTemplatePdfBuffer } from "../../../src/modules/ticketTemplates/ticketTemplate.renderer.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

describe("ticket template renderer PDF output", () => {
  it("renders a real PDF with text, shapes and a PNG image", async () => {
    const pdf = await renderTicketTemplatePdfBuffer({
      ticket: {
        id: "ticket-real-pdf",
      },
      fields: {
        "event.title": "Real PDF Event",
        "system.qrEnabled": false,
      },
      imageBuffers: new Map([["6a0000000000000000000001", ONE_PIXEL_PNG]]),
      template: {
        page: {
          width: 300,
          height: 400,
          backgroundColor: "#ffffff",
        },
        elements: [
          {
            id: "background-box",
            type: "rect",
            x: 10,
            y: 10,
            width: 280,
            height: 100,
            fillColor: "#eeeeee",
            strokeColor: "#111111",
            strokeWidth: 1,
            radius: 5,
          },
          {
            id: "title",
            type: "text",
            x: 20,
            y: 20,
            width: 180,
            value: "{{event.title}}",
            font: "Helvetica-Bold",
            fontSize: 14,
            color: "#000000",
            align: "left",
          },
          {
            id: "logo",
            type: "image",
            x: 220,
            y: 20,
            width: 50,
            height: 50,
            assetId: "6a0000000000000000000001",
            fit: "contain",
            align: "center",
            valign: "center",
          },
          {
            id: "divider",
            type: "line",
            x: 20,
            y: 130,
            x2: 280,
            y2: 130,
            strokeColor: "#333333",
            strokeWidth: 1,
          },
        ],
      },
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
