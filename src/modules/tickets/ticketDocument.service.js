import { randomUUID } from "node:crypto";
import { logger } from "../../config/logger.js";
import { features } from "../../config/features.js";
import { env } from "../../config/env.js";

import { getBuffer, uploadBuffer } from "../storage/storage.service.js";

import { findEventById } from "../events/repositories/event.repository.js";

import { findTicketTypeById } from "../ticketTypes/repositories/ticketType.repository.js";

import { resolveTicketTemplateForRenderService } from "../ticketTemplates/ticketTemplate.service.js";

import { renderTicketTemplatePdfBuffer } from "../ticketTemplates/ticketTemplate.renderer.js";

import { ticketTemplateRenderAssetMissingError } from "../ticketTemplates/ticketTemplate.errors.js";

import { setTicketPdfDocument } from "./repositories/ticket.repository.js";

import {
  deleteTicketPdfStorageReferencesSafe,
  getTicketPdfStorageReference,
} from "./ticketPdfStorage.service.js";

import {
  ticketDocumentEventNotFoundError,
  ticketPdfGenerationDisabledError,
  ticketRequiredError,
} from "./ticket.errors.js";

const TICKET_DOCUMENT_VERSION = 1;

const PDF_MIME_TYPE = "application/pdf";

function getDocumentLocale() {
  return env.branding?.locale || "en-US";
}

function getBrandName() {
  return env.branding?.appName || "Kiwi Events";
}

function getTicketTitle() {
  return env.branding?.ticketTitle || "Event Ticket";
}

