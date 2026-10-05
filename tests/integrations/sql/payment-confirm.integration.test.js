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

const TEST_JWT_SECRET = "integration-local-jwt-secret";
const TEST_EXTERNAL_JWT_SECRET = "integration-external-jwt-secret";

const TEST_EXTERNAL_PROVIDER = "dummy";
const TEST_EXTERNAL_USER_ID = "host-customer-payment-confirm-1";
const TEST_EXTERNAL_EMAIL = "payment.confirm.customer@example.com";

let publicOrderApp;
let paymentWebhookApp;
let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEvent;
let createTicketType;
let findOrderById;
let findTicketsByOrderId;
let findTicketTypeById;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;
let TICKET_STATUS;

let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let ORDER_FULFILLMENT_STATUS;
let ORDER_FULFILLMENT_STEP;

let TEST_FEATURES;
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

async function loadPaymentConfirmSqlIntegrationApp({
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
    providerPaymentId: "pay_sql_confirm_123",
    checkoutUrl: "https://payments.example.test/pay_sql_confirm_123",
    status: "open",
  });

  getPaymentSessionMock = vi.fn().mockResolvedValue({
    provider: paymentProvider,
    providerPaymentId: "pay_sql_confirm_123",
    orderId: null,
    metadata: {},
    status: "paid",
    rawStatus: "paid",
  });
  parsePaymentWebhookMock = vi.fn(async ({ body }) => ({
    providerPaymentId: body?.id || body?.paymentId || body?.resource?.id,
    rawEvent: body,
  }));
  generateOfficialTicketDocumentMock = vi.fn().mockResolvedValue({
    ticket: {
      ticketPdfStorageKey: "tickets/sql-test-ticket.pdf",
    },
    document: {
      mimeType: "application/pdf",
      filename: "sql-ticket-test.pdf",
      version: 1,
    },
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: TEST_JWT_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
      },
      payments: {
        provider: paymentProvider,
        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",
          webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
        },
      },
      branding: {
        appName: "Kiwi Events Test",
      },
    },
  }));

  TEST_FEATURES = {
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

  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;
  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;
  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;

  const eventRepositoryModule =
    await import("../../../src/modules/events/repositories/event.repository.js");
  const ticketTypeRepositoryModule =
    await import("../../../src/modules/ticketTypes/repositories/ticketType.repository.js");
  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");
  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");

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

  createEvent = eventRepositoryModule.createEvent;
  createTicketType = ticketTypeRepositoryModule.createTicketType;
  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  findOrderById = orderRepositoryModule.findOrderById;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;
  ORDER_FULFILLMENT_STATUS = orderConstantsModule.ORDER_FULFILLMENT_STATUS;

  ORDER_FULFILLMENT_STEP = orderConstantsModule.ORDER_FULFILLMENT_STEP;
  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  publicOrderApp = createHttpTestApp({
    mountPath: "/api/public/orders",
    router: publicOrderRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  paymentWebhookApp = createHttpTestApp({
    mountPath: "/api/webhooks/payments",
    router: paymentWebhookRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

function createExternalUserToken({
  externalProvider = TEST_EXTERNAL_PROVIDER,
  externalUserId = TEST_EXTERNAL_USER_ID,
  email = TEST_EXTERNAL_EMAIL,
  firstName = "Payment",
  lastName = "Customer",
} = {}) {
  return jwt.sign(
    {
      sub: externalUserId,
      tokenType: "external_user",
      type: "external_user",
      role: "customer",
      roles: ["customer"],

      provider: externalProvider,
      externalProvider,
      externalUserId,

      email,
      firstName,
      lastName,
      given_name: firstName,
      family_name: lastName,
      name: `${firstName} ${lastName}`,
    },
    TEST_EXTERNAL_JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

function buildFutureSession() {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt,
    endAt,
    timezone: "Europe/Vienna",
    locationLabel: "Main Hall",
    locationDetails: "Room 1",
    capacity: 100,
    status: "scheduled",
  };
}

async function createPublishedPaidEvent(overrides = {}) {
  return createEvent({
    title: "SQL Payment Confirm Event",
    slug: `sql-payment-confirm-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL payment confirm event",
    description: "Created by SQL payment confirm integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "payment-confirm"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    notesInternal: "Created by SQL payment confirm integration test",
    ...overrides,
  });
}

async function createPaidTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,
    name: `${event.title} - Paid Ticket`,
    displayName: "SQL Payment Confirm Ticket",
    description: "Paid SQL payment confirm test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "fixed",
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 10,
    stockSold: 0,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    ...overrides,
  });
}

async function createPendingPaidOrder({ quantity = 2 } = {}) {
  const event = await createPublishedPaidEvent();

  const ticketType = await createPaidTicketType(event, {
    displayName: "SQL Payment Confirm Ticket",
    pricingMode: "fixed",
    priceGross: 2500,
    stockTotal: 10,
    stockSold: 0,
  });

  const checkoutResponse = await request(publicOrderApp)
    .post("/api/public/orders/checkout")
    .set("Idempotency-Key", "test-e19891f9-d15e-4470-834f-ae2956d8ab8d")
    .set("Authorization", `Bearer ${createExternalUserToken()}`)
    .send({
      eventId: event.id,
      items: [
        {
          ticketTypeId: ticketType.id,
          quantity,
        },
      ],
    });

  if (checkoutResponse.status !== 201) {
    console.dir(checkoutResponse.body, { depth: null });
  }

  expect(checkoutResponse.status).toBe(201);
  expect(checkoutResponse.body.success).toBe(true);
  expect(checkoutResponse.body.data.order).toMatchObject({
    id: expect.any(String),

    event: {
      id: event.id,
    },

    status: ORDER_STATUS.PENDING,

    payment: {
      status: ORDER_PAYMENT_STATUS.PENDING,

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
    },

    pricing: {
      total: 2500 * quantity,

      currency: "EUR",
    },
  });

  expect(checkoutResponse.body.data.checkout).toEqual({
    provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

    url: "https://payments.example.test/pay_sql_confirm_123",

    status: "open",
  });

  expect(checkoutResponse.body.meta.paymentInitializationFailed).toBe(false);

  return {
    event,
    ticketType,
    order: checkoutResponse.body.data.order,
  };
}

describe("Payment confirm SQL integration", () => {
  beforeAll(async () => {
    await loadPaymentConfirmSqlIntegrationApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    TEST_FEATURES.ticketing = true;
    TEST_FEATURES.guestCheckout = true;
    TEST_FEATURES.depositTickets = false;
    TEST_FEATURES.ticketPdf = false;
    TEST_FEATURES.ticketQr = false;
    TEST_FEATURES.mail = false;
    TEST_FEATURES.mailOrderConfirmation = false;
    TEST_FEATURES.mailEventCancellation = false;
    TEST_FEATURES.mailEventReminder = false;
    TEST_FEATURES.media = false;
    TEST_FEATURES.reminders = false;

    createPaymentSessionMock?.mockReset();
    createPaymentSessionMock?.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_sql_confirm_123",
      checkoutUrl: "https://payments.example.test/pay_sql_confirm_123",
      status: "open",
    });

    getPaymentSessionMock?.mockReset();
    parsePaymentWebhookMock?.mockClear();
    getPaymentSessionMock?.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_sql_confirm_123",
      orderId: null,
      metadata: {},
      status: "paid",
      rawStatus: "paid",
    });
    generateOfficialTicketDocumentMock?.mockReset();

    generateOfficialTicketDocumentMock?.mockResolvedValue({
      ticket: {
        ticketPdfStorageKey: "tickets/sql-test-ticket.pdf",
      },
      document: {
        mimeType: "application/pdf",
        filename: "sql-ticket-test.pdf",
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("confirms a paid order and creates tickets when payment provider reports paid", async () => {
    const { order, ticketType } = await createPendingPaidOrder({
      quantity: 2,
    });

    getPaymentSessionMock.mockResolvedValueOnce({
      provider: "mollie",
      providerPaymentId: "pay_sql_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "paid",
      rawStatus: "paid",
    });

    const response = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_confirm_123",
      });

    if (response.status !== 200) {
      console.dir(response.body, { depth: null });
    }

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(getPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(getPaymentSessionMock).toHaveBeenCalledWith({
      provider: "mollie",
      providerPaymentId: "pay_sql_confirm_123",
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toBeDefined();
    expect(orderInDb).toMatchObject({
      id: order.id,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_sql_confirm_123",

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 1,
    });

    expect(orderInDb.confirmedAt).toBeTruthy();

    expect(orderInDb.fulfillmentStartedAt).toBeTruthy();

    expect(orderInDb.fulfillmentCompletedAt).toBeTruthy();

    expect(orderInDb.fulfillmentFailedAt).toBe(null);

    expect(orderInDb.fulfillmentLeaseExpiresAt).toBe(null);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);

    for (const ticket of tickets) {
      expect(ticket).toMatchObject({
        orderId: order.id,
        ticketTypeId: ticketType.id,
        status: TICKET_STATUS.ACTIVE,
        unitPrice: 2500,
        currency: "EUR",
      });

      expect(ticket.id).toEqual(expect.any(String));
      expect(ticket.ticketCode).toEqual(expect.any(String));
    }
  });

  it("is idempotent and does not create duplicate tickets when paid webhook is received twice", async () => {
    const { order } = await createPendingPaidOrder({
      quantity: 2,
    });

    getPaymentSessionMock.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_sql_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "paid",
      rawStatus: "paid",
    });

    const firstResponse = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_confirm_123",
      });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.success).toBe(true);

    const secondResponse = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_confirm_123",
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);
    expect(getPaymentSessionMock).toHaveBeenCalledTimes(2);
    const orderAfterReplay = await findOrderById(order.id, {
      lean: true,
    });

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
      providerPaymentId: "pay_sql_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "failed",
      rawStatus: "failed",
    });

    const response = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_confirm_123",
      });

    if (response.status !== 200) {
      console.dir(response.body, { depth: null });
    }

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toBeDefined();
    expect(orderInDb).toMatchObject({
      id: order.id,
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      paymentProviderPaymentId: "pay_sql_confirm_123",
      cancellationReason: "Payment failed",
    });
    expect(orderInDb.cancelledAt).toBeTruthy();

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("ignores paid webhook when provider payment cannot be mapped to an order", async () => {
    getPaymentSessionMock.mockResolvedValueOnce({
      provider: "mollie",
      providerPaymentId: "pay_sql_unknown",
      orderId: "00000000-0000-4000-8000-000000000001",
      metadata: {
        orderId: "00000000-0000-4000-8000-000000000001",
      },
      status: "paid",
      rawStatus: "paid",
    });

    const response = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_unknown",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const tickets = await findTicketsByOrderId(
      "00000000-0000-4000-8000-000000000001",
      {
        lean: true,
      },
    );

    expect(tickets).toHaveLength(0);
  });
  it("does not immediately retry failed SQL ticket document fulfillment before the retry deadline", async () => {
    TEST_FEATURES.ticketPdf = true;

    generateOfficialTicketDocumentMock
      .mockRejectedValueOnce(new Error("Simulated SQL ticket PDF failure"))
      .mockResolvedValue({
        ticket: {
          ticketPdfStorageKey: "tickets/sql-retried-ticket.pdf",
        },
        document: {
          mimeType: "application/pdf",
          filename: "sql-ticket-retried.pdf",
          version: 1,
        },
      });

    const { order } = await createPendingPaidOrder({
      quantity: 1,
    });

    getPaymentSessionMock.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_sql_confirm_123",
      orderId: order.id,
      metadata: {
        orderId: order.id,
      },
      status: "paid",
      rawStatus: "paid",
    });

    const firstResponse = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_confirm_123",
      });

    expect(firstResponse.status).toBe(500);
    expect(firstResponse.body.success).toBe(false);

    const failedOrder = await findOrderById(order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(failedOrder).toMatchObject({
      id: order.id,
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

    let tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);

    const secondResponse = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({
        id: "pay_sql_confirm_123",
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.success).toBe(true);

    const orderAfterImmediateReplay = await findOrderById(order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(orderAfterImmediateReplay).toMatchObject({
      id: order.id,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.DOCUMENTS,

      fulfillmentAttemptCount: 1,
    });

    expect(orderAfterImmediateReplay.fulfillmentFailedAt).toBeTruthy();

    expect(orderAfterImmediateReplay.fulfillmentCompletedAt).toBe(null);

    expect(orderAfterImmediateReplay.fulfillmentNextRetryAt).toBeTruthy();

    expect(orderAfterImmediateReplay.fulfillmentLeaseExpiresAt).toBe(null);

    tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);

    /*
     * The immediate webhook replay must not bypass
     * the fulfillment retry deadline.
     */
    expect(generateOfficialTicketDocumentMock).toHaveBeenCalledTimes(1);

    /*
     * The payment webhook itself was still processed twice.
     */
    expect(getPaymentSessionMock).toHaveBeenCalledTimes(2);
  });
  it("rejects webhook without provider payment id", async () => {
    const response = await request(paymentWebhookApp)
      .post("/api/webhooks/payments/mollie")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "Missing provider payment id.",
      },
    });

    expect(getPaymentSessionMock).not.toHaveBeenCalled();
  });
});
