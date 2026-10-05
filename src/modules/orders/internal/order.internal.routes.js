import express from "express";

import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import { requireEventUser } from "../../../core/middleware/eventAccess.middleware.js";
import { requireEventPermissions } from "../../../core/middleware/permission.middleware.js";

import { EVENT_PERMISSIONS } from "../../permissions/permission.constant.js";

import {
  cancelInternalOrder,
  createManualOrderForEvent,
  getInternalOrderById,
  updateInternalOrderBuyer,
  listEventOrdersInternal,
  refundInternalOrder,
  resendInternalOrderMail,
} from "./order.internal.controller.js";

import {
  cancelInternalOrderSchema,
  createManualOrderForEventSchema,
  getInternalOrderByIdSchema,
  listEventOrdersInternalSchema,
  refundInternalOrderSchema,
  updateInternalOrderBuyerSchema,
  resendInternalOrderMailSchema,
} from "./order.internal.validation.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(requireEventUser));

/*
 * MANAGE_ALL implies MANAGE_OWN.
 *
 * The route only verifies that the actor has event-management access.
 * Ownership of the concrete event is enforced in the service layer.
 */
const requireEventManagement = requireEventPermissions(
  EVENT_PERMISSIONS.MANAGE_OWN,
);

router.get(
  "/event/:eventId",
  validate(listEventOrdersInternalSchema),
  requireEventManagement,
  asyncHandler(listEventOrdersInternal),
);

router.post(
  "/event/:eventId/manual",
  validate(createManualOrderForEventSchema),
  requireEventManagement,
  asyncHandler(createManualOrderForEvent),
);
router.patch(
  "/:id/cancel",
  validate(cancelInternalOrderSchema),
  requireEventManagement,
  asyncHandler(cancelInternalOrder),
);
router.patch(
  "/:id/buyer",
  validate(updateInternalOrderBuyerSchema),
  requireEventManagement,
  asyncHandler(updateInternalOrderBuyer),
);
router.post(
  "/:id/mails/resend",
  validate(resendInternalOrderMailSchema),
  requireEventManagement,
  asyncHandler(resendInternalOrderMail),
);
router.post(
  "/:id/refund",
  validate(refundInternalOrderSchema),
  requireEventManagement,
  asyncHandler(refundInternalOrder),
);
router.get(
  "/:id",
  validate(getInternalOrderByIdSchema),
  requireEventManagement,
  asyncHandler(getInternalOrderById),
);

export default router;
