import { sendSuccess } from "../../../core/http/response.js";

import {
  createTicketTypeService,
  deleteTicketTypeService,
  getTicketTypeByIdService,
  listTicketTypesService,
  updateTicketTypeService,
} from "./ticketType.internal.service.js";

function getEventUserId(req) {
  return req.eventUser?.id || null;
}

function buildActor(req) {
  return {
    eventUserId: getEventUserId(req),
    eventUser: req.eventUser || null,
  };
}

export async function listTicketTypes(req, res) {
  const filters = req.validated?.query || req.query || {};

  const ticketTypes = await listTicketTypesService(filters, buildActor(req));

  return sendSuccess(res, {
    data: ticketTypes,
  });
}

export async function getTicketTypeById(req, res) {
  const { id } = req.validated.params;

  const ticketType = await getTicketTypeByIdService(id, buildActor(req));

  return sendSuccess(res, {
    data: ticketType,
  });
}

export async function createTicketType(req, res) {
  const payload = req.validated.body;
  const actor = buildActor(req);

  const ticketType = await createTicketTypeService(
    {
      ...payload,
      createdByEventUserId: actor.eventUserId,
      updatedByEventUserId: actor.eventUserId,
    },
    actor,
  );

  return sendSuccess(res, {
    status: 201,
    data: ticketType,
  });
}

export async function updateTicketType(req, res) {
  const { id } = req.validated.params;
  const payload = req.validated.body;
  const actor = buildActor(req);

  const ticketType = await updateTicketTypeService(
    id,
    {
      ...payload,
      updatedByEventUserId: actor.eventUserId,
    },
    actor,
  );

  return sendSuccess(res, {
    data: ticketType,
  });
}

export async function deleteTicketType(req, res) {
  const { id } = req.validated.params;

  const result = await deleteTicketTypeService(id, buildActor(req));

  return sendSuccess(res, {
    data: result,
  });
}
