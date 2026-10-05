// src/modules/ticketTypes/public/ticketType.public.routes.js

import express from "express";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import {
  getPublicTicketTypeById,
  listPublicTicketTypes,
} from "./ticketType.public.controller.js";
import {
  getPublicTicketTypeByIdSchema,
  listPublicTicketTypesSchema,
} from "./ticketType.public.validation.js";

const router = express.Router();

router.get(
  "/",
  validate(listPublicTicketTypesSchema),
  asyncHandler(listPublicTicketTypes),
);

router.get(
  "/:id",
  validate(getPublicTicketTypeByIdSchema),
  asyncHandler(getPublicTicketTypeById),
);

export default router;
