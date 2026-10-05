// src/modules/ticketTypes/internal/ticketType.internal.routes.js

import express from "express";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import { requireEventUser } from "../../../core/middleware/eventAccess.middleware.js";
import { requireEventPermissions } from "../../../core/middleware/permission.middleware.js";
import { EVENT_PERMISSIONS } from "../../permissions/permission.constant.js";
import {
  createTicketType,
  deleteTicketType,
  getTicketTypeById,
  listTicketTypes,
  updateTicketType,
} from "./ticketType.internal.controller.js";
import {
  createTicketTypeSchema,
  deleteTicketTypeSchema,
  getTicketTypeByIdSchema,
  listTicketTypesSchema,
  updateTicketTypeSchema,
} from "./ticketType.internal.validation.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(requireEventUser));

const requireEventManagement = requireEventPermissions(
  EVENT_PERMISSIONS.MANAGE_OWN,
);

router.get(
  "/",
  validate(listTicketTypesSchema),
  requireEventManagement,
  asyncHandler(listTicketTypes),
);

router.get(
  "/:id",
  validate(getTicketTypeByIdSchema),
  requireEventManagement,
  asyncHandler(getTicketTypeById),
);

router.post(
  "/",
  validate(createTicketTypeSchema),
  requireEventManagement,
  asyncHandler(createTicketType),
);

router.patch(
  "/:id",
  validate(updateTicketTypeSchema),
  requireEventManagement,
  asyncHandler(updateTicketType),
);

router.delete(
  "/:id",
  validate(deleteTicketTypeSchema),
  requireEventManagement,
  asyncHandler(deleteTicketType),
);

export default router;
