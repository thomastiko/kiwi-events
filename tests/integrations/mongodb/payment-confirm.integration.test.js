import jwt from "jsonwebtoken";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createHttpTestApp } from "../../helpers/httpTestApp.js";
import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let app;

let Event;
let TicketType;
let Order;
let Ticket;

let ORDER_FULFILLMENT_STATUS;
let ORDER_FULFILLMENT_STEP;

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;
let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;
let TICKET_TYPE_PRICING_MODE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;
let TICKET_STATUS;

let createPaymentSessionMock;
let getPaymentSessionMock;
let parsePaymentWebhookMock;

let generateOfficialTicketDocumentMock;

function createPaymentProviderCheckoutConfigMock(provider = "mollie") {
  return {
    provider,
    redirectUrl: "https://frontend.example.test/payment-return",
    webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
  };
}

async function loadPaymentConfirmIntegrationApp({
  ticketing = true,
  guestCheckout = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
  paymentProvider = "mollie",
} = {}) {
  vi.resetModules();

  createPaymentSessionMock = vi.fn().mockResolvedValue({
    provider: paymentProvider,
    providerPaymentId: "pay_test_confirm_123",
    checkoutUrl: "https://payments.example.test/pay_test_confirm_123",
    status: "open",
  });
  parsePaymentWebhookMock = vi.fn(async ({ body }) => ({
    providerPaymentId: body?.id || body?.paymentId || body?.resource?.id,
    rawEvent: body,
  }));

  getPaymentSessionMock = vi.fn().mockResolvedValue({
    provider: paymentProvider,
    providerPaymentId: "pay_test_confirm_123",
    orderId: null,
    metadata: {},
    status: "paid",
    rawStatus: "paid",
  });
  generateOfficialTicketDocumentMock = vi.fn().mockResolvedValue({
    ticket: {
      ticketPdfStorageKey: "tickets/test-ticket.pdf",
    },
    document: {
      mimeType: "application/pdf",
      filename: "ticket-test.pdf",
      version: 1,
    },
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      features: {
        ticketing,
        guestCheckout,
        ticketPdf,
        ticketQr,
        mail,
      },
      payments: {
        provider: paymentProvider,
        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",
          webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    isMongoDatabase: () => true,
    isSqlDatabase: () => false,
    assertDatabaseConnected: () => true,
    getDatabaseConnection: () => null,
    withDatabaseTransaction: async (callback) => callback({}),
  }));

  const TEST_FEATURES = {
    ticketing,
    guestCheckout,
    depositTickets: false,
    ticketPdf,
    ticketQr,
    mail,
    mailOrderConfirmation: mail,
    mailEventCancellation: mail,
    mailEventReminder: false,
    media: false,
    reminders: false,
  };

  vi.doMock("../../../src/config/features.js", () => ({
    features: TEST_FEATURES,
    getDefaultFeatures: () => TEST_FEATURES,
    getRuntimeFeatureOverrides: () => ({}),
    getFeatures: () => TEST_FEATURES,
    isFeatureEnabled: (featureName) => TEST_FEATURES[featureName] === true,
  }));

  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderConfirmedMailSafe: vi.fn().mockResolvedValue({
      success: false,
      skipped: true,
      reason: "mail_disabled_in_test",
    }),
  }));

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: createPaymentSessionMock,
    getPaymentSession: getPaymentSessionMock,
    parsePaymentWebhook: parsePaymentWebhookMock,
    getPaymentProviderCheckoutConfig: vi.fn((provider = paymentProvider) =>
      createPaymentProviderCheckoutConfigMock(provider),
    ),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: generateOfficialTicketDocumentMock,

    buildOfficialTicketAttachment: vi.fn().mockResolvedValue(null),
  }));

  const expressModule = await import("express");

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");
  const ticketTypeModelModule =
    await import("../../../src/modules/ticketTypes/ticketType.model.js");
  const orderModelModule =
    await import("../../../src/modules/orders/order.model.js");
  const ticketModelModule =
    await import("../../../src/modules/tickets/ticket.model.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");
  const ticketConstantsModule =
    await import("../../../src/modules/tickets/ticket.constants.js");

  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");
  const paymentWebhookRoutesModule =
    await import("../../../src/modules/payments/webhooks/paymentWebhook.routes.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  Event = eventModelModule.Event;
  TicketType = ticketTypeModelModule.TicketType;
  Order = orderModelModule.Order;
  Ticket = ticketModelModule.Ticket;

  ORDER_FULFILLMENT_STATUS = orderConstantsModule.ORDER_FULFILLMENT_STATUS;

  ORDER_FULFILLMENT_STEP = orderConstantsModule.ORDER_FULFILLMENT_STEP;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_PRICING_MODE = ticketTypeConstantsModule.TICKET_TYPE_PRICING_MODE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  const router = expressModule.default.Router();

  router.use("/public/orders", publicOrderRoutesModule.default);
  router.use("/webhooks/payments", paymentWebhookRoutesModule.default);
  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

function signExternalUserToken(payload = {}) {
  return jwt.sign(
    {
      externalProvider: "dummy",
      externalUserId: "host-customer-1",
      role: "host_user",
      email: "kunde@example.com",
      firstName: "Max",
      lastName: "Kunde",
      ...payload,
    },
    EXTERNAL_SECRET,
  );
}

function buildFutureSession() {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt,
    endAt,
    timezone: "Europe/Vienna",
    locationLabel: "Audimax",
    capacity: 100,
  };
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Payment Confirm Event",
    slug: `payment-confirm-event-${Date.now()}`,
    shortDescription: "Payment confirm integration event",
    description: "Created by payment confirm integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildFutureSession()],
    isFree: false,
    publishedAt: new Date(),
    ...overrides,
  });
}

