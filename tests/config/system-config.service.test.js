import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  ...process.env,
};

const SECRET_ENVIRONMENT_VARIABLES = [
  "KIWI_EVENTS_DATABASE_URI",
  "DATABASE_URL",
  "MONGODB_URI",

  "KIWI_EVENTS_LOCAL_JWT_SECRET",
  "KIWI_EVENTS_EXTERNAL_JWT_SECRET",
  "KIWI_EVENTS_TICKET_QR_SECRET",

  "KIWI_EVENTS_MOLLIE_API_KEY",
  "MOLLIE_API_KEY",

  "KIWI_EVENTS_STRIPE_SECRET_KEY",
  "STRIPE_SECRET_KEY",

  "KIWI_EVENTS_STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET",

  "KIWI_EVENTS_MAIL_SMTP_PASS",
  "KIWI_EVENTS_MAIL_RESEND_API_KEY",

  "KIWI_EVENTS_STORAGE_PUBLIC_ACCESS_KEY_ID",
  "KIWI_EVENTS_STORAGE_PUBLIC_SECRET_ACCESS_KEY",
  "KIWI_EVENTS_STORAGE_PRIVATE_ACCESS_KEY_ID",
  "KIWI_EVENTS_STORAGE_PRIVATE_SECRET_ACCESS_KEY",
];

let tempDir;

function buildIsolatedEnvironment(configPath, dataDirectory) {
  const environment = {
    ...ORIGINAL_ENV,

    KIWI_EVENTS_CONFIG_FILE: configPath,

    KIWI_EVENTS_DATA_DIR: dataDirectory,
  };

  for (const variableName of SECRET_ENVIRONMENT_VARIABLES) {
    delete environment[variableName];
  }

  return environment;
}

async function loadSystemConfigModules(initialConfig = null) {
  vi.resetModules();

  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "kiwi-events-system-config-test-"),
  );

  const configPath = path.join(tempDir, "kiwi-events.config.json");

  const dataDirectory = path.join(tempDir, "data");

  process.env = buildIsolatedEnvironment(configPath, dataDirectory);

  const configStoreModule =
    await import("../../src/config/kiwi-events/kiwi-events.config.store.js");

  const secretConstantsModule =
    await import("../../src/config/kiwi-events/kiwi-events.secret.constants.js");

  const secretStoreModule =
    await import("../../src/config/kiwi-events/kiwi-events.secret.store.js");

  const systemConfigServiceModule =
    await import("../../src/modules/system/system.config.service.js");

  const systemConfigControllerModule =
    await import("../../src/modules/system/system.config.controller.js");

  const systemConfigValidationModule =
    await import("../../src/modules/system/system.config.validation.js");

  if (initialConfig) {
    configStoreModule.saveKiwiEventsConfig(initialConfig);
  }

  return {
    configPath,

    ...configStoreModule,
    ...secretConstantsModule,
    ...secretStoreModule,
    ...systemConfigServiceModule,
    ...systemConfigControllerModule,
    ...systemConfigValidationModule,
  };
}

function cleanupTempDirectory() {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }

  tempDir = null;
}

afterEach(() => {
  cleanupTempDirectory();

  process.env = {
    ...ORIGINAL_ENV,
  };

  vi.restoreAllMocks();
  vi.resetModules();
});

