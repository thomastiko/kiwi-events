import {
  addImagesToEventService,
  removeImageFromEventService,
  archiveEventService,
  createEventService,
  deleteEventService,
  featureEventService,
  getEventByIdService,
  listEventsService,
  publishEventService,
  updateEventService,
} from "./event.internal.service.js";
import { sendSuccess } from "../../../core/http/response.js";
import {
  cancelEventWithOrdersService,
  getEventRefundPreviewService,
} from "./event.refund.service.js";
import {
  toEventMailResultDto,
  toEventCancellationExecutionDto,
  toEventRefundPreviewDto,
} from "./event.refund.dto.js";
import { sendCustomEventMailService } from "./event.customMail.service.js";

import { toCustomEventMailResultDto } from "./event.customMail.dto.js";
function getPersistableId(value) {
  const stringValue = String(value || "").trim();

  if (!stringValue) {
    return null;
  }

  if (/^[a-f\d]{24}$/i.test(stringValue)) {
    return stringValue;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      stringValue,
    )
  ) {
    return stringValue;
  }

  return null;
}

function buildActorIds(req) {
  const actor = req.eventUser || null;
  const eventUserId = getPersistableId(actor?.id);

  return {
    eventUserId,
    eventUser: actor,
  };
}

function buildCreateAuditFields(req) {
  const actor = buildActorIds(req);

  return {
    createdByEventUserId: actor.eventUserId,
    updatedByEventUserId: actor.eventUserId,
  };
}

function buildUpdateAuditFields(req) {
  const actor = buildActorIds(req);

  return {
    updatedByEventUserId: actor.eventUserId,
  };
}
function getEventImageFiles(req) {
  const files = [];

  if (req.file) {
    files.push(req.file);
  }

  if (Array.isArray(req.files?.image)) {
    files.push(...req.files.image);
  }

  if (Array.isArray(req.files?.images)) {
    files.push(...req.files.images);
  }

  return files;
}
export async function listEvents(req, res) {
  const filters = req.validated?.query || req.query || {};
  const actor = buildActorIds(req);

  const events = await listEventsService(filters, actor);

  return sendSuccess(res, {
    data: events,
  });
}

export async function getEventById(req, res) {
  const { id } = req.validated.params;
  const actor = buildActorIds(req);

  const event = await getEventByIdService(id, actor);

  return sendSuccess(res, {
    data: event,
  });
}

export async function createEvent(req, res) {
  const body = req.validated.body;
  const actor = buildActorIds(req);

  const event = await createEventService(
    {
      ...body,
      ...buildCreateAuditFields(req),
    },
    actor,
  );

  return sendSuccess(res, {
    status: 201,
    data: event,
  });
}

export async function updateEvent(req, res) {
  const { id } = req.validated.params;
  const body = req.validated.body;
  const actor = buildActorIds(req);

  const event = await updateEventService(
    id,
    {
      ...body,
      ...buildUpdateAuditFields(req),
    },
    actor,
  );

  return sendSuccess(res, {
    data: event,
  });
}
export async function uploadEventImages(req, res) {
  const { id } = req.validated.params;
  const actor = buildActorIds(req);
  const imageFiles = getEventImageFiles(req);

  const event = await addImagesToEventService(id, imageFiles, actor, {
    storageTarget: req.validated.query.storageTarget,

    updatedByEventUserId: actor.eventUserId || null,
  });

  return sendSuccess(res, {
    data: event,
  });
}
export async function removeEventImage(req, res) {
  const params = req.validated?.params || req.params;
  const { id, assetId } = params;
  const actor = buildActorIds(req);

  const event = await removeImageFromEventService(id, assetId, actor, {
    updatedByEventUserId: actor.eventUserId || null,
  });

  return sendSuccess(res, {
    data: event,
  });
}
export async function featureEvent(req, res) {
  const { id } = req.validated.params;
  const payload = req.validated.body;
  const actor = buildActorIds(req);

  const event = await featureEventService(id, payload, actor);

  return sendSuccess(res, {
    data: event,
  });
}

export async function deleteEvent(req, res) {
  const { id } = req.validated.params;
  const actor = buildActorIds(req);

  const result = await deleteEventService(id, actor);

  return sendSuccess(res, {
    data: result,
  });
}

export async function archiveEvent(req, res) {
  const { id } = req.validated.params;
  const actor = buildActorIds(req);

  const event = await archiveEventService(
    id,
    {
      updatedByEventUserId: actor.eventUserId,
    },
    actor,
  );

  return sendSuccess(res, {
    data: event,
  });
}

export async function publishEvent(req, res) {
  const { id } = req.validated.params;
  const actor = buildActorIds(req);

  const event = await publishEventService(
    id,
    {
      updatedByEventUserId: actor.eventUserId,
    },
    actor,
  );

  return sendSuccess(res, {
    data: event,
  });
}

export async function cancelEvent(req, res) {
  const { id } = req.validated.params;

  const { reason, refundMode, orderIds } = req.validated.body;

  const actor = buildActorIds(req);

  const result = await cancelEventWithOrdersService({
    eventId: id,

    reason: reason || null,

    refundMode,

    orderIds: orderIds || [],

    actor,
  });

  const event = await getEventByIdService(id, actor);

  return sendSuccess(res, {
    data: {
      event,

      cancellation: toEventCancellationExecutionDto(result),
    },

    meta: {
      mail: toEventMailResultDto(result.mail),
    },
  });
}

export async function getEventRefundPreview(req, res) {
  const { id } = req.validated.params;
  const actor = buildActorIds(req);

  const result = await getEventRefundPreviewService(id, actor);

  return sendSuccess(res, {
    data: toEventRefundPreviewDto(result),
  });
}
export async function sendCustomEventMail(req, res) {
  const { id } = req.validated.params;

  const actor = buildActorIds(req);

  const result = await sendCustomEventMailService({
    eventId: id,

    payload: req.validated.body,

    files: Array.isArray(req.files) ? req.files : [],

    actor,
  });

  return sendSuccess(res, {
    data: toCustomEventMailResultDto(result),
  });
}
