import { describe, expect, it } from "vitest";

import {
  toDatabaseSwitchResultDto,
  toDatabaseTestResultDto,
  toMaintenanceStateDto,
  toSystemDatabaseStatusDto,
} from "../../../src/modules/system/system.dto.js";

describe("system DTO contract", () => {
  it("serializes database status without URI or driver errors", () => {
    const result = toSystemDatabaseStatusDto({
      provider: "mongodb",

      configured: true,

      source: "encrypted_store",
      providerSource: "config",

      managedByEnvironment: false,

      state: "connected",

      uri: "mongodb://user:password@localhost/private",

      lastError: "Driver failed with mongodb://secret",

      internalOnly: true,
    });

    expect(result).toEqual({
      provider: "mongodb",

      configured: true,

      source: "encrypted_store",
      providerSource: "config",

      managedByEnvironment: false,

      state: "connected",
    });

    expect(result).not.toHaveProperty("uri");
    expect(result).not.toHaveProperty("lastError");

    expect(result).not.toHaveProperty("internalOnly");
  });

  it("serializes a database test result through an allowlist", () => {
    const result = toDatabaseTestResultDto({
      success: true,

      provider: "mysql",

      uri: "mysql://user:password@localhost/private",

      driverMessage: "private",

      internalOnly: true,
    });

    expect(result).toEqual({
      provider: "mysql",
    });
  });

  it("serializes database switch results without seed or migration internals", () => {
    const result = toDatabaseSwitchResultDto({
      success: true,

      provider: "mysql",

      uri: "mysql://user:password@localhost/private",

      data: {
        migrations: {
          skipped: false,

          batchNo: 4,

          migrations: ["010_private_migration.js", "011_private_migration.js"],
        },

        roles: [
          {
            id: "admin",
            internalOnly: true,
          },
        ],

        admin: {
          created: true,

          passwordUpdated: false,

          email: "admin@admin",

          eventUserId: "private-id",
        },
      },
    });

    expect(result).toEqual({
      provider: "mysql",

      migrations: {
        skipped: false,
        batchNo: 4,
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
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("private_migration");

    expect(serialized).not.toContain("eventUserId");

    expect(serialized).not.toContain('"roles"');

    expect(serialized).not.toContain("mysql://");
  });

  it("serializes maintenance state without stale reasons", () => {
    expect(
      toMaintenanceStateDto({
        enabled: false,
        reason: "database_switch",
      }),
    ).toEqual({
      enabled: false,
      reason: null,
    });

    expect(
      toMaintenanceStateDto({
        enabled: true,
        reason: "database_switch",
      }),
    ).toEqual({
      enabled: true,
      reason: "database_switch",
    });
  });
});
