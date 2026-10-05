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

import { KIWI_EVENTS_SECRET_PATHS } from "../../../src/config/kiwi-events/kiwi-events.secret.constants.js";

import { updateKiwiEventsSecrets } from "../../../src/config/kiwi-events/kiwi-events.secret.store.js";

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
let ORDER_FULFILLMENT_STATUS;
let TICKET_STATUS;

async function loadCheckoutIntegrationApp({
  ticketing = true,
  payments = false,
  guestCheckout = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
} = {}) {
  vi.resetModules();

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
        payments,
        guestCheckout,
        ticketPdf,
        ticketQr,
        mail,
      },
      payments: {
        provider: "none",
        mollie: {
          redirectUrl: null,
          webhookUrl: null,
        },
      },
    },
  }));
  vi.doMock(
    "../../../src/config/kiwi-events/kiwi-events.config.store.js",
    () => ({
      loadKiwiEventsConfig: () => ({
        features: {
          ticketing,
          payments,
          guestCheckout,
          ticketPdf,
          ticketQr,
          mail,
        },
      }),
    }),
  );
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
    payments,
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

  /**
   * We test checkout/order/ticket behavior here, not email transport.
   */
  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderConfirmedMailSafe: vi.fn().mockResolvedValue({
      success: false,
      skipped: true,
      reason: "mail_disabled_in_test",
    }),
  }));

  /**
   * Free checkout does not create payment sessions, but mocking keeps this
   * integration test independent from payment provider configuration.
   */
  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
  }));

  /**
   * Free checkout creates real tickets, but we do not want this test to depend
   * on PDF/storage generation. Ticket document generation is covered separately.
   */
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
  const ticketConstantsModule =
    await import("../../../src/modules/tickets/ticket.constants.js");

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

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;
  ORDER_FULFILLMENT_STATUS = orderConstantsModule.ORDER_FULFILLMENT_STATUS;
  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  const router = expressModule.default.Router();

  router.use("/public/orders", publicOrderRoutesModule.default);

  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}
const TEST_TICKET_QR_SECRET =
  "test-ticket-qr-secret-123456789012345678901234567890";

function configureTestTicketQrSecret() {
  updateKiwiEventsSecrets({
    set: {
      [KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET]:
        TEST_TICKET_QR_SECRET,
    },
  });
}

function removeTestTicketQrSecret() {
  updateKiwiEventsSecrets({
    remove: [KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET],
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
    title: "Checkout Integration Event",
    slug: `checkout-integration-event-${Date.now()}`,
    shortDescription: "Checkout integration event",
    description: "Created by checkout integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildFutureSession()],
    isFree: true,
    publishedAt: new Date(),
    ...overrides,
  });
}

