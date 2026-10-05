import express from "express";

import { asyncHandler } from "../../../core/utils/asyncHandler.js";

import { validate } from "../../../core/middleware/validate.middleware.js";

import { requireIdentity } from "../../../core/middleware/identity.middleware.js";

import { requireEventUser } from "../../../core/middleware/eventAccess.middleware.js";

import { requireEventPermissions } from "../../../core/middleware/permission.middleware.js";

import { EVENT_PERMISSIONS } from "../../permissions/permission.constant.js";

import {
  createDiscountCodeGroup,
  createDiscountCodes,
  deleteDiscountCode,
  deleteDiscountCodeGroup,
  listDiscountCodeGroups,
  listDiscountCodes,
  updateDiscountCode,
  updateDiscountCodeGroup,
} from "./discountCode.internal.controller.js";

import {
  createDiscountCodeGroupSchema,
  createDiscountCodesSchema,
  deleteDiscountCodeGroupSchema,
  deleteDiscountCodeSchema,
  listDiscountCodeGroupsSchema,
  listDiscountCodesSchema,
  updateDiscountCodeGroupSchema,
  updateDiscountCodeSchema,
} from "./discountCode.internal.validation.js";

const router = express.Router();

router.use(requireIdentity);

router.use(asyncHandler(requireEventUser));

const requireEventManagement = requireEventPermissions(
  EVENT_PERMISSIONS.MANAGE_OWN,
);

router.get(
  "/groups",
  validate(listDiscountCodeGroupsSchema),
  requireEventManagement,
  asyncHandler(listDiscountCodeGroups),
);

router.post(
  "/groups",
  validate(createDiscountCodeGroupSchema),
  requireEventManagement,
  asyncHandler(createDiscountCodeGroup),
);

router.patch(
  "/groups/:groupId",
  validate(updateDiscountCodeGroupSchema),
  requireEventManagement,
  asyncHandler(updateDiscountCodeGroup),
);

router.delete(
  "/groups/:groupId",
  validate(deleteDiscountCodeGroupSchema),
  requireEventManagement,
  asyncHandler(deleteDiscountCodeGroup),
);

router.get(
  "/groups/:groupId/codes",
  validate(listDiscountCodesSchema),
  requireEventManagement,
  asyncHandler(listDiscountCodes),
);

router.post(
  "/groups/:groupId/codes",
  validate(createDiscountCodesSchema),
  requireEventManagement,
  asyncHandler(createDiscountCodes),
);

router.patch(
  "/:codeId",
  validate(updateDiscountCodeSchema),
  requireEventManagement,
  asyncHandler(updateDiscountCode),
);

router.delete(
  "/:codeId",
  validate(deleteDiscountCodeSchema),
  requireEventManagement,
  asyncHandler(deleteDiscountCode),
);

export default router;
