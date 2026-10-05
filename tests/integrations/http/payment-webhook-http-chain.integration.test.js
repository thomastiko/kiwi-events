import express from "express";
import request from "supertest";
import Stripe from "stripe";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_STRIPE_SECRET_KEY = "sk_test_kiwi_events_http_chain";

const TEST_STRIPE_WEBHOOK_SECRET = "whsec_kiwi_events_http_chain_secret";

let app;
let handlePaymentWebhookServiceMock;
let parsedWebhookEvent;

function buildMollieWebhookPayload(
  body = {
    id: "pay_test_http_chain_123",
  },
) {
  return {
    body,
    payload: JSON.stringify(body, null, 2),
  };
}

function buildStripeWebhookPayload() {
  const event = {
    id: "evt_test_http_chain_123",
    object: "event",
    type: "checkout.session.completed",

    data: {
      object: {
        id: "cs_test_http_chain_123",
        object: "checkout.session",
        payment_status: "paid",
        status: "complete",

        metadata: {
          orderId: "order-http-chain-123",
        },
      },
    },
  };

  /*
   * Die Formatierung ist absichtlich enthalten.
   *
   * Würde der Body nach express.json() erneut serialisiert,
   * wären die Bytes anders und die Stripe-Signatur ungültig.
   */
  const payload = JSON.stringify(event, null, 2);

  const stripe = new Stripe(TEST_STRIPE_SECRET_KEY);

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_STRIPE_WEBHOOK_SECRET,
  });

  return {
    event,
    payload,
    signature,
  };
}

async function loadPaymentWebhookHttpApp() {
  vi.resetModules();

  const passThroughMiddleware = (_req, _res, next) => next();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      nodeEnv: "test",
      port: 5001,

      appUrl: "http://localhost:5001",

      adminFrontendUrl: "http://localhost:5001/admin",

      frontendUrl: "http://localhost:9000",

      corsOrigins: ["http://localhost:5001", "http://localhost:9000"],

      storage: {
        localDir: "uploads-test",
      },

      payments: {
        provider: "mollie",

        mollie: {
          apiKey: "test_mollie_http_chain",

          redirectUrl: "http://localhost:9000/payment-return",

          webhookUrl: "http://localhost:5001/api/webhooks/payments/mollie",
        },

        stripe: {
          secretKey: TEST_STRIPE_SECRET_KEY,

          webhookSecret: TEST_STRIPE_WEBHOOK_SECRET,

          successUrl:
            "http://localhost:9000/payment-return?session_id={CHECKOUT_SESSION_ID}",

          cancelUrl: "http://localhost:9000/payment-cancelled",
        },
      },
    },
  }));

  const TEST_FEATURES = {
    ticketing: true,
    payments: true,
  };

  vi.doMock("../../../src/config/features.js", () => ({
    features: TEST_FEATURES,

    getDefaultFeatures: () => TEST_FEATURES,

    getRuntimeFeatureOverrides: () => ({}),

    getFeatures: () => TEST_FEATURES,

    isFeatureEnabled: (featureName) => TEST_FEATURES[featureName] === true,
  }));

  /*
   * Diese Middleware ist für den Webhook-Test nicht relevant.
   * express.json() aus der echten app.js bleibt unverändert aktiv.
   */
  vi.doMock(
    "../../../src/core/middleware/securityHeaders.middleware.js",
    () => ({
      securityHeadersMiddleware: passThroughMiddleware,
    }),
  );

  vi.doMock(
    "../../../src/core/middleware/requestLogging.middleware.js",
    () => ({
      requestLoggingMiddleware: passThroughMiddleware,
    }),
  );

  vi.doMock("../../../src/core/middleware/setupMode.middleware.js", () => ({
    setupModeMiddleware: passThroughMiddleware,
  }));

  vi.doMock("../../../src/modules/system/system.maintenance.js", () => ({
    maintenanceMiddleware: passThroughMiddleware,
  }));

  vi.doMock("../../../src/core/middleware/rateLimiters.js", () => ({
    checkoutRateLimit: passThroughMiddleware,

    guestAccessRateLimit: passThroughMiddleware,

    paymentWebhookRateLimit: passThroughMiddleware,
  }));

  /*
   * Diese Exporte werden beim Laden des Order-Routers importiert,
   * liegen aber nicht auf dem Webhook-Pfad.
   */
  vi.doMock("../../../src/core/middleware/identity.middleware.js", () => ({
    requireIdentity: passThroughMiddleware,
  }));

  vi.doMock("../../../src/core/middleware/eventAccess.middleware.js", () => ({
    attachEventUserIfExists: passThroughMiddleware,
  }));

  /*
   * Der echte Controller bleibt aktiv.
   *
   * Nur die Datenbank-/Order-Verarbeitung wird ersetzt. Der Mock
   * ruft den echten Payment-Service und damit die echten Mollie-
   * und Stripe-Webhook-Parser auf.
   */
  vi.doMock(
    "../../../src/modules/orders/public/order.public.service.js",
    async () => {
      const paymentService =
        await import("../../../src/modules/payments/payment.service.js");

      const orderErrors =
        await import("../../../src/modules/orders/order.errors.js");

      handlePaymentWebhookServiceMock = vi.fn(
        async ({ provider, body, headers, rawBody }) => {
          const webhookEvent = await paymentService.parsePaymentWebhook({
            provider,
            body,
            headers,
            rawBody,
          });

          parsedWebhookEvent = webhookEvent;

          /*
           * Das entspricht der echten Prüfung im
           * handlePaymentWebhookService.
           */
          if (!webhookEvent.providerPaymentId) {
            throw orderErrors.providerPaymentIdMissingError();
          }

          return {
            success: true,
            webhookEvent,
          };
        },
      );

      return {
        checkoutPublicOrderService: vi.fn(),

        listOwnOrdersService: vi.fn(),

        getOwnOrderByIdService: vi.fn(),

        cancelOwnOrderService: vi.fn(),

        getGuestOrderByAccessTokenService: vi.fn(),

        handlePaymentWebhookService: handlePaymentWebhookServiceMock,
      };
    },
  );

  /*
   * In die echte app.js wird ausschließlich der echte
   * Payment-Webhook-Router eingehängt. Andere Fachmodule und
   * Datenbanken sind für diesen HTTP-Kettentest nicht notwendig.
   */
  vi.doMock("../../../src/routes/index.js", async () => {
    const paymentWebhookRoutesModule =
      await import("../../../src/modules/payments/webhooks/paymentWebhook.routes.js");

    const router = express.Router();

    router.use("/webhooks/payments", paymentWebhookRoutesModule.default);

    return {
      default: router,
    };
  });

  const appModule = await import("../../../src/app.js");

  app = appModule.default;
}

