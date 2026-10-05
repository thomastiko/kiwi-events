import { requestGracefulRestart } from "../../core/process/gracefulRestart.service.js";

import { toManualRestartDto } from "./system.dto.js";

export async function restartSystemHandler(_req, res) {
  res.json({
    success: true,
    data: toManualRestartDto(),
  });

  res.on("finish", () => {
    requestGracefulRestart({
      reason: "manual_restart",
      delayMs: 500,
    });
  });
}
