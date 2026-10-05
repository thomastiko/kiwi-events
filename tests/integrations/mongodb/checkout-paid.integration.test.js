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

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;
let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;
let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;
let TICKET_TYPE_PRICING_MODE;
let createPaymentSessionMock;

let createDiscountCodeGroup;
let insertDiscountCodes;

function createPaymentProviderCheckoutConfigMock(provider = "mollie") {
  return {
    provider,
    redirectUrl: "https://frontend.example.test/payment-return",
    webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
  };
}

async function loadPaidCheckoutIntegrationApp({
  ticketing = true,
  guestCheckout = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
  discountCodes = true,
  paymentProvider = "mollie",
  paymentSessionResult = {
    provider: "mollie",
    providerPaymentId: "pay_test_123",
    checkoutUrl: "https://payments.example.test/pay_test_123",
    status: "open",
  },
  paymentSessionError = null,
} = {}) {
  vi.resetModules();

  createPaymentSessionMock = vi.fn();

  if (paymentSessionError) {
    createPaymentSessionMock.mockRejectedValue(paymentSessionError);
  } else {
    createPaymentSessionMock.mockResolvedValue(paymentSessionResult);
  }

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
        discountCodes,
      },
      payments: {
        provider: paymentProvider,
        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",
          webhookUrl:
            "https://api.example.test/api/public/orders/webhook/mollie",
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
    discountCodes,
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
    getPaymentSession: vi.fn(),
    parsePaymentWebhook: vi.fn(),
    getPaymentProviderCheckoutConfig: vi.fn((provider = paymentProvider) =>
      createPaymentProviderCheckoutConfigMock(provider),
    ),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: vi.fn().mockResolvedValue({
      skipped: true,
      reason: "ticket_pdf_disabled_in_test",
    }),
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

  const discountCodeRepositoryModule =
    await import("../../../src/modules/discountCodes/repositories/discountCode.repository.js");

  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  Event = eventModelModule.Event;
  TicketType = ticketTypeModelModule.TicketType;
  Order = orderModelModule.Order;
  Ticket = ticketModelModule.Ticket;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_PRICING_MODE = ticketTypeConstantsModule.TICKET_TYPE_PRICING_MODE;
  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  createDiscountCodeGroup =
    discountCodeRepositoryModule.createDiscountCodeGroup;
  insertDiscountCodes = discountCodeRepositoryModule.insertDiscountCodes;

  const router = expressModule.default.Router();

  router.use("/public/orders", publicOrderRoutesModule.default);

  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

function signHostServiceToken(payload = {}) {
  return jwt.sign(
    {
      sub: "dummy-host-service",
      tokenType: "host-service",
      role: "host_service",
      roles: ["host_service"],
      externalProvider: "dummy",
      email: "host-service@example.com",
      ...payload,
    },
    EXTERNAL_SECRET,
  );
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
    title: "Paid Checkout Integration Event",
    slug: `paid-checkout-integration-event-${Date.now()}`,
    shortDescription: "Paid checkout integration event",
    description: "Created by paid checkout integration test.",
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
    description: "Paid checkout test ticket",
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

function buildPaidCheckoutPayload({
  eventId,
  ticketTypeId,
  quantity = 2,
  donationAmountGross,
  discountCode,
} = {}) {
  return {
    eventId: String(eventId),

    ...(discountCode !== undefined
      ? {
          discountCode,
        }
      : {}),
    items: [
      {
        ticketTypeId: String(ticketTypeId),
        quantity,

        ...(donationAmountGross !== undefined
          ? {
              donationAmountGross,
            }
          : {}),
      },
    ],
  };
}

async function createDiscountForEvent(
  event,
  {
    name = "Partner",
    discountPercent = 10,
    groupIsActive = true,
    code = "PARTNER10",
    codeIsActive = true,
  } = {},
) {
  const group = await createDiscountCodeGroup(
    {
      eventId: String(event._id),
      name,
      discountPercent,
      isActive: groupIsActive,
    },
    {
      lean: true,
    },
  );

  const [createdCode] = await insertDiscountCodes(
    [
      {
        eventId: String(event._id),
        groupId: group.id,
        code: String(code).trim().toUpperCase(),
        isActive: codeIsActive,
      },
    ],
    {
      lean: true,
    },
  );

  return {
    group,
    code: createdCode,
  };
}

describe("Paid checkout MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadPaidCheckoutIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    createPaymentSessionMock?.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates a pending paid order, initializes payment and reserves stock without creating tickets", async () => {
    const event = await createPublishedEvent({
      title: "Paid External Checkout Event",
      slug: "paid-external-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      displayName: "Paid External Ticket",
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-e205b0c9-7337-4264-aec7-733a96ac5478")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 2,
        }),
      );

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);

    expect(response.headers["idempotency-replayed"]).toBe("false");

    expect(response.body.data.checkout).toEqual({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      url: "https://payments.example.test/pay_test_123",

      status: "open",
    });

    expect(response.body.data.guestAccess).toBe(null);

    expect(response.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",

        firstName: "Max",

        lastName: "Kunde",

        displayName: "Max Kunde",
      },

      event: {
        id: String(event._id),

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: "Audimax",
      },

      items: [
        {
          ticketType: {
            id: String(ticketType._id),

            displayName: ticketType.displayName,

            description: ticketType.description,

            kind: ticketType.ticketKind,
          },

          quantity: 2,

          unitPrice: 2500,

          lineTotal: 5000,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      status: ORDER_STATUS.PENDING,

      payment: {
        status: ORDER_PAYMENT_STATUS.PENDING,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(response.body.meta).toEqual({
      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: null,

      fulfillment: {
        documents: null,

        mail: null,
      },
    });

    expect(response.body.data.order.createdAt).toBeTypeOf("string");

    expect(response.body.data.order.updatedAt).toBeTypeOf("string");

    expect(response.body.data.order.expiresAt).toBeTypeOf("string");

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(createPaymentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        amount: 50,
        currency: "EUR",
        orderId: expect.any(String),
        metadata: expect.objectContaining({
          orderNumber: expect.any(String),
          eventId: String(event._id),
          isGuest: false,
        }),
      }),
    );
    const serializedCheckout = JSON.stringify(response.body);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",

      "providerPaymentId",
    ]) {
      expect(serializedCheckout).not.toContain(`"${field}"`);
    }
    const orderInDb = await Order.findById(response.body.data.order.id).lean();

    expect(orderInDb).toBeDefined();
    expect(orderInDb.status).toBe(ORDER_STATUS.PENDING);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PENDING);
    expect(orderInDb.paymentProviderPaymentId).toBe("pay_test_123");
    expect(orderInDb.paymentCheckoutUrl).toBe(
      "https://payments.example.test/pay_test_123",
    );

    expect(await Ticket.countDocuments({ orderId: orderInDb._id })).toBe(0);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(2);
  });
  it("confirms a fixed-price order without online payment when no payment provider is configured", async () => {
    await loadPaidCheckoutIntegrationApp({
      paymentProvider: "disabled",
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent({
      slug: "external-payment-paid-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-external-payment-paid-checkout-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data.checkout).toBe(null);
    expect(response.body.data.guestAccess).toBe(null);

    expect(response.body.data.order).toMatchObject({
      items: [
        {
          ticketType: {
            id: String(ticketType._id),
            displayName: ticketType.displayName,
            kind: TICKET_TYPE_KIND.NORMAL,
            pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
          },
          quantity: 1,
          unitPrice: 2500,
          lineTotal: 2500,
        },
      ],

      pricing: {
        currency: "EUR",
        subtotal: 2500,
        total: 2500,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },
    });

    expect(response.body.meta.message).toBe(
      "Order confirmed. Payment is handled externally.",
    );

    expect(response.body.meta.paymentInitializationFailed).toBe(false);

    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const orderInDb = await Order.findById(response.body.data.order.id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,
    });

    expect(orderInDb.confirmedAt).toBeTruthy();
    expect(orderInDb.expiresAt).toBeNull();

    expect(
      await Ticket.countDocuments({
        orderId: orderInDb._id,
      }),
    ).toBe(1);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(1);

    await loadPaidCheckoutIntegrationApp();
  });

  it("marks order as failed and releases stock when payment session creation fails", async () => {
    await loadPaidCheckoutIntegrationApp({
      paymentSessionError: new Error("Payment provider unavailable"),
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent({
      slug: "payment-session-fails-event",
    });

    const ticketType = await createPaidTicketType(event);

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-911b168e-46c5-4c2c-bcb1-d75ebe9fc85d")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);

    expect(response.headers["idempotency-replayed"]).toBe("false");

    expect(response.body.data.checkout).toBe(null);

    expect(response.body.data.guestAccess).toBe(null);

    expect(response.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",
      },

      event: {
        id: String(event._id),

        title: event.title,
      },

      items: [
        {
          ticketType: {
            id: String(ticketType._id),

            displayName: ticketType.displayName,

            kind: ticketType.ticketKind,
          },

          quantity: 1,

          unitPrice: 2500,

          lineTotal: 2500,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 2500,

        total: 2500,
      },

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      cancellationReason: "Payment initialization failed",
    });

    expect(response.body.meta).toEqual({
      idempotencyReplayed: false,

      paymentInitializationFailed: true,

      message: "Payment provider unavailable",

      fulfillment: {
        documents: null,

        mail: null,
      },
    });

    expect(response.body.data.order.cancelledAt).toBeTypeOf("string");

    const serializedFailedCheckout = JSON.stringify(response.body);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "fulfillmentLeaseToken",
      "guestAccessTokenHash",
      "metadata",

      "providerPaymentId",
    ]) {
      expect(serializedFailedCheckout).not.toContain(`"${field}"`);
    }

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(await Ticket.countDocuments()).toBe(0);

    await loadPaidCheckoutIntegrationApp();
  });

  it("creates guest access for paid guest checkout and initializes payment", async () => {
    const event = await createPublishedEvent({
      slug: "paid-guest-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 1200,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-2a13c1c7-ddd1-4bd3-964d-252c17019287")
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send({
        eventId: String(event._id),
        items: [
          {
            ticketTypeId: String(ticketType._id),
            quantity: 1,
          },
        ],
        guest: {
          firstName: "Paid",
          lastName: "Guest",
          email: "paid.guest@example.com",
        },
      });

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);

    expect(response.headers["idempotency-replayed"]).toBe("false");

    expect(response.body.data.guestAccess).toMatchObject({
      orderId: expect.any(String),

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });

    expect(response.body.data.checkout).toEqual({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      url: "https://payments.example.test/pay_test_123",

      status: "open",
    });

    expect(response.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "paid.guest@example.com",

        firstName: "Paid",

        lastName: "Guest",

        displayName: "Paid Guest",
      },

      event: {
        id: String(event._id),

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: "Audimax",
      },

      items: [
        {
          ticketType: {
            id: String(ticketType._id),

            displayName: ticketType.displayName,

            description: ticketType.description,

            kind: ticketType.ticketKind,
          },

          quantity: 1,

          unitPrice: 1200,

          lineTotal: 1200,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 1200,

        total: 1200,
      },

      status: ORDER_STATUS.PENDING,

      payment: {
        status: ORDER_PAYMENT_STATUS.PENDING,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },
    });

    expect(response.body.data.guestAccess.orderId).toBe(
      response.body.data.order.id,
    );

    expect(response.body.meta).toEqual({
      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: null,

      fulfillment: {
        documents: null,

        mail: null,
      },
    });
    const serializedGuestCheckout = JSON.stringify(response.body);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",

      "providerPaymentId",
    ]) {
      expect(serializedGuestCheckout).not.toContain(`"${field}"`);
    }
    const orderInDb = await Order.findById(response.body.data.order.id).lean();

    expect(orderInDb).toBeDefined();
    expect(orderInDb.guestAccessTokenExpiresAt).toBeTruthy();
    expect(orderInDb.guestAccessDownloadCount).toBe(0);

    expect(await Ticket.countDocuments({ orderId: orderInDb._id })).toBe(0);
  });
  it("creates a donation checkout using the selected donation amount", async () => {
    const event = await createPublishedEvent({
      title: "Donation Checkout Event",
      slug: "donation-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      displayName: "Donation Ticket",
      description: "Choose your donation amount",
      pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
      priceGross: 0,
      stockTotal: 10,
      stockSold: 0,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "donation-checkout-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 2,
          donationAmountGross: 1500,
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data.order).toMatchObject({
      items: [
        {
          ticketType: {
            id: String(ticketType._id),
            pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
          },

          quantity: 2,
          unitPrice: 1500,
          lineTotal: 3000,
        },
      ],

      pricing: {
        currency: "EUR",
        subtotal: 3000,
        total: 3000,
      },

      status: ORDER_STATUS.PENDING,

      payment: {
        status: ORDER_PAYMENT_STATUS.PENDING,
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },
    });

    expect(response.body.data.checkout).toEqual({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      url: "https://payments.example.test/pay_test_123",
      status: "open",
    });

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(createPaymentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        amount: 30,
        currency: "EUR",
      }),
    );

    const orderInDb = await Order.findById(response.body.data.order.id).lean();

    expect(orderInDb.items[0]).toMatchObject({
      pricingModeSnapshot: TICKET_TYPE_PRICING_MODE.DONATION,
      unitPrice: 1500,
      lineTotal: 3000,
    });

    expect(orderInDb.totalPrice).toBe(3000);

    expect(
      await Ticket.countDocuments({
        orderId: orderInDb._id,
      }),
    ).toBe(0);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(2);
  });
  it("rejects a donation checkout without a donation amount", async () => {
    const event = await createPublishedEvent({
      slug: "donation-amount-required-event",
    });

    const ticketType = await createPaidTicketType(event, {
      displayName: "Donation Ticket",
      pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
      priceGross: 0,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "donation-amount-required-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DONATION_AMOUNT_REQUIRED",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);
    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it.each([
    {
      name: "FREE",
      pricingMode: "free",
      priceGross: 0,
    },
    {
      name: "FIXED",
      pricingMode: "fixed",
      priceGross: 2500,
    },
  ])(
    "rejects donationAmountGross for $name ticket types",
    async ({ pricingMode, priceGross }) => {
      const event = await createPublishedEvent({
        slug: `donation-not-allowed-${pricingMode}-event`,
      });

      const ticketType = await createPaidTicketType(event, {
        displayName: `${pricingMode} Ticket`,
        pricingMode,
        priceGross,
      });

      const response = await request(app)
        .post("/api/public/orders/checkout")
        .set("Idempotency-Key", `donation-not-allowed-${pricingMode}-0001`)
        .set("Authorization", `Bearer ${signExternalUserToken()}`)
        .send(
          buildPaidCheckoutPayload({
            eventId: event._id,
            ticketTypeId: ticketType._id,
            quantity: 1,
            donationAmountGross: 1500,
          }),
        );

      expect(response.status).toBe(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "DONATION_AMOUNT_NOT_ALLOWED",
        },
      });

      expect(await Order.countDocuments()).toBe(0);
      expect(await Ticket.countDocuments()).toBe(0);
      expect(createPaymentSessionMock).not.toHaveBeenCalled();

      const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

      expect(ticketTypeInDb.stockSold).toBe(0);
    },
  );
  it("rejects reuse of an Idempotency-Key with a different donation amount", async () => {
    const event = await createPublishedEvent({
      slug: "donation-idempotency-conflict-event",
    });

    const ticketType = await createPaidTicketType(event, {
      displayName: "Donation Ticket",
      pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
      priceGross: 0,
      stockTotal: 10,
      stockSold: 0,
    });

    const idempotencyKey = "donation-idempotency-conflict-0001";
    const token = signExternalUserToken();

    const firstResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
          donationAmountGross: 1500,
        }),
      );

    const conflictResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
          donationAmountGross: 1600,
        }),
      );

    expect(firstResponse.status).toBe(201);

    expect(conflictResponse.status).toBe(409);

    expect(conflictResponse.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_IDEMPOTENCY_KEY_REUSED",
      },
    });

    expect(await Order.countDocuments()).toBe(1);
    expect(await Ticket.countDocuments()).toBe(0);

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);

    const order = await Order.findOne({
      eventId: event._id,
    }).lean();

    expect(order.items[0]).toMatchObject({
      pricingModeSnapshot: TICKET_TYPE_PRICING_MODE.DONATION,
      unitPrice: 1500,
      lineTotal: 1500,
    });

    expect(order.totalPrice).toBe(1500);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(1);
  });
  it("replays a paid checkout without creating a second payment session", async () => {
    const event = await createPublishedEvent({
      slug: "paid-idempotency-replay-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    const payload = buildPaidCheckoutPayload({
      eventId: event._id,
      ticketTypeId: ticketType._id,
      quantity: 1,
    });

    const idempotencyKey = "paid-checkout-replay-0001";

    const token = signExternalUserToken();

    const firstResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    const replayResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(firstResponse.status).toBe(201);

    expect(firstResponse.headers["idempotency-replayed"]).toBe("false");

    expect(firstResponse.body.meta.idempotencyReplayed).toBe(false);

    expect(replayResponse.status).toBe(200);

    expect(replayResponse.headers["idempotency-replayed"]).toBe("true");

    expect(replayResponse.body.meta.idempotencyReplayed).toBe(true);

    expect(replayResponse.body.data.order.id).toBe(
      firstResponse.body.data.order.id,
    );

    expect(firstResponse.body.data.guestAccess).toBe(null);

    expect(replayResponse.body.data.guestAccess).toBe(null);

    expect(firstResponse.body.data.checkout).toEqual({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      url: "https://payments.example.test/pay_test_123",

      status: "open",
    });

    expect(replayResponse.body.data.checkout).toEqual(
      firstResponse.body.data.checkout,
    );

    expect(replayResponse.body.data.order).toEqual(
      firstResponse.body.data.order,
    );

    expect(replayResponse.body.meta).toEqual({
      idempotencyReplayed: true,

      paymentInitializationFailed: false,

      message: null,

      fulfillment: {
        documents: null,

        mail: null,
      },
    });

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(await Order.countDocuments()).toBe(1);
    expect(await Ticket.countDocuments()).toBe(0);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(1);

    const order = await Order.findOne({
      eventId: event._id,
    }).lean();

    expect(order).toMatchObject({
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      paymentProviderPaymentId: "pay_test_123",
      paymentCheckoutUrl: "https://payments.example.test/pay_test_123",
    });
  });

  it("applies an active percentage discount and persists the immutable snapshot", async () => {
    const event = await createPublishedEvent({
      slug: "paid-discount-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    const discount = await createDiscountForEvent(event, {
      name: "Partner 10",
      discountPercent: 10,
      code: "PARTNER10",
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "paid-discount-checkout-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 2,
          discountCode: "partner10",
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data.order.pricing).toEqual({
      currency: "EUR",
      subtotal: 5000,
      discount: {
        codeId: discount.code.id,
        code: "PARTNER10",
        group: {
          id: discount.group.id,
          name: "Partner 10",
        },
        percent: 10,
        amount: 500,
      },
      total: 4500,
    });

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(createPaymentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45,
        currency: "EUR",
      }),
    );

    const orderInDb = await Order.findById(response.body.data.order.id).lean();

    expect(orderInDb).toMatchObject({
      subtotal: 5000,
      discountCodeSnapshot: "PARTNER10",
      discountCodeGroupNameSnapshot: "Partner 10",
      discountPercent: 10,
      discountAmount: 500,
      totalPrice: 4500,
    });

    expect(String(orderInDb.discountCodeIdSnapshot)).toBe(discount.code.id);
    expect(String(orderInDb.discountCodeGroupIdSnapshot)).toBe(
      discount.group.id,
    );
  });

  it("rejects invalid or inactive discount codes before stock is reserved", async () => {
    const event = await createPublishedEvent({
      slug: "inactive-discount-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    await createDiscountForEvent(event, {
      code: "INACTIVE10",
      codeIsActive: false,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "inactive-discount-checkout-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
          discountCode: "inactive10",
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODE_INVALID",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });

  it("rejects a discount code when the order contains no discountable amount", async () => {
    const event = await createPublishedEvent({
      slug: "donation-discount-not-applicable-event",
    });

    const ticketType = await createPaidTicketType(event, {
      pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
      priceGross: 0,
      stockTotal: 10,
      stockSold: 0,
    });

    await createDiscountForEvent(event, {
      code: "DONATION10",
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "donation-discount-not-applicable-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
          donationAmountGross: 1500,
          discountCode: "DONATION10",
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODE_NOT_APPLICABLE",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(createPaymentSessionMock).not.toHaveBeenCalled();
  });

  it("confirms a 100 percent discounted order without creating a payment session", async () => {
    const event = await createPublishedEvent({
      slug: "full-discount-checkout-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    const discount = await createDiscountForEvent(event, {
      name: "Full Discount",
      discountPercent: 100,
      code: "FREE100",
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "full-discount-checkout-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
          discountCode: "free100",
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.data.checkout).toBe(null);
    expect(response.body.data.order).toMatchObject({
      pricing: {
        currency: "EUR",
        subtotal: 2500,
        discount: {
          codeId: discount.code.id,
          code: "FREE100",
          group: {
            id: discount.group.id,
            name: "Full Discount",
          },
          percent: 100,
          amount: 2500,
        },
        total: 0,
      },
      status: ORDER_STATUS.CONFIRMED,
      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },
    });

    expect(response.body.meta.message).toBe("Order confirmed.");
    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    expect(
      await Ticket.countDocuments({
        orderId: response.body.data.order.id,
      }),
    ).toBe(1);
  });

  it("rejects mixed currencies before creating an order", async () => {
    const event = await createPublishedEvent({
      slug: "mixed-currency-checkout-event",
    });

    const eurTicket = await createPaidTicketType(event, {
      displayName: "EUR Ticket",
      currency: "EUR",
      stockTotal: 10,
      stockSold: 0,
    });

    const usdTicket = await createPaidTicketType(event, {
      displayName: "USD Ticket",
      currency: "USD",
      stockTotal: 10,
      stockSold: 0,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "mixed-currency-checkout-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send({
        eventId: String(event._id),
        items: [
          {
            ticketTypeId: String(eurTicket._id),
            quantity: 1,
          },
          {
            ticketTypeId: String(usdTicket._id),
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_CURRENCY_MISMATCH",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(createPaymentSessionMock).not.toHaveBeenCalled();
  });

  it("rejects submitted discount codes when the feature is disabled", async () => {
    await loadPaidCheckoutIntegrationApp({
      discountCodes: false,
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent({
      slug: "discount-feature-disabled-event",
    });

    const ticketType = await createPaidTicketType(event, {
      priceGross: 2500,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "discount-feature-disabled-0001")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send(
        buildPaidCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
          discountCode: "ANYCODE",
        }),
      );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODES_DISABLED",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    await loadPaidCheckoutIntegrationApp();
  });
});
