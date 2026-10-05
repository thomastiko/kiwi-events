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

let eventApp;
let publicEventApp;
let ticketTypeApp;
let publicTicketTypeApp;
let publicOrderApp;

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let findOrdersByEventId;

let hashPassword;
let createEventUser;
let findTicketsByOrderId;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

async function loadPublicCheckoutFreeSqlIntegrationApp() {
  vi.resetModules();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
      },
      payments: {
        provider: "none",
        mollie: {
          redirectUrl: null,
          webhookUrl: null,
        },
      },
      branding: {
        appName: "Kiwi Events Test",
      },
    },
  }));
  const TEST_FEATURES = {
    ticketing: true,
    guestCheckout: true,
    depositTickets: false,
    ticketPdf: false,
    ticketQr: false,
    mail: false,
    mailOrderConfirmation: false,
    mailEventCancellation: false,
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
  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;
  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;
  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;

  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");
  const eventUserRepositoryModule =
    await import("../../../src/modules/eventUsers/repositories/eventUser.repository.js");
  const passwordServiceModule =
    await import("../../../src/core/security/password.service.js");

  const eventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");
  const publicEventRoutesModule =
    await import("../../../src/modules/events/public/event.public.routes.js");
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const ticketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/internal/ticketType.internal.routes.js");
  const publicTicketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/public/ticketType.public.routes.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");

  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");
  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");
  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;
  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  findOrdersByEventId = orderRepositoryModule.findOrdersByEventId;
  eventApp = createHttpTestApp({
    mountPath: "/api/admin/events",
    router: eventRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  publicEventApp = createHttpTestApp({
    mountPath: "/api/public/events",
    router: publicEventRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  ticketTypeApp = createHttpTestApp({
    mountPath: "/api/admin/ticket-types",
    router: ticketTypeRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  publicTicketTypeApp = createHttpTestApp({
    mountPath: "/api/public/ticket-types",
    router: publicTicketTypeRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  publicOrderApp = createHttpTestApp({
    mountPath: "/api/public/orders",
    router: publicOrderRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminAndToken({
  emailSnapshot = "admin@example.com",
  password = "secret123",
  role = EVENT_USER_ROLES.ADMIN,
} = {}) {
  const passwordHash = await hashPassword(password);

  const admin = await createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot,
    passwordHash,
    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",
    role,
    isActive: true,
    mustChangePassword: false,
    grants: [],
    denies: [],
  });

  const adminAuthRoutesModule =
    await import("../../../src/modules/adminAuth/adminAuth.routes.js");

  const authApp = createHttpTestApp({
    mountPath: "/api/admin/auth",
    router: adminAuthRoutesModule.default,
  });

  const loginResponse = await request(authApp)
    .post("/api/admin/auth/login")
    .send({
      email: emailSnapshot,
      password,
    });

  expect(loginResponse.status).toBe(200);

  return {
    admin,
    accessToken: loginResponse.body.data.accessToken,
  };
}

function createHostServiceToken() {
  return jwt.sign(
    {
      sub: "dummy-host-service",
      tokenType: "host-service",
      role: "host_service",
      roles: ["host_service"],
      externalProvider: "dummy",
    },
    TEST_EXTERNAL_JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

function buildEventPayload(overrides = {}) {
  return {
    title: "SQL Public Checkout Event",
    slug: "sql-public-checkout-event",
    shortDescription: "Short public checkout event description",
    description: "Long public checkout event description",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "checkout"],
    sessions: [
      {
        startAt: "2030-03-10T10:00:00.000Z",
        endAt: "2030-03-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Main Hall",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    faqs: [],
    isFree: true,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-03-09T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL public checkout integration test",
    ...overrides,
  };
}

function buildTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "Free Checkout Ticket",
    description: "A free checkout test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "free",
    priceGross: 0,
    currency: "EUR",
    stockTotal: 100,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-03-09T10:00:00.000Z",
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    ...overrides,
  };
}

async function createPublishedFreeEventWithTicketType(accessToken) {
  const eventCreateResponse = await request(eventApp)
    .post("/api/admin/events")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(buildEventPayload());

  expect(eventCreateResponse.status).toBe(201);

  const event = eventCreateResponse.body.data;

  const ticketTypeCreateResponse = await request(ticketTypeApp)
    .post("/api/admin/ticket-types")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(buildTicketTypePayload(event.id));

  expect(ticketTypeCreateResponse.status).toBe(201);

  const publishResponse = await request(eventApp)
    .patch(`/api/admin/events/${event.id}/publish`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send();

  expect(publishResponse.status).toBe(200);

  return {
    event: publishResponse.body.data,
    ticketType: ticketTypeCreateResponse.body.data,
  };
}

describe("Public free checkout SQL integration", () => {
  beforeAll(async () => {
    await loadPublicCheckoutFreeSqlIntegrationApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    delete process.env.KIWI_EVENTS_FEATURE_TICKETING;
    delete process.env.KIWI_EVENTS_FEATURE_FREE_TICKETS;
    delete process.env.KIWI_EVENTS_FEATURE_GUEST_CHECKOUT;
    delete process.env.KIWI_EVENTS_FEATURE_PAID_TICKETS;
    delete process.env.KIWI_EVENTS_FEATURE_PAYMENTS;
    delete process.env.KIWI_EVENTS_FEATURE_TICKET_PDF;
    delete process.env.KIWI_EVENTS_FEATURE_MAIL;

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("lists published public events and ticket types, then confirms a free guest checkout", async () => {
    const { accessToken } = await createAdminAndToken();
    const hostServiceToken = createHostServiceToken();

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(accessToken);

    const publicEventsResponse = await request(publicEventApp)
      .get("/api/public/events")
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .query({
        includeTicketTypes: true,
      });

    expect(publicEventsResponse.status).toBe(200);
    expect(publicEventsResponse.body.success).toBe(true);
    expect(publicEventsResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: event.id,
          slug: "sql-public-checkout-event",
          status: EVENT_STATUSES.PUBLISHED,
          visibility: EVENT_VISIBILITIES.PUBLIC,
        }),
      ]),
    );
    const listedPublicEvent = publicEventsResponse.body.data.find(
      (item) => item.id === event.id,
    );

    expect(listedPublicEvent).toBeDefined();
    expect(listedPublicEvent.ticketTypes).toHaveLength(1);

    expect(listedPublicEvent.ticketTypes[0]).toMatchObject({
      id: ticketType.id,
      eventId: event.id,
      displayName: "Free Checkout Ticket",
      pricingMode: "free",
      priceGross: 0,
      status: TICKET_TYPE_STATUS.ACTIVE,
      stockRemaining: expect.any(Number),
      isSoldOut: false,
      isSalesOpen: true,
    });

    expect(listedPublicEvent.ticketTypes[0]).not.toHaveProperty("_id");
    expect(listedPublicEvent.ticketTypes[0]).not.toHaveProperty("name");
    expect(listedPublicEvent.ticketTypes[0]).not.toHaveProperty("stockTotal");
    expect(listedPublicEvent.ticketTypes[0]).not.toHaveProperty("stockSold");

    expect(listedPublicEvent).toMatchObject({
      id: event.id,
      title: "SQL Public Checkout Event",
      slug: "sql-public-checkout-event",
      status: EVENT_STATUSES.PUBLISHED,
      visibility: EVENT_VISIBILITIES.PUBLIC,
      startsAt: expect.any(String),
      endsAt: expect.any(String),
      sessions: [
        expect.objectContaining({
          id: expect.any(String),
          startAt: expect.any(String),
          endAt: expect.any(String),
          timezone: "Europe/Vienna",
          isCancelled: false,
        }),
      ],
      isBookable: true,
    });

    const serializedListedEvent = JSON.stringify(listedPublicEvent);

    expect(serializedListedEvent).not.toContain('"_id"');
    expect(serializedListedEvent).not.toContain('"notesInternal"');
    expect(serializedListedEvent).not.toContain('"imageAssetIds"');
    expect(serializedListedEvent).not.toContain('"__v"');

    const publicEventBySlugResponse = await request(publicEventApp)
      .get("/api/public/events/slug/sql-public-checkout-event")
      .set("Authorization", `Bearer ${hostServiceToken}`);

    expect(publicEventBySlugResponse.status).toBe(200);
    expect(publicEventBySlugResponse.body.success).toBe(true);
    expect(publicEventBySlugResponse.body.data).toMatchObject({
      id: event.id,
      slug: "sql-public-checkout-event",
      status: EVENT_STATUSES.PUBLISHED,
    });
    expect(publicEventBySlugResponse.body.data).not.toHaveProperty("_id");
    expect(publicEventBySlugResponse.body.data).not.toHaveProperty(
      "notesInternal",
    );
    expect(publicEventBySlugResponse.body.data).not.toHaveProperty(
      "imageAssetIds",
    );
    expect(publicEventBySlugResponse.body.data).not.toHaveProperty("__v");
    const publicEventByIdResponse = await request(publicEventApp)
      .get(`/api/public/events/id/${event.id}`)
      .set("Authorization", `Bearer ${hostServiceToken}`);

    expect(publicEventByIdResponse.status).toBe(200);
    expect(publicEventByIdResponse.body.success).toBe(true);

    expect(publicEventByIdResponse.body).toEqual(
      publicEventBySlugResponse.body,
    );
    const publicTicketTypesResponse = await request(publicTicketTypeApp)
      .get("/api/public/ticket-types")
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .query({
        eventId: event.id,
        onlyBookable: true,
      });

    expect(publicTicketTypesResponse.status).toBe(200);
    expect(publicTicketTypesResponse.body.success).toBe(true);
    expect(publicTicketTypesResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ticketType.id,
          eventId: event.id,
          displayName: "Free Checkout Ticket",
          pricingMode: "free",
          priceGross: 0,
          status: TICKET_TYPE_STATUS.ACTIVE,
        }),
      ]),
    );
    const listedPublicTicketType = publicTicketTypesResponse.body.data.find(
      (item) => item.id === ticketType.id,
    );

    expect(listedPublicTicketType).toBeDefined();
    expect(listedPublicTicketType).not.toHaveProperty("_id");
    expect(listedPublicTicketType).not.toHaveProperty("name");
    expect(listedPublicTicketType).not.toHaveProperty("stockTotal");
    expect(listedPublicTicketType).not.toHaveProperty("stockSold");

    const checkoutResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-884ce574-0501-4c82-a49e-a1896ce58849")
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .send({
        eventId: event.id,
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 2,
          },
        ],
        guest: {
          firstName: "Guest",
          lastName: "Buyer",
          email: "guest@example.com",
        },
      });

    expect(checkoutResponse.status).toBe(201);

    expect(checkoutResponse.body.success).toBe(true);

    expect(checkoutResponse.headers["idempotency-replayed"]).toBe("false");

    expect(checkoutResponse.body.data.checkout).toBe(null);

    expect(checkoutResponse.body.data.guestAccess).toMatchObject({
      orderId: expect.any(String),

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });

    expect(checkoutResponse.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "guest@example.com",

        firstName: "Guest",

        lastName: "Buyer",

        displayName: "Guest Buyer",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: "Main Hall – Room 1",
      },

      items: [
        {
          ticketType: {
            id: ticketType.id,

            displayName: ticketType.displayName,

            description: ticketType.description,

            kind: ticketType.ticketKind,
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

        provider: "none",
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(checkoutResponse.body.meta).toMatchObject({
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

    const orderId = checkoutResponse.body.data.order.id;

    expect(checkoutResponse.body.data.guestAccess.orderId).toBe(orderId);

    expect(checkoutResponse.body.data.order.createdAt).toBeTypeOf("string");

    expect(checkoutResponse.body.data.order.updatedAt).toBeTypeOf("string");

    const serializedCheckout = JSON.stringify(checkoutResponse.body);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "eventTitleSnapshot",
      "paymentStatus",
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
    const tickets = await findTicketsByOrderId(orderId, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);
    expect(tickets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId,
          eventId: event.id,
          ticketTypeId: ticketType.id,
        }),
      ]),
    );
  });

  it("rejects guest checkout without host service token", async () => {
    const { accessToken } = await createAdminAndToken();
    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(accessToken);

    const checkoutResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-025353ce-0aea-4b3c-a3ce-bfb77308b088")
      .send({
        eventId: event.id,
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
          },
        ],
        guest: {
          firstName: "Guest",
          lastName: "Buyer",
          email: "guest@example.com",
        },
      });

    expect(checkoutResponse.status).toBe(401);
    expect(checkoutResponse.body.success).toBe(false);
  });
  it("replays an SQL checkout without creating a second order", async () => {
    const { accessToken } = await createAdminAndToken();

    const hostServiceToken = createHostServiceToken();

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(accessToken);

    const payload = {
      eventId: event.id,
      items: [
        {
          ticketTypeId: ticketType.id,
          quantity: 2,
        },
      ],
      guest: {
        firstName: "Guest",
        lastName: "Buyer",
        email: "guest@example.com",
      },
    };

    const idempotencyKey = "sql-checkout-replay-0001";

    const firstResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .send(payload);

    const replayResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${hostServiceToken}`)
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

    expect(firstResponse.body.data.checkout).toBe(null);

    expect(replayResponse.body.data.checkout).toBe(null);

    expect(replayResponse.body.data.order).toEqual(
      firstResponse.body.data.order,
    );

    const orders = await findOrdersByEventId(event.id, {
      lean: true,
    });

    expect(orders).toHaveLength(1);

    const tickets = await findTicketsByOrderId(
      firstResponse.body.data.order.id,
      {
        lean: true,
      },
    );

    expect(tickets).toHaveLength(2);
  });

  it("rejects a changed SQL checkout using the same Idempotency-Key", async () => {
    const { accessToken } = await createAdminAndToken();

    const hostServiceToken = createHostServiceToken();

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(accessToken);

    const idempotencyKey = "sql-checkout-conflict-001";

    const buildPayload = (quantity) => ({
      eventId: event.id,
      items: [
        {
          ticketTypeId: ticketType.id,
          quantity,
        },
      ],
      guest: {
        firstName: "Guest",
        lastName: "Buyer",
        email: "guest@example.com",
      },
    });

    const firstResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .send(buildPayload(1));

    const conflictResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .send(buildPayload(2));

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.meta.idempotencyReplayed).toBe(false);

    expect(firstResponse.body.data.order.id).toBeTypeOf("string");

    expect(firstResponse.body.data.guestAccess).toMatchObject({
      orderId: firstResponse.body.data.order.id,

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });
    expect(conflictResponse.status).toBe(409);

    expect(conflictResponse.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_IDEMPOTENCY_KEY_REUSED",
      },
    });

    const orders = await findOrdersByEventId(event.id, {
      lean: true,
    });

    expect(orders).toHaveLength(1);

    const tickets = await findTicketsByOrderId(
      firstResponse.body.data.order.id,
      {
        lean: true,
      },
    );

    expect(tickets).toHaveLength(1);
  });
  it("prevents duplicate SQL orders during parallel identical checkouts", async () => {
    const { accessToken } = await createAdminAndToken();

    const hostServiceToken = createHostServiceToken();

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(accessToken);

    const payload = {
      eventId: event.id,
      items: [
        {
          ticketTypeId: ticketType.id,
          quantity: 2,
        },
      ],
      guest: {
        firstName: "Guest",
        lastName: "Buyer",
        email: "parallel.guest@example.com",
      },
    };

    const idempotencyKey = "sql-parallel-checkout-0001";

    const sendCheckout = () =>
      request(publicOrderApp)
        .post("/api/public/orders/checkout")
        .set("Idempotency-Key", idempotencyKey)
        .set("Authorization", `Bearer ${hostServiceToken}`)
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

    expect(createdResponses[0].headers["idempotency-replayed"]).toBe("false");

    expect(createdResponses[0].body.data.order.id).toBeTypeOf("string");

    expect(createdResponses[0].body.data.checkout).toBe(null);

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

      expect(secondResult.body.data.checkout).toBe(null);

      expect(secondResult.body.data.order.id).toBe(
        createdResponses[0].body.data.order.id,
      );
    }

    if (secondResult.status === 409) {
      expect(secondResult.body).toMatchObject({
        success: false,
        error: {
          code: "ORDER_IDEMPOTENCY_IN_PROGRESS",
        },
      });
    }

    const orders = await findOrdersByEventId(event.id, {
      lean: true,
    });

    expect(orders).toHaveLength(1);

    const tickets = await findTicketsByOrderId(orders[0].id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);
  });
});
