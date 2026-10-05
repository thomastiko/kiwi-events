// src/routes/index.js

import express from "express";
import setupRoutes from "../modules/setup/setup.routes.js";
import healthRoutes from "../modules/health/health.routes.js";
import adminAuthRoutes from "../modules/adminAuth/adminAuth.routes.js";
import eventUserRoutes from "../modules/eventUsers/eventUser.routes.js";
import adminEventRoutes from "../modules/events/internal/event.internal.routes.js";
import publicEventRoutes from "../modules/events/public/event.public.routes.js";
import adminTicketTypeRoutes from "../modules/ticketTypes/internal/ticketType.internal.routes.js";
import publicTicketTypeRoutes from "../modules/ticketTypes/public/ticketType.public.routes.js";
import adminOrderRoutes from "../modules/orders/internal/order.internal.routes.js";
import publicOrderRoutes from "../modules/orders/public/order.public.routes.js";
import mediaAssetAdminRoutes from "../modules/mediaAssets/internal/mediaAsset.internal.routes.js";
import mediaAssetPublicRoutes from "../modules/mediaAssets/public/mediaAsset.public.routes.js";
import adminTicketRoutes from "../modules/tickets/internal/ticket.internal.routes.js";
import publicTicketRoutes from "../modules/tickets/public/ticket.public.routes.js";
import adminMailRoutes from "../modules/mail/internal/mail.internal.routes.js";
import systemRoutes from "../modules/system/system.routes.js";
import adminEventRoleRoutes from "../modules/eventRoles/eventRole.routes.js";
import paymentWebhookRoutes from "../modules/payments/webhooks/paymentWebhook.routes.js";
import adminDiscountCodeRoutes from "../modules/discountCodes/internal/discountCode.internal.routes.js";
import { requireFeature } from "../core/middleware/feature.middleware.js";

const router = express.Router();

router.use("/setup", setupRoutes);
router.use("/health", healthRoutes);

router.use("/admin/auth", adminAuthRoutes);
router.use("/admin/event-roles", adminEventRoleRoutes);
router.use("/admin/event-users", eventUserRoutes);

router.use("/admin/events", adminEventRoutes);
router.use("/public/events", publicEventRoutes);

router.use(
  "/admin/ticket-types",
  requireFeature("ticketing"),
  adminTicketTypeRoutes,
);

router.use(
  "/public/ticket-types",
  requireFeature("ticketing"),
  publicTicketTypeRoutes,
);

router.use(
  "/admin/discount-codes",
  requireFeature("ticketing"),
  requireFeature("discountCodes"),
  adminDiscountCodeRoutes,
);

router.use("/admin/orders", requireFeature("ticketing"), adminOrderRoutes);
router.use("/webhooks/payments", paymentWebhookRoutes);
router.use("/public/orders", requireFeature("ticketing"), publicOrderRoutes);

router.use("/admin/media-assets", mediaAssetAdminRoutes);
router.use("/public/media-assets", mediaAssetPublicRoutes);
router.use("/admin/mail", requireFeature("mail"), adminMailRoutes);

router.use("/admin/system", systemRoutes);

router.use("/public/tickets", requireFeature("ticketing"), publicTicketRoutes);

router.use("/admin/tickets", requireFeature("ticketing"), adminTicketRoutes);

export default router;
