import { Router } from "express";

import { validate } from "../../../core/middleware/validate.middleware.js";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";

import { downloadPublicMediaAssetFileHandler } from "./mediaAsset.public.controller.js";
import { downloadPublicMediaAssetFileSchema } from "./mediaAsset.public.validation.js";

const router = Router();

router.get(
  "/:id/file",
  validate(downloadPublicMediaAssetFileSchema),
  asyncHandler(downloadPublicMediaAssetFileHandler),
);

export default router;
