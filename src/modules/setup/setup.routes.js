import express from "express";

import {
  getSetupConfigHandler,
  getSetupStatusHandler,
  initializeKiwiEventsHandler,
  saveSetupDatabaseHandler,
  testSetupDatabaseHandler,
} from "./setup.controller.js";

import { asyncHandler } from "../../core/utils/asyncHandler.js";

import { getPublicSetupStatus } from "../../config/kiwi-events/kiwi-events.config.store.js";

import { setupRateLimit } from "../../core/middleware/rateLimiters.js";

import { AppError } from "../../core/errors/AppError.js";

const router = express.Router();

function preventSetupResponseCaching(_req, res, next) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",

    Pragma: "no-cache",
    Expires: "0",
  });

  return next();
}

function requireJsonRequest(req, _res, next) {
  if (!req.is("application/json")) {
    return next(
      AppError.badRequest("Setup requests must use application/json.", {
        code: "SETUP_JSON_REQUIRED",
        title: "JSON request required",
        action: "Send the setup request with Content-Type application/json.",
      }),
    );
  }

  return next();
}

function requireSetupNotInitialized(_req, _res, next) {
  const setupStatus = getPublicSetupStatus();

  if (setupStatus.initialized) {
    return next(
      AppError.forbidden("Setup is already completed.", {
        code: "SETUP_ALREADY_COMPLETED",
        title: "Setup already completed",
        action:
          "Use the authenticated Admin System settings instead of the public setup endpoints.",
      }),
    );
  }

  return next();
}

router.use(preventSetupResponseCaching);

router.get("/status", asyncHandler(getSetupStatusHandler));

router.get(
  "/config",
  setupRateLimit,
  requireSetupNotInitialized,
  asyncHandler(getSetupConfigHandler),
);

router.post(
  "/database/test",
  setupRateLimit,
  requireSetupNotInitialized,
  requireJsonRequest,
  asyncHandler(testSetupDatabaseHandler),
);

router.post(
  "/database/save",
  setupRateLimit,
  requireSetupNotInitialized,
  requireJsonRequest,
  asyncHandler(saveSetupDatabaseHandler),
);

router.post(
  "/initialize",
  setupRateLimit,
  requireSetupNotInitialized,
  requireJsonRequest,
  asyncHandler(initializeKiwiEventsHandler),
);

export default router;
