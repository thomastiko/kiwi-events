import { describe, expect, it } from "vitest";

import { toPublicTicketQrDto } from "../../../src/modules/tickets/ticket.qr.dto.js";

const TICKET_ID = "64f300000000000000000001";

const QR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9rQAAAAASUVORK5CYII=";

function buildQrResult() {
  return {
    ticketId: TICKET_ID,

    ticketCode: "TKT-QR-ABC123",

    payload: "kiwi-ticket:v1:encrypted-payload",

    qrDataUrl: QR_DATA_URL,

    _id: "must-not-leak",

    encryptedCheckInToken: "must-not-leak",

    checkInTokenHash: "must-not-leak",

    internalMetadata: {
      mustNotLeak: true,
    },
  };
}

describe("public ticket QR DTO contract", () => {
  it("serializes the canonical ticket QR contract", () => {
    const result = toPublicTicketQrDto(buildQrResult());

    expect(result).toEqual({
      ticket: {
        id: TICKET_ID,

        code: "TKT-QR-ABC123",
      },

      qr: {
        payload: "kiwi-ticket:v1:encrypted-payload",

        dataUrl: QR_DATA_URL,
      },
    });
  });

  it("does not expose persistence, credential or metadata fields", () => {
    const serialized = JSON.stringify(toPublicTicketQrDto(buildQrResult()));

    for (const field of [
      "_id",
      "encryptedCheckInToken",
      "checkInTokenHash",
      "internalMetadata",
      "ticketId",
      "ticketCode",
      "qrDataUrl",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    expect(serialized).toContain('"ticket"');

    expect(serialized).toContain('"qr"');
  });

  it("does not use _id as a compatibility fallback", () => {
    const result = buildQrResult();

    result.ticketId = null;

    result._id = TICKET_ID;

    expect(() => toPublicTicketQrDto(result)).toThrow(
      "Cannot serialize a ticket QR result without ticketId.",
    );
  });

  it("rejects missing ticket and payload values", () => {
    const missingCode = buildQrResult();

    missingCode.ticketCode = " ";

    expect(() => toPublicTicketQrDto(missingCode)).toThrow(
      "Cannot serialize a ticket QR result without ticketCode.",
    );

    const missingPayload = buildQrResult();

    missingPayload.payload = null;

    expect(() => toPublicTicketQrDto(missingPayload)).toThrow(
      "Cannot serialize a ticket QR result without payload.",
    );
  });

  it("rejects non-PNG and malformed QR data URLs", () => {
    const wrongType = buildQrResult();

    wrongType.qrDataUrl = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";

    expect(() => toPublicTicketQrDto(wrongType)).toThrow(
      "Cannot serialize an invalid ticket QR data URL.",
    );

    const malformed = buildQrResult();

    malformed.qrDataUrl = "data:image/png;base64,not valid base64!";

    expect(() => toPublicTicketQrDto(malformed)).toThrow(
      "Cannot serialize an invalid ticket QR data URL.",
    );
  });
});
