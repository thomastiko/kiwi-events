// src/modules/eventUsers/eventUser.routes.js

import express from "express";

import {
  createEventUser,
  deactivateEventUser,
  deactivateEventUserByExternalUser,
  deleteEventUser,
  deleteEventUserProfileImage,
  getEventUserByExternalUser,
  getEventUserById,
  getMyEventUser,
  listEventUsers,
  reactivateEventUser,
  reactivateEventUserByExternalUser,
  updateEventUser,
  uploadEventUserProfileImage,
  upsertEventUserByExternalUser,
} from "./eventUser.controller.js";

import { uploadEventMediaImage } from "../../core/middleware/mediaAsset.middleware.js";
import { validate } from "../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../core/middleware/identity.middleware.js";
import {
  attachEventUserIfExists,
  requireEventUser,
} from "../../core/middleware/eventAccess.middleware.js";
import { requireAdmin } from "../../core/middleware/adminAuth.middleware.js";
import {
  createEventUserSchema,
  deactivateEventUserSchema,
  getEventUserByExternalUserSchema,
  getEventUserByIdSchema,
  toggleEventUserByExternalUserSchema,
  updateEventUserSchema,
  upsertEventUserByExternalUserSchema,
  uploadEventUserProfileImageSchema,
} from "./eventUser.validation.js";
import { asyncHandler } from "../../core/utils/asyncHandler.js";

const router = express.Router();

router.use(requireIdentity);

/**
 * Attach EventUser context early.
 *
 * This is required because requireAdmin checks req.eventUser.
 */
router.use(asyncHandler(attachEventUserIfExists));

/**
 * Current identity profile.
 *
 * This stays available for authenticated identities, even if they are not admin.
 */
router.get("/me", asyncHandler(getMyEventUser));

/**
 * External user bridge.
 *
 * Only role="admin" can link external host users to kiwi-events EventUsers.
 */
router.get(
  "/by-external-user/:provider/:externalUserId",
  requireAdmin,
  validate(getEventUserByExternalUserSchema),
  asyncHandler(getEventUserByExternalUser),
);

router.put(
  "/by-external-user/:provider/:externalUserId",
  requireAdmin,
  validate(upsertEventUserByExternalUserSchema),
  asyncHandler(upsertEventUserByExternalUser),
);

router.patch(
  "/by-external-user/:provider/:externalUserId/deactivate",
  requireAdmin,
  validate(toggleEventUserByExternalUserSchema),
  asyncHandler(deactivateEventUserByExternalUser),
);

router.patch(
  "/by-external-user/:provider/:externalUserId/reactivate",
  requireAdmin,
  validate(toggleEventUserByExternalUserSchema),
  asyncHandler(reactivateEventUserByExternalUser),
);

/**
 * kiwi-events staff management.
 *
 * From now on this is global administration:
 * only role="admin" can list/create/update/deactivate/delete EventUsers.
 */
router.use(asyncHandler(requireEventUser));
router.use(requireAdmin);

router.get("/", asyncHandler(listEventUsers));

router.get(
  "/:id",
  validate(getEventUserByIdSchema),
  asyncHandler(getEventUserById),
);

router.post(
  "/",
  validate(createEventUserSchema),
  asyncHandler(createEventUser),
);

router.patch(
  "/:id",
  validate(updateEventUserSchema),
  asyncHandler(updateEventUser),
);

router.patch(
  "/:id/profile-image",
  validate(uploadEventUserProfileImageSchema),
  uploadEventMediaImage.single("image"),
  asyncHandler(uploadEventUserProfileImage),
);

router.delete(
  "/:id/profile-image",
  validate(getEventUserByIdSchema),
  asyncHandler(deleteEventUserProfileImage),
);

router.patch(
  "/:id/deactivate",
  validate(deactivateEventUserSchema),
  asyncHandler(deactivateEventUser),
);

router.patch(
  "/:id/reactivate",
  validate(deactivateEventUserSchema),
  asyncHandler(reactivateEventUser),
);

router.delete(
  "/:id",
  validate(getEventUserByIdSchema),
  asyncHandler(deleteEventUser),
);

export default router;
