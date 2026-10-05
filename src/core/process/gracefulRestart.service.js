// src/core/process/gracefulRestart.service.js

import { logger } from "../../config/logger.js";
import { enableMaintenanceMode } from "../../modules/system/system.maintenance.js";

let shutdownHandler = null;
let restartRequested = false;
let restartReason = null;
let restartRequestedAt = null;

export function registerShutdownHandler(handler) {
  shutdownHandler = handler;
}

export function getRestartState() {
  return {
    requested: restartRequested,
    reason: restartReason,
    requestedAt: restartRequestedAt,
  };
}

function isRunningUnderNodemon() {
  return Boolean(
    process.env.NODEMON ||
    process.env.npm_lifecycle_script?.includes("nodemon"),
  );
}

export function requestGracefulRestart({
  reason = "manual_restart",
  delayMs = 300,
} = {}) {
  if (restartRequested) {
    return getRestartState();
  }

  restartRequested = true;
  restartReason = reason;
  restartRequestedAt = new Date().toISOString();

  enableMaintenanceMode(reason);

  logger.warn("Graceful restart requested", {
    reason: restartReason,
    requestedAt: restartRequestedAt,
    nodemon: isRunningUnderNodemon(),
  });

  setTimeout(async () => {
    try {
      if (typeof shutdownHandler === "function") {
        await shutdownHandler("RESTART", {
          exitCode: isRunningUnderNodemon() ? null : 0,
          reason: restartReason,
          restartWithNodemonSignal: isRunningUnderNodemon(),
        });

        return;
      }

      if (isRunningUnderNodemon()) {
        process.kill(process.pid, "SIGUSR2");
        return;
      }

      process.exit(0);
    } catch (error) {
      logger.error("Graceful restart failed:", error.message);
      process.exit(1);
    }
  }, delayMs).unref?.();

  return getRestartState();
}