describe("System config service", () => {
  it("returns default config and secret statuses", async () => {
    const { getSystemConfigService, KIWI_EVENTS_SECRET_PATHS } =
      await loadSystemConfigModules();

    const { config, secretStatuses } = getSystemConfigService();

    expect(config.setup.initialized).toBe(false);

    expect(config.server.port).toBe(5001);

    expect(config.auth.provider).toBe("hybrid");

    expect(config.features.ticketing).toBe(true);

    expect(config.features.discountCodes).toBe(false);

    expect(config.features.mailOrderCancellation).toBe(true);

    expect(config.features.media).toBe(true);

    expect(config.storage).toMatchObject({
      local: {
        dir: "uploads",
      },
      public: {
        enabled: false,
      },
      private: {
        enabled: false,
      },
      generated: {
        ticketPdfTarget: "local",
      },
    });

    expect(config.branding.appName).toBe("Kiwi Events");

    expect(
      secretStatuses[KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET],
    ).toEqual({
      configured: false,
      source: "none",
      deletable: false,
    });
  });

  it("never returns secret values in the config snapshot", async () => {
    const {
      getSystemConfigService,
      setKiwiEventsSecret,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules();

    const externalJwtSecret = "external-jwt-secret-12345678901234567890";

    setKiwiEventsSecret(
      KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
      externalJwtSecret,
    );

    const snapshot = getSystemConfigService();

    expect(snapshot.config.auth).not.toHaveProperty("externalJwtSecret");

    expect(snapshot.config.auth).not.toHaveProperty("localJwtSecret");

    expect(snapshot.config.security).not.toHaveProperty("ticketQrSecret");

    expect(JSON.stringify(snapshot)).not.toContain(externalJwtSecret);

    expect(
      snapshot.secretStatuses[
        KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET
      ],
    ).toEqual({
      configured: true,
      source: "encrypted_store",
      deletable: true,
    });
  });

  it("updates normal config without adding secret fields", async () => {
    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      updateSystemConfigService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules();

    const result = updateSystemConfigService({
      config: {
        server: {
          port: 6001,
          appUrl: "https://api.kiwi-events.test",
        },

        features: {
          ticketPdf: false,
          mailOrderCancellation: false,
        },

        payments: {
          provider: "stripe",
          currency: "EUR",

          stripe: {
            successUrl: "https://example.test/success",

            cancelUrl: "https://example.test/cancel",
          },
        },

        branding: {
          appName: "Kiwi Events Test",

          ticketTitle: "My Ticket",
        },
      },
    });

    expect(result.success).toBe(true);

    expect(result.message).toBe("Configuration saved.");

    expect(result.data.config.server.port).toBe(6001);

    expect(result.data.config.branding.appName).toBe("Kiwi Events Test");

    expect(result.data.config.features.mailOrderCancellation).toBe(false);

    expect(result.data.config.payments.stripe).not.toHaveProperty("secretKey");

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.server.port).toBe(6001);

    expect(storedConfig.payments.provider).toBe("stripe");

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.PAYMENTS_STRIPE_SECRET_KEY,
      ),
    ).toBe("");
  });

  it("enables public storage only with a public base URL and credentials", async () => {
    const { updateSystemConfigService, KIWI_EVENTS_SECRET_PATHS } =
      await loadSystemConfigModules();

    const result = updateSystemConfigService({
      config: {
        storage: {
          public: {
            enabled: true,
            endpoint: "https://account.r2.cloudflarestorage.com",
            region: "auto",
            bucket: "kiwi-events-public",
            publicBaseUrl: "https://assets.example.test",
            forcePathStyle: false,
          },
          generated: {
            ticketPdfTarget: "public",
          },
        },
      },
      secrets: {
        [KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID]:
          "public-access-key",
        [KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY]:
          "public-secret-key",
      },
    });

    expect(result.data.config.storage.public).toMatchObject({
      enabled: true,
      endpoint: "https://account.r2.cloudflarestorage.com",
      bucket: "kiwi-events-public",
      publicBaseUrl: "https://assets.example.test",
    });
    expect(result.data.config.storage.generated.ticketPdfTarget).toBe("public");
    expect(
      result.data.secretStatuses[
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID
      ],
    ).toMatchObject({
      configured: true,
      source: "encrypted_store",
    });
  });

  it("rejects enabled public storage without a public base URL", async () => {
    const { updateSystemConfigService, KIWI_EVENTS_SECRET_PATHS } =
      await loadSystemConfigModules();

    let thrownError;

    try {
      updateSystemConfigService({
        config: {
          storage: {
            public: {
              enabled: true,
              bucket: "kiwi-events-public",
            },
          },
        },
        secrets: {
          [KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID]:
            "public-access-key",
          [KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY]:
            "public-secret-key",
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      statusCode: 400,
      code: "SYSTEM_CONFIG_INVALID",
    });
    expect(thrownError.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "config.storage.public.publicBaseUrl",
        }),
      ]),
    );
  });

  it("allows private storage without a public base URL", async () => {
    const { updateSystemConfigService, KIWI_EVENTS_SECRET_PATHS } =
      await loadSystemConfigModules();

    const result = updateSystemConfigService({
      config: {
        storage: {
          private: {
            enabled: true,
            endpoint: "https://account.r2.cloudflarestorage.com",
            region: "auto",
            bucket: "kiwi-events-private",
            forcePathStyle: false,
          },
          generated: {
            ticketPdfTarget: "private",
          },
        },
      },
      secrets: {
        [KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID]:
          "private-access-key",
        [KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY]:
          "private-secret-key",
      },
    });

    expect(result.data.config.storage.private).toMatchObject({
      enabled: true,
      bucket: "kiwi-events-private",
    });
    expect(result.data.config.storage.private).not.toHaveProperty(
      "publicBaseUrl",
    );
    expect(result.data.config.storage.generated.ticketPdfTarget).toBe(
      "private",
    );
  });

  it("rejects selecting an unavailable storage target for generated ticket PDFs", async () => {
    const { updateSystemConfigService } = await loadSystemConfigModules();

    let thrownError;

    try {
      updateSystemConfigService({
        config: {
          storage: {
            generated: {
              ticketPdfTarget: "private",
            },
          },
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      statusCode: 400,
      code: "SYSTEM_CONFIG_INVALID",
    });
    expect(thrownError.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "config.storage.generated.ticketPdfTarget",
        }),
      ]),
    );
  });

  it("sets a secret and enables its dependent feature atomically", async () => {
    const {
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      updateSystemConfigService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules();

    const ticketQrSecret = "ticket-qr-secret-123456789012345678901234";

    const result = updateSystemConfigService({
      config: {
        features: {
          ticketQr: true,
        },
      },

      secrets: {
        [KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET]: ticketQrSecret,
      },
    });

    expect(result.data.config.features.ticketQr).toBe(true);

    expect(
      result.data.secretStatuses[
        KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET
      ],
    ).toEqual({
      configured: true,
      source: "encrypted_store",
      deletable: true,
    });

    expect(
      getStoredKiwiEventsSecret(
        KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
      ),
    ).toBe(ticketQrSecret);

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.features.ticketQr).toBe(true);

    expect(storedConfig.security).not.toHaveProperty("ticketQrSecret");
  });

  it("removes a stored secret when null is submitted", async () => {
    const {
      getStoredKiwiEventsSecret,
      setKiwiEventsSecret,
      updateSystemConfigService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules();

    const secretPath = KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD;

    setKiwiEventsSecret(secretPath, "existing-smtp-password");

    const result = updateSystemConfigService({
      secrets: {
        [secretPath]: null,
      },
    });

    expect(getStoredKiwiEventsSecret(secretPath)).toBe("");

    expect(result.data.secretStatuses[secretPath]).toEqual({
      configured: false,
      source: "none",
      deletable: false,
    });
  });

  it("does not remove the Ticket QR secret while Ticket QR is enabled", async () => {
    const {
      getStoredKiwiEventsSecret,
      setKiwiEventsSecret,
      updateSystemConfigService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules({
      features: {
        ticketQr: true,
      },
    });

    const secretPath = KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET;

    const existingSecret = "existing-ticket-qr-secret-123456789012345";

    setKiwiEventsSecret(secretPath, existingSecret);

    let thrownError;

    try {
      updateSystemConfigService({
        secrets: {
          [secretPath]: null,
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();

    expect(thrownError.statusCode).toBe(400);

    expect(thrownError.code).toBe("SYSTEM_CONFIG_INVALID");

    expect(thrownError.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'secrets["security.ticketQrSecret"]',
        }),
      ]),
    );

    expect(getStoredKiwiEventsSecret(secretPath)).toBe(existingSecret);
  });

  it("rejects mutations of environment-managed secrets", async () => {
    const {
      getStoredKiwiEventsSecret,
      updateSystemConfigService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules();

    process.env.KIWI_EVENTS_MOLLIE_API_KEY = "environment-mollie-api-key";

    const secretPath = KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY;

    let thrownError;

    try {
      updateSystemConfigService({
        secrets: {
          [secretPath]: "stored-mollie-api-key",
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();

    expect(thrownError.statusCode).toBe(409);

    expect(thrownError.code).toBe("SECRET_MANAGED_BY_ENVIRONMENT");

    expect(getStoredKiwiEventsSecret(secretPath)).toBe("");
  });

  it("rolls back secret changes when saving config fails", async () => {
    const {
      configPath,
      getStoredKiwiEventsSecret,
      loadKiwiEventsConfig,
      setKiwiEventsSecret,
      updateSystemConfigService,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules({
      branding: {
        appName: "Original Name",
      },
    });

    const secretPath = KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD;

    const previousSecret = "previous-smtp-password";

    setKiwiEventsSecret(secretPath, previousSecret);

    const realWriteFileSync = fs.writeFileSync.bind(fs);

    vi.spyOn(fs, "writeFileSync").mockImplementation((filePath, ...args) => {
      if (path.resolve(String(filePath)) === path.resolve(configPath)) {
        throw new Error("Simulated config write failure.");
      }

      return realWriteFileSync(filePath, ...args);
    });

    expect(() =>
      updateSystemConfigService({
        config: {
          branding: {
            appName: "Updated Name",
          },
        },

        secrets: {
          [secretPath]: "new-smtp-password",
        },
      }),
    ).toThrow("Simulated config write failure.");

    expect(getStoredKiwiEventsSecret(secretPath)).toBe(previousSecret);

    const storedConfig = loadKiwiEventsConfig();

    expect(storedConfig.branding.appName).toBe("Original Name");
  });

  it("returns config metadata and secret statuses from the controller", async () => {
    const {
      getSystemConfigHandler,
      setKiwiEventsSecret,
      KIWI_EVENTS_SECRET_PATHS,
    } = await loadSystemConfigModules();

    const secretPath = KIWI_EVENTS_SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET;

    setKiwiEventsSecret(secretPath, "external-jwt-secret-12345678901234567890");

    const json = vi.fn();

    await getSystemConfigHandler(
      {},
      {
        json,
      },
    );

    expect(json).toHaveBeenCalledOnce();

    const response = json.mock.calls[0][0];

    expect(response.success).toBe(true);

    expect(response.data.config).toBeDefined();

    expect(response.data.secretStatuses[secretPath]).toEqual({
      configured: true,
      source: "encrypted_store",
      deletable: true,
    });

    expect(response.data.restartRequiredSettings).toEqual(
      expect.arrayContaining([
        "server.port",
        "auth.localJwtSecret",
        "auth.externalJwtSecret",
        "database.provider",
        "storage.local",
        "storage.public",
        "storage.private",
        "storage.generated",
        "payments.provider",
        "mail.provider",
        "mail.defaultFromName",
        "mail.defaultFromEmail",
        "mail.defaultReplyTo",
        "security.ticketQrSecret",
      ]),
    );

    expect(response.data.specialApplySettings).toEqual(["database"]);
  });

  it("requires ticketing when discount codes are enabled", async () => {
    const { updateSystemConfigService } = await loadSystemConfigModules();

    let thrownError;

    try {
      updateSystemConfigService({
        config: {
          features: {
            ticketing: false,
            discountCodes: true,
          },
        },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      statusCode: 400,
      code: "SYSTEM_CONFIG_INVALID",
    });

    expect(thrownError.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "config.features.discountCodes",
          message: "Discount codes require ticketing to be enabled.",
        }),
      ]),
    );
  });

  it("enables discount codes when ticketing is enabled", async () => {
    const { loadKiwiEventsConfig, updateSystemConfigService } =
      await loadSystemConfigModules();

    const result = updateSystemConfigService({
      config: {
        features: {
          ticketing: true,
          discountCodes: true,
        },
      },
    });

    expect(result.data.config.features).toMatchObject({
      ticketing: true,
      discountCodes: true,
    });

    expect(loadKiwiEventsConfig().features).toMatchObject({
      ticketing: true,
      discountCodes: true,
    });
  });

  it("validates the new config and secret update contract", async () => {
    const { updateSystemConfigSchema } = await loadSystemConfigModules();

    const validResult = updateSystemConfigSchema.safeParse({
      body: {
        config: {
          server: {
            port: 6001,
          },

          branding: {
            appName: "Kiwi Events Test",
          },

          features: {
            discountCodes: true,
            mailOrderCancellation: false,
          },
        },

        secrets: {
          "auth.externalJwtSecret": "12345678901234567890123456789012",
        },
      },

      params: {},
      query: {},
    });

    expect(validResult.success).toBe(true);
    const customerCancellationResult = updateSystemConfigSchema.safeParse({
      body: {
        config: {
          orders: {
            customerSelfServiceCancellation: {
              enabled: true,
              refundDeadlineDaysBeforeSession: 3,
            },
          },
        },
      },

      params: {},
      query: {},
    });

    expect(customerCancellationResult.success).toBe(true);
    const invalidCustomerCancellationDeadlineResult =
      updateSystemConfigSchema.safeParse({
        body: {
          config: {
            orders: {
              customerSelfServiceCancellation: {
                enabled: true,
                refundDeadlineDaysBeforeSession: -1,
              },
            },
          },
        },

        params: {},
        query: {},
      });

    expect(invalidCustomerCancellationDeadlineResult.success).toBe(false);
    const legacySecretResult = updateSystemConfigSchema.safeParse({
      body: {
        config: {
          auth: {
            externalJwtSecret: "plaintext-secret",
          },
        },
      },

      params: {},
      query: {},
    });

    expect(legacySecretResult.success).toBe(false);

    const databaseSecretResult = updateSystemConfigSchema.safeParse({
      body: {
        secrets: {
          "database.mongodb.uri": "mongodb://localhost/test",
        },
      },

      params: {},
      query: {},
    });

    expect(databaseSecretResult.success).toBe(false);

    const emptyUpdateResult = updateSystemConfigSchema.safeParse({
      body: {},
      params: {},
      query: {},
    });

    expect(emptyUpdateResult.success).toBe(false);

    const invalidPortResult = updateSystemConfigSchema.safeParse({
      body: {
        config: {
          server: {
            port: 70000,
          },
        },
      },

      params: {},
      query: {},
    });

    expect(invalidPortResult.success).toBe(false);
  });
});
