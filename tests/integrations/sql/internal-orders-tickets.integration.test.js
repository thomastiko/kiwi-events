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

const {
  cancelPaymentSessionMock,
  createPaymentRefundMock,
  sendOrderCancelledMailMock,
  sendOrderConfirmedMailMock,
} = vi.hoisted(() => ({
  cancelPaymentSessionMock: vi.fn(),
  createPaymentRefundMock: vi.fn(),
  sendOrderCancelledMailMock: vi.fn().mockResolvedValue({
    success: true,
    skipped: false,
    email: "guest@example.com",
  }),
  sendOrderConfirmedMailMock: vi.fn().mockResolvedValue({
    success: true,
    skipped: false,
    email: "guest@example.com",
  }),
}));

let eventApp;
let ticketTypeApp;
let publicOrderApp;
let internalOrderApp;
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
let TICKET_CHECK_IN_STATE;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_SOURCE;
let ORDER_STATUS;

let createEvent;
let createTicketType;
let reserveTicketTypeStock;
let releaseTicketTypeStock;
let findTicketTypeById;

let createOrder;
let findOrderById;
let findTicketsByOrderId;
let updateTicketById;

let generateTicketsForOrderService;
let cancelInternalOrderService;
let deleteObjectMock;

async function loadInternalOrdersTicketsSqlIntegrationApp() {
  vi.resetModules();

  deleteObjectMock = vi.fn().mockResolvedValue({ success: true });

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
    payments: false,
    guestCheckout: true,
    depositTickets: false,
    ticketPdf: false,
    ticketQr: false,
    mail: false,
    mailOrderConfirmation: false,
    mailOrderCancellation: false,
    mailOrderRefunded: false,
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

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    deleteObject: deleteObjectMock,
  }));

  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderCancelledMailSafe: sendOrderCancelledMailMock,
    sendOrderConfirmedMailSafe: sendOrderConfirmedMailMock,
  }));

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),

    cancelPaymentSession: cancelPaymentSessionMock,

    createPaymentRefund: createPaymentRefundMock,
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
  const eventRepositoryModule =
    await import("../../../src/modules/events/repositories/event.repository.js");

  const ticketTypeRepositoryModule =
    await import("../../../src/modules/ticketTypes/repositories/ticketType.repository.js");

  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");

  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");

  const orderInternalServiceModule =
    await import("../../../src/modules/orders/internal/order.internal.service.js");
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
  const internalOrderRoutesModule =
    await import("../../../src/modules/orders/internal/order.internal.routes.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");

  const adminTicketRoutesModule =
    await import("../../../src/modules/tickets/internal/ticket.internal.routes.js");
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
  TICKET_CHECK_IN_STATE = ticketConstantsModule.TICKET_CHECK_IN_STATE;
  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;

  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;

  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;

  ORDER_SOURCE = orderConstantsModule.ORDER_SOURCE;

  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;
  createEvent = eventRepositoryModule.createEvent;

  createTicketType = ticketTypeRepositoryModule.createTicketType;

  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;

  releaseTicketTypeStock = ticketTypeRepositoryModule.releaseTicketTypeStock;

  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  createOrder = orderRepositoryModule.createOrder;

  findOrderById = orderRepositoryModule.findOrderById;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  updateTicketById = ticketRepositoryModule.updateTicketById;
  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;

  cancelInternalOrderService =
    orderInternalServiceModule.cancelInternalOrderService;
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

  internalOrderApp = createHttpTestApp({
    mountPath: "/api/admin/orders",
    router: internalOrderRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  ticketApp = createHttpTestApp({
    mountPath: "/api/admin/tickets",
    router: adminTicketRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

function signLocalEventUserToken(eventUser) {
  const eventUserId = String(eventUser.id);

  return jwt.sign(
    {
      sub: eventUserId,

      eventUserId,

      email: eventUser.emailSnapshot,

      role: eventUser.role,

      roles: [eventUser.role],

      type: "KIWI_EVENTS_test",
    },

    TEST_JWT_SECRET,

    {
      expiresIn: "1h",
    },
  );
}

async function createInternalUserAndToken({
  emailSnapshot,
  password = "secret123",
  role,
  firstNameSnapshot = "Test",
  lastNameSnapshot = "User",
}) {
  const passwordHash = await hashPassword(password);

  const eventUser = await createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot,
    passwordHash,

    firstNameSnapshot,
    lastNameSnapshot,

    role,

    isActive: true,

    mustChangePassword: false,
  });

  return {
    eventUser,

    // bestehende Tests erwarten teilweise noch .admin
    admin: eventUser,

    accessToken: signLocalEventUserToken(eventUser),
  };
}

async function createAdminAndToken({
  emailSnapshot = "admin@example.com",
  password = "secret123",
} = {}) {
  return createInternalUserAndToken({
    emailSnapshot,
    password,

    role: EVENT_USER_ROLES.ADMIN,

    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",
  });
}
async function createOwnManagerAndToken({
  emailSnapshot = "own-manager@example.com",
} = {}) {
  return createInternalUserAndToken({
    emailSnapshot,

    role: EVENT_USER_ROLES.EVENT_MANAGER,

    firstNameSnapshot: "Own",
    lastNameSnapshot: "Manager",
  });
}

async function createAllManagerAndToken({
  emailSnapshot = "all-manager@example.com",
} = {}) {
  return createInternalUserAndToken({
    emailSnapshot,

    role: EVENT_USER_ROLES.EVENT_ADMIN,

    firstNameSnapshot: "All",
    lastNameSnapshot: "Manager",
  });
}

async function createCheckinStaffAndToken({
  emailSnapshot = "checkin-staff@example.com",
} = {}) {
  return createInternalUserAndToken({
    emailSnapshot,

    role: EVENT_USER_ROLES.CHECKIN_STAFF,

    firstNameSnapshot: "Checkin",
    lastNameSnapshot: "Staff",
  });
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
    title: "SQL Internal Orders Event",
    slug: "sql-internal-orders-event",
    shortDescription: "Short internal orders event description",
    description: "Long internal orders event description",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "orders", "tickets"],
    sessions: [
      {
        startAt: "2030-04-10T10:00:00.000Z",
        endAt: "2030-04-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Main Hall",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    faqs: [],
    isFree: true,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-04-09T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL internal orders/tickets integration test",
    ...overrides,
  };
}

function buildTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "Internal Orders Ticket",
    description: "A free internal orders test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "free",
    priceGross: 0,
    currency: "EUR",
    stockTotal: 100,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-04-09T10:00:00.000Z",
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

async function createFreeGuestCheckout({ accessToken, quantity = 2 }) {
  const hostServiceToken = createHostServiceToken();

  const { event, ticketType } =
    await createPublishedFreeEventWithTicketType(accessToken);

  const checkoutResponse = await request(publicOrderApp)
    .post("/api/public/orders/checkout")
    .set("Idempotency-Key", "test-a03b41e0-c187-4cd4-a0b2-14adc06e5cca")
    .set("Authorization", `Bearer ${hostServiceToken}`)
    .send({
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

  expect(checkoutResponse.status).toBe(201);
  expect(checkoutResponse.body.success).toBe(true);

  return {
    event,
    ticketType,

    order: checkoutResponse.body.data.order,

    guestAccess: checkoutResponse.body.data.guestAccess,
  };
}
function buildInternalActor(eventUser) {
  return {
    eventUserId: String(eventUser.id),
    eventUser,
  };
}

async function createSqlManagedEvent({ ownerId, ...overrides } = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return createEvent({
    title: "SQL Managed Order Event",

    slug: `sql-managed-order-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    shortDescription: "SQL managed order integration event",

    description: "SQL managed order integration event",

    category: EVENT_CATEGORIES.EVENT,

    status: EVENT_STATUSES.PUBLISHED,

    visibility: EVENT_VISIBILITIES.PUBLIC,

    location: "WU Wien",

    tags: ["sql", "managed-order"],

    sessions: [
      {
        startAt,
        endAt,

        timezone: "Europe/Vienna",

        locationLabel: "Audimax",

        locationDetails: "Room 1",

        capacity: 100,

        status: "scheduled",
      },
    ],

    faqs: [],

    isFree: false,

    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),

    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),

    isFeatured: false,

    featuredOrder: 0,

    publishedAt: new Date(),

    notesInternal: "SQL internal cancellation integration test",

    createdByEventUserId: ownerId || null,

    updatedByEventUserId: ownerId || null,

    ...overrides,
  });
}

async function createSqlManagedTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,

    name: `${event.title} - Managed Ticket`,

    displayName: "SQL Managed Ticket",

    description: "SQL managed order test ticket",

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

async function createSqlManagedOrderWithTickets({
  event,
  ticketType,

  quantity = 1,

  totalPrice = 2500,

  status = ORDER_STATUS.CONFIRMED,

  paymentStatus = ORDER_PAYMENT_STATUS.PAID,

  paymentProvider = totalPrice > 0
    ? ORDER_PAYMENT_PROVIDER.MOLLIE
    : ORDER_PAYMENT_PROVIDER.NONE,

  paymentProviderPaymentId = totalPrice > 0
    ? "pay_sql_internal_cancel_123"
    : null,

  createTickets = true,
  guestAccessTokenHash = null,
  guestAccessTokenExpiresAt = null,
} = {}) {
  const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;

  const order = await createOrder({
    orderNumber: `ORD-SQL-INTERNAL-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.GUEST,

    buyerExternalProvider: null,

    buyerExternalUserId: null,

    buyerEmailSnapshot: "guest@example.com",

    buyerFirstNameSnapshot: "Guest",

    buyerLastNameSnapshot: "Buyer",

    buyerDisplayNameSnapshot: "Guest Buyer",

    buyerRawExternalSnapshot: null,

    eventId: event.id,

    eventTitleSnapshot: event.title,

    eventSlugSnapshot: event.slug,

    eventCategorySnapshot: event.category,

    eventLocationSnapshot: event.location,

    eventStartsAtSnapshot: event.sessions?.[0]?.startAt || null,

    items: [
      {
        ticketTypeId: ticketType.id,

        eventId: event.id,

        quantity,

        unitPrice,

        lineTotal: totalPrice,

        currency: "EUR",

        ticketTypeNameSnapshot: ticketType.displayName,

        ticketTypeDescriptionSnapshot: ticketType.description,

        ticketKindSnapshot: ticketType.ticketKind,

        pricingModeSnapshot: ticketType.pricingMode,
      },
    ],

    currency: "EUR",

    subtotal: totalPrice,

    totalPrice,

    status,

    paymentStatus,

    paymentProvider,

    paymentProviderPaymentId,

    paymentCheckoutUrl: null,

    guestAccessTokenHash,
    guestAccessTokenExpiresAt,

    source: ORDER_SOURCE.PUBLIC,

    confirmedAt: status === ORDER_STATUS.CONFIRMED ? new Date() : null,

    expiresAt:
      status === ORDER_STATUS.PENDING
        ? new Date(Date.now() + 15 * 60 * 1000)
        : null,

    createdByEventUserId: null,

    updatedByEventUserId: null,

    metadata: null,
  });

  await reserveTicketTypeStock({
    ticketTypeId: ticketType.id,

    eventId: event.id,

    quantity,

    updatedByEventUserId: null,
  });

  let tickets = [];

  if (createTickets) {
    tickets = await generateTicketsForOrderService(order.id, {
      createdByEventUserId: null,

      updatedByEventUserId: null,
    });
  }

  return {
    order,
    tickets,
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

describe("Internal Orders/Tickets SQL integration", () => {
  beforeAll(async () => {
    await loadInternalOrdersTicketsSqlIntegrationApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    cancelPaymentSessionMock.mockReset();
    createPaymentRefundMock.mockReset();
    deleteObjectMock.mockClear();

    sendOrderCancelledMailMock.mockReset();
    sendOrderCancelledMailMock.mockResolvedValue({
      success: true,
      skipped: false,
      email: "guest@example.com",
    });

    sendOrderConfirmedMailMock.mockReset();
    sendOrderConfirmedMailMock.mockResolvedValue({
      success: true,
      skipped: false,
      email: "guest@example.com",
    });

    createPaymentRefundMock.mockResolvedValue({
      providerRefundId: "refund_sql_internal_http_123",

      status: "refunded",
    });
    cancelPaymentSessionMock.mockImplementation(
      async ({ provider, providerPaymentId }) => ({
        provider: provider || ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId,

        status: "canceled",

        rawStatus: "canceled",

        terminated: true,

        terminal: true,

        paid: false,
      }),
    );
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("lists and reads orders created by free guest checkout via internal API", async () => {
    const { accessToken } = await createAdminAndToken();
    const { event, order } = await createFreeGuestCheckout({
      accessToken,
      quantity: 2,
    });

    const listResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/event/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);

    const orders = getListItems(listResponse.body);

    expect(orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: order.id,

          buyer: expect.objectContaining({
            type: ORDER_BUYER_TYPE.GUEST,

            email: "guest@example.com",

            externalIdentity: null,
          }),

          event: expect.objectContaining({
            id: event.id,

            title: event.title,
          }),

          pricing: {
            currency: "EUR",

            subtotal: 0,

            discount: null,

            total: 0,
          },

          status: ORDER_STATUS.CONFIRMED,

          payment: expect.objectContaining({
            status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
          }),

          source: "public",
        }),
      ]),
    );

    expect(listResponse.body.meta).toEqual({
      event: {
        id: event.id,

        title: event.title,

        status: EVENT_STATUSES.PUBLISHED,
      },

      pagination: {
        page: 1,

        limit: 20,

        total: 1,

        pages: 1,
      },

      summary: {
        total: 1,
      },
    });

    expect(listResponse.body.pagination).toBeUndefined();

    expect(listResponse.body.summary).toBeUndefined();

    expect(listResponse.body.event).toBeUndefined();
    const detailResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/${order.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(detailResponse.status).toBe(200);

    expect(detailResponse.body.success).toBe(true);

    expect(detailResponse.body.data).toMatchObject({
      id: order.id,

      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "guest@example.com",

        firstName: "Guest",

        lastName: "Buyer",

        displayName: "Guest Buyer",

        externalIdentity: null,
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,
      },

      pricing: {
        currency: "EUR",

        subtotal: 0,

        discount: null,

        total: 0,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      source: ORDER_SOURCE.PUBLIC,
    });

    expect(detailResponse.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quantity: 2,

          unitPrice: 0,

          lineTotal: 0,
        }),
      ]),
    );

    expect(detailResponse.body.data.tickets).toHaveLength(2);

    for (const ticket of detailResponse.body.data.tickets) {
      expect(ticket).toMatchObject({
        orderId: order.id,

        event: {
          id: event.id,

          title: event.title,
        },

        status: TICKET_STATUS.ACTIVE,
      });

      expect(ticket.id).toBeTypeOf("string");
    }

    expect(detailResponse.body.meta).toEqual({
      summary: {
        ticketsCount: 2,

        totalPrice: 0,

        currency: "EUR",
      },

      actions: {
        editBuyer: {
          allowed: true,
          reason: null,
        },

        cancel: {
          allowed: true,
          reason: null,
        },

        refund: {
          allowed: false,
          reason: "payment_not_paid",
        },

        mailResend: {
          orderConfirmed: {
            allowed: false,
            reason: "mail_feature_disabled",
          },

          orderCancelled: {
            allowed: false,
            reason: "order_not_cancelled",
          },

          orderRefunded: {
            allowed: false,
            reason: "order_refund_not_completed",
          },

          eventCancelled: {
            allowed: false,
            reason: "event_not_cancelled",
          },
        },
      },
    });

    expect(detailResponse.body.event).toBeUndefined();

    expect(detailResponse.body.tickets).toBeUndefined();

    expect(detailResponse.body.summary).toBeUndefined();

    const serializedDetailResponse = JSON.stringify(detailResponse.body);

    for (const field of [
      "_id",
      "__v",

      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "guestAccessTokenExpiresAt",

      "fulfillmentLeaseToken",
      "fulfillmentLeaseExpiresAt",

      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "metadata",
    ]) {
      expect(serializedDetailResponse).not.toContain(`"${field}"`);
    }
  });
  it("updates a guest buyer through the internal HTTP endpoint and preserves ticket identity", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "buyer-update-manager@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const guestAccessTokenHash = "sql-guest-access-before-change";
    const guestAccessTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const { order, tickets } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
      guestAccessTokenHash,
      guestAccessTokenExpiresAt,
    });

    const ticket = tickets[0];

    await updateTicketById(ticket.id, {
      checkInTokenHash: "sql-check-in-hash-before-change",
      encryptedCheckInToken: "sql-encrypted-token-before-change",
      ticketPdfStorageKey: "tickets/sql-original.pdf",
      ticketPdfStorageTarget: "private",
      ticketPdfGeneratedAt: new Date(),
    });

    const beforeTicket = (
      await findTicketsByOrderId(order.id, {
        includeSecrets: true,
        lean: true,
      })
    )[0];

    const response = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/buyer`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Updated",
        lastName: "Guest",
        email: "UPDATED@example.com",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.buyer).toMatchObject({
      type: ORDER_BUYER_TYPE.GUEST,
      email: "updated@example.com",
      firstName: "Updated",
      lastName: "Guest",
      displayName: "Updated Guest",
      externalIdentity: null,
    });

    expect(response.body.meta.actions.editBuyer).toEqual({
      allowed: true,
      reason: null,
    });

    const orderInDb = await findOrderById(order.id, {
      includeSecrets: true,
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      buyerEmailSnapshot: "updated@example.com",
      buyerFirstNameSnapshot: "Updated",
      buyerLastNameSnapshot: "Guest",
      buyerDisplayNameSnapshot: "Updated Guest",
      guestAccessTokenHash: null,
      guestAccessTokenExpiresAt: null,
    });

    const ticketInDb = (
      await findTicketsByOrderId(order.id, {
        includeSecrets: true,
        lean: true,
      })
    )[0];

    expect(ticketInDb).toMatchObject({
      buyerEmailSnapshot: "updated@example.com",
      buyerFirstNameSnapshot: "Updated",
      buyerLastNameSnapshot: "Guest",
      buyerDisplayNameSnapshot: "Updated Guest",

      holderType: "buyer",
      holderEmailSnapshot: "updated@example.com",
      holderFirstNameSnapshot: "Updated",
      holderLastNameSnapshot: "Guest",
      holderDisplayNameSnapshot: "Updated Guest",

      ticketPdfStorageKey: null,
      ticketPdfStorageTarget: null,
      ticketPdfGeneratedAt: null,
    });

    expect(ticketInDb.ticketCode).toBe(beforeTicket.ticketCode);
    expect(ticketInDb.checkInTokenHash).toBe(beforeTicket.checkInTokenHash);
    expect(ticketInDb.encryptedCheckInToken).toBe(
      beforeTicket.encryptedCheckInToken,
    );

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "tickets/sql-original.pdf",
      storageTarget: "private",
    });
  });

  it("blocks guest buyer updates through HTTP after ticket check-in", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "checked-buyer-manager@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order, tickets } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    await updateTicketById(tickets[0].id, {
      status: TICKET_STATUS.CHECKED_IN,
      checkedInAt: new Date(),
      checkedInByEventUserId: eventUser.id,
    });

    const response = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/buyer`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Must",
        lastName: "Fail",
        email: "must.fail@example.com",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "ORDER_BUYER_UPDATE_NOT_ALLOWED",
      details: expect.objectContaining({
        reason: "ticket_already_checked_in",
      }),
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb.buyerEmailSnapshot).toBe("guest@example.com");
  });

  it("rejects unsupported mail resend types through the internal HTTP endpoint", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "resend-validation-manager@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const response = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/mails/resend`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        type: "order.unknown",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("applies mail resend state gates before the disabled mail feature", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "resend-state-manager@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const cancelledResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/mails/resend`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        type: "order.cancelled",
      });

    expect(cancelledResponse.status).toBe(409);
    expect(cancelledResponse.body.error).toMatchObject({
      code: "ORDER_MAIL_RESEND_NOT_ALLOWED",
      details: expect.objectContaining({
        reason: "order_not_cancelled",
      }),
    });

    const confirmedResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/mails/resend`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        type: "order.confirmed",
      });

    expect(confirmedResponse.status).toBe(409);
    expect(confirmedResponse.body.error).toMatchObject({
      code: "ORDER_MAIL_RESEND_NOT_ALLOWED",
      details: expect.objectContaining({
        reason: "mail_feature_disabled",
      }),
    });
  });

  it("creates canonical and distinct manual orders through the internal API", async () => {
    const { admin, accessToken } = await createAdminAndToken({
      emailSnapshot: "manual-order-admin@example.com",
    });

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(accessToken);

    const payload = {
      ticketTypeId: ticketType.id,

      quantity: 2,

      email: "manual-sql@example.com",

      firstName: "Manual",

      lastName: "SQL",

      reason: "Manual SQL allocation",
    };

    const firstResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/event/${event.id}/manual`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(firstResponse.status).toBe(201);

    expect(firstResponse.body.success).toBe(true);

    expect(firstResponse.body.data).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.MANUAL,

        email: "manual-sql@example.com",

        firstName: "Manual",

        lastName: "SQL",

        displayName: "Manual SQL",

        externalIdentity: null,
      },

      event: {
        id: event.id,

        title: event.title,
      },

      pricing: {
        currency: "EUR",

        subtotal: 0,

        discount: null,

        total: 0,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      source: ORDER_SOURCE.MANUAL,

      manualAssignmentReason: "Manual SQL allocation",

      audit: {
        createdByEventUserId: admin.id,

        updatedByEventUserId: admin.id,
      },
    });

    expect(firstResponse.body.data.tickets).toHaveLength(2);

    for (const ticket of firstResponse.body.data.tickets) {
      expect(ticket).toMatchObject({
        orderId: firstResponse.body.data.id,

        event: {
          id: event.id,
        },

        ticketType: {
          id: ticketType.id,
        },

        status: TICKET_STATUS.ACTIVE,
      });
    }

    expect(firstResponse.body.meta).toEqual({
      summary: {
        ticketsCount: 2,

        totalPrice: 0,

        currency: "EUR",
      },

      creation: {
        ticketsCreated: 2,

        documents: {
          skipped: true,

          reason: "ticket_pdf_disabled",

          generated: 0,

          alreadyExisted: 0,

          failed: 0,
        },

        fulfillment: {
          status: "completed",
          completed: true,
          retryScheduled: false,
          manualReviewRequired: false,
        },
      },
    });

    expect(firstResponse.body.buyer).toBeUndefined();

    expect(firstResponse.body.tickets).toBeUndefined();

    expect(firstResponse.body.documents).toBeUndefined();

    const secondResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/event/${event.id}/manual`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(secondResponse.status).toBe(201);

    expect(secondResponse.body.data.id).not.toBe(firstResponse.body.data.id);

    expect(secondResponse.body.data.orderNumber).not.toBe(
      firstResponse.body.data.orderNumber,
    );

    expect(sendOrderConfirmedMailMock).toHaveBeenCalledTimes(2);

    const listResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/event/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);

    expect(listResponse.body.meta.summary.total).toBe(2);

    const serialized = JSON.stringify([
      firstResponse.body,
      secondResponse.body,
    ]);

    for (const field of [
      "_id",
      "__v",

      "buyerEmailSnapshot",
      "buyerRawExternalSnapshot",

      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",

      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
  it("allows manage-own users to read and create orders for their own event", async () => {
    const { accessToken: ownerToken } = await createOwnManagerAndToken();

    const { event, ticketType, order } = await createFreeGuestCheckout({
      accessToken: ownerToken,

      quantity: 1,
    });

    const listResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/event/${event.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(listResponse.status).toBe(200);

    const orders = getListItems(listResponse.body);

    expect(orders.some((item) => item.id === order.id)).toBe(true);

    const detailResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/${order.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(detailResponse.status).toBe(200);

    expect(detailResponse.body.data.id).toBe(order.id);

    const manualResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/event/${event.id}/manual`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        ticketTypeId: ticketType.id,

        quantity: 1,

        email: "own-manual@example.com",

        firstName: "Own",
        lastName: "Buyer",

        reason: "Own event manual allocation",
      });

    expect(manualResponse.status).toBe(201);

    expect(manualResponse.body.data).toMatchObject({
      event: {
        id: event.id,
      },

      buyer: {
        email: "own-manual@example.com",
      },

      source: ORDER_SOURCE.MANUAL,
    });
  });
  it("blocks manage-own users from reading orders of foreign events", async () => {
    const { accessToken: ownerToken } = await createOwnManagerAndToken({
      emailSnapshot: "event-owner@example.com",
    });

    const { accessToken: foreignManagerToken } = await createOwnManagerAndToken(
      {
        emailSnapshot: "foreign-manager@example.com",
      },
    );

    const { event, order } = await createFreeGuestCheckout({
      accessToken: ownerToken,

      quantity: 1,
    });

    const listResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/event/${event.id}`)
      .set("Authorization", `Bearer ${foreignManagerToken}`);

    expect(listResponse.status).toBe(403);

    expect(listResponse.body).toMatchObject({
      success: false,

      error: {
        code: "ORDER_MANAGE_FORBIDDEN",
      },
    });

    const detailResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/${order.id}`)
      .set("Authorization", `Bearer ${foreignManagerToken}`);

    expect(detailResponse.status).toBe(403);

    expect(detailResponse.body).toMatchObject({
      success: false,

      error: {
        code: "ORDER_MANAGE_FORBIDDEN",
      },
    });
  });
  it("blocks manage-own users from creating manual orders for foreign events", async () => {
    const { accessToken: ownerToken } = await createOwnManagerAndToken({
      emailSnapshot: "manual-owner@example.com",
    });

    const { accessToken: foreignManagerToken } = await createOwnManagerAndToken(
      {
        emailSnapshot: "manual-foreign@example.com",
      },
    );

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(ownerToken);

    const response = await request(internalOrderApp)
      .post(`/api/admin/orders/event/${event.id}/manual`)
      .set("Authorization", `Bearer ${foreignManagerToken}`)
      .send({
        ticketTypeId: ticketType.id,

        quantity: 1,

        email: "forbidden@example.com",

        firstName: "Forbidden",

        lastName: "Buyer",

        reason: "Must not be created",
      });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "ORDER_MANAGE_FORBIDDEN",
      },
    });
  });
  it("allows manage-all users to read and create orders for foreign events", async () => {
    const { accessToken: ownerToken } = await createOwnManagerAndToken({
      emailSnapshot: "all-test-owner@example.com",
    });

    const { accessToken: allManagerToken } = await createAllManagerAndToken();

    const { event, ticketType, order } = await createFreeGuestCheckout({
      accessToken: ownerToken,

      quantity: 1,
    });

    const listResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/event/${event.id}`)
      .set("Authorization", `Bearer ${allManagerToken}`);

    expect(listResponse.status).toBe(200);

    expect(
      getListItems(listResponse.body).some((item) => item.id === order.id),
    ).toBe(true);

    const detailResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/${order.id}`)
      .set("Authorization", `Bearer ${allManagerToken}`);

    expect(detailResponse.status).toBe(200);

    const manualResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/event/${event.id}/manual`)
      .set("Authorization", `Bearer ${allManagerToken}`)
      .send({
        ticketTypeId: ticketType.id,

        quantity: 1,

        email: "manage-all@example.com",

        firstName: "Manage",
        lastName: "All",

        reason: "Global event management",
      });

    expect(manualResponse.status).toBe(201);

    expect(manualResponse.body.data).toMatchObject({
      event: {
        id: event.id,
      },

      buyer: {
        email: "manage-all@example.com",
      },

      source: ORDER_SOURCE.MANUAL,
    });
  });
  it("blocks check-in-only users from internal order management", async () => {
    const { accessToken: ownerToken } = await createOwnManagerAndToken({
      emailSnapshot: "checkin-order-owner@example.com",
    });

    const { accessToken: checkinToken } = await createCheckinStaffAndToken();

    const { event, ticketType } =
      await createPublishedFreeEventWithTicketType(ownerToken);

    const listResponse = await request(internalOrderApp)
      .get(`/api/admin/orders/event/${event.id}`)
      .set("Authorization", `Bearer ${checkinToken}`);

    expect(listResponse.status).toBe(403);

    expect(listResponse.body).toMatchObject({
      success: false,

      error: {
        code: "INSUFFICIENT_EVENT_PERMISSIONS",
      },
    });

    const manualResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/event/${event.id}/manual`)
      .set("Authorization", `Bearer ${checkinToken}`)
      .send({
        ticketTypeId: ticketType.id,

        quantity: 1,

        email: "no-order-access@example.com",

        firstName: "No",

        lastName: "Access",
      });

    expect(manualResponse.status).toBe(403);

    expect(manualResponse.body.error.code).toBe(
      "INSUFFICIENT_EVENT_PERMISSIONS",
    );
  });
  it("cancels and refunds a paid order through the internal HTTP endpoint", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-refund-owner@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      paymentProviderPaymentId: "pay_sql_http_refund_123",
    });

    const response = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "Refund through HTTP",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "completed",

        amount: 5000,
      },
    });

    expect(response.body.meta.refundExecution).toMatchObject({
      skipped: false,

      failed: false,

      reason: null,

      alreadyRefundedDepositAmount: 0,

      remainingRefundAmount: 5000,

      providerRefundId: "refund_sql_internal_http_123",
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
    expect(sendOrderCancelledMailMock).not.toHaveBeenCalled();

    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_sql_http_refund_123",

        amount: "50.00",

        currency: "EUR",

        idempotencyKey: `order-refund:${String(order.id)}`,

        metadata: expect.objectContaining({
          source: "admin_order_refund",

          orderId: String(order.id),

          eventId: String(event.id),

          orderTotal: 5000,

          alreadyRefundedDepositAmount: 0,

          remainingRefundAmount: 5000,
        }),
      }),
    );

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: "completed",

      refundedAmount: 5000,

      cancellationReason: "Refund through HTTP",

      refundReason: "Refund through HTTP",

      paymentProviderRefundId: "refund_sql_internal_http_123",
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("refunds an order through HTTP after it was previously cancelled without refund", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-delayed-refund@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      paymentProviderPaymentId: "pay_sql_http_delayed_refund_123",
    });

    /*
     * Zuerst bewusst ohne Refund stornieren.
     */
    const cancelResponse = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "Cancelled first",
      });

    expect(cancelResponse.status).toBe(200);
    expect(sendOrderCancelledMailMock).toHaveBeenCalledTimes(1);

    const afterCancel = await findOrderById(order.id, {
      lean: true,
    });

    expect(afterCancel).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",

      cancellationReason: "Cancelled first",
    });

    const ticketTypeAfterCancel = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterCancel.stockSold).toBe(0);

    /*
     * Erst danach Refund.
     */
    const refundResponse = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "Refund approved later",
      });

    expect(refundResponse.status).toBe(200);

    expect(refundResponse.body.data).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,
      },

      refund: {
        status: "completed",

        amount: 5000,
      },

      /*
       * Der spätere Refund darf den ursprünglichen
       * Cancellation-Grund nicht überschreiben.
       */
      cancellationReason: "Cancelled first",
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
    expect(sendOrderCancelledMailMock).toHaveBeenCalledTimes(1);

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      cancellationReason: "Cancelled first",

      refundReason: "Refund approved later",

      refundStatus: "completed",

      refundedAmount: 5000,
    });

    /*
     * Kein zweites Stock-Release.
     */
    const ticketTypeAfterRefund = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterRefund.stockSold).toBe(0);
  });
  it("blocks manage-own users from refunding foreign orders through HTTP", async () => {
    const { eventUser: owner } = await createOwnManagerAndToken({
      emailSnapshot: "http-refund-event-owner@example.com",
    });

    const { accessToken: foreignToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-refund-foreign@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: owner.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const response = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set("Authorization", `Bearer ${foreignToken}`)
      .send({
        reason: "Must not refund",
      });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "ORDER_MANAGE_FORBIDDEN",
      },
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",
    });
  });
  it("rejects an empty internal order refund reason", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-refund-validation@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const response = await request(internalOrderApp)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "   ",
      });

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "VALIDATION_FAILED",

        fields: [
          expect.objectContaining({
            path: "body.reason",

            field: "reason",
          }),
        ],
      },
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder.status).toBe(ORDER_STATUS.CONFIRMED);
  });
  it("cancels a paid order through the internal HTTP endpoint without refunding it", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-cancel-owner@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,
    });

    const response = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "Cancelled through HTTP",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,
      },
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();
    expect(sendOrderCancelledMailMock).toHaveBeenCalledTimes(1);

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      cancellationReason: "Cancelled through HTTP",

      refundStatus: "none",

      refundedAmount: 0,
    });

    const storedTickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      storedTickets.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("blocks manage-own users from cancelling foreign orders through HTTP", async () => {
    const { eventUser: owner } = await createOwnManagerAndToken({
      emailSnapshot: "http-cancel-event-owner@example.com",
    });

    const { accessToken: foreignToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-cancel-foreign@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: owner.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const response = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${foreignToken}`)
      .send({
        reason: "Must not be allowed",
      });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "ORDER_MANAGE_FORBIDDEN",
      },
    });

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder.status).toBe(ORDER_STATUS.CONFIRMED);
  });

  it("blocks check-in-only users from cancelling orders through HTTP", async () => {
    const { eventUser: owner } = await createOwnManagerAndToken({
      emailSnapshot: "http-checkin-owner@example.com",
    });

    const { accessToken: checkinToken } = await createCheckinStaffAndToken({
      emailSnapshot: "http-checkin-only@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: owner.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const response = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${checkinToken}`)
      .send({
        reason: "Must not be allowed",
      });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "INSUFFICIENT_EVENT_PERMISSIONS",
      },
    });
  });
  it("rejects an empty internal order cancellation reason", async () => {
    const { eventUser, accessToken } = await createOwnManagerAndToken({
      emailSnapshot: "http-cancel-validation@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const response = await request(internalOrderApp)
      .patch(`/api/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "   ",
      });

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "VALIDATION_FAILED",
      },
    });

    expect(response.body.error.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "body.reason",

          field: "reason",
        }),
      ]),
    );

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder.status).toBe(ORDER_STATUS.CONFIRMED);
  });
  it("allows manage-own users to cancel a paid SQL order without refunding it", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,
    });

    const result = await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "Cancelled by organizer",
    });

    expect(result.order).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,
      },
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      cancellationReason: "Cancelled by organizer",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("lists and reads tickets created by free guest checkout via internal API", async () => {
    const { accessToken } = await createAdminAndToken();

    const { event, ticketType, order } = await createFreeGuestCheckout({
      accessToken,
      quantity: 2,
    });

    const listResponse = await request(ticketApp)
      .get(`/api/admin/tickets/event/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);

    expect(listResponse.body.success).toBe(true);

    const tickets = getListItems(listResponse.body);

    expect(tickets).toHaveLength(2);

    for (const listedTicket of tickets) {
      expect(listedTicket).toMatchObject({
        orderId: order.id,

        buyer: {
          type: ORDER_BUYER_TYPE.GUEST,

          email: "guest@example.com",

          firstName: "Guest",

          lastName: "Buyer",

          displayName: "Guest Buyer",
        },

        holder: {
          type: "buyer",

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

        document: {
          available: false,

          generatedAt: null,
        },
      });

      expect(listedTicket.id).toBeTypeOf("string");

      expect(listedTicket.createdAt).toBeTypeOf("string");

      expect(listedTicket.updatedAt).toBeTypeOf("string");
    }

    expect(listResponse.body.meta).toEqual({
      event: {
        id: event.id,

        title: event.title,

        status: EVENT_STATUSES.PUBLISHED,
      },

      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
      },

      summary: {
        total: 2,
        active: 2,
        checkedIn: 0,
        cancelled: 0,
        refunded: 0,
      },
    });

    expect(listResponse.body.pagination).toBeUndefined();

    expect(listResponse.body.summary).toBeUndefined();

    expect(listResponse.body.event).toBeUndefined();

    const serializedTicketList = JSON.stringify(listResponse.body);

    for (const field of [
      "_id",
      "__v",

      "buyerEmailSnapshot",
      "holderEmailSnapshot",
      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "ticketPdfStorageKey",

      "metadata",
    ]) {
      expect(serializedTicketList).not.toContain(`"${field}"`);
    }

    const ticket = tickets[0];

    const detailResponse = await request(ticketApp)
      .get(`/api/admin/tickets/${ticket.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(detailResponse.status).toBe(200);

    expect(detailResponse.body.success).toBe(true);

    expect(detailResponse.body.data).toEqual(ticket);

    expect(detailResponse.body.event).toBeUndefined();

    expect(detailResponse.body.ticketType).toBeUndefined();

    expect(detailResponse.body.data).toMatchObject({
      id: ticket.id,

      orderId: order.id,

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

      document: {
        available: false,

        generatedAt: null,
      },
    });

    const serializedTicketDetail = JSON.stringify(detailResponse.body.data);

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

      "checkInTokenHash",
      "encryptedCheckInToken",
      "ticketPdfStorageKey",

      "metadata",
    ]) {
      expect(serializedTicketDetail).not.toContain(`"${field}"`);
    }
  });
  it("blocks manage-own users from cancelling SQL orders of foreign events", async () => {
    const { eventUser: owner } = await createOwnManagerAndToken({
      emailSnapshot: "sql-cancel-owner@example.com",
    });

    const { eventUser: foreignManager } = await createOwnManagerAndToken({
      emailSnapshot: "sql-cancel-foreign@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: owner.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    await expect(
      cancelInternalOrderService({
        actor: buildInternalActor(foreignManager),

        orderId: order.id,

        reason: "Must not be allowed",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",
    });

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder.status).toBe(ORDER_STATUS.CONFIRMED);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(1);
  });
  it("allows manage-all users to cancel SQL orders of foreign events", async () => {
    const { eventUser: owner } = await createOwnManagerAndToken({
      emailSnapshot: "sql-all-owner@example.com",
    });

    const { eventUser: allManager } = await createAllManagerAndToken({
      emailSnapshot: "sql-all-manager@example.com",
    });

    const event = await createSqlManagedEvent({
      ownerId: owner.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,
    });

    const result = await cancelInternalOrderService({
      actor: buildInternalActor(allManager),

      orderId: order.id,

      reason: "Cancelled globally",
    });

    expect(result.order.status).toBe(ORDER_STATUS.CANCELLED);

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      cancellationReason: "Cancelled globally",
    });
  });
  it("keeps repeated SQL internal order cancellation idempotent without releasing stock twice", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,
    });

    await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "First cancellation",
    });

    const firstTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(firstTicketType.stockSold).toBe(0);

    await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "Second cancellation",
    });

    const secondTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(secondTicketType.stockSold).toBe(0);

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "First cancellation",

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();
  });
  it("cancels a free SQL internal order without attempting a payment operation", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
      isFree: true,
    });

    const ticketType = await createSqlManagedTicketType(event, {
      pricingMode: "free",
      priceGross: 0,
    });

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 0,

      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

      paymentProviderPaymentId: null,
    });

    const result = await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "Free order cancelled",
    });

    expect(result.order).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },
    });

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

      cancellationReason: "Free order cancelled",

      refundStatus: "none",

      refundedAmount: 0,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("terminates and cancels a pending SQL internal order without refunding it", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_sql_internal_cancel_123",

      createTickets: false,
    });

    const result = await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "Pending order cancelled",
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(cancelPaymentSessionMock).toHaveBeenCalledWith({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_internal_cancel_123",
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    expect(result.order).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },
    });

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      /*
       * Darf beim SQL-Cancel nicht verloren gehen.
       */
      paymentProviderPaymentId: "pay_sql_internal_cancel_123",

      cancellationReason: "Pending order cancelled",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("rejects cancellation of an already expired SQL order without touching stock", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      status: ORDER_STATUS.EXPIRED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_sql_expired_123",

      createTickets: false,
    });

    /*
     * Der Helper reserviert zunächst Stock.
     * Hier simulieren wir einen bereits vollständig
     * ausgeführten Expiry-Flow, der diesen Stock
     * schon freigegeben hat.
     */
    await releaseTicketTypeStock({
      ticketTypeId: ticketType.id,

      eventId: event.id,

      quantity: 2,

      updatedByEventUserId: null,
    });

    const beforeCancellation = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(beforeCancellation.stockSold).toBe(0);

    await expect(
      cancelInternalOrderService({
        actor: buildInternalActor(eventUser),

        orderId: order.id,

        reason: "Must not cancel expired order",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "ORDER_CANCELLATION_NOT_ALLOWED",

      details: expect.objectContaining({
        reason: "order_expired",

        status: ORDER_STATUS.EXPIRED,
      }),
    });

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.EXPIRED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
    });

    const afterCancellation = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    /*
     * Wichtig:
     * kein zweites Stock-Release.
     */
    expect(afterCancellation.stockSold).toBe(0);
  });
  it("still cancels a pending SQL internal order when provider cancellation fails", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_sql_provider_failure_123",

      createTickets: false,
    });

    cancelPaymentSessionMock.mockRejectedValueOnce(
      new Error("Payment provider unavailable"),
    );

    const result = await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "Cancelled despite provider failure",
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(cancelPaymentSessionMock).toHaveBeenCalledWith({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_provider_failure_123",
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    expect(result.order).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },
    });

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_sql_provider_failure_123",

      cancellationReason: "Cancelled despite provider failure",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("cancels a pending SQL internal order without refund when the provider reports it became paid during cancellation", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_sql_paid_race_123",

      createTickets: false,
    });

    cancelPaymentSessionMock.mockResolvedValueOnce({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_paid_race_123",

      status: "paid",

      rawStatus: "paid",

      terminated: false,

      terminal: true,

      paid: true,
    });

    const result = await cancelInternalOrderService({
      actor: buildInternalActor(eventUser),

      orderId: order.id,

      reason: "Organizer cancelled without refund",
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    /*
     * Ganz wichtig:
     * Der Admin hat nur CANCEL gewählt.
     * Das inzwischen erfolgreiche Payment
     * löst hier deshalb keinen Refund aus.
     */
    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    expect(result.order).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },
    });

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_sql_paid_race_123",

      cancellationReason: "Organizer cancelled without refund",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("rejects SQL internal order cancellation when any ticket is already checked in", async () => {
    const { eventUser } = await createOwnManagerAndToken();

    const event = await createSqlManagedEvent({
      ownerId: eventUser.id,
    });

    const ticketType = await createSqlManagedTicketType(event);

    const { order, tickets } = await createSqlManagedOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    await updateTicketById(tickets[0].id, {
      status: TICKET_STATUS.CHECKED_IN,

      checkedInAt: new Date(),
    });

    await expect(
      cancelInternalOrderService({
        actor: buildInternalActor(eventUser),

        orderId: order.id,

        reason: "Must not cancel checked-in order",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "ORDER_CANCELLATION_NOT_ALLOWED",

      details: expect.objectContaining({
        reason: "ticket_already_checked_in",

        status: ORDER_STATUS.CONFIRMED,
      }),
    });

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const storedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",

      refundedAmount: 0,
    });

    const storedTickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      storedTickets.some(
        (ticket) => ticket.status === TICKET_STATUS.CHECKED_IN,
      ),
    ).toBe(true);

    expect(
      storedTickets.some((ticket) => ticket.status === TICKET_STATUS.ACTIVE),
    ).toBe(true);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(2);
  });
  it("sets and clears internal ticket check-in for a SQL ticket", async () => {
    const { accessToken } = await createAdminAndToken();

    const { event } = await createFreeGuestCheckout({
      accessToken,
      quantity: 1,
    });

    const listResponse = await request(ticketApp)
      .get(`/api/admin/tickets/event/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);

    const [ticket] = getListItems(listResponse.body);

    expect(ticket).toBeTruthy();

    const checkInResponse = await request(ticketApp)
      .patch(`/api/admin/tickets/${ticket.id}/check-in`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        checkedIn: true,
      });

    expect(checkInResponse.status).toBe(200);

    expect(checkInResponse.body.success).toBe(true);

    expect(checkInResponse.body.data).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),
      },
    });

    expect(checkInResponse.body.meta).toEqual({
      checkIn: {
        requestedCheckedIn: true,

        statusChanged: true,
      },
    });

    expect(checkInResponse.body.event).toBeUndefined();

    expect(checkInResponse.body.ticketType).toBeUndefined();

    expect(checkInResponse.body.checkIn).toBeUndefined();

    expect(checkInResponse.body.refund).toBeUndefined();

    expect(checkInResponse.body.message).toBeUndefined();

    const checkOutResponse = await request(ticketApp)
      .patch(`/api/admin/tickets/${ticket.id}/check-in`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        checkedIn: false,
      });

    expect(checkOutResponse.status).toBe(200);

    expect(checkOutResponse.body.success).toBe(true);

    expect(checkOutResponse.body.data).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.ACTIVE,

      checkIn: {
        checkedInAt: null,

        checkedInByEventUserId: null,
      },
    });

    expect(checkOutResponse.body.meta).toEqual({
      checkIn: {
        requestedCheckedIn: false,

        statusChanged: true,
      },
    });
  });
  it("looks up and confirms a ticket check-in by ticket code", async () => {
    const { accessToken } = await createAdminAndToken();

    const { event } = await createFreeGuestCheckout({
      accessToken,
      quantity: 1,
    });

    const listResponse = await request(ticketApp)
      .get(`/api/admin/tickets/event/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);

    const [ticket] = getListItems(listResponse.body);

    expect(ticket).toBeTruthy();

    expect(ticket.ticketCode).toMatch(
      /^TKT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/,
    );

    /*
     * Absichtlich kleingeschrieben:
     * Die Validation muss den Code normalisieren.
     */
    const lookupResponse = await request(ticketApp)
      .post("/api/admin/tickets/check-in/lookup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ticketCode: ticket.ticketCode.toLowerCase(),
      });

    expect(lookupResponse.status).toBe(200);

    expect(lookupResponse.body.success).toBe(true);

    expect(lookupResponse.body.data).toMatchObject({
      id: ticket.id,

      ticketCode: ticket.ticketCode,

      status: TICKET_STATUS.ACTIVE,

      checkIn: {
        checkedInAt: null,

        checkedInByEventUserId: null,
      },
    });

    expect(lookupResponse.body.meta).toEqual({
      checkIn: {
        allowed: true,

        state: TICKET_CHECK_IN_STATE.ALLOWED,
      },
    });

    expect(lookupResponse.body.event).toBeUndefined();

    expect(lookupResponse.body.allowed).toBeUndefined();

    expect(lookupResponse.body.state).toBeUndefined();

    expect(lookupResponse.body.message).toBeUndefined();

    const serializedLookup = JSON.stringify(lookupResponse.body);

    for (const field of [
      "_id",
      "__v",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "checkInPayloadVersion",
      "checkInTokenCreatedAt",
      "checkInTokenRotatedAt",
      "checkInTokenLastUsedAt",

      "ticketPdfStorageKey",

      "metadata",
    ]) {
      expect(serializedLookup).not.toContain(`"${field}"`);
    }

    const confirmResponse = await request(ticketApp)
      .post("/api/admin/tickets/check-in/confirm")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ticketCode: ticket.ticketCode,
      });

    expect(confirmResponse.status).toBe(200);

    expect(confirmResponse.body.success).toBe(true);

    expect(confirmResponse.body.data).toMatchObject({
      id: ticket.id,

      ticketCode: ticket.ticketCode,

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),
      },
    });

    expect(confirmResponse.body.meta).toEqual({
      checkIn: {
        requestedCheckedIn: true,

        statusChanged: true,
      },
    });

    expect(confirmResponse.body.message).toBeUndefined();

    /*
     * Derselbe Confirm ist idempotent.
     * Er darf nicht wieder auschecken.
     */
    const replayResponse = await request(ticketApp)
      .post("/api/admin/tickets/check-in/confirm")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ticketCode: ticket.ticketCode,
      });

    expect(replayResponse.status).toBe(200);

    expect(replayResponse.body.data).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: confirmResponse.body.data.checkIn.checkedInAt,
      },
    });

    expect(replayResponse.body.meta).toEqual({
      checkIn: {
        requestedCheckedIn: true,

        statusChanged: false,
      },
    });

    /*
     * Lookup nach dem Confirm zeigt
     * den bereits eingecheckten Zustand.
     */
    const checkedInLookupResponse = await request(ticketApp)
      .post("/api/admin/tickets/check-in/lookup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ticketCode: ticket.ticketCode,
      });

    expect(checkedInLookupResponse.status).toBe(200);

    expect(checkedInLookupResponse.body.data).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CHECKED_IN,
    });

    expect(checkedInLookupResponse.body.meta).toEqual({
      checkIn: {
        allowed: false,

        state: TICKET_CHECK_IN_STATE.ALREADY_CHECKED_IN,
      },
    });
  });
  it("rejects invalid ticket codes before lookup or confirmation", async () => {
    const { accessToken } = await createAdminAndToken();

    for (const path of [
      "/api/admin/tickets/check-in/lookup",
      "/api/admin/tickets/check-in/confirm",
    ]) {
      const response = await request(ticketApp)
        .post(path)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          ticketCode: "invalid-ticket-code",
        });

      expect(response.status).toBe(400);

      expect(response.body).toMatchObject({
        success: false,

        error: {
          code: "VALIDATION_FAILED",

          message: "Please fix the highlighted fields.",

          fields: [
            {
              path: "body.ticketCode",

              field: "ticketCode",

              message: "Ticket code is invalid.",
            },
          ],
        },
      });
    }
  });
  it("requires a ticket code for lookup and confirmation", async () => {
    const { accessToken } = await createAdminAndToken();

    for (const path of [
      "/api/admin/tickets/check-in/lookup",
      "/api/admin/tickets/check-in/confirm",
    ]) {
      const response = await request(ticketApp)
        .post(path)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({});

      expect(response.status).toBe(400);

      expect(response.body.success).toBe(false);

      expect(response.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "ticketCode",
          }),
        ]),
      );
    }
  });
  it("cancels an internal ticket for a SQL ticket", async () => {
    const { accessToken } = await createAdminAndToken();
    const { event } = await createFreeGuestCheckout({
      accessToken,
      quantity: 1,
    });

    const listResponse = await request(ticketApp)
      .get(`/api/admin/tickets/event/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);

    const [ticket] = getListItems(listResponse.body);
    expect(ticket).toBeTruthy();

    const cancelResponse = await request(ticketApp)
      .patch(`/api/admin/tickets/${ticket.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "SQL integration test cancellation",
      });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.success).toBe(true);
    expect(cancelResponse.body.data).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CANCELLED,

      cancellation: {
        cancelledAt: expect.any(String),

        reason: "SQL integration test cancellation",
      },
    });

    expect(cancelResponse.body.meta).toEqual({
      cancellation: {
        statusChanged: true,
      },
    });

    expect(cancelResponse.body.event).toBeUndefined();

    expect(cancelResponse.body.ticketType).toBeUndefined();

    expect(cancelResponse.body.cancellation).toBeUndefined();

    expect(cancelResponse.body.message).toBeUndefined();
  });

  it("rejects internal orders and tickets without admin token", async () => {
    const orderResponse = await request(internalOrderApp).get(
      "/api/admin/orders/event/some-event-id",
    );

    expect(orderResponse.status).toBe(401);

    const ticketResponse = await request(ticketApp).get(
      "/api/admin/tickets/event/some-event-id",
    );

    expect(ticketResponse.status).toBe(401);
  });
});
