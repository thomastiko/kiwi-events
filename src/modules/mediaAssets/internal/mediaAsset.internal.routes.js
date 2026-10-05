import { Router } from "express";

import { requireEventUser } from "../../../core/middleware/eventAccess.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import { requireEventPermissions } from "../../../core/middleware/permission.middleware.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";

import { EVENT_PERMISSIONS } from "../../permissions/permission.constant.js";

import {
  deleteEventImageAssetHandler,
  listEventImageAssetsHandler,
} from "./mediaAsset.internal.controller.js";

import {
  deleteEventImageAssetSchema,
  listEventImageAssetsSchema,
} from "./mediaAsset.internal.validation.js";

const router = Router();

router.use(requireIdentity);
router.use(asyncHandler(requireEventUser));

/*
 * Global cross-event media library.
 *
 * Own-event managers manage event images through:
 * /admin/events/:id/images
 *
 * The global asset catalog remains an all-event operation.
 */
router.get(
  "/events",
  validate(listEventImageAssetsSchema),
  requireEventPermissions(EVENT_PERMISSIONS.MANAGE_ALL),
  asyncHandler(listEventImageAssetsHandler),
);

router.delete(
  "/events/:id",
  validate(deleteEventImageAssetSchema),
  requireEventPermissions(EVENT_PERMISSIONS.MANAGE_ALL),
  asyncHandler(deleteEventImageAssetHandler),
);

export default router;
