import { requestGracefulRestart } from "../../core/process/gracefulRestart.service.js";

import { resetKiwiEventsService } from "./system.reset.service.js";

import { toSystemResetDto } from "./system.dto.js";

export async function resetSystemHandler(_req, res) {
  await resetKiwiEventsService();

  res.json({
    success: true,

    message: "Kiwi Events was reset successfully. Restart scheduled.",

    data: toSystemResetDto(),
  });

  res.on("finish", () => {
    requestGracefulRestart({
      reason: "system_reset",
      delayMs: 500,
    });
  });
}
