import { sendSuccess } from "../../../core/http/response.js";

import {
  getPublicEventByIdService,
  getPublicEventBySlugService,
  listPublicEventsService,
} from "./event.public.service.js";

export async function listPublicEvents(req, res) {
  const filters = req.validated?.query || req.query || {};

  const events = await listPublicEventsService(filters);

  return sendSuccess(res, {
    data: events,
  });
}

export async function getPublicEventBySlug(req, res) {
  const { slug } = req.validated.params;

  const event = await getPublicEventBySlugService(slug);

  return sendSuccess(res, {
    data: event,
  });
}

export async function getPublicEventById(req, res) {
  const { id } = req.validated.params;

  const event = await getPublicEventByIdService(id);

  return sendSuccess(res, {
    data: event,
  });
}