function getTicketSubtitle() {
  return (
    env.branding?.ticketSubtitle ||
    "Official confirmation for your booked event ticket."
  );
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(getDocumentLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(cents, currency = env.branding?.defaultCurrency || "EUR") {
  const amount = Number(cents || 0) / 100;

  return amount.toLocaleString(getDocumentLocale(), {
    style: "currency",

    currency: currency || env.branding?.defaultCurrency || "EUR",
  });
}

function cleanText(value, fallback = "—") {
  const text = String(value || "").trim();

  return text || fallback;
}

function buildPersonName({ firstName, lastName, displayName, email } = {}) {
  const explicit = String(displayName || "").trim();

  if (explicit) {
    return explicit;
  }

  const name = [firstName, lastName].filter(Boolean).join(" ").trim();

  return name || email || "—";
}

function getTicketBuyerSnapshot(ticket = {}) {
  return {
    type: ticket.buyerType || "guest",

    externalProvider: ticket.buyerExternalProvider || null,

    externalUserId: ticket.buyerExternalUserId || null,

    email: ticket.buyerEmailSnapshot || "",

    firstName: ticket.buyerFirstNameSnapshot || "",

    lastName: ticket.buyerLastNameSnapshot || "",

    displayName:
      ticket.buyerDisplayNameSnapshot ||
      [ticket.buyerFirstNameSnapshot, ticket.buyerLastNameSnapshot]
        .filter(Boolean)
        .join(" "),
  };
}

function getTicketHolderSnapshot(ticket = {}) {
  return {
    type: ticket.holderType || "buyer",

    externalProvider:
      ticket.holderExternalProvider || ticket.buyerExternalProvider || null,

    externalUserId:
      ticket.holderExternalUserId || ticket.buyerExternalUserId || null,

    email: ticket.holderEmailSnapshot || ticket.buyerEmailSnapshot || "",

    firstName:
      ticket.holderFirstNameSnapshot || ticket.buyerFirstNameSnapshot || "",

    lastName:
      ticket.holderLastNameSnapshot || ticket.buyerLastNameSnapshot || "",

    displayName:
      ticket.holderDisplayNameSnapshot ||
      ticket.buyerDisplayNameSnapshot ||
      [
        ticket.holderFirstNameSnapshot || ticket.buyerFirstNameSnapshot,

        ticket.holderLastNameSnapshot || ticket.buyerLastNameSnapshot,
      ]
        .filter(Boolean)
        .join(" "),
  };
}

function getEventStart(event, ticket) {
  if (ticket?.eventStartsAtSnapshot) {
    return ticket.eventStartsAtSnapshot;
  }

  const firstSession = Array.isArray(event?.sessions)
    ? event.sessions[0]
    : null;

  return firstSession?.startAt || null;
}

function getEventLocationLabel(event) {
  if (!event) {
    return "—";
  }

  if (typeof event.location === "string" && event.location.trim()) {
    return event.location.trim();
  }

  if (event.location?.label) {
    return event.location.label;
  }

  if (event.location?.name) {
    return event.location.name;
  }

  if (event.location?.address) {
    return event.location.address;
  }

  const firstSession = Array.isArray(event.sessions) ? event.sessions[0] : null;

  if (firstSession?.locationLabel) {
    return firstSession.locationLabel;
  }

  if (firstSession?.locationDetails) {
    return firstSession.locationDetails;
  }

  return "—";
}

function buildTicketDocumentKey(ticket, version = TICKET_DOCUMENT_VERSION) {
  return `tickets/${ticket.eventId}/${ticket.id}/ticket-v${version}-${randomUUID()}.pdf`;
}

function unwrapStorageBuffer(file) {
  if (Buffer.isBuffer(file)) {
    return file;
  }

  if (Buffer.isBuffer(file?.buffer)) {
    return file.buffer;
  }

  if (Buffer.isBuffer(file?.content)) {
    return file.content;
  }

  return null;
}

function buildExternalIdentity(buyer) {
  if (!buyer.externalProvider && !buyer.externalUserId) {
    return "";
  }

  return [
    buyer.externalProvider || "external",

    buyer.externalUserId || "unknown",
  ].join(":");
}

function buildTemplateFields({
  ticket,
  event,
  ticketType,
  buyer,
  holder,
  templateRevision,
  generatedAt,
}) {
  return {
    "system.brandName": getBrandName(),

    "system.ticketTitle": getTicketTitle(),

    "system.ticketSubtitle": getTicketSubtitle(),

    "system.qrEnabled": Boolean(features.ticketQr),

    "event.title": cleanText(ticket.eventTitleSnapshot || event?.title),

    "event.date": formatDateTime(getEventStart(event, ticket)),

    "event.location": getEventLocationLabel(event),

    "event.slug": cleanText(ticket.eventSlugSnapshot || event?.slug),

    "event.category": cleanText(
      ticket.eventCategorySnapshot || event?.category,
    ),

    "ticket.code": cleanText(ticket.ticketCode),

    "ticket.typeName": cleanText(
      ticket.ticketTypeNameSnapshot ||
        ticketType?.displayName ||
        ticketType?.name,
    ),

    "ticket.typeDescription": cleanText(
      ticket.ticketTypeDescriptionSnapshot || ticketType?.description,

      "",
    ),

    "ticket.price": formatMoney(ticket.unitPrice, ticket.currency),

    "ticket.currency": cleanText(
      ticket.currency,
      env.branding?.defaultCurrency || "EUR",
    ),

    "ticket.kind": cleanText(ticket.ticketKind, "normal"),

    "buyer.name": buildPersonName(buyer),

    "buyer.email": cleanText(buyer.email),

    "buyer.externalIdentity": buildExternalIdentity(buyer),

    "holder.name": buildPersonName(holder),

    "holder.email": cleanText(holder.email),

    generatedAt: formatDateTime(generatedAt),

    "document.version": TICKET_DOCUMENT_VERSION,

    "template.revision": Number(templateRevision || 0),
  };
}

async function loadTemplateImageBuffers({ eventId, imageAssets = [] }) {
  const entries = await Promise.all(
    imageAssets.map(async (asset) => {
      let file;

      try {
        file = await getBuffer({
          key: asset.key,

          storageTarget: asset.storageTarget,
        });
      } catch {
        throw ticketTemplateRenderAssetMissingError({
          eventId,

          assetId: asset.id,
        });
      }

      const buffer = unwrapStorageBuffer(file);

      if (!buffer) {
        throw ticketTemplateRenderAssetMissingError({
          eventId,

          assetId: asset.id,
        });
      }

      return [String(asset.id), buffer];
    }),
  );

  return new Map(entries);
}

async function getStoredTicketPdfBuffer(ticket) {
  const key = ticket.ticketPdfStorageKey || null;

  if (!key) {
    return null;
  }

  const file = await getBuffer({
    key,

    storageTarget: ticket.ticketPdfStorageTarget,
  });

  return unwrapStorageBuffer(file);
}

export async function buildExistingOfficialTicketAttachment({ ticket }) {
  let file = null;

  try {
    file = await getStoredTicketPdfBuffer(ticket);
  } catch (error) {
    logger.warn("ticket.pdf_attachment_load_failed", {
      ticketId: ticket.id,

      ticketCode: ticket?.ticketCode || null,

      storageKey: ticket?.ticketPdfStorageKey || null,

      error,
    });

    return null;
  }

  if (!file) {
    return null;
  }

  return {
    filename: `ticket-${ticket.ticketCode}.pdf`,

    content: file,

    contentType: PDF_MIME_TYPE,
  };
}

export async function generateOfficialTicketDocument({ ticket }) {
  if (!features.ticketPdf) {
    throw ticketPdfGenerationDisabledError();
  }

  if (!ticket?.id) {
    throw ticketRequiredError();
  }

  const event = await findEventById(
    ticket.eventId,

    {
      lean: true,
    },
  );

  if (!event) {
    throw ticketDocumentEventNotFoundError(ticket.eventId);
  }

  const [ticketType, effectiveTemplate] = await Promise.all([
    ticket.ticketTypeId
      ? findTicketTypeById(
          ticket.ticketTypeId,

          {
            lean: true,
          },
        )
      : null,

    resolveTicketTemplateForRenderService(event.id),
  ]);

  const buyer = getTicketBuyerSnapshot(ticket);

  const holder = getTicketHolderSnapshot(ticket);

  const generatedAt = new Date();

  const imageBuffers = await loadTemplateImageBuffers({
    eventId: event.id,

    imageAssets: effectiveTemplate.imageAssets || [],
  });

  const fields = buildTemplateFields({
    ticket,
    event,
    ticketType,
    buyer,
    holder,

    templateRevision: effectiveTemplate.revision,

    generatedAt,
  });

  const pdfBuffer = await renderTicketTemplatePdfBuffer({
    ticket,

    template: effectiveTemplate.template,

    fields,

    imageBuffers,

    info: {
      Title: `${getBrandName()} Ticket ${ticket.ticketCode}`,

      Author: getBrandName(),

      Subject: getTicketTitle(),
    },
  });

  const version = TICKET_DOCUMENT_VERSION;

  const key = buildTicketDocumentKey(ticket, version);
  const previousStorageReference = getTicketPdfStorageReference(ticket);
  const upload = await uploadBuffer({
    storageTarget: env.storage.generated.ticketPdfTarget,

    buffer: pdfBuffer,

    mimeType: PDF_MIME_TYPE,

    originalName: `ticket-${ticket.ticketCode}.pdf`,

    key,
  });
  const uploadedStorageReference = {
    key: upload.key,

    storageTarget: upload.storageTarget,
  };

  let updatedTicket;

  try {
    updatedTicket = await setTicketPdfDocument(
      ticket.id,

      {
        ticketPdfStorageKey: upload.key,

        ticketPdfStorageTarget: upload.storageTarget,

        ticketPdfGeneratedAt: generatedAt,

        updatedByEventUserId: ticket.updatedByEventUserId || null,
      },
    );
  } catch (error) {
    await deleteTicketPdfStorageReferencesSafe([uploadedStorageReference], {
      ticketId: ticket.id,
      reason: "ticket_pdf_persist_failed",
    });

    throw error;
  }

  if (previousStorageReference) {
    await deleteTicketPdfStorageReferencesSafe([previousStorageReference], {
      ticketId: ticket.id,
      reason: "ticket_pdf_replaced",
    });
  }

  return {
    ticket: updatedTicket,

    event,

    ticketType,

    buyer,

    holder,

    pdfBuffer,

    document: {
      mimeType: PDF_MIME_TYPE,

      filename: `ticket-${ticket.ticketCode}.pdf`,

      version,

      templateSource: effectiveTemplate.source,

      templateRevision: effectiveTemplate.revision,
    },
  };
}

export async function buildOfficialTicketAttachment({
  ticket,
  forceRegenerate = false,
}) {
  if (!features.ticketPdf) {
    return null;
  }

  if (!forceRegenerate) {
    const existingAttachment = await buildExistingOfficialTicketAttachment({
      ticket,
    });

    if (existingAttachment) {
      return existingAttachment;
    }
  }

  const result = await generateOfficialTicketDocument({
    ticket,
  });

  return {
    filename: result.document.filename,

    content: result.pdfBuffer,

    contentType: result.document.mimeType,
  };
}
