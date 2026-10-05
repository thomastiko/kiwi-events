import express from "express";
import { asyncHandler } from "../../../core/utils/asyncHandler.js";
import { validate } from "../../../core/middleware/validate.middleware.js";
import { requireIdentity } from "../../../core/middleware/identity.middleware.js";
import {
  attachEventUserIfExists,
  requireEventUser,
} from "../../../core/middleware/eventAccess.middleware.js";
import { requireAdmin } from "../../../core/middleware/adminAuth.middleware.js";

import {
  createMailTemplate,
  deleteMailTemplate,
  getMailLog,
  getMailTemplate,
  listMailLogs,
  listMailTemplates,
  sendMailTemplateTest,
  updateMailTemplate,
} from "./mail.internal.controller.js";

import {
  createMailTemplateSchema,
  listMailLogsSchema,
  listMailTemplatesSchema,
  mailLogIdParamSchema,
  mailTemplateIdParamSchema,
  testMailTemplateSchema,
  updateMailTemplateSchema,
} from "./mail.internal.validation.js";

const router = express.Router();

router.use(requireIdentity);
router.use(asyncHandler(attachEventUserIfExists));
router.use(asyncHandler(requireEventUser));
router.use(requireAdmin);
router.get(
  "/templates",
  validate(listMailTemplatesSchema),
  asyncHandler(listMailTemplates),
);

router.post(
  "/templates",
  validate(createMailTemplateSchema),
  asyncHandler(createMailTemplate),
);

router.get(
  "/templates/:id",
  validate(mailTemplateIdParamSchema),
  asyncHandler(getMailTemplate),
);

router.patch(
  "/templates/:id",
  validate(updateMailTemplateSchema),
  asyncHandler(updateMailTemplate),
);

router.delete(
  "/templates/:id",
  validate(mailTemplateIdParamSchema),
  asyncHandler(deleteMailTemplate),
);

router.post(
  "/templates/:id/test",
  validate(testMailTemplateSchema),
  asyncHandler(sendMailTemplateTest),
);

router.get("/logs", validate(listMailLogsSchema), asyncHandler(listMailLogs));

router.get(
  "/logs/:id",
  validate(mailLogIdParamSchema),
  asyncHandler(getMailLog),
);

export default router;