beforeAll(async () => {
  await loadPaymentWebhookHttpApp();
});

beforeEach(() => {
  parsedWebhookEvent = null;

  handlePaymentWebhookServiceMock?.mockClear();
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Payment webhook HTTP chain", () => {
  describe("Mollie", () => {
    it("passes the parsed body and preserved raw HTTP body through the real webhook route", async () => {
      const { body, payload } = buildMollieWebhookPayload();

      const response = await request(app)
        .post("/api/webhooks/payments/mollie")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(response.status).toBe(200);

      expect(response.body).toEqual({
        success: true,
        data: null,
      });

      expect(handlePaymentWebhookServiceMock).toHaveBeenCalledTimes(1);

      const webhookArguments = handlePaymentWebhookServiceMock.mock.calls[0][0];

      expect(webhookArguments.provider).toBe("mollie");

      expect(webhookArguments.body).toEqual(body);

      expect(Buffer.isBuffer(webhookArguments.rawBody)).toBe(true);

      expect(webhookArguments.rawBody.toString("utf8")).toBe(payload);

      expect(parsedWebhookEvent).toMatchObject({
        provider: "mollie",

        providerPaymentId: "pay_test_http_chain_123",

        eventType: "payment.updated",
      });
    });

    it("rejects a Mollie webhook without a payment id", async () => {
      const { payload } = buildMollieWebhookPayload({});

      const response = await request(app)
        .post("/api/webhooks/payments/mollie")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(response.status).toBe(400);

      expect(response.body).toMatchObject({
        success: false,

        error: {
          code: "PROVIDER_PAYMENT_ID_MISSING",
        },
      });

      expect(handlePaymentWebhookServiceMock).toHaveBeenCalledTimes(1);

      expect(parsedWebhookEvent).toMatchObject({
        provider: "mollie",
        providerPaymentId: null,
      });
    });
  });

  describe("Stripe", () => {
    it("preserves the exact HTTP bytes and accepts a valid Stripe signature", async () => {
      const { event, payload, signature } = buildStripeWebhookPayload();

      const response = await request(app)
        .post("/api/webhooks/payments/stripe")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);

      expect(response.status).toBe(200);

      expect(response.body).toEqual({
        success: true,
        data: null,
      });

      expect(handlePaymentWebhookServiceMock).toHaveBeenCalledTimes(1);

      const webhookArguments = handlePaymentWebhookServiceMock.mock.calls[0][0];

      expect(webhookArguments.provider).toBe("stripe");

      expect(webhookArguments.body).toEqual(event);

      expect(webhookArguments.headers["stripe-signature"]).toBe(signature);

      expect(Buffer.isBuffer(webhookArguments.rawBody)).toBe(true);

      expect(webhookArguments.rawBody.toString("utf8")).toBe(payload);

      expect(parsedWebhookEvent).toMatchObject({
        provider: "stripe",

        providerPaymentId: "cs_test_http_chain_123",

        eventType: "checkout.session.completed",

        ignored: false,
      });
    });

    it("rejects an invalid Stripe signature", async () => {
      const { payload } = buildStripeWebhookPayload();

      const stripe = new Stripe(TEST_STRIPE_SECRET_KEY);

      const invalidSignature = stripe.webhooks.generateTestHeaderString({
        payload,

        secret: "whsec_wrong_http_chain_secret",
      });

      const response = await request(app)
        .post("/api/webhooks/payments/stripe")
        .set("Content-Type", "application/json")
        .set("stripe-signature", invalidSignature)
        .send(payload);

      expect(response.status).toBe(400);

      expect(response.body).toMatchObject({
        success: false,

        error: {
          code: "STRIPE_WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
        },
      });

      expect(handlePaymentWebhookServiceMock).toHaveBeenCalledTimes(1);

      expect(parsedWebhookEvent).toBeNull();
    });

    it("rejects a Stripe webhook without its signature header", async () => {
      const { payload } = buildStripeWebhookPayload();

      const response = await request(app)
        .post("/api/webhooks/payments/stripe")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(response.status).toBe(400);

      expect(response.body).toMatchObject({
        success: false,

        error: {
          code: "STRIPE_WEBHOOK_SIGNATURE_MISSING",
        },
      });

      expect(handlePaymentWebhookServiceMock).toHaveBeenCalledTimes(1);

      expect(parsedWebhookEvent).toBeNull();
    });
  });
});
