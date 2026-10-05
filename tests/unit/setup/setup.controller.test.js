import { describe, expect, it } from "vitest";

import {
  toSetupConfigDto,
  toSetupDatabaseSaveDto,
  toSetupDatabaseTestDto,
  toSetupInitializationDto,
  toSetupStatusDto,
} from "../../../src/modules/setup/setup.dto.js";

describe("setup DTO contract", () => {
  it("serializes public setup status through an allowlist", () => {
    const result = toSetupStatusDto({
      initialized: false,

      databaseConfigured: true,

      databaseProvider: "mongodb",

      appName: "Kiwi Events",

      uri: "mongodb://private",

      internalOnly: true,
    });

    expect(result).toEqual({
      initialized: false,

      databaseConfigured: true,

      databaseProvider: "mongodb",

      appName: "Kiwi Events",
    });

    expect(result).not.toHaveProperty("uri");

    expect(result).not.toHaveProperty("internalOnly");
  });

  it("serializes public setup config without secret values", () => {
    const result = toSetupConfigDto({
      setup: {
        initialized: false,

        databaseConfigured: true,

        databaseProvider: "mysql",

        appName: "Kiwi Events",

        internalOnly: true,
      },

      database: {
        provider: "mysql",

        configured: true,

        supportedProviders: ["mongodb", "mysql", "mariadb"],

        uri: "mysql://private",
      },

      server: {
        appUrl: "https://api.example.test",

        adminFrontendUrl: "https://admin.example.test",

        publicFrontendUrl: "https://events.example.test",
      },

      branding: {
        appName: "Kiwi Events",
      },

      auth: {
        externalJwtSecretConfigured: true,

        externalJwtSecret: "must-not-leak",
      },

      security: {
        ticketQrSecretConfigured: true,

        ticketQrSecret: "must-not-leak",
      },
    });

    expect(result).toEqual({
      setup: {
        initialized: false,

        databaseConfigured: true,

        databaseProvider: "mysql",

        appName: "Kiwi Events",
      },

      database: {
        provider: "mysql",

        configured: true,

        supportedProviders: ["mongodb", "mysql", "mariadb"],
      },

      server: {
        appUrl: "https://api.example.test",

        adminFrontendUrl: "https://admin.example.test",

        publicFrontendUrl: "https://events.example.test",
      },

      branding: {
        appName: "Kiwi Events",
      },

      auth: {
        externalJwtSecretConfigured: true,
      },

      security: {
        ticketQrSecretConfigured: true,
      },
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("must-not-leak");

    expect(serialized).not.toContain("mysql://private");
  });

  it("serializes database test and save results through explicit contracts", () => {
    expect(
      toSetupDatabaseTestDto({
        provider: "mysql",

        uri: "mysql://private",
      }),
    ).toEqual({
      provider: "mysql",
    });

    expect(
      toSetupDatabaseSaveDto({
        provider: "mysql",

        configured: true,

        uri: "mysql://private",
      }),
    ).toEqual({
      provider: "mysql",
      configured: true,
    });
  });

  it("summarizes SQL migrations without exposing migration filenames", () => {
    const result = toSetupInitializationDto({
      initialized: true,

      initializedAt: "2030-01-01T10:00:00.000Z",

      databaseProvider: "mysql",

      admin: {
        created: true,

        email: "admin@admin",

        eventUserId: "private-id",
      },

      migrations: {
        skipped: false,

        batchNo: 3,

        migrations: ["010_private.js", "011_private.js"],
      },

      roles: [
        {
          internalOnly: true,
        },
      ],
    });

    expect(result).toEqual({
      initialized: true,

      initializedAt: "2030-01-01T10:00:00.000Z",

      databaseProvider: "mysql",

      admin: {
        created: true,

        email: "admin@admin",
      },

      migrations: {
        skipped: false,

        appliedCount: 2,
      },
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("010_private.js");

    expect(serialized).not.toContain("batchNo");

    expect(serialized).not.toContain("eventUserId");

    expect(serialized).not.toContain('"roles"');
  });

  it("returns zero applied migrations for non-SQL setup", () => {
    expect(
      toSetupInitializationDto({
        initialized: true,

        initializedAt: "2030-01-01T10:00:00.000Z",

        databaseProvider: "mongodb",

        admin: {
          created: false,
          email: "admin@admin",
        },

        migrations: {
          skipped: true,

          reason: "Current database provider is not SQL",
        },
      }),
    ).toMatchObject({
      migrations: {
        skipped: true,
        appliedCount: 0,
      },
    });
  });
});
