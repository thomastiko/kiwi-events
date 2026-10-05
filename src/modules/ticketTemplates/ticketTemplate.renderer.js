import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { buildQrPayloadFromEncryptedToken } from "../tickets/ticketCredential.service.js";

import { ticketQrTokenMissingForDocumentError } from "../tickets/ticket.errors.js";

import {
  TICKET_TEMPLATE_CONDITION_OPERATOR,
  TICKET_TEMPLATE_ELEMENT_TYPE,
} from "./ticketTemplate.constants.js";

function buildPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on("error", reject);

    doc.end();
  });
}

function getField(fields, key) {
  return fields[key];
}

function interpolate(value, fields) {
  return String(value || "").replace(
    /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
    (_, key) => {
      const resolved = getField(fields, key);

      if (resolved === null || resolved === undefined) {
        return "";
      }

      return String(resolved);
    },
  );
}

function matchesCondition(condition, fields) {
  if (!condition) {
    return true;
  }

  const value = getField(fields, condition.field);

  switch (condition.operator) {
    case TICKET_TEMPLATE_CONDITION_OPERATOR.EQUALS:
      return value === condition.value;

    case TICKET_TEMPLATE_CONDITION_OPERATOR.NOT_EQUALS:
      return value !== condition.value;

    case TICKET_TEMPLATE_CONDITION_OPERATOR.EMPTY:
      return (
        value === null || value === undefined || String(value).trim() === ""
      );

    case TICKET_TEMPLATE_CONDITION_OPERATOR.NOT_EMPTY:
      return (
        value !== null && value !== undefined && String(value).trim() !== ""
      );

    case TICKET_TEMPLATE_CONDITION_OPERATOR.TRUTHY:
      return Boolean(value);

    case TICKET_TEMPLATE_CONDITION_OPERATOR.FALSY:
      return !value;

    default:
      return false;
  }
}

function applyElementState(doc, element) {
  doc.save();

  if (element.opacity !== undefined) {
    doc.opacity(element.opacity);
  }

  if (element.rotation) {
    doc.rotate(element.rotation, {
      origin: [element.x, element.y],
    });
  }
}

function renderText(doc, element, fields) {
  const options = {
    width: element.width,
    align: element.align,
    lineGap: element.lineGap || 0,
    characterSpacing: element.characterSpacing || 0,
    underline: Boolean(element.underline),
  };

  if (element.height) {
    options.height = element.height;
  }

  doc
    .font(element.font)
    .fontSize(element.fontSize)
    .fillColor(element.color)
    .text(interpolate(element.value, fields), element.x, element.y, options);
}

function renderLine(doc, element) {
  doc
    .lineWidth(element.strokeWidth)
    .strokeColor(element.strokeColor)
    .moveTo(element.x, element.y)
    .lineTo(element.x2, element.y2)
    .stroke();
}

function renderRect(doc, element) {
  const shape =
    element.radius > 0
      ? doc.roundedRect(
          element.x,
          element.y,
          element.width,
          element.height,
          element.radius,
        )
      : doc.rect(element.x, element.y, element.width, element.height);

  if (element.fillColor && element.strokeColor) {
    shape
      .fillColor(element.fillColor)
      .strokeColor(element.strokeColor)
      .lineWidth(element.strokeWidth)
      .fillAndStroke();

    return;
  }

  if (element.fillColor) {
    shape.fillColor(element.fillColor).fill();
    return;
  }

  shape
    .strokeColor(element.strokeColor)
    .lineWidth(element.strokeWidth)
    .stroke();
}

function renderImage(doc, element, imageBuffers) {
  const buffer = imageBuffers.get(String(element.assetId));

  if (!buffer) {
    throw new Error(
      `Ticket template image buffer missing for asset ${String(
        element.assetId,
      )}.`,
    );
  }

  let options;

  if (element.fit === "stretch") {
    options = {
      width: element.width,
      height: element.height,
    };
  } else if (element.fit === "cover") {
    options = {
      cover: [element.width, element.height],
      align: element.align,
      valign: element.valign,
    };
  } else {
    options = {
      fit: [element.width, element.height],
      align: element.align,
      valign: element.valign,
    };
  }

  doc.image(buffer, element.x, element.y, options);
}

async function buildQrBuffer(ticket, element) {
  const encryptedToken =
    ticket.encryptedCheckInToken ||
    ticket.checkInTokenEncrypted ||
    ticket.encrypted_check_in_token ||
    null;

  if (!encryptedToken) {
    throw ticketQrTokenMissingForDocumentError(ticket.id);
  }

  const payload = buildQrPayloadFromEncryptedToken(encryptedToken);

  return QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,

    color: {
      dark: element.foregroundColor,
      light: element.backgroundColor,
    },
  });
}

export async function renderTicketTemplatePdfBuffer({
  ticket,
  template,
  fields,
  imageBuffers = new Map(),
  info = {},
}) {
  const doc = new PDFDocument({
    size: [template.page.width, template.page.height],

    margin: 0,
    info,
  });

  doc
    .rect(0, 0, template.page.width, template.page.height)
    .fillColor(template.page.backgroundColor)
    .fill();

  const qrBuffers = new Map();

  for (const element of template.elements) {
    if (!matchesCondition(element.condition, fields)) {
      continue;
    }

    // QR is a platform capability and must not be re-enabled
    // by a custom template when QR generation is disabled.
    if (
      element.type === TICKET_TEMPLATE_ELEMENT_TYPE.QR &&
      !fields["system.qrEnabled"]
    ) {
      continue;
    }

    applyElementState(doc, element);

    try {
      switch (element.type) {
        case TICKET_TEMPLATE_ELEMENT_TYPE.TEXT:
          renderText(doc, element, fields);
          break;

        case TICKET_TEMPLATE_ELEMENT_TYPE.LINE:
          renderLine(doc, element);
          break;

        case TICKET_TEMPLATE_ELEMENT_TYPE.RECT:
          renderRect(doc, element);
          break;

        case TICKET_TEMPLATE_ELEMENT_TYPE.IMAGE:
          renderImage(doc, element, imageBuffers);
          break;

        case TICKET_TEMPLATE_ELEMENT_TYPE.QR: {
          const qrKey = [element.foregroundColor, element.backgroundColor].join(
            ":",
          );

          let qrBuffer = qrBuffers.get(qrKey);

          if (!qrBuffer) {
            qrBuffer = await buildQrBuffer(ticket, element);

            qrBuffers.set(qrKey, qrBuffer);
          }

          doc.image(qrBuffer, element.x, element.y, {
            width: element.size,
            height: element.size,
          });

          break;
        }
        default:
          throw new Error(
            `Unsupported ticket template element type: ${element.type}`,
          );
      }
    } finally {
      doc.restore();
    }
  }

  return buildPdfBuffer(doc);
}
