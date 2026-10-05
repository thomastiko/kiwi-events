import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let documentInstances;
let qrToBufferMock;
let buildQrPayloadMock;
let renderTicketTemplatePdfBuffer;

class MockPdfDocument extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = options;
    this.textCalls = [];
    this.imageCalls = [];
    this.rotationCalls = [];
    this.opacityCalls = [];

    documentInstances.push(this);
  }

  rect() {
    return this;
  }

  roundedRect() {
    return this;
  }

  fillColor() {
    return this;
  }

  strokeColor() {
    return this;
  }

  lineWidth() {
    return this;
  }

  fill() {
    return this;
  }

  stroke() {
    return this;
  }

  fillAndStroke() {
    return this;
  }

  moveTo() {
    return this;
  }

  lineTo() {
    return this;
  }

  save() {
    return this;
  }

  restore() {
    return this;
  }

  font() {
    return this;
  }

  fontSize() {
    return this;
  }

  opacity(value) {
    this.opacityCalls.push(value);
    return this;
  }

  rotate(value, options) {
    this.rotationCalls.push({
      value,
      options,
    });

    return this;
  }

  text(value, x, y, options) {
    this.textCalls.push({
      value,
      x,
      y,
      options,
    });

    return this;
  }

  image(buffer, x, y, options) {
    this.imageCalls.push({
      buffer,
      x,
      y,
      options,
    });

    return this;
  }

  end() {
    this.emit("data", Buffer.from("%PDF-MOCK"));
    this.emit("end");
  }
}

function buildPage(elements) {
  return {
    page: {
      width: 500,
      height: 700,
      backgroundColor: "#ffffff",
    },
    elements,
  };
}

beforeEach(async () => {
  vi.resetModules();

  documentInstances = [];
  qrToBufferMock = vi.fn().mockResolvedValue(Buffer.from("qr-image"));
  buildQrPayloadMock = vi.fn().mockReturnValue("kiwi-events:check-in:payload");

  vi.doMock("pdfkit", () => ({
    default: MockPdfDocument,
  }));

  vi.doMock("qrcode", () => ({
    default: {
      toBuffer: qrToBufferMock,
    },
  }));

  vi.doMock("../../../src/modules/tickets/ticketCredential.service.js", () => ({
    buildQrPayloadFromEncryptedToken: buildQrPayloadMock,
  }));

  const rendererModule =
    await import("../../../src/modules/ticketTemplates/ticketTemplate.renderer.js");

  renderTicketTemplatePdfBuffer = rendererModule.renderTicketTemplatePdfBuffer;
});

afterEach(() => {
  vi.doUnmock("pdfkit");
  vi.doUnmock("qrcode");
  vi.doUnmock("../../../src/modules/tickets/ticketCredential.service.js");

  vi.restoreAllMocks();
  vi.resetModules();
});

describe("ticket template renderer", () => {
  it("renders interpolated text, conditions and image placement", async () => {
    const imageBuffer = Buffer.from("logo-image");

    const pdf = await renderTicketTemplatePdfBuffer({
      ticket: {
        id: "ticket-1",
      },
      fields: {
        "event.title": "Summer Party",
        "ticket.kind": "normal",
        "system.qrEnabled": false,
      },
      imageBuffers: new Map([["6a0000000000000000000001", imageBuffer]]),
      template: buildPage([
        {
          id: "title",
          type: "text",
          x: 20,
          y: 20,
          width: 300,
          value: "Event: {{event.title}}",
          font: "Helvetica",
          fontSize: 12,
          color: "#000000",
          align: "left",
          opacity: 0.75,
          rotation: 5,
        },
        {
          id: "deposit-only",
          type: "text",
          x: 20,
          y: 50,
          width: 300,
          value: "Deposit",
          font: "Helvetica",
          fontSize: 12,
          color: "#000000",
          align: "left",
          condition: {
            field: "ticket.kind",
            operator: "equals",
            value: "deposit",
          },
        },
        {
          id: "logo",
          type: "image",
          x: 20,
          y: 100,
          width: 100,
          height: 60,
          assetId: "6a0000000000000000000001",
          fit: "cover",
          align: "center",
          valign: "center",
        },
      ]),
    });

    expect(pdf.equals(Buffer.from("%PDF-MOCK"))).toBe(true);

    const doc = documentInstances[0];

    expect(doc.textCalls).toEqual([
      expect.objectContaining({
        value: "Event: Summer Party",
        x: 20,
        y: 20,
      }),
    ]);

    expect(doc.imageCalls).toEqual([
      {
        buffer: imageBuffer,
        x: 20,
        y: 100,
        options: {
          cover: [100, 60],
          align: "center",
          valign: "center",
        },
      },
    ]);

    expect(doc.opacityCalls).toContain(0.75);
    expect(doc.rotationCalls).toEqual([
      {
        value: 5,
        options: {
          origin: [20, 20],
        },
      },
    ]);
  });

  it("does not build a QR code when system QR generation is disabled", async () => {
    await expect(
      renderTicketTemplatePdfBuffer({
        ticket: {
          id: "ticket-without-token",
        },
        fields: {
          "system.qrEnabled": false,
        },
        template: buildPage([
          {
            id: "qr",
            type: "qr",
            x: 20,
            y: 20,
            size: 100,
            foregroundColor: "#000000",
            backgroundColor: "#ffffff",
          },
        ]),
      }),
    ).resolves.toEqual(Buffer.from("%PDF-MOCK"));

    expect(qrToBufferMock).not.toHaveBeenCalled();
    expect(buildQrPayloadMock).not.toHaveBeenCalled();
  });

  it("reuses QR buffers for identical colors and separates different QR styles", async () => {
    await renderTicketTemplatePdfBuffer({
      ticket: {
        id: "ticket-qr",
        encryptedCheckInToken: "encrypted-token",
      },
      fields: {
        "system.qrEnabled": true,
      },
      template: buildPage([
        {
          id: "qr-black-a",
          type: "qr",
          x: 20,
          y: 20,
          size: 100,
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
        },
        {
          id: "qr-black-b",
          type: "qr",
          x: 140,
          y: 20,
          size: 100,
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
        },
        {
          id: "qr-blue",
          type: "qr",
          x: 260,
          y: 20,
          size: 100,
          foregroundColor: "#0000ff",
          backgroundColor: "#ffffff",
        },
      ]),
    });

    expect(qrToBufferMock).toHaveBeenCalledTimes(2);
    expect(buildQrPayloadMock).toHaveBeenCalledTimes(2);

    const doc = documentInstances[0];

    expect(doc.imageCalls).toHaveLength(3);
  });

  it("fails when an image element has no resolved image buffer", async () => {
    await expect(
      renderTicketTemplatePdfBuffer({
        ticket: {
          id: "ticket-image",
        },
        fields: {
          "system.qrEnabled": false,
        },
        template: buildPage([
          {
            id: "missing-logo",
            type: "image",
            x: 20,
            y: 20,
            width: 100,
            height: 60,
            assetId: "6a0000000000000000000001",
            fit: "contain",
            align: "center",
            valign: "center",
          },
        ]),
      }),
    ).rejects.toThrow(
      "Ticket template image buffer missing for asset 6a0000000000000000000001.",
    );
  });
});
