// src/modules/events/public/event.public.routes.js

import express from "express";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import {
  getPublicEventById,
  getPublicEventBySlug,
  listPublicEvents,
} from "./event.public.controller.js";
import {
  getPublicEventByIdSchema,
  getPublicEventBySlugSchema,
  listPublicEventsSchema,
} from "./event.public.validation.js";

const router = express.Router();

router.get(
  "/",
  validate(listPublicEventsSchema),
  asyncHandler(listPublicEvents),
);

router.get(
  "/slug/:slug",
  validate(getPublicEventBySlugSchema),
  asyncHandler(getPublicEventBySlug),
);

router.get(
  "/id/:id",
  validate(getPublicEventByIdSchema),
  asyncHandler(getPublicEventById),
);

export default router;
