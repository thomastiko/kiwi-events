import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

let getSystemDatabaseStatusServiceMock;
let testSystemDatabaseConfigServiceMock;
let switchSystemDatabaseServiceMock;

let getMaintenanceStateMock;
let requestGracefulRestartMock;

async function loadSystemController() {
  vi.resetModules();

  getSystemDatabaseStatusServiceMock = vi.fn().mockResolvedValue({
    provider: "mongodb",

    configured: true,

    source: "encrypted_store",
    providerSource: "config",

    managedByEnvironment: false,

    state: "connected",

    uri: "mongodb://user:password@localhost/private",

    lastError: "driver error with private details",
  });

  testSystemDatabaseConfigServiceMock = vi.fn().mockResolvedValue({
    success: true,

    provider: "mongodb",

    uri: "mongodb://user:password@localhost/private",

    message: "Database connection successful.",
  });

  switchSystemDatabaseServiceMock = vi.fn().mockResolvedValue({
    success: true,

    provider: "mysql",

    uri: "mysql://user:password@localhost/private",

    message:
      "Database switched successfully. No data was migrated; the selected database is now active.",

    data: {
      migrations: {
        skipped: false,

        batchNo: 2,

        migrations: ["010_internal.js", "011_internal.js"],
      },

      roles: [
        {
          id: "admin",
        },
      ],

      admin: {
        created: true,

        passwordUpdated: false,

        email: "admin@admin",

        eventUserId: "internal-id",
      },
    },
  });

  getMaintenanceStateMock = vi.fn().mockReturnValue({
    enabled: false,
    reason: null,
  });

  requestGracefulRestartMock = vi.fn();

  vi.doMock("../../../src/modules/system/system.database.service.js", () => ({
    getSystemDatabaseStatusService: getSystemDatabaseStatusServiceMock,

    testSystemDatabaseConfigService: testSystemDatabaseConfigServiceMock,

    switchSystemDatabaseService: switchSystemDatabaseServiceMock,
  }));

  vi.doMock("../../../src/modules/system/system.maintenance.js", () => ({
    getMaintenanceState: getMaintenanceStateMock,
  }));

  vi.doMock("../../../src/core/process/gracefulRestart.service.js", () => ({
    requestGracefulRestart: requestGracefulRestartMock,
  }));

  return import("../../../src/modules/system/system.controller.js");
}

async function loadRestartController() {
  vi.resetModules();

  requestGracefulRestartMock = vi.fn();

  vi.doMock("../../../src/core/process/gracefulRestart.service.js", () => ({
    requestGracefulRestart: requestGracefulRestartMock,
  }));

  return import("../../../src/modules/system/system.restart.controller.js");
}

function createResponseMock() {
  const res = new EventEmitter();

  res.json = vi.fn((payload) => {
    res.payload = payload;
    return res;
  });

  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("system.controller", () => {
  it("returns canonical database status without internal database details", async () => {
    const { getSystemDatabaseStatusHandler } = await loadSystemController();

    const res = createResponseMock();

    await getSystemDatabaseStatusHandler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,

      data: {
        database: {
          provider: "mongodb",

          configured: true,

          source: "encrypted_store",
          providerSource: "config",

          managedByEnvironment: false,

          state: "connected",
        },

        maintenance: {
          enabled: false,
          reason: null,
        },
      },
    });

    const serialized = JSON.stringify(res.payload);

    expect(serialized).not.toContain("mongodb://");

    expect(serialized).not.toContain("lastError");
  });

  it("returns a canonical database test response", async () => {
    const { testSystemDatabaseConfigHandler } = await loadSystemController();

    const req = {
      body: {
        provider: "mongodb",

        uri: "mongodb://127.0.0.1:27017/kiwi-events",
      },
    };

    const res = createResponseMock();

    await testSystemDatabaseConfigHandler(req, res);

    expect(testSystemDatabaseConfigServiceMock).toHaveBeenCalledWith(req.body);

    expect(res.json).toHaveBeenCalledWith({
      success: true,

      message: "Database connection successful.",

      data: {
        provider: "mongodb",
      },
    });

    expect(JSON.stringify(res.payload)).not.toContain("mongodb://");
  });

  it("returns canonical switch data and schedules restart after response finish", async () => {
    const { switchSystemDatabaseHandler } = await loadSystemController();

    const req = {
      body: {
        provider: "mysql",

        uri: "mysql://localhost/kiwi-events",

        confirmation: "SWITCH DATABASE",
      },
    };

    const res = createResponseMock();

    await switchSystemDatabaseHandler(req, res);

    expect(switchSystemDatabaseServiceMock).toHaveBeenCalledWith(req.body);

    expect(res.json).toHaveBeenCalledWith({
      success: true,

      message:
        "Database switched successfully. No data was migrated; the selected database is now active.",

      data: {
        provider: "mysql",

        migrations: {
          skipped: false,
          batchNo: 2,
          appliedCount: 2,
        },

        admin: {
          created: true,
          passwordUpdated: false,
          email: "admin@admin",
        },

        restart: {
          scheduled: true,
          reason: "database_switch",
          mode: "graceful-process-exit",
          requiresProcessManager: true,
        },
      },
    });

    const serialized = JSON.stringify(res.payload);

    expect(serialized).not.toContain("mysql://");

    expect(serialized).not.toContain("010_internal.js");

    expect(serialized).not.toContain("eventUserId");

    expect(requestGracefulRestartMock).not.toHaveBeenCalled();

    res.emit("finish");

    expect(requestGracefulRestartMock).toHaveBeenCalledWith({
      reason: "database_switch",
      delayMs: 500,
    });
  });
});

describe("system.restart.controller", () => {
  it("returns a canonical restart response and schedules it after response finish", async () => {
    const { restartSystemHandler } = await loadRestartController();

    const res = createResponseMock();

    await restartSystemHandler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,

      data: {
        restart: {
          scheduled: true,
          reason: "manual_restart",
          mode: "graceful-process-exit",
          requiresProcessManager: true,
        },
      },
    });

    expect(requestGracefulRestartMock).not.toHaveBeenCalled();

    res.emit("finish");

    expect(requestGracefulRestartMock).toHaveBeenCalledWith({
      reason: "manual_restart",
      delayMs: 500,
    });
  });
});
