import { sendSuccess } from "../../../core/http/response.js";

import {
  getPublicTicketTypeByIdService,
  listPublicTicketTypesService,
} from "./ticketType.public.service.js";

export async function listPublicTicketTypes(req, res) {
  const filters = req.validated?.query || req.query || {};

  const ticketTypes = await listPublicTicketTypesService(filters);

  return sendSuccess(res, {
    data: ticketTypes,
  });
}

export async function getPublicTicketTypeById(req, res) {
  const { id } = req.validated.params;

  const ticketType = await getPublicTicketTypeByIdService(id);

  return sendSuccess(res, {
    data: ticketType,
  });
}
