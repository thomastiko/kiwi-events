import express from "express";
import {
  getSystemDatabaseStatusHandler,
  testSystemDatabaseConfigHandler,
  switchSystemDatabaseHandler,
} from "./system.controller.js";
import {
  getSystemConfigHandler,
  updateSystemConfigHandler,
} from "./system.config.controller.js";
import { restartSystemHandler } from "./system.restart.controller.js";
import { resetSystemHandler } from "./system.reset.controller.js";
import {
  resetSystemSchema,
  testDatabaseConfigSchema,
  switchDatabaseConfigSchema,
} from "./system.validation.js";
import { updateSystemConfigSchema } from "./system.config.validation.js";
import { validate } from "../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../core/middleware/identity.middleware.js";
import { attachEventUserIfExists } from "../../core/middleware/eventAccess.middleware.js";
import { requireSystemAdmin } from "../../core/middleware/adminAuth.middleware.js";
import { asyncHandler } from "../../core/utils/asyncHandler.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(attachEventUserIfExists));
router.use(requireSystemAdmin);

router.get("/config", asyncHandler(getSystemConfigHandler));

router.patch(
  "/config",
  validate(updateSystemConfigSchema),
  asyncHandler(updateSystemConfigHandler),
);

router.get("/database/status", asyncHandler(getSystemDatabaseStatusHandler));

router.post(
  "/database/test",
  validate(testDatabaseConfigSchema),
  asyncHandler(testSystemDatabaseConfigHandler),
);

router.post(
  "/database/switch",
  validate(switchDatabaseConfigSchema),
  asyncHandler(switchSystemDatabaseHandler),
);

router.post(
  "/reset",
  validate(resetSystemSchema),
  asyncHandler(resetSystemHandler),
);

router.post("/restart", asyncHandler(restartSystemHandler));

export default router;
