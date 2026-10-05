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
const TEST_EXTERNAL_USER_ID = "host-customer-1";
const TEST_EXTERNAL_EMAIL = "customer@example.com";

let eventApp;
let ticketTypeApp;
let publicOrderApp;
let ticketApp;

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let hashPassword;
let createEventUser;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;
let TICKET_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

async function loadExternalUserOrdersTicketsSqlIntegrationApp() {
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
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const ticketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/internal/ticketType.internal.routes.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");

  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");

  const publicTicketRoutesModule =
    await import("../../../src/modules/tickets/public/ticket.public.routes.js");
  const ticketConstantsModule =
    await import("../../../src/modules/tickets/ticket.constants.js");

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

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;

  eventApp = createHttpTestApp({
    mountPath: "/api/admin/events",
    router: eventRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  ticketTypeApp = createHttpTestApp({
    mountPath: "/api/admin/ticket-types",
    router: ticketTypeRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  publicOrderApp = createHttpTestApp({
    mountPath: "/api/public/orders",
    router: publicOrderRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  ticketApp = createHttpTestApp({
    mountPath: "/api/public/tickets",
    router: publicTicketRoutesModule.default,
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

function createExternalUserToken({
  externalProvider = TEST_EXTERNAL_PROVIDER,
  externalUserId = TEST_EXTERNAL_USER_ID,
  email = TEST_EXTERNAL_EMAIL,
  firstName = "External",
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

function buildEventPayload(overrides = {}) {
  return {
    title: "SQL External User Event",
    slug: "sql-external-user-event",
    shortDescription: "Short external user event description",
    description: "Long external user event description",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "external", "orders", "tickets"],
    sessions: [
      {
        startAt: "2030-05-10T10:00:00.000Z",
        endAt: "2030-05-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Main Hall",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    faqs: [],
    isFree: true,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-05-09T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL external user integration test",
    ...overrides,
  };
}

function buildTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "External User Ticket",
    description: "A free external user test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "free",
    priceGross: 0,
    currency: "EUR",
    stockTotal: 100,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-05-09T10:00:00.000Z",
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

async function createExternalUserCheckout({ accessToken, quantity = 2 }) {
  const externalUserToken = createExternalUserToken();

  const { event, ticketType } =
    await createPublishedFreeEventWithTicketType(accessToken);

  const checkoutResponse = await request(publicOrderApp)
    .post("/api/public/orders/checkout")
    .set("Idempotency-Key", "test-c96425a6-7f53-4fa0-bcc9-9b2611dd856c")
    .set("Authorization", `Bearer ${externalUserToken}`)
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

  return {
    event,
    ticketType,
    order: checkoutResponse.body.data.order,
    externalUserToken,
  };
}

function getListItems(payload) {
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
}

describe("External user orders/tickets SQL integration", () => {
  beforeAll(async () => {
    await loadExternalUserOrdersTicketsSqlIntegrationApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates a free external-user checkout and lists/reads own orders", async () => {
    const { accessToken } = await createAdminAndToken();
    const { event, ticketType, order, externalUserToken } =
      await createExternalUserCheckout({
        accessToken,
        quantity: 2,
      });
    expect(order).toMatchObject({
      id: expect.any(String),

      event: {
        id: event.id,
      },

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,
        email: TEST_EXTERNAL_EMAIL,
        firstName: "External",
        lastName: "Customer",
        displayName: "External Customer",
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
        provider: "none",
      },

      pricing: {
        subtotal: 0,
        discount: null,
        total: 0,
        currency: "EUR",
      },
    });

    expect(order.guestAccessTokenHash).toBeFalsy();

    const ownOrdersResponse = await request(publicOrderApp)
      .get("/api/public/orders")
      .set("Authorization", `Bearer ${externalUserToken}`);

    expect(ownOrdersResponse.status).toBe(200);
    expect(ownOrdersResponse.body.success).toBe(true);

    const ownOrders = getListItems(ownOrdersResponse.body);

    expect(ownOrders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: order.id,

          buyer: {
            type: ORDER_BUYER_TYPE.EXTERNAL_USER,
            email: TEST_EXTERNAL_EMAIL,
            firstName: "External",
            lastName: "Customer",
            displayName: "External Customer",
          },

          event: expect.objectContaining({
            id: event.id,
            title: event.title,
            slug: event.slug,
            category: event.category,
            location: "Main Hall – Room 1",
          }),

          items: [
            {
              ticketType: {
                id: ticketType.id,
                displayName: ticketType.displayName,
                description: ticketType.description,
                kind: ticketType.ticketKind,
                pricingMode: "free",
              },

              quantity: 2,
              unitPrice: 0,
              lineTotal: 0,
            },
          ],

          pricing: {
            currency: "EUR",
            subtotal: 0,
            discount: null,
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
        }),
      ]),
    );

    const listedOrder = ownOrders.find((item) => item.id === order.id);

    expect(listedOrder).toBeDefined();
    expect(listedOrder.createdAt).toBeTypeOf("string");
    expect(listedOrder.updatedAt).toBeTypeOf("string");

    const ownOrderResponse = await request(publicOrderApp)
      .get(`/api/public/orders/${order.id}`)
      .set("Authorization", `Bearer ${externalUserToken}`);

    expect(ownOrderResponse.status).toBe(200);
    expect(ownOrderResponse.body.success).toBe(true);

    expect(Object.keys(ownOrderResponse.body.data).sort()).toEqual([
      "cancellation",
      "order",
      "tickets",
    ]);

    expect(ownOrderResponse.body.data.order).toMatchObject({
      id: order.id,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,
        email: TEST_EXTERNAL_EMAIL,
        firstName: "External",
        lastName: "Customer",
        displayName: "External Customer",
      },

      event: expect.objectContaining({
        id: event.id,
        title: event.title,
        slug: event.slug,
        category: event.category,
        location: "Main Hall – Room 1",
      }),

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
        discount: null,
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

    expect(ownOrderResponse.body.data.tickets).toHaveLength(2);

    for (const ticket of ownOrderResponse.body.data.tickets) {
      expect(ticket).toMatchObject({
        orderId: order.id,

        buyer: {
          type: ORDER_BUYER_TYPE.EXTERNAL_USER,
          email: TEST_EXTERNAL_EMAIL,
          firstName: "External",
          lastName: "Customer",
          displayName: "External Customer",
        },

        holder: {
          type: "buyer",
          email: TEST_EXTERNAL_EMAIL,
          firstName: "External",
          lastName: "Customer",
          displayName: "External Customer",
        },

        event: expect.objectContaining({
          id: event.id,
          title: event.title,
          slug: event.slug,
          category: event.category,
        }),

        ticketType: {
          id: ticketType.id,
          displayName: ticketType.displayName,
          description: ticketType.description,
          kind: ticketType.ticketKind,
        },

        pricing: {
          currency: "EUR",
          unitPrice: 0,
        },

        status: TICKET_STATUS.ACTIVE,

        checkIn: {
          checkedInAt: null,
        },

        cancellation: {
          cancelledAt: null,
          reason: null,
        },

        depositRefund: {
          status: "not_required",
          amount: 0,
          currency: "EUR",
          triggeredAt: null,
        },
      });

      expect(ticket.id).toBeTypeOf("string");
      expect(ticket.createdAt).toBeTypeOf("string");
      expect(ticket.updatedAt).toBeTypeOf("string");
    }

    const serializedPublicResult = JSON.stringify({
      ownOrders,
      detail: ownOrderResponse.body.data,
    });

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "holderExternalProvider",
      "holderExternalUserId",
      "holderEmailSnapshot",
      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",
      "paymentStatus",
      "paymentProviderPaymentId",
      "checkInTokenHash",
      "encryptedCheckInToken",
      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serializedPublicResult).not.toContain(`"${field}"`);
    }
  });

  it("lists and reads own tickets for a SQL external user", async () => {
    const { accessToken } = await createAdminAndToken();
    const { event, ticketType, order, externalUserToken } =
      await createExternalUserCheckout({
        accessToken,
        quantity: 2,
      });

    const ownTicketsResponse = await request(ticketApp)
      .get("/api/public/tickets")
      .set("Authorization", `Bearer ${externalUserToken}`);

    expect(ownTicketsResponse.status).toBe(200);
    expect(ownTicketsResponse.body.success).toBe(true);

    const ownTickets = getListItems(ownTicketsResponse.body);

    expect(ownTickets).toHaveLength(2);

    for (const listedTicket of ownTickets) {
      expect(listedTicket).toMatchObject({
        orderId: order.id,

        buyer: {
          type: ORDER_BUYER_TYPE.EXTERNAL_USER,

          email: TEST_EXTERNAL_EMAIL,

          firstName: "External",

          lastName: "Customer",

          displayName: "External Customer",
        },

        holder: {
          type: "buyer",

          email: TEST_EXTERNAL_EMAIL,

          firstName: "External",

          lastName: "Customer",

          displayName: "External Customer",
        },

        event: {
          id: event.id,

          title: event.title,

          slug: event.slug,

          category: event.category,
        },

        ticketType: {
          id: ticketType.id,

          displayName: ticketType.displayName,

          description: ticketType.description,

          kind: ticketType.ticketKind,
        },

        pricing: {
          currency: "EUR",

          unitPrice: 0,
        },

        status: TICKET_STATUS.ACTIVE,

        checkIn: {
          checkedInAt: null,
        },

        cancellation: {
          cancelledAt: null,

          reason: null,
        },

        depositRefund: {
          status: "not_required",

          amount: 0,

          currency: "EUR",

          triggeredAt: null,
        },
      });

      expect(listedTicket.id).toBeTypeOf("string");

      expect(listedTicket.event.startsAt).toBeTypeOf("string");

      expect(listedTicket.createdAt).toBeTypeOf("string");

      expect(listedTicket.updatedAt).toBeTypeOf("string");
    }

    expect(ownTicketsResponse.body.meta).toEqual({
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
      },
    });

    expect(ownTicketsResponse.body.pagination).toBeUndefined();

    const serializedTicketList = JSON.stringify(ownTickets);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "holderExternalProvider",
      "holderExternalUserId",
      "holderEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "checkedInByEventUserId",
      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "depositRefundProviderRefundId",

      "metadata",
      "createdByEventUserId",
      "updatedByEventUserId",
    ]) {
      expect(serializedTicketList).not.toContain(`"${field}"`);
    }

    const ticket = ownTickets[0];

    const ownTicketResponse = await request(ticketApp)
      .get(`/api/public/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${externalUserToken}`);

    expect(ownTicketResponse.status).toBe(200);
    expect(ownTicketResponse.body.success).toBe(true);

    expect(ownTicketResponse.body.data).toMatchObject({
      id: ticket.id,

      orderId: order.id,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: TEST_EXTERNAL_EMAIL,

        firstName: "External",

        lastName: "Customer",

        displayName: "External Customer",
      },

      holder: {
        type: "buyer",

        email: TEST_EXTERNAL_EMAIL,

        firstName: "External",

        lastName: "Customer",

        displayName: "External Customer",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,
      },

      ticketType: {
        id: ticketType.id,

        displayName: ticketType.displayName,

        description: ticketType.description,

        kind: ticketType.ticketKind,
      },

      pricing: {
        currency: "EUR",

        unitPrice: 0,
      },

      status: TICKET_STATUS.ACTIVE,

      checkIn: {
        checkedInAt: null,
      },

      cancellation: {
        cancelledAt: null,

        reason: null,
      },

      depositRefund: {
        status: "not_required",

        amount: 0,

        currency: "EUR",

        triggeredAt: null,
      },
    });

    expect(ownTicketResponse.body.data.event.startsAt).toBeTypeOf("string");

    expect(ownTicketResponse.body.data.createdAt).toBeTypeOf("string");

    expect(ownTicketResponse.body.data.updatedAt).toBeTypeOf("string");

    const serializedTicketDetail = JSON.stringify(ownTicketResponse.body.data);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "holderExternalProvider",
      "holderExternalUserId",
      "holderEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "checkedInByEventUserId",
      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "depositRefundProviderRefundId",

      "metadata",
      "createdByEventUserId",
      "updatedByEventUserId",
    ]) {
      expect(serializedTicketDetail).not.toContain(`"${field}"`);
    }
  });

  it("prevents one external user from reading another external user's order and ticket", async () => {
    const { accessToken } = await createAdminAndToken();
    const { order, externalUserToken } = await createExternalUserCheckout({
      accessToken,
      quantity: 1,
    });

    const ownTicketsResponse = await request(ticketApp)
      .get("/api/public/tickets")
      .set("Authorization", `Bearer ${externalUserToken}`);

    expect(ownTicketsResponse.status).toBe(200);

    const [ticket] = getListItems(ownTicketsResponse.body);
    expect(ticket).toBeTruthy();

    const otherExternalUserToken = createExternalUserToken({
      externalUserId: "host-customer-2",
      email: "other@example.com",
      firstName: "Other",
      lastName: "Customer",
    });

    const otherOrderResponse = await request(publicOrderApp)
      .get(`/api/public/orders/${order.id}`)
      .set("Authorization", `Bearer ${otherExternalUserToken}`);

    expect(otherOrderResponse.status).toBe(404);

    const otherTicketResponse = await request(ticketApp)
      .get(`/api/public/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${otherExternalUserToken}`);

    expect(otherTicketResponse.status).toBe(404);
  });

  it("rejects own orders and own tickets without external user token", async () => {
    const ordersResponse =
      await request(publicOrderApp).get("/api/public/orders");

    expect(ordersResponse.status).toBe(401);

    const ticketsResponse = await request(ticketApp).get("/api/public/tickets");

    expect(ticketsResponse.status).toBe(401);
  });
});
