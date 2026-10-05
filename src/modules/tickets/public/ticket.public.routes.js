import express from "express";

import { requireFeature } from "../../../core/middleware/feature.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import { attachEventUserIfExists } from "../../../core/middleware/eventAccess.middleware.js";
import { guestAccessRateLimit } from "../../../core/middleware/rateLimiters.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";

import {
  downloadGuestTicketDocument,
  downloadOwnTicketDocument,
  getGuestTicketQr,
  getOwnTicketById,
  getOwnTicketQr,
  listOwnTickets,
} from "../ticket.controller.js";

import {
  getOwnTicketByIdSchema,
  getOwnTicketDocumentSchema,
  getOwnTicketQrSchema,
  guestTicketAccessSchema,
  listOwnTicketsSchema,
} from "../ticket.validation.js";

const router = express.Router();

const authenticatedTicketAccess = [
  requireIdentity,
  asyncHandler(attachEventUserIfExists),
];

router.get(
  "/guest/:id/qr",
  guestAccessRateLimit,
  requireFeature("ticketQr"),
  validate(guestTicketAccessSchema),
  asyncHandler(getGuestTicketQr),
);

router.get(
  "/guest/:id/document",
  guestAccessRateLimit,
  requireFeature("ticketPdf"),
  validate(guestTicketAccessSchema),
  asyncHandler(downloadGuestTicketDocument),
);

router.get(
  "/",
  ...authenticatedTicketAccess,
  validate(listOwnTicketsSchema),
  asyncHandler(listOwnTickets),
);

router.get(
  "/:id/qr",
  ...authenticatedTicketAccess,
  requireFeature("ticketQr"),
  validate(getOwnTicketQrSchema),
  asyncHandler(getOwnTicketQr),
);

router.get(
  "/:id/document",
  ...authenticatedTicketAccess,
  requireFeature("ticketPdf"),
  validate(getOwnTicketDocumentSchema),
  asyncHandler(downloadOwnTicketDocument),
);

router.get(
  "/:id",
  ...authenticatedTicketAccess,
  validate(getOwnTicketByIdSchema),
  asyncHandler(getOwnTicketById),
);

export default router;