async function createPaidTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Paid Ticket`,
    displayName: "Paid Ticket",
    description: "Paid payment confirm test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 10,
    stockSold: 0,
    minPerOrder: 1,
    maxPerOrder: 5,
    isPersonalized: false,
    sortOrder: 0,
    ...overrides,
  });
}

async function createPendingPaidOrder({ quantity = 2 } = {}) {
  const event = await createPublishedEvent({
    title: "Payment Confirm Paid Event",
    slug: `payment-confirm-paid-event-${Date.now()}`,
  });

  const ticketType = await createPaidTicketType(event, {
    displayName: "Payment Confirm Ticket",
    priceGross: 2500,
    stockTotal: 10,
    stockSold: 0,
  });

  const checkoutResponse = await request(app)
    .post("/api/public/orders/checkout")
    .set("Idempotency-Key", "test-8a80f97f-c0e8-4197-b85b-d07efd8df4ca")
    .set("Authorization", `Bearer ${signExternalUserToken()}`)
    .send({
      eventId: String(event._id),

      items: [
        {
          ticketTypeId: String(ticketType._id),

          quantity,
        },
      ],
    });

  expect(checkoutResponse.status).toBe(201);

  expect(checkoutResponse.body.success).toBe(true);

  expect(checkoutResponse.body.data.order).toMatchObject({
    id: expect.any(String),

    status: ORDER_STATUS.PENDING,

    payment: {
      status: ORDER_PAYMENT_STATUS.PENDING,

      provider: "mollie",
    },
  });

  expect(checkoutResponse.body.data.checkout).toEqual({
    provider: "mollie",

    url: "https://payments.example.test/pay_test_confirm_123",

    status: "open",
  });

  expect(checkoutResponse.body.data.guestAccess).toBe(null);

  expect(checkoutResponse.body.meta).toMatchObject({
    idempotencyReplayed: false,

    paymentInitializationFailed: false,
  });
  expect(checkoutResponse.body.data.order).toMatchObject({
    id: expect.any(String),

    items: [
      {
        ticketType: {
          id: String(ticketType._id),
          pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
        },
        unitPrice: 2500,
      },
    ],

    status: ORDER_STATUS.PENDING,

    payment: {
      status: ORDER_PAYMENT_STATUS.PENDING,
      provider: "mollie",
    },
  });

  return {
    event,
    ticketType,

    order: checkoutResponse.body.data.order,
  };
}

describe("Payment confirm MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadPaymentConfirmIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    createPaymentSessionMock?.mockClear();
    getPaymentSessionMock?.mockClear();
    parsePaymentWebhookMock?.mockClear();
    generateOfficialTicketDocumentMock?.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("confirms a paid order and creates tickets when payment provider reports paid", async () => {
    const { order, ticketType } = await createPendingPaidOrder({
      quantity: 2,
    });

    getPaymentSessionMock.mockResolvedValueOnce({
      provider: "mollie",
      providerPaymentId: "pay_test_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "paid",
      rawStatus: "paid",
    });

    const response = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_test_confirm_123",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(getPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(getPaymentSessionMock).toHaveBeenCalledWith({
      provider: "mollie",
      providerPaymentId: "pay_test_confirm_123",
    });
    const orderInDb = await Order.findById(order.id).lean();

    expect(orderInDb).toBeDefined();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 1,
    });

    expect(orderInDb.confirmedAt).toBeTruthy();
    expect(orderInDb.fulfillmentStartedAt).toBeTruthy();

    expect(orderInDb.fulfillmentCompletedAt).toBeTruthy();

    expect(orderInDb.fulfillmentFailedAt).toBe(null);

    expect(orderInDb.fulfillmentLeaseExpiresAt).toBe(null);

    const tickets = await Ticket.find({
      orderId: orderInDb._id,
    }).lean();

    expect(tickets).toHaveLength(2);

    for (const ticket of tickets) {
      expect(ticket).toMatchObject({
        orderId: orderInDb._id,
        ticketTypeId: ticketType._id,
        status: TICKET_STATUS.ACTIVE,
        unitPrice: 2500,
        currency: "EUR",
      });

      expect(ticket.ticketCode).toEqual(expect.any(String));
    }
  });

  it("is idempotent and does not create duplicate tickets when paid webhook is received twice", async () => {
    const { order } = await createPendingPaidOrder({
      quantity: 2,
    });

    getPaymentSessionMock.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_test_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "paid",
      rawStatus: "paid",
    });

    const firstResponse = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_test_confirm_123",
      });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.success).toBe(true);

    const secondResponse = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_test_confirm_123",
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);

    const tickets = await Ticket.find({
      orderId: order.id,
    }).lean();

    expect(tickets).toHaveLength(2);
    expect(getPaymentSessionMock).toHaveBeenCalledTimes(2);
    const orderAfterReplay = await Order.findById(order.id).lean();

    expect(orderAfterReplay).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 1,
    });
  });

  it("marks order as failed, releases stock and creates no tickets when payment provider reports failed", async () => {
    const { order, ticketType } = await createPendingPaidOrder({
      quantity: 2,
    });

    getPaymentSessionMock.mockResolvedValueOnce({
      provider: "mollie",
      providerPaymentId: "pay_test_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "failed",
      rawStatus: "failed",
    });

    const response = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_test_confirm_123",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body).toMatchObject({
      success: true,
    });

    const orderInDb = await Order.findById(order.id).lean();

    expect(orderInDb).toBeDefined();
    expect(orderInDb.status).toBe(ORDER_STATUS.CANCELLED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.FAILED);
    expect(orderInDb.cancelledAt).toBeTruthy();

    expect(await Ticket.countDocuments({ orderId: order.id })).toBe(0);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("ignores paid webhook when provider payment cannot be mapped to an order", async () => {
    getPaymentSessionMock.mockResolvedValueOnce({
      provider: "mollie",
      providerPaymentId: "pay_unknown",
      orderId: "6a0000000000000000000000",
      metadata: {
        orderId: "6a0000000000000000000000",
      },
      status: "paid",
      rawStatus: "paid",
    });

    const response = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_unknown",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toMatchObject({
      success: true,
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);
  });
  it("acknowledges unsupported Stripe events without resolving a payment session", async () => {
    parsePaymentWebhookMock.mockResolvedValueOnce({
      provider: "stripe",
      providerPaymentId: null,
      eventType: "payment_intent.succeeded",
      orderId: null,
      status: null,
      ignored: true,
      ignoreReason: "unsupported_event_type",
      rawEvent: {
        id: "evt_payment_intent_unsupported",
        type: "payment_intent.succeeded",
      },
    });

    const response = await request(app)
      .post("/api/webhooks/payments/stripe")
      .set("stripe-signature", "test-signature")
      .send({
        id: "evt_payment_intent_unsupported",
        type: "payment_intent.succeeded",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: null,
    });

    expect(parsePaymentWebhookMock).toHaveBeenCalledTimes(1);
    expect(getPaymentSessionMock).not.toHaveBeenCalled();

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);
  });
  it("rejects webhook without provider payment id", async () => {
    const response = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "PROVIDER_PAYMENT_ID_MISSING",
        message: "Missing provider payment id.",
      },
    });

    expect(getPaymentSessionMock).not.toHaveBeenCalled();
  });
  it("does not immediately retry failed ticket document fulfillment before the retry deadline", async () => {
    await loadPaymentConfirmIntegrationApp({
      ticketPdf: true,
    });

    await clearMongoTestDb();

    generateOfficialTicketDocumentMock
      .mockRejectedValueOnce(new Error("Simulated ticket PDF failure"))
      .mockResolvedValue({
        ticket: {
          ticketPdfStorageKey: "tickets/retried-ticket.pdf",
        },
        document: {
          mimeType: "application/pdf",
          filename: "ticket-retried.pdf",
          version: 1,
        },
      });

    const { order } = await createPendingPaidOrder({
      quantity: 1,
    });

    getPaymentSessionMock.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_test_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "paid",
      rawStatus: "paid",
    });

    const firstResponse = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_test_confirm_123",
      });

    expect(firstResponse.status).toBe(500);
    expect(firstResponse.body.success).toBe(false);

    const failedOrder = await Order.findById(order.id)
      .select("+fulfillmentLastError")
      .lean();

    expect(failedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.DOCUMENTS,

      fulfillmentAttemptCount: 1,
    });

    expect(failedOrder.fulfillmentStartedAt).toBeTruthy();

    expect(failedOrder.fulfillmentFailedAt).toBeTruthy();
    expect(failedOrder.fulfillmentNextRetryAt).toBeTruthy();

    expect(
      new Date(failedOrder.fulfillmentNextRetryAt).getTime(),
    ).toBeGreaterThan(new Date(failedOrder.fulfillmentFailedAt).getTime());
    expect(failedOrder.fulfillmentCompletedAt).toBe(null);

    expect(failedOrder.fulfillmentLastError).toContain(
      "Ticket document generation failed",
    );

    /**
     * Tickets were already generated before the PDF
     * step failed.
     */
    expect(
      await Ticket.countDocuments({
        orderId: order.id,
      }),
    ).toBe(1);

    const secondResponse = await request(app)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_test_confirm_123",
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);

    const orderAfterImmediateReplay = await Order.findById(order.id).lean();

    expect(orderAfterImmediateReplay).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.DOCUMENTS,

      fulfillmentAttemptCount: 1,
    });

    expect(orderAfterImmediateReplay.fulfillmentFailedAt).toBeTruthy();
    expect(orderAfterImmediateReplay.fulfillmentCompletedAt).toBe(null);
    expect(orderAfterImmediateReplay.fulfillmentNextRetryAt).toBeTruthy();

    /**
     * Retrying fulfillment must reuse the ticket
     * created during the first attempt.
     */
    expect(
      await Ticket.countDocuments({
        orderId: order.id,
      }),
    ).toBe(1);

    expect(generateOfficialTicketDocumentMock).toHaveBeenCalledTimes(1);

    expect(getPaymentSessionMock).toHaveBeenCalledTimes(2);
  });
});
