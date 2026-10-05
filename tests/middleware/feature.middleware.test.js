import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpTestApp } from "../helpers/httpTestApp.js";

const ORIGINAL_ENV = { ...process.env };

async function createTestAppWithFeatureEnv(
  envPatch = {},
  runtimeFeatures = {},
) {
  vi.resetModules();

  process.env = {
    ...ORIGINAL_ENV,
    ...envPatch,
  };

  /**
   * Important:
   * kiwi-events feature checks use getFeatures(), which combines:
   * 1. ENV/default features
   * 2. kiwi-events.config.json runtime feature overrides
   *
   * In this middleware unit/integration-style test we mock the runtime config,
   * so the test is deterministic and does not depend on the developer's local
   * kiwi-events.config.json.
   */
  const defaultFeatures = {
    ticketing: true,
    guestCheckout: true,
    depositTickets: false,
    ticketPdf: true,
    ticketQr: false,
    mail: false,
    mailOrderConfirmation: true,
    mailEventCancellation: true,
    mailEventReminder: false,
    media: true,
  };

  function readEnvBoolean(name, fallback) {
    if (process.env[name] === undefined) {
      return fallback;
    }

    return ["true", "1", "yes", "on"].includes(
      String(process.env[name]).toLowerCase(),
    );
  }

  vi.doMock("../../src/config/kiwi-events/kiwi-events.config.store.js", () => ({
    loadKiwiEventsConfig: () => ({
      features: {
        ...defaultFeatures,

        ticketing: readEnvBoolean(
          "KIWI_EVENTS_FEATURE_TICKETING",
          defaultFeatures.ticketing,
        ),

        payments: readEnvBoolean(
          "KIWI_EVENTS_FEATURE_PAYMENTS",
          defaultFeatures.payments,
        ),

        ...runtimeFeatures,
      },
    }),
  }));

  const { requireFeature } =
    await import("../../src/core/middleware/feature.middleware.js");
  const { errorHandler } =
    await import("../../src/core/errors/errorHandler.js");

  const router = (await import("express")).default.Router();

  router.get(
    "/protected-ticketing-route",
    requireFeature("ticketing"),
    (_req, res) => {
      res.json({
        success: true,
        message: "Ticketing route reached",
      });
    },
  );

  router.get(
    "/protected-payments-route",
    requireFeature("payments"),
    (_req, res) => {
      res.json({
        success: true,
        message: "Payments route reached",
      });
    },
  );

  return createHttpTestApp({
    mountPath: "/",
    router,
    errorHandler,
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("requireFeature middleware", () => {
  it("allows access when the required feature is enabled through ENV/default config", async () => {
    const app = await createTestAppWithFeatureEnv({
      KIWI_EVENTS_FEATURE_TICKETING: "true",
    });

    const response = await request(app).get("/protected-ticketing-route");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Ticketing route reached",
    });
  });

  it("blocks access with 403 when the required feature is disabled through ENV/default config", async () => {
    const app = await createTestAppWithFeatureEnv({
      KIWI_EVENTS_FEATURE_TICKETING: "false",
    });

    const response = await request(app).get("/protected-ticketing-route");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: 'Feature "ticketing" is not enabled.',
      },
    });
  });

  it("documents that runtime config overrides ENV/default feature values", async () => {
    const app = await createTestAppWithFeatureEnv(
      {
        KIWI_EVENTS_FEATURE_TICKETING: "false",
      },
      {
        ticketing: true,
      },
    );

    const response = await request(app).get("/protected-ticketing-route");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Ticketing route reached",
    });
  });

  it("blocks access when runtime config explicitly disables a feature, even if ENV enables it", async () => {
    const app = await createTestAppWithFeatureEnv(
      {
        KIWI_EVENTS_FEATURE_PAYMENTS: "true",
      },
      {
        payments: false,
      },
    );

    const response = await request(app).get("/protected-payments-route");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: 'Feature "payments" is not enabled.',
      },
    });
  });
});
