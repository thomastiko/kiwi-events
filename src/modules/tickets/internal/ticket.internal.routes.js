import express from "express";

import { requireEventUser } from "../../../core/middleware/eventAccess.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import { requireEventPermissions } from "../../../core/middleware/permission.middleware.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";

import { EVENT_PERMISSIONS } from "../../permissions/permission.constant.js";

import {
  cancelInternalTicket,
  confirmTicketCheckIn,
  confirmTicketCheckInPayload,
  getInternalTicketById,
  listEventTicketsInternal,
  lookupTicketForCheckIn,
  lookupTicketForCheckInPayload,
  setInternalTicketCheckIn,
} from "../ticket.controller.js";

import {
  cancelInternalTicketSchema,
  checkInTicketByQrSchema,
  confirmTicketCheckInSchema,
  getInternalTicketByIdSchema,
  listEventTicketsInternalSchema,
  lookupTicketForCheckInSchema,
  setInternalTicketCheckInSchema,
} from "../ticket.validation.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(requireEventUser));

/*
 * MANAGE_ALL implies MANAGE_OWN.
 *
 * Ticket read/check-in access is available to:
 * - event managers
 * - global check-in users
 *
 * Concrete event ownership is checked in the service.
 */
const requireTicketAccess = requireEventPermissions([
  EVENT_PERMISSIONS.MANAGE_OWN,
  EVENT_PERMISSIONS.CHECKIN_ALL,
]);

const requireEventManagement = requireEventPermissions(
  EVENT_PERMISSIONS.MANAGE_OWN,
);

router.post(
  "/check-in/lookup",
  validate(lookupTicketForCheckInSchema),
  requireTicketAccess,
  asyncHandler(lookupTicketForCheckIn),
);

router.post(
  "/check-in/confirm",
  validate(confirmTicketCheckInSchema),
  requireTicketAccess,
  asyncHandler(confirmTicketCheckIn),
);

router.post(
  "/check-in/qr/lookup",
  validate(checkInTicketByQrSchema),
  requireTicketAccess,
  asyncHandler(lookupTicketForCheckInPayload),
);

router.post(
  "/check-in/qr/confirm",
  validate(checkInTicketByQrSchema),
  requireTicketAccess,
  asyncHandler(confirmTicketCheckInPayload),
);

router.get(
  "/event/:eventId",
  validate(listEventTicketsInternalSchema),
  requireTicketAccess,
  asyncHandler(listEventTicketsInternal),
);

router.get(
  "/:id",
  validate(getInternalTicketByIdSchema),
  requireTicketAccess,
  asyncHandler(getInternalTicketById),
);

/*
 * Cancelling a ticket is event management,
 * not check-in.
 */
router.patch(
  "/:id/cancel",
  validate(cancelInternalTicketSchema),
  requireEventManagement,
  asyncHandler(cancelInternalTicket),
);

router.patch(
  "/:id/check-in",
  validate(setInternalTicketCheckInSchema),
  requireTicketAccess,
  asyncHandler(setInternalTicketCheckIn),
);

export default router;