async function createTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Free Ticket`,
    displayName: "Free Ticket",
    description: "Free checkout test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "free",
    priceGross: 0,
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

function buildGuestCheckoutPayload({
  eventId,
  ticketTypeId,
  quantity = 2,
} = {}) {
  return {
    eventId: String(eventId),
    items: [
      {
        ticketTypeId: String(ticketTypeId),
        quantity,
      },
    ],
    guest: {
      firstName: "Gast",
      lastName: "Tester",
      email: "gast@example.com",
    },
  };
}

describe("Free checkout MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadCheckoutIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    removeTestTicketQrSecret();
  });
  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("confirms a free guest checkout, creates tickets and reserves stock", async () => {
    const event = await createPublishedEvent({
      title: "Free Guest Checkout Event",
      slug: "free-guest-checkout-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Free Guest Ticket",
      stockTotal: 10,
      stockSold: 0,
      minPerOrder: 1,
      maxPerOrder: 5,
    });

    const token = signHostServiceToken();

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-79e3789b-c422-4e32-9f74-30c26ebbb594")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 2,
        }),
      );

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.order).toMatchObject({
      id: expect.any(String),

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },
    });

    expect(response.body.data.checkout).toBe(null);

    expect(response.body.data.guestAccess).toMatchObject({
      orderId: expect.any(String),

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });

    expect(response.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "gast@example.com",

        firstName: "Gast",

        lastName: "Tester",

        displayName: "Gast Tester",
      },

      event: {
        id: String(event._id),

        title: "Free Guest Checkout Event",

        slug: "free-guest-checkout-event",
      },

      items: [
        {
          ticketType: {
            id: String(ticketType._id),

            displayName: "Free Guest Ticket",

            kind: "normal",
          },

          quantity: 2,

          unitPrice: 0,

          lineTotal: 0,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 0,

        total: 0,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(response.body.meta).toMatchObject({
      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: "Order confirmed.",

      fulfillment: {
        documents: {
          skipped: expect.any(Boolean),

          generated: expect.any(Number),

          alreadyExisted: expect.any(Number),

          failed: expect.any(Number),
        },

        mail: {
          skipped: expect.any(Boolean),
        },
      },
    });

    const orderInDb = await Order.findById(response.body.data.order.id).lean();

    expect(orderInDb).toBeDefined();

    expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);

    expect(response.body.data.guestAccess.orderId).toBe(String(orderInDb._id));

    expect(orderInDb.guestAccessTokenExpiresAt).toBeTruthy();

    expect(orderInDb.guestAccessDownloadCount).toBe(0);

    const serializedCheckout = JSON.stringify(response.body);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "eventTitleSnapshot",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",
      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",
      "errors",
      "providerMessageId",
    ]) {
      expect(serializedCheckout).not.toContain(`"${field}"`);
    }
    const tickets = await Ticket.find({
      orderId: orderInDb._id,
    })
      .select("+checkInTokenHash +encryptedCheckInToken")
      .lean();

    expect(tickets).toHaveLength(2);

    for (const ticket of tickets) {
      expect(ticket).toMatchObject({
        eventId: event._id,
        ticketTypeId: ticketType._id,
        buyerType: ORDER_BUYER_TYPE.GUEST,
        buyerEmailSnapshot: "gast@example.com",
        holderEmailSnapshot: "gast@example.com",
        status: TICKET_STATUS.ACTIVE,
        unitPrice: 0,
        currency: "EUR",
      });

      expect(ticket.ticketCode).toEqual(expect.any(String));
      expect(ticket.checkInTokenHash).toBe(null);
      expect(ticket.encryptedCheckInToken).toBe(null);
    }

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(2);
  });

  it("blocks guest checkout when guestCheckout feature is disabled", async () => {
    await loadCheckoutIntegrationApp({
      guestCheckout: false,
      payments: false,
      ticketPdf: false,
      mail: false,
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent({
      slug: "guest-checkout-disabled-event",
    });

    const ticketType = await createTicketType(event);

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-751535c2-970a-42c9-a440-e9cb324e40d0")
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "GUEST_CHECKOUT_DISABLED",
        message: "Guest checkout is not enabled.",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);

    await loadCheckoutIntegrationApp();
  });

  it("allows an external user checkout without guest access token", async () => {
    const event = await createPublishedEvent({
      slug: "external-user-free-checkout-event",
    });

    const ticketType = await createTicketType(event);

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-c453cb30-dcad-4c32-9925-6612b2cd40c4")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send({
        eventId: String(event._id),
        items: [
          {
            ticketTypeId: String(ticketType._id),
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);

    expect(response.body.data.checkout).toBe(null);

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

          quantity: 1,

          unitPrice: 0,

          lineTotal: 0,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 0,

        total: 0,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(response.body.meta).toMatchObject({
      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: "Order confirmed.",
    });

    const serializedCheckout = JSON.stringify(response.body);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "eventTitleSnapshot",
      "paymentStatus",
      "paymentProviderPaymentId",
      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",
    ]) {
      expect(serializedCheckout).not.toContain(`"${field}"`);
    }

    const tickets = await Ticket.find({
      orderId: response.body.data.order.id,
    }).lean();

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
      buyerExternalProvider: "dummy",
      buyerExternalUserId: "host-customer-1",
      status: TICKET_STATUS.ACTIVE,
    });
  });

  it("confirms checkout and schedules fulfillment retry when ticket QR secret is missing", async () => {
    await loadCheckoutIntegrationApp({
      ticketing: true,
      payments: false,
      guestCheckout: true,
      ticketPdf: false,
      ticketQr: true,
      mail: false,
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent({
      slug: "qr-enabled-missing-secret-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "QR Missing Secret Ticket",
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-b18edbfd-7608-4ede-9dd6-d19e9b141be5")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send({
        eventId: String(event._id),
        items: [
          {
            ticketTypeId: String(ticketType._id),
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);

    expect(response.body.data.order).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
    });

    expect(response.body.data.checkout).toBe(null);

    expect(await Ticket.countDocuments()).toBe(0);

    const storedOrder = await Order.findById(
      response.body.data.order.id,
    ).lean();

    expect(storedOrder).toBeTruthy();

    expect(storedOrder.fulfillmentStatus).toBe(ORDER_FULFILLMENT_STATUS.FAILED);

    expect(storedOrder.fulfillmentStep).toBe("tickets");

    expect(storedOrder.fulfillmentAttemptCount).toBe(1);

    expect(storedOrder.fulfillmentFailedAt).toBeTruthy();

    expect(storedOrder.fulfillmentNextRetryAt).toBeTruthy();

    await loadCheckoutIntegrationApp();
  });
  it("creates QR credentials when ticket QR is enabled and secret is configured", async () => {
    configureTestTicketQrSecret();
    await loadCheckoutIntegrationApp({
      ticketing: true,
      payments: false,
      guestCheckout: true,
      ticketPdf: false,
      ticketQr: true,
      mail: false,
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent({
      slug: "qr-enabled-with-secret-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "QR Enabled Ticket",
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-56d2d642-ba0d-461f-a06c-98d750fe5304")
      .set("Authorization", `Bearer ${signExternalUserToken()}`)
      .send({
        eventId: String(event._id),
        items: [
          {
            ticketTypeId: String(ticketType._id),
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const tickets = await Ticket.find({
      orderId: response.body.data.order.id,
    })
      .select("+checkInTokenHash +encryptedCheckInToken")
      .lean();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].checkInTokenHash).toEqual(expect.any(String));
    expect(tickets[0].encryptedCheckInToken).toEqual(expect.any(String));

    await loadCheckoutIntegrationApp();
  });

  it("blocks checkout for inactive ticket types", async () => {
    const event = await createPublishedEvent({
      slug: "inactive-ticket-type-checkout-event",
    });

    const ticketType = await createTicketType(event, {
      status: TICKET_TYPE_STATUS.INACTIVE,
      displayName: "Inactive Ticket",
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-9bea4bb4-dd6a-4bac-8749-89aede39cc8f")
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_TICKET_TYPE_INACTIVE",
        message: "Ticket type is not active.",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("blocks checkout when quantity exceeds maxPerOrder", async () => {
    const event = await createPublishedEvent({
      slug: "max-per-order-checkout-event",
    });

    const ticketType = await createTicketType(event, {
      maxPerOrder: 2,
    });

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-00862bd9-203e-40b3-a05f-7ce3925baa6c")
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 3,
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_TICKET_QUANTITY_ABOVE_MAXIMUM",
        message: 'The maximum quantity for "Free Ticket" is 2.',
        details: {
          ticketTypeName: "Free Ticket",
          maxPerOrder: 2,
        },
      },
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);

    const unchangedTicketType = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(unchangedTicketType.stockSold).toBe(0);
  });
  it("requires an Idempotency-Key for authenticated checkout", async () => {
    const event = await createPublishedEvent({
      slug: "missing-idempotency-key-event",
    });

    const ticketType = await createTicketType(event);

    const response = await request(app)
      .post("/api/public/orders/checkout")
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_IDEMPOTENCY_KEY_REQUIRED",
      },
    });

    expect(await Order.countDocuments()).toBe(0);
  });

  it("replays the same free checkout without creating duplicates", async () => {
    const event = await createPublishedEvent({
      slug: "idempotent-free-checkout-event",
    });

    const ticketType = await createTicketType(event);

    const payload = buildGuestCheckoutPayload({
      eventId: event._id,
      ticketTypeId: ticketType._id,
      quantity: 2,
    });

    const idempotencyKey = "checkout-replay-00000001";

    const firstResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(payload);

    const replayResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
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

    expect(firstResponse.body.data.guestAccess).toMatchObject({
      orderId: firstResponse.body.data.order.id,

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });

    expect(replayResponse.body.data.guestAccess).toBe(null);

    expect(firstResponse.body.data.order).toEqual(
      replayResponse.body.data.order,
    );

    expect(firstResponse.body.data.checkout).toBe(null);

    expect(replayResponse.body.data.checkout).toBe(null);

    expect(await Order.countDocuments()).toBe(1);
    expect(await Ticket.countDocuments()).toBe(2);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(2);
  });

  it("rejects reuse of an Idempotency-Key with a different payload", async () => {
    const event = await createPublishedEvent({
      slug: "idempotency-conflict-event",
    });

    const ticketType = await createTicketType(event);

    const idempotencyKey = "checkout-conflict-000001";

    const firstResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 1,
        }),
      );

    const conflictResponse = await request(app)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${signHostServiceToken()}`)
      .send(
        buildGuestCheckoutPayload({
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity: 2,
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
    expect(await Ticket.countDocuments()).toBe(1);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(1);
  });
  it("prevents duplicate orders during parallel identical checkouts", async () => {
    const event = await createPublishedEvent({
      slug: "parallel-idempotent-checkout-event",
    });

    const ticketType = await createTicketType(event, {
      stockTotal: 10,
      stockSold: 0,
    });

    const payload = buildGuestCheckoutPayload({
      eventId: event._id,
      ticketTypeId: ticketType._id,
      quantity: 2,
    });

    const idempotencyKey = "parallel-checkout-000001";

    const token = signHostServiceToken();

    const sendCheckout = () =>
      request(app)
        .post("/api/public/orders/checkout")
        .set("Idempotency-Key", idempotencyKey)
        .set("Authorization", `Bearer ${token}`)
        .send(payload);

    const [firstResponse, secondResponse] = await Promise.all([
      sendCheckout(),
      sendCheckout(),
    ]);

    const responses = [firstResponse, secondResponse];

    const createdResponses = responses.filter(
      (response) => response.status === 201,
    );

    expect(createdResponses).toHaveLength(1);
    expect(createdResponses[0].body.meta.idempotencyReplayed).toBe(false);

    expect(createdResponses[0].body.data.order.id).toBeTypeOf("string");

    expect(createdResponses[0].body.data.guestAccess).toMatchObject({
      orderId: createdResponses[0].body.data.order.id,

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });
    const secondResult = responses.find((response) => response.status !== 201);

    expect([200, 409]).toContain(secondResult.status);

    if (secondResult.status === 200) {
      expect(secondResult.body.meta.idempotencyReplayed).toBe(true);

      expect(secondResult.headers["idempotency-replayed"]).toBe("true");

      expect(secondResult.body.data.guestAccess).toBe(null);

      expect(secondResult.body.data.order.id).toBeTypeOf("string");
    }

    if (secondResult.status === 409) {
      expect(secondResult.body).toMatchObject({
        success: false,
        error: {
          code: "ORDER_IDEMPOTENCY_IN_PROGRESS",
        },
      });
    }

    expect(await Order.countDocuments()).toBe(1);
    expect(await Ticket.countDocuments()).toBe(2);

    const storedOrder = await Order.findOne({
      eventId: event._id,
    }).lean();

    expect(storedOrder).toBeTruthy();
    expect(storedOrder.status).toBe(ORDER_STATUS.CONFIRMED);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(2);
  });
});
