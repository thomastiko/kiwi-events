import {
  getSystemConfigService,
  updateSystemConfigService,
} from "./system.config.service.js";

const RESTART_REQUIRED_SETTINGS = [
  "server.port",
  "server.appUrl",
  "server.adminFrontendUrl",
  "server.publicFrontendUrl",
  "server.corsOrigin",

  "auth.localJwtSecret",
  "auth.externalJwtSecret",

  "database.provider",

  "storage.local",
  "storage.public",
  "storage.private",
  "storage.generated",

  "payments.provider",
  "payments.stripe.secretKey",
  "payments.stripe.webhookSecret",
  "payments.mollie.apiKey",

  "mail.provider",
  "mail.smtp",
  "mail.resend",
  "mail.defaultFromName",
  "mail.defaultFromEmail",
  "mail.defaultReplyTo",

  "security.ticketQrSecret",
];

const SPECIAL_APPLY_SETTINGS = ["database"];

export async function getSystemConfigHandler(_req, res) {
  const { config, secretStatuses } = getSystemConfigService();

  return res.json({
    success: true,
    data: {
      config,
      secretStatuses,
      restartRequiredSettings: RESTART_REQUIRED_SETTINGS,
      specialApplySettings: SPECIAL_APPLY_SETTINGS,
    },
  });
}

export async function updateSystemConfigHandler(req, res) {
  const result = updateSystemConfigService(req.body);

  return res.json({
    success: result.success === true,

    message: result.message,

    data: {
      config: result.data?.config || {},
    },
  });
}
