import express from "express";

import {
  createEventRole,
  deleteEventRole,
  getEventRoleByKey,
  getEventRolePermissionGroups,
  listEventRoles,
  updateEventRole,
} from "./eventRole.controller.js";

import { asyncHandler } from "../../core/utils/asyncHandler.js";
import { validate } from "../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../core/middleware/identity.middleware.js";
import { attachEventUserIfExists } from "../../core/middleware/eventAccess.middleware.js";
import { requireAdmin } from "../../core/middleware/adminAuth.middleware.js";

import {
  createEventRoleSchema,
  deleteEventRoleSchema,
  getEventRoleByKeySchema,
  listEventRolesSchema,
  updateEventRoleSchema,
} from "./eventRole.validation.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(attachEventUserIfExists));
router.use(requireAdmin);

router.get("/permission-groups", asyncHandler(getEventRolePermissionGroups));

router.get("/", validate(listEventRolesSchema), asyncHandler(listEventRoles));

router.get(
  "/:key",
  validate(getEventRoleByKeySchema),
  asyncHandler(getEventRoleByKey),
);

router.post(
  "/",
  validate(createEventRoleSchema),
  asyncHandler(createEventRole),
);

router.patch(
  "/:key",
  validate(updateEventRoleSchema),
  asyncHandler(updateEventRole),
);

router.delete(
  "/:key",
  validate(deleteEventRoleSchema),
  asyncHandler(deleteEventRole),
);

export default router;
