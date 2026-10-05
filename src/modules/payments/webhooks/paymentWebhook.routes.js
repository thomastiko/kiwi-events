import express from "express";

import { paymentWebhookRateLimit } from "../../../core/middleware/rateLimiters.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";

import { handlePaymentWebhook } from "./paymentWebhook.controller.js";
import { paymentWebhookSchema } from "./paymentWebhook.validation.js";

const router = express.Router();

router.post(
  "/:provider",
  paymentWebhookRateLimit,
  validate(paymentWebhookSchema),
  asyncHandler(handlePaymentWebhook),
);

export default router;
