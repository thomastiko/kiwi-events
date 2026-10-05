import express from "express";

import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import { requireEventUser } from "../../../core/middleware/eventAccess.middleware.js";
import { parseEventMultipartBody } from "../../../core/middleware/parseEventMultipart.middleware.js";
import { uploadEventMediaImage } from "../../../core/middleware/mediaAsset.middleware.js";
import { requireEventPermissions } from "../../../core/middleware/permission.middleware.js";
import { EVENT_PERMISSIONS } from "../../permissions/permission.constant.js";

import {
  deleteTicketTemplateImage,
  getTicketTemplate,
  resetTicketTemplate,
  saveTicketTemplate,
  uploadTicketTemplateImage,
} from "../../ticketTemplates/internal/ticketTemplate.internal.controller.js";

import {
  deleteTicketTemplateImageSchema,
  getTicketTemplateSchema,
  resetTicketTemplateSchema,
  saveTicketTemplateSchema,
  uploadTicketTemplateImageSchema,
} from "../../ticketTemplates/internal/ticketTemplate.internal.validation.js";

import { parseCustomMailMultipartBody } from "../../../core/middleware/parseCustomMailMultipart.middleware.js";

import {
  CUSTOM_MAIL_MAX_FILES,
  uploadCustomMailAttachments,
  validateCustomMailAttachmentTotal,
} from "../../../core/middleware/customMailAttachment.middleware.js";

import {
  archiveEvent,
  cancelEvent,
  createEvent,
  deleteEvent,
  featureEvent,
  getEventById,
  getEventRefundPreview,
  listEvents,
  publishEvent,
  removeEventImage,
  sendCustomEventMail,
  updateEvent,
  uploadEventImages,
} from "./event.internal.controller.js";

import {
  archiveEventSchema,
  cancelEventSchema,
  createEventSchema,
  deleteEventSchema,
  featureEventSchema,
  getEventByIdSchema,
  listEventsSchema,
  publishEventSchema,
  refundPreviewParamsSchema,
  removeEventImageSchema,
  sendCustomEventMailSchema,
  updateEventSchema,
  uploadEventImagesSchema,
} from "./event.internal.validation.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(requireEventUser));

const requireEventManagement = requireEventPermissions(
  EVENT_PERMISSIONS.MANAGE_OWN,
);

router.get(
  "/",
  validate(listEventsSchema),
  requireEventManagement,
  asyncHandler(listEvents),
);

router.get(
  "/:id/refund-preview",
  validate(refundPreviewParamsSchema),
  requireEventManagement,
  asyncHandler(getEventRefundPreview),
);
router.get(
  "/:id/ticket-template",
  validate(getTicketTemplateSchema),
  requireEventManagement,
  asyncHandler(getTicketTemplate),
);

router.put(
  "/:id/ticket-template",
  validate(saveTicketTemplateSchema),
  requireEventManagement,
  asyncHandler(saveTicketTemplate),
);

router.delete(
  "/:id/ticket-template",
  validate(resetTicketTemplateSchema),
  requireEventManagement,
  asyncHandler(resetTicketTemplate),
);

router.post(
  "/:id/ticket-template/images",
  validate(uploadTicketTemplateImageSchema),
  requireEventManagement,
  uploadEventMediaImage.single("image"),
  asyncHandler(uploadTicketTemplateImage),
);

router.delete(
  "/:id/ticket-template/images/:assetId",
  validate(deleteTicketTemplateImageSchema),
  requireEventManagement,
  asyncHandler(deleteTicketTemplateImage),
);
router.get(
  "/:id",
  validate(getEventByIdSchema),
  requireEventManagement,
  asyncHandler(getEventById),
);

router.post(
  "/:id/images",
  validate(uploadEventImagesSchema),
  requireEventManagement,
  uploadEventMediaImage.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  asyncHandler(uploadEventImages),
);

router.delete(
  "/:id/images/:assetId",
  validate(removeEventImageSchema),
  requireEventManagement,
  asyncHandler(removeEventImage),
);

router.post(
  "/",
  requireEventManagement,
  parseEventMultipartBody,
  validate(createEventSchema),
  asyncHandler(createEvent),
);

router.patch(
  "/:id",
  requireEventManagement,
  parseEventMultipartBody,
  validate(updateEventSchema),
  asyncHandler(updateEvent),
);

router.patch(
  "/:id/feature",
  validate(featureEventSchema),
  requireEventManagement,
  asyncHandler(featureEvent),
);

router.delete(
  "/:id",
  validate(deleteEventSchema),
  requireEventManagement,
  asyncHandler(deleteEvent),
);

router.patch(
  "/:id/archive",
  validate(archiveEventSchema),
  requireEventManagement,
  asyncHandler(archiveEvent),
);

router.patch(
  "/:id/publish",
  validate(publishEventSchema),
  requireEventManagement,
  asyncHandler(publishEvent),
);
router.post(
  "/:id/custom-mail",

  requireEventManagement,

  uploadCustomMailAttachments.array("attachments", CUSTOM_MAIL_MAX_FILES),

  validateCustomMailAttachmentTotal,

  parseCustomMailMultipartBody,

  validate(sendCustomEventMailSchema),

  asyncHandler(sendCustomEventMail),
);
router.patch(
  "/:id/cancel",
  validate(cancelEventSchema),
  requireEventManagement,
  asyncHandler(cancelEvent),
);

export default router;
