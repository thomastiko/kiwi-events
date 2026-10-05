import {
  getSystemDatabaseStatusService,
  testSystemDatabaseConfigService,
  switchSystemDatabaseService,
} from "./system.database.service.js";

import { getMaintenanceState } from "./system.maintenance.js";

import {
  toDatabaseSwitchResultDto,
  toDatabaseTestResultDto,
  toMaintenanceStateDto,
  toSystemDatabaseStatusDto,
} from "./system.dto.js";

import { requestGracefulRestart } from "../../core/process/gracefulRestart.service.js";

export async function getSystemDatabaseStatusHandler(_req, res) {
  const database = await getSystemDatabaseStatusService();

  const maintenance = getMaintenanceState();

  return res.json({
    success: true,

    data: {
      database: toSystemDatabaseStatusDto(database),

      maintenance: toMaintenanceStateDto(maintenance),
    },
  });
}

export async function testSystemDatabaseConfigHandler(req, res) {
  const result = await testSystemDatabaseConfigService(req.body);

  return res.json({
    success: true,

    message: result.message || "Database connection successful.",

    data: toDatabaseTestResultDto(result),
  });
}

export async function switchSystemDatabaseHandler(req, res) {
  const result = await switchSystemDatabaseService(req.body);

  res.json({
    success: true,

    message: result.message || "Database switched successfully.",

    data: toDatabaseSwitchResultDto(result),
  });

  res.on("finish", () => {
    requestGracefulRestart({
      reason: "database_switch",
      delayMs: 500,
    });
  });
}
