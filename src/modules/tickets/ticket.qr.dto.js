import { toApiId } from "../../core/dto/contractValue.dto.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(
      `Cannot serialize a ticket QR result without ${fieldName}.`,
    );
  }

  return id;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(
      `Cannot serialize a ticket QR result without ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeQrDataUrl(value) {
  const normalized = normalizeRequiredString(value, "qrDataUrl");

  const prefix = "data:image/png;base64,";

  if (!normalized.startsWith(prefix)) {
    throw new TypeError("Cannot serialize an invalid ticket QR data URL.");
  }

  const encoded = normalized.slice(prefix.length);

  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new TypeError("Cannot serialize an invalid ticket QR data URL.");
  }

  return normalized;
}

export function toPublicTicketQrDto(result) {
  if (!result) {
    throw new TypeError("Cannot serialize a missing ticket QR result.");
  }

  return {
    ticket: {
      id: requireApiId(result.ticketId, "ticketId"),

      code: normalizeRequiredString(result.ticketCode, "ticketCode"),
    },

    qr: {
      payload: normalizeRequiredString(result.payload, "payload"),

      dataUrl: normalizeQrDataUrl(result.qrDataUrl),
    },
  };
}
