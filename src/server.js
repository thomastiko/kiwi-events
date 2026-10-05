// src/server.js
import { createRequire } from "node:module";

import app from "./app.js";
import { env } from "./config/env.js";
import { features } from "./config/features.js";
import { logger } from "./config/logger.js";

import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus,
} from "./modules/database/database.service.js";

import { registerShutdownHandler } from "./core/process/gracefulRestart.service.js";

import { expirePendingOrdersService } from "./modules/orders/order.expiry.service.js";
import { recoverOrderFulfillmentsService } from "./modules/orders/order.fulfillment.service.js";
import { sendTomorrowEventRemindersService } from "./modules/events/event.reminder.service.js";

import { seedDefaultEventEmailTemplates } from "./modules/mail/mail.seed.service.js";

let server = null;

let orderExpiryInterval = null;
let fulfillmentRecoveryInterval = null;
let eventReminderInterval = null;

let isFulfillmentRecoveryRunning = false;
let isEventReminderRunning = false;
let isShuttingDown = false;

const ORDER_EXPIRY_INTERVAL_MS = 60 * 1000;
const FULFILLMENT_RECOVERY_INTERVAL_MS = 60 * 1000;

const EVENT_REMINDER_INTERVAL_MS =
  Number(process.env.EVENT_REMINDER_INTERVAL_MS) || 60 * 60 * 1000;

const FORCE_SHUTDOWN_TIMEOUT_MS = 10 * 1000;

const DEFAULT_DOCUMENTATION_URL = "https://kiwi-events.tikowiz.com/#/docs";

const require = createRequire(import.meta.url);
const { version: packageVersion } = require("../package.json");

function getServerBaseUrl() {
  return env.appUrl || `http://localhost:${env.port}`;
}

function getAdminUrl() {
  return `${getServerBaseUrl().replace(/\/$/, "")}/admin`;
}

function getDocumentationUrl() {
  return (
    env.documentationUrl ||
    process.env.KIWI_EVENTS_DOCUMENTATION_URL ||
    DEFAULT_DOCUMENTATION_URL
  );
}

function getAppVersion() {
  return `v${packageVersion}`;
}

function formatStartupRow(label, value) {
  return ` » ${label.padEnd(23, ".")} ${value}`;
}

function printStartupBanner() {
  console.log("");
  console.log("▲ kiwi-events");
  console.log("");
  console.log("  Headless event ticketing backend");
  console.log("");
  console.log(formatStartupRow("Version", getAppVersion()));
  console.log(formatStartupRow("Dashboard", getAdminUrl()));
  console.log(formatStartupRow("Documentation", getDocumentationUrl()));
  console.log("");
}

function canStartJobs() {
  const databaseStatus = getDatabaseStatus();

  return (
    env.config?.setup?.initialized === true &&
    databaseStatus.configured === true &&
    databaseStatus.state === "connected"
  );
}

async function seedMailTemplatesIfPossible() {
  if (!canStartJobs()) {
    return;
  }

  try {
    const result = await seedDefaultEventEmailTemplates();

    if (result.created > 0) {
      logger.info("Default mail templates seeded", result);
    }
  } catch (error) {
    logger.error("Default mail template seed failed:", error.message);
  }
}

function startOrderExpiryJob() {
  if (orderExpiryInterval) {
    return;
  }

  if (!canStartJobs()) {
    return;
  }

  if (!features.ticketing) {
    return;
  }

  orderExpiryInterval = setInterval(async () => {
    try {
      const result = await expirePendingOrdersService();

      if (result.processed > 0) {
        logger.info("Order expiry job processed expired orders", result);
      }
    } catch (error) {
      logger.error("Order expiry job failed:", error.message);
    }
  }, ORDER_EXPIRY_INTERVAL_MS);
}
async function runFulfillmentRecoveryJob() {
  if (isFulfillmentRecoveryRunning) {
    return;
  }

  if (!canStartJobs()) {
    return;
  }

  if (!features.ticketing) {
    return;
  }

  isFulfillmentRecoveryRunning = true;

  try {
    const result = await recoverOrderFulfillmentsService();

    if (result.candidates > 0) {
      logger.info(
        "Order fulfillment recovery job processed candidates",
        result,
      );
    }
  } catch (error) {
    logger.error("Order fulfillment recovery job failed:", error.message);
  } finally {
    isFulfillmentRecoveryRunning = false;
  }
}

function startFulfillmentRecoveryJob() {
  if (fulfillmentRecoveryInterval) {
    return;
  }

  if (!canStartJobs()) {
    return;
  }

  if (!features.ticketing) {
    return;
  }

  void runFulfillmentRecoveryJob();

  fulfillmentRecoveryInterval = setInterval(() => {
    void runFulfillmentRecoveryJob();
  }, FULFILLMENT_RECOVERY_INTERVAL_MS);
}
async function runEventReminderJob() {
  if (isEventReminderRunning || isShuttingDown) {
    return;
  }

  if (!canStartJobs()) {
    return;
  }

  isEventReminderRunning = true;

  try {
    const result = await sendTomorrowEventRemindersService();

    if (result.sent > 0 || result.failed > 0) {
      logger.info("Event reminder job processed reminders", result);
    }
  } catch (error) {
    logger.error("Event reminder job failed", {
      error: error?.message || String(error),
    });
  } finally {
    isEventReminderRunning = false;
  }
}
function startEventReminderJob() {
  if (eventReminderInterval) {
    return;
  }

  if (!canStartJobs()) {
    return;
  }

  void runEventReminderJob();

  eventReminderInterval = setInterval(() => {
    void runEventReminderJob();
  }, EVENT_REMINDER_INTERVAL_MS);
}

function stopJobs() {
  if (orderExpiryInterval) {
    clearInterval(orderExpiryInterval);
    orderExpiryInterval = null;
  }

  if (fulfillmentRecoveryInterval) {
    clearInterval(fulfillmentRecoveryInterval);
    fulfillmentRecoveryInterval = null;
  }

  if (eventReminderInterval) {
    clearInterval(eventReminderInterval);
    eventReminderInterval = null;
  }
}

function closeHttpServer() {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startServer() {
  try {
    await connectDatabase();

    server = app.listen(env.port, () => {
      printStartupBanner();
    });

    await seedMailTemplatesIfPossible();

    startOrderExpiryJob();
    startFulfillmentRecoveryJob();
    startEventReminderJob();
  } catch (error) {
    logger.error("Failed to start kiwi-events:", error.message);
    process.exit(1);
  }
}

async function shutdown(
  signal,
  { exitCode = 0, reason = null, restartWithNodemonSignal = false } = {},
) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.warn(`${signal} received. Shutting down...`, {
    reason,
    exitCode,
    restartWithNodemonSignal,
  });

  const forceExitTimer = setTimeout(() => {
    logger.error("Forced shutdown after timeout.", {
      timeoutMs: FORCE_SHUTDOWN_TIMEOUT_MS,
      signal,
      reason,
    });

    process.exit(1);
  }, FORCE_SHUTDOWN_TIMEOUT_MS);

  forceExitTimer.unref?.();

  try {
    stopJobs();
    await closeHttpServer();
    await disconnectDatabase();

    clearTimeout(forceExitTimer);

    if (restartWithNodemonSignal) {
      process.kill(process.pid, "SIGUSR2");
      return;
    }

    process.exit(exitCode);
  } catch (error) {
    logger.error("Shutdown failed:", error.message);

    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

registerShutdownHandler(shutdown);

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
