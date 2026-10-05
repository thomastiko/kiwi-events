// src/modules/orders/public/order.public.routes.js

import express from "express";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import {
  requireIdentity,
  requireHostServiceIdentity,
} from "../../../core/middleware/identity.middleware.js";
import { attachEventUserIfExists } from "../../../core/middleware/eventAccess.middleware.js";
import {
  checkoutPublicOrder,
  reissueGuestAccess,
  listOwnOrders,
  getOwnOrderById,
  cancelOwnOrder,
  getGuestOrderByAccessToken,
  cancelGuestOrder,
} from "./order.public.controller.js";
import {
  checkoutPublicOrderSchema,
  listOwnOrdersQuerySchema,
  ownOrderIdParamSchema,
  cancelOwnOrderSchema,
  guestOrderAccessSchema,
  cancelGuestOrderSchema,
  reissueGuestAccessSchema,
} from "./order.public.validation.js";

import {
  checkoutRateLimit,
  guestAccessRateLimit,
  guestAccessRecoveryRateLimit,
} from "../../../core/middleware/rateLimiters.js";

const router = express.Router();

// Public guest access route.
// Must be before router.use(requireIdentity), because guests do not have JWTs.
// Access is protected by the secret accessToken query param.
router.get(
  "/guest/:id",
  guestAccessRateLimit,
  validate(guestOrderAccessSchema),
  asyncHandler(getGuestOrderByAccessToken),
);

router.patch(
  "/guest/:id/cancel",
  guestAccessRateLimit,
  validate(cancelGuestOrderSchema),
  asyncHandler(cancelGuestOrder),
);

// Checkout still requires host/service identity.
// For guest checkout, the host-service JWT is the technical caller,
// but the buyer identity comes from body.guest.
router.post(
  "/checkout",
  checkoutRateLimit,
  requireIdentity,
  asyncHandler(attachEventUserIfExists),
  validate(checkoutPublicOrderSchema),
  asyncHandler(checkoutPublicOrder),
);

router.post(
  "/guest-access/reissue",
  guestAccessRecoveryRateLimit,
  requireIdentity,
  requireHostServiceIdentity,
  validate(reissueGuestAccessSchema),
  asyncHandler(reissueGuestAccess),
);

// From here on, routes are for logged-in external users.
router.use(requireIdentity);
router.use(asyncHandler(attachEventUserIfExists));

router.get(
  "/",
  validate(listOwnOrdersQuerySchema),
  asyncHandler(listOwnOrders),
);

router.get(
  "/:id",
  validate(ownOrderIdParamSchema),
  asyncHandler(getOwnOrderById),
);

router.patch(
  "/:id/cancel",
  validate(cancelOwnOrderSchema),
  asyncHandler(cancelOwnOrder),
);

export default router;
