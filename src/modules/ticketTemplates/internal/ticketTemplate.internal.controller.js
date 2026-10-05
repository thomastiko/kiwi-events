import { sendSuccess } from "../../../core/http/response.js";

import { validImageFileRequiredError } from "../../mediaAssets/mediaAsset.errors.js";

import {
  toAdminTicketTemplateDto,
  toAdminTicketTemplateImageDto,
} from "../ticketTemplate.dto.js";

import {
  deleteTicketTemplateImageForEventService,
  getTicketTemplateForEventService,
  resetTicketTemplateForEventService,
  saveTicketTemplateForEventService,
  uploadTicketTemplateImageForEventService,
} from "../ticketTemplate.service.js";

function buildActor(req) {
  return {
    eventUserId: req.eventUser?.id || null,

    eventUser: req.eventUser || null,
  };
}

export async function getTicketTemplate(req, res) {
  const result = await getTicketTemplateForEventService({
    eventId: req.validated.params.id,

    actor: buildActor(req),
  });

  return sendSuccess(res, {
    data: toAdminTicketTemplateDto(result),
  });
}

export async function saveTicketTemplate(req, res) {
  const result = await saveTicketTemplateForEventService({
    eventId: req.validated.params.id,

    template: req.validated.body.template,

    actor: buildActor(req),
  });

  return sendSuccess(res, {
    data: toAdminTicketTemplateDto(result),
  });
}

export async function resetTicketTemplate(req, res) {
  const result = await resetTicketTemplateForEventService({
    eventId: req.validated.params.id,

    actor: buildActor(req),
  });

  return sendSuccess(res, {
    data: toAdminTicketTemplateDto(result),
  });
}

export async function uploadTicketTemplateImage(req, res) {
  if (!req.file?.buffer) {
    throw validImageFileRequiredError("image");
  }

  const asset = await uploadTicketTemplateImageForEventService({
    eventId: req.validated.params.id,

    file: req.file,

    storageTarget: req.validated.query.storageTarget,

    actor: buildActor(req),
  });

  return sendSuccess(res, {
    status: 201,

    data: toAdminTicketTemplateImageDto(asset),
  });
}

export async function deleteTicketTemplateImage(req, res) {
  const result = await deleteTicketTemplateImageForEventService({
    eventId: req.validated.params.id,

    assetId: req.validated.params.assetId,

    actor: buildActor(req),
  });

  return sendSuccess(res, {
    data: result,
  });
}
