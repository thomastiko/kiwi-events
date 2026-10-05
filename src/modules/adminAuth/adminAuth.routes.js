import express from "express";

import {
  getAdminMeHandler,
  loginAdminHandler,
} from "./adminAuth.controller.js";
import { requireAdmin } from "../../core/middleware/adminAuth.middleware.js";
import { requireEventUser } from "../../core/middleware/eventAccess.middleware.js";
import { requireIdentity } from "../../core/middleware/identity.middleware.js";
import { adminLoginRateLimit } from "../../core/middleware/rateLimiters.js";
import { validate } from "../../core/middleware/validate.middleware.js";
import { asyncHandler } from "../../core/utils/asyncHandler.js";
import { adminLoginSchema } from "./adminAuth.validation.js";

const router = express.Router();

router.post(
  "/login",
  adminLoginRateLimit,
  validate(adminLoginSchema),
  asyncHandler(loginAdminHandler),
);

router.get(
  "/me",
  requireIdentity,
  asyncHandler(requireEventUser),
  requireAdmin,
  asyncHandler(getAdminMeHandler),
);

export default router;
