// src/modules/tickets/ticket.controller.js

import {
  listOwnTicketsService,
  getOwnTicketByIdService,
  getInternalTicketByIdService,
  cancelInternalTicketService,
  setInternalTicketCheckInService,
  listEventTicketsInternalService,
  lookupTicketForCheckInService,
  confirmTicketCheckInService,
  lookupTicketForCheckInPayloadService,
  confirmTicketCheckInPayloadService,
  getOwnTicketQrService,
  getOwnTicketDocumentService,
  getGuestTicketQrService,
  getGuestTicketDocumentService,
} from "./ticket.service.js";

import { sendSuccess } from "../../core/http/response.js";

import { toPublicTicketQrDto } from "./ticket.qr.dto.js";

function buildExternalActor(req) {
  const identity = req.identity || {};

  return {
    externalProvider: identity.externalProvider || null,
    externalUserId: identity.externalUserId || null,
    email: identity.email || null,
    rawClaims: identity.rawClaims || null,
    eventUserId: req.eventUser?.id || null,
    eventUser: req.eventUser || null,
  };
}

function buildInternalActor(req) {
  return {
    eventUserId: req.eventUser?.id || null,
    eventUser: req.eventUser || null,
  };
}

export async function listOwnTickets(req, res) {
  const query = req.validated.query;

  const result = await listOwnTicketsService({
    actor: buildExternalActor(req),

    page: query.page,

    limit: query.limit,

    status: query.status,

    eventId: query.eventId,

    orderId: query.orderId,
  });

  return sendSuccess(res, {
    data: result.items,

    meta: {
      pagination: result.pagination,
    },
  });
}

export async function getOwnTicketById(req, res) {
  const { id } = req.validated.params;

  const ticket = await getOwnTicketByIdService({
    actor: buildExternalActor(req),

    ticketId: id,
  });

  return sendSuccess(res, {
    data: ticket,
  });
}

export async function getOwnTicketQr(req, res) {
  const { id } = req.validated.params;

  const result = await getOwnTicketQrService({
    actor: buildExternalActor(req),

    ticketId: id,
  });

  return sendSuccess(res, {
    data: toPublicTicketQrDto(result),
  });
}

export async function downloadOwnTicketDocument(req, res) {
  const { id } = req.validated.params;

  const result = await getOwnTicketDocumentService({
    actor: buildExternalActor(req),
    ticketId: id,
  });

  res.setHeader("Content-Type", result.contentType || "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${result.filename}"`,
  );

  if (result.contentLength) {
    res.setHeader("Content-Length", String(result.contentLength));
  }

  return res.status(200).send(result.buffer);
}

export async function listEventTicketsInternal(req, res) {
  const { eventId } = req.validated.params;

  const query = req.validated.query;

  const result = await listEventTicketsInternalService({
    actor: buildInternalActor(req),

    eventId,

    page: query.page,

    limit: query.limit,

    status: query.status,

    search: query.search,

    sortBy: query.sortBy,

    sortOrder: query.sortOrder,
  });

  return sendSuccess(res, {
    data: result.items,

    meta: result.meta,
  });
}

export async function getInternalTicketById(req, res) {
  const { id } = req.validated.params;

  const ticket = await getInternalTicketByIdService({
    actor: buildInternalActor(req),

    ticketId: id,
  });

  return sendSuccess(res, {
    data: ticket,
  });
}

export async function cancelInternalTicket(req, res) {
  const { id } = req.validated.params;
  const payload = req.validated.body;

  const result = await cancelInternalTicketService({
    actor: buildInternalActor(req),
    ticketId: id,
    reason: payload.reason,
  });

  return sendSuccess(res, {
    data: result.ticket,

    meta: {
      cancellation: {
        statusChanged: result.statusChanged,
      },
    },
  });
}

export async function setInternalTicketCheckIn(req, res) {
  const { id } = req.validated.params;
  const { checkedIn } = req.validated.body;

  const result = await setInternalTicketCheckInService({
    actor: buildInternalActor(req),
    ticketId: id,
    checkedIn,
  });

  return sendSuccess(res, {
    data: result.ticket,

    meta: {
      checkIn: {
        requestedCheckedIn: checkedIn,
        statusChanged: result.statusChanged,
      },
    },
  });
}

export async function lookupTicketForCheckIn(req, res) {
  const { ticketCode } = req.validated.body;

  const result = await lookupTicketForCheckInService({
    actor: buildInternalActor(req),
    ticketCode,
  });

  return sendSuccess(res, {
    data: result.ticket,

    meta: {
      checkIn: result.checkIn,
    },
  });
}

export async function confirmTicketCheckIn(req, res) {
  const { ticketCode } = req.validated.body;

  const result = await confirmTicketCheckInService({
    actor: buildInternalActor(req),
    ticketCode,
  });

  return sendSuccess(res, {
    data: result.ticket,

    meta: {
      checkIn: result.checkIn,
    },
  });
}
export async function lookupTicketForCheckInPayload(req, res) {
  const { payload } = req.validated.body;

  const result = await lookupTicketForCheckInPayloadService({
    actor: buildInternalActor(req),
    payload,
  });

  return sendSuccess(res, {
    data: result.ticket,

    meta: {
      checkIn: result.checkIn,
    },
  });
}

export async function confirmTicketCheckInPayload(req, res) {
  const { payload } = req.validated.body;

  const result = await confirmTicketCheckInPayloadService({
    actor: buildInternalActor(req),
    payload,
  });

  return sendSuccess(res, {
    data: result.ticket,

    meta: {
      checkIn: result.checkIn,
    },
  });
}
export async function getGuestTicketQr(req, res) {
  const { id } = req.validated.params;

  const { accessToken } = req.validated.query;

  const result = await getGuestTicketQrService({
    ticketId: id,

    accessToken,
  });

  return sendSuccess(res, {
    data: toPublicTicketQrDto(result),
  });
}

export async function downloadGuestTicketDocument(req, res) {
  const { id } = req.validated.params;
  const { accessToken } = req.validated.query;

  const result = await getGuestTicketDocumentService({
    ticketId: id,
    accessToken,
  });

  res.setHeader("Content-Type", result.contentType || "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${result.filename}"`,
  );

  if (result.contentLength) {
    res.setHeader("Content-Length", String(result.contentLength));
  }

  return res.status(200).send(result.buffer);
}
