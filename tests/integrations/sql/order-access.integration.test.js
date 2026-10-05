import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_JWT_SECRET = "integration-local-jwt-secret";
const TEST_EXTERNAL_JWT_SECRET = "integration-external-jwt-secret";
const HOST_SERVICE_PROVIDER = "demo-system";
const HOST_SERVICE_ID = "kiwi-events-demo-host";

const {
  cancelPaymentSessionMock,
  createProviderRefundMock,
  sendRefundCompletedMailMock,
} = vi.hoisted(() => ({
  cancelPaymentSessionMock: vi.fn(),
  createProviderRefundMock: vi.fn(),
  sendRefundCompletedMailMock: vi.fn(),
}));

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEvent;
let createTicketType;
let reserveTicketTypeStock;
let findTicketTypeById;

let createOrder;
let findOrderById;

let findTicketsByOrderId;
let generateTicketsForOrderService;

let listOwnOrdersService;
let getOwnOrderByIdService;
let cancelOwnOrderService;
let getGuestOrderByAccessTokenService;

let cancelGuestOrderByAccessTokenService;

let issueGuestAccessForOrderService;
let reissueGuestAccessService;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;
let ORDER_REFUND_STATUS;

let PAYMENT_REFUND_SOURCE_TYPE;
let PAYMENT_REFUND_STATUS;

let findPaymentRefundByIdempotencyKey;

let createPaymentRefundRecord;
let getDatabaseConnection;

let TICKET_STATUS;

async function loadOrderAccessSqlIntegrationModules() {
  vi.resetModules();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: TEST_JWT_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
      },
      payments: {
        provider: "mollie",
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
  vi.doMock(
    "../../../src/config/kiwi-events/kiwi-events.config.store.js",
    async (importOriginal) => {
      const actual = await importOriginal();

      return {
        ...actual,

        loadKiwiEventsConfig: (...args) => {
          const config = actual.loadKiwiEventsConfig(...args);

          return {
            ...config,

            orders: {
              ...(config.orders || {}),

              customerSelfServiceCancellation: {
                enabled: true,

                refundDeadlineDaysBeforeSession: null,
              },
            },
          };
        },
      };
    },
  );

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

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),

    cancelPaymentSession: cancelPaymentSessionMock,

    createPaymentRefund: createProviderRefundMock,
  }));

  vi.doMock(
    "../../../src/modules/paymentRefunds/paymentRefund.mail.service.js",
    () => ({
      sendPaymentRefundCompletedMailSafe: sendRefundCompletedMailMock,
    }),
  );

  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderConfirmedMailSafe: vi.fn().mockResolvedValue({
      success: false,
      skipped: true,
      reason: "mail_disabled_in_test",
    }),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: vi.fn().mockResolvedValue({
      skipped: true,
      reason: "ticket_pdf_disabled_in_test",
    }),
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

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");
  const orderPublicServiceModule =
    await import("../../../src/modules/orders/public/order.public.service.js");
  const guestAccessServiceModule =
    await import("../../../src/modules/orders/order.guestAccess.service.js");
  const guestAccessRecoveryServiceModule =
    await import("../../../src/modules/orders/order.guestAccessRecovery.service.js");
  const paymentRefundConstantsModule =
    await import("../../../src/modules/paymentRefunds/paymentRefund.constants.js");

  const paymentRefundRepositoryModule =
    await import("../../../src/modules/paymentRefunds/repositories/paymentRefund.repository.js");

  const databaseServiceModule =
    await import("../../../src/modules/database/database.service.js");

  createEvent = eventRepositoryModule.createEvent;

  createTicketType = ticketTypeRepositoryModule.createTicketType;
  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;
  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  createOrder = orderRepositoryModule.createOrder;
  findOrderById = orderRepositoryModule.findOrderById;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;

  listOwnOrdersService = orderPublicServiceModule.listOwnOrdersService;
  getOwnOrderByIdService = orderPublicServiceModule.getOwnOrderByIdService;
  cancelOwnOrderService = orderPublicServiceModule.cancelOwnOrderService;
  getGuestOrderByAccessTokenService =
    orderPublicServiceModule.getGuestOrderByAccessTokenService;
  cancelGuestOrderByAccessTokenService =
    orderPublicServiceModule.cancelGuestOrderByAccessTokenService;
  issueGuestAccessForOrderService =
    guestAccessServiceModule.issueGuestAccessForOrderService;

  reissueGuestAccessService =
    guestAccessRecoveryServiceModule.reissueGuestAccessService;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;
  ORDER_REFUND_STATUS = orderConstantsModule.ORDER_REFUND_STATUS;

  PAYMENT_REFUND_SOURCE_TYPE =
    paymentRefundConstantsModule.PAYMENT_REFUND_SOURCE_TYPE;

  PAYMENT_REFUND_STATUS = paymentRefundConstantsModule.PAYMENT_REFUND_STATUS;

  findPaymentRefundByIdempotencyKey =
    paymentRefundRepositoryModule.findPaymentRefundByIdempotencyKey;

  createPaymentRefundRecord = paymentRefundRepositoryModule.createPaymentRefund;

  getDatabaseConnection = databaseServiceModule.getDatabaseConnection;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;
}

function buildFutureSession() {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt,
    endAt,
    timezone: "Europe/Vienna",
    locationLabel: "Audimax",
    locationDetails: "Room 1",
    capacity: 100,
    status: "scheduled",
  };
}

function buildExternalActor(overrides = {}) {
  return {
    externalProvider: "dummy",
    externalUserId: "host-customer-1",
    email: "kunde@example.com",
    rawClaims: {
      firstName: "Max",
      lastName: "Kunde",
    },
    ...overrides,
  };
}
function buildHostServiceActor(overrides = {}) {
  return {
    externalProvider: HOST_SERVICE_PROVIDER,
    externalUserId: null,

    isHostService: true,
    tokenType: "host-service",
    hostServiceId: HOST_SERVICE_ID,

    email: null,

    rawClaims: {
      sub: HOST_SERVICE_ID,
    },

    ...overrides,
  };
}
async function createPublishedEvent(overrides = {}) {
  return createEvent({
    title: "SQL Order Access Event",
    slug: `sql-order-access-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL order access integration event",
    description: "Created by SQL order access integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["sql", "order-access"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    notesInternal: "Created by SQL order access integration test",
    ...overrides,
  });
}

async function createAccessTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,
    name: `${event.title} - Access Ticket`,
    displayName: "SQL Access Ticket",
    description: "SQL order access test ticket",
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

async function createOrderWithTickets({
  event,
  ticketType,
  quantity = 1,
  buyerType = ORDER_BUYER_TYPE.EXTERNAL_USER,
  externalProvider = "dummy",
  hostServiceProvider = null,
  hostServiceId = null,
  externalUserId = "host-customer-1",
  email = "kunde@example.com",
  firstName = "Max",
  lastName = "Kunde",
  totalPrice = 2500,
  status = ORDER_STATUS.CONFIRMED,
  paymentStatus = ORDER_PAYMENT_STATUS.PAID,
  paymentProvider = totalPrice > 0
    ? ORDER_PAYMENT_PROVIDER.MOLLIE
    : ORDER_PAYMENT_PROVIDER.NONE,
  paymentProviderPaymentId = totalPrice > 0 ? "pay_sql_order_access_123" : null,
  createTickets = true,
} = {}) {
  const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;

  const order = await createOrder({
    orderNumber: `ORD-SQL-ACCESS-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    hostServiceProvider,
    hostServiceId,
    buyerType,
    buyerExternalProvider:
      buyerType === ORDER_BUYER_TYPE.EXTERNAL_USER ? externalProvider : null,
    buyerExternalUserId:
      buyerType === ORDER_BUYER_TYPE.EXTERNAL_USER ? externalUserId : null,
    buyerEmailSnapshot: email,
    buyerFirstNameSnapshot: firstName,
    buyerLastNameSnapshot: lastName,
    buyerDisplayNameSnapshot: [firstName, lastName].filter(Boolean).join(" "),
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

    source: "public",
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

async function createGuestOrderWithAccess({ quantity = 2 } = {}) {
  const event = await createPublishedEvent({
    title: "SQL Guest Access Event",
    slug: `sql-guest-access-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    isFree: true,
  });

  const ticketType = await createAccessTicketType(event, {
    displayName: "SQL Guest Access Ticket",
    priceGross: 0,
  });

  const { order, tickets } = await createOrderWithTickets({
    event,
    ticketType,
    quantity,

    buyerType: ORDER_BUYER_TYPE.GUEST,

    externalProvider: null,
    externalUserId: null,

    hostServiceProvider: HOST_SERVICE_PROVIDER,
    hostServiceId: HOST_SERVICE_ID,

    email: "guest@example.com",
    firstName: "Guest",
    lastName: "Tester",

    totalPrice: 0,

    paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,
    paymentProviderPaymentId: null,

    createTickets: true,
  });

  const issued = await issueGuestAccessForOrderService(order);

  return {
    event,
    ticketType,
    order: issued.order,
    tickets,
    accessToken: issued.guestAccess.token,
  };
}

describe("Order access SQL integration", () => {
  beforeAll(async () => {
    await loadOrderAccessSqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    cancelPaymentSessionMock.mockReset();
    cancelPaymentSessionMock.mockImplementation(
      async ({ provider, providerPaymentId }) => ({
        provider: provider || "mollie",
        providerPaymentId,
        status: "canceled",
        rawStatus: "canceled",
        terminated: true,
        terminal: true,
        paid: false,
      }),
    );

    createProviderRefundMock.mockReset();
    createProviderRefundMock.mockImplementation(
      async ({ provider, providerPaymentId }) => ({
        provider,
        providerPaymentId,
        providerRefundId: `refund_${providerPaymentId}`,
        status: "refunded",
      }),
    );

    sendRefundCompletedMailMock.mockReset();
    sendRefundCompletedMailMock.mockResolvedValue({
      skipped: false,
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a guest order and tickets using the public DTO contracts and tracks access usage", async () => {
    const { event, ticketType, order, tickets, accessToken } =
      await createGuestOrderWithAccess({
        quantity: 2,
      });

    const result = await getGuestOrderByAccessTokenService({
      orderId: order.id,

      accessToken,
    });

    expect(Object.keys(result).sort()).toEqual([
      "cancellation",
      "order",
      "tickets",
    ]);
    expect(result.cancellation).toMatchObject({
      allowed: true,

      reason: null,
    });

    expect(result.order).toMatchObject({
      id: order.id,

      orderNumber: order.orderNumber,

      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "guest@example.com",

        firstName: "Guest",

        lastName: "Tester",

        displayName: "Guest Tester",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: event.location,
      },

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

    expect(result.tickets).toHaveLength(2);

    expect(result.tickets.map((ticket) => ticket.id).sort()).toEqual(
      tickets.map((ticket) => ticket.id).sort(),
    );

    for (const ticket of result.tickets) {
      expect(ticket).toMatchObject({
        orderId: order.id,

        buyer: {
          type: ORDER_BUYER_TYPE.GUEST,

          email: "guest@example.com",

          firstName: "Guest",

          lastName: "Tester",

          displayName: "Guest Tester",
        },

        holder: {
          type: "buyer",

          email: "guest@example.com",

          firstName: "Guest",

          lastName: "Tester",

          displayName: "Guest Tester",
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

        depositRefund: {
          status: "not_required",

          amount: 0,

          currency: "EUR",

          triggeredAt: null,
        },
      });
    }

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",

      "guestAccessTokenHash",
      "guestAccessTokenExpiresAt",
      "guestAccessLastUsedAt",
      "guestAccessDownloadCount",

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
      "paymentCheckoutUrl",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "ticketPdfStorageKey",

      "fulfillmentStatus",
      "fulfillmentLeaseToken",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb.guestAccessDownloadCount).toBe(1);

    expect(orderInDb.guestAccessLastUsedAt).toBeTruthy();
  });

  it("rejects guest order access with an invalid token", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      getGuestOrderByAccessTokenService({
        orderId: order.id,
        accessToken: "invalid-token",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Invalid guest access token.",
    });
  });
  it("reissues guest access, rotates the token and invalidates the previous token", async () => {
    const { order, accessToken: previousAccessToken } =
      await createGuestOrderWithAccess({
        quantity: 1,
      });

    const db = getDatabaseConnection();

    const beforeRecovery = await db("orders")
      .where({
        id: order.id,
      })
      .first();

    expect(beforeRecovery.guest_access_token_hash).toBeTruthy();

    const result = await reissueGuestAccessService({
      actor: buildHostServiceActor(),

      orderNumber: order.orderNumber,
      email: "guest@example.com",
    });

    expect(result.order.id).toBe(order.id);

    expect(result.guestAccess).toMatchObject({
      orderId: order.id,
      token: expect.any(String),
      expiresAt: expect.any(Date),
    });

    expect(result.guestAccess.token).not.toBe(previousAccessToken);

    const afterRecovery = await db("orders")
      .where({
        id: order.id,
      })
      .first();

    expect(afterRecovery.guest_access_token_hash).toBeTruthy();

    expect(afterRecovery.guest_access_token_hash).not.toBe(
      beforeRecovery.guest_access_token_hash,
    );

    await expect(
      getGuestOrderByAccessTokenService({
        orderId: order.id,
        accessToken: previousAccessToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "INVALID_GUEST_ACCESS_TOKEN",
    });

    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken: result.guestAccess.token,
    });

    expect(guestResult.order).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
    });
  });
  it("does not reissue guest access when the email does not match", async () => {
    const { order, accessToken } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      reissueGuestAccessService({
        actor: buildHostServiceActor(),

        orderNumber: order.orderNumber,
        email: "wrong@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
    });

    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(guestResult.order.id).toBe(order.id);
  });
  it("does not reissue guest access for a different host service", async () => {
    const { order, accessToken } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      reissueGuestAccessService({
        actor: buildHostServiceActor({
          hostServiceId: "another-host-service",
        }),

        orderNumber: order.orderNumber,
        email: "guest@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
    });

    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(guestResult.order.id).toBe(order.id);
  });
  it("requires a host-service actor for guest access recovery", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      reissueGuestAccessService({
        actor: buildExternalActor(),

        orderNumber: order.orderNumber,
        email: "guest@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "GUEST_ACCESS_RECOVERY_HOST_SERVICE_REQUIRED",
    });
  });
  it("lists only orders owned by the external user using the public order contract", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order: ownOrder } = await createOrderWithTickets({
      event,
      ticketType,
      externalUserId: "host-customer-1",
      email: "kunde@example.com",
      totalPrice: 2500,
    });

    await createOrderWithTickets({
      event,
      ticketType,
      externalUserId: "other-user",
      email: "other@example.com",
      totalPrice: 2500,
    });

    const result = await listOwnOrdersService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),

      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);

    const [listedOrder] = result.items;

    expect(listedOrder).toMatchObject({
      id: ownOrder.id,

      orderNumber: ownOrder.orderNumber,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",

        firstName: "Max",

        lastName: "Kunde",

        displayName: "Max Kunde",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: event.location,
      },

      pricing: {
        currency: "EUR",

        subtotal: 2500,

        total: 2500,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(listedOrder.items).toHaveLength(1);

    expect(listedOrder.items[0]).toMatchObject({
      ticketType: {
        id: ticketType.id,

        displayName: ticketType.displayName,

        description: ticketType.description,

        kind: ticketType.ticketKind,
      },

      quantity: 1,
      unitPrice: 2500,
      lineTotal: 2500,
    });

    expect(listedOrder.event.startsAt).toBeTypeOf("string");

    expect(listedOrder.confirmedAt).toBeTypeOf("string");

    expect(listedOrder.createdAt).toBeTypeOf("string");

    expect(listedOrder.updatedAt).toBeTypeOf("string");

    const serialized = JSON.stringify(listedOrder);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "buyerRawExternalSnapshot",
      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",
      "fulfillmentStatus",
      "fulfillmentLeaseToken",
      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    });
  });
  it("returns an owned order and its tickets using the public DTO contracts", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 2500,
    });

    const result = await getOwnOrderByIdService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),

      orderId: order.id,
    });

    expect(Object.keys(result).sort()).toEqual([
      "cancellation",
      "order",
      "tickets",
    ]);
    expect(result.cancellation).toMatchObject({
      allowed: true,

      action: "refund_confirmed",

      reason: null,
    });

    expect(result.order).toMatchObject({
      id: order.id,

      orderNumber: order.orderNumber,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",

        firstName: "Max",

        lastName: "Kunde",

        displayName: "Max Kunde",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: event.location,
      },

      pricing: {
        currency: "EUR",

        subtotal: 2500,

        total: 2500,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(result.tickets).toHaveLength(1);

    expect(result.tickets[0]).toMatchObject({
      id: tickets[0].id,

      ticketCode: tickets[0].ticketCode,

      orderId: order.id,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",

        firstName: "Max",

        lastName: "Kunde",

        displayName: "Max Kunde",
      },

      holder: {
        type: "buyer",

        email: "kunde@example.com",

        firstName: "Max",

        lastName: "Kunde",

        displayName: "Max Kunde",
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

        unitPrice: 2500,
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

    expect(result.order.createdAt).toBeTypeOf("string");

    expect(result.order.updatedAt).toBeTypeOf("string");

    expect(result.tickets[0].createdAt).toBeTypeOf("string");

    expect(result.tickets[0].updatedAt).toBeTypeOf("string");

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "buyerRawExternalSnapshot",

      "holderExternalProvider",
      "holderExternalUserId",
      "holderEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "checkedInByEventUserId",

      "ticketPdfStorageKey",
      "depositRefundProviderRefundId",

      "fulfillmentStatus",
      "fulfillmentLeaseToken",

      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("does not return another external user's order", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createAccessTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      externalUserId: "other-user",
      email: "other@example.com",
      totalPrice: 2500,
    });

    await expect(
      getOwnOrderByIdService({
        actor: buildExternalActor({
          externalUserId: "host-customer-1",
        }),
        orderId: order.id,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Order not found.",
    });
  });

  it("refunds an own paid confirmed order, cancels tickets and releases stock", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createAccessTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      externalUserId: "host-customer-1",
      email: "kunde@example.com",
      totalPrice: 5000,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),
      orderId: order.id,
      reason: "Customer cannot attend",
    });

    expect(result).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Customer cannot attend",

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",
      },

      event: {
        id: event.id,

        title: event.title,
      },

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.COMPLETED,

        amount: 5000,

        refundedAt: expect.any(String),
      },
    });

    expect(result.cancelledAt).toBeTypeOf("string");

    expect(result.updatedAt).toBeTypeOf("string");

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_sql_order_access_123",

        idempotencyKey: `order-refund:${order.id}`,

        amount: "50.00",

        currency: "EUR",
      }),
    );

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(1);

    const serializedCancelledOrder = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "eventTitleSnapshot",
      "paymentStatus",
      "paymentProviderPaymentId",
      "fulfillmentStatus",
      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serializedCancelledOrder).not.toContain(`"${field}"`);
    }
    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,

      refundedAmount: 5000,

      paymentProviderRefundId: "refund_pay_sql_order_access_123",
    });

    expect(updatedOrder.refundedAt).toBeTruthy();

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${order.id}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,

      sourceId: order.id,

      orderId: order.id,

      ticketId: null,

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_order_access_123",

      amount: 5000,

      currency: "EUR",

      status: PAYMENT_REFUND_STATUS.COMPLETED,

      providerRefundId: "refund_pay_sql_order_access_123",
    });
    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);
    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("cancels an own pending payment without tickets and releases reserved stock", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createAccessTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      externalUserId: "host-customer-1",
      email: "kunde@example.com",
      totalPrice: 5000,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      createTickets: false,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),
      orderId: order.id,
      reason: "Customer changed mind",
    });

    expect(result).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Customer changed mind",

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,

        refundedAt: null,
      },
    });

    expect(result.cancelledAt).toBeTypeOf("string");

    expect(result.expiresAt).toBeTypeOf("string");

    expect(result._id).toBeUndefined();

    expect(result.paymentStatus).toBeUndefined();
    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(cancelPaymentSessionMock).toHaveBeenCalledWith({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_order_access_123",
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      refundedAmount: 0,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("cancels an own confirmed free order without creating a refund", async () => {
    const event = await createPublishedEvent({
      isFree: true,
    });

    const ticketType = await createAccessTicketType(event, {
      pricingMode: "free",
      priceGross: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 0,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

      paymentProviderPaymentId: null,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order.id,

      reason: "Customer cannot attend",
    });

    expect(result).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Customer cannot attend",

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,

        refundedAt: null,
      },
    });

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      refundedAmount: 0,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("refunds only the remaining amount when part of the order was already refunded as a deposit", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    const alreadyRefundedTicket = tickets[0];

    await createPaymentRefundRecord({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,

      sourceId: alreadyRefundedTicket.id,

      orderId: order.id,

      ticketId: alreadyRefundedTicket.id,

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_order_access_123",

      providerRefundId: "refund_existing_deposit",

      amount: 2500,

      currency: "EUR",

      idempotencyKey: `deposit-refund:${alreadyRefundedTicket.id}`,

      status: PAYMENT_REFUND_STATUS.COMPLETED,

      providerSucceededAt: new Date(),

      completedAt: new Date(),

      triggeredByEventUserId: null,

      metadata: {
        source: "customer_cancellation_test",
      },
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order.id,

      reason: "Customer cannot attend",
    });

    expect(result).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,
      },

      refund: {
        status: ORDER_REFUND_STATUS.COMPLETED,

        amount: 5000,
      },
    });

    /*
     * 25 EUR wurden bereits als Deposit
     * refundiert. Nur weitere 25 EUR dürfen
     * an Mollie geschickt werden.
     */
    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_sql_order_access_123",

        amount: "25.00",

        currency: "EUR",

        idempotencyKey: `order-refund:${order.id}`,
      }),
    );

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(1);

    const orderRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${order.id}`,
      {
        lean: true,
      },
    );

    expect(orderRefund).toMatchObject({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,

      amount: 2500,

      status: PAYMENT_REFUND_STATUS.COMPLETED,
    });

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,

      refundedAmount: 5000,
    });

    const updatedTickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      updatedTickets.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("blocks customer cancellation while a deposit refund is unresolved", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    const ticket = tickets[0];

    await createPaymentRefundRecord({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,

      sourceId: ticket.id,

      orderId: order.id,

      ticketId: ticket.id,

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_order_access_123",

      amount: 2500,

      currency: "EUR",

      idempotencyKey: `deposit-refund:${ticket.id}`,

      status: PAYMENT_REFUND_STATUS.PENDING,

      triggeredByEventUserId: null,

      metadata: {
        source: "customer_cancellation_test",
      },
    });

    await expect(
      cancelOwnOrderService({
        actor: buildExternalActor(),

        orderId: order.id,

        reason: "Customer cannot attend",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED",

      details: expect.objectContaining({
        reason: "deposit_refund_incomplete",
      }),
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: ORDER_REFUND_STATUS.NONE,
    });

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(2);

    const ticketsInDb = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsInDb.every(
        (currentTicket) => currentTicket.status === TICKET_STATUS.ACTIVE,
      ),
    ).toBe(true);
  });
  it("blocks customer cancellation when any ticket is already checked in", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    const db = getDatabaseConnection();

    await db("tickets")
      .where({
        id: tickets[0].id,
      })
      .update({
        status: TICKET_STATUS.CHECKED_IN,

        checked_in_at: new Date(),
      });

    await expect(
      cancelOwnOrderService({
        actor: buildExternalActor(),

        orderId: order.id,

        reason: "Customer cannot attend",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED",

      details: expect.objectContaining({
        reason: "ticket_already_checked_in",
      }),
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: ORDER_REFUND_STATUS.NONE,
    });

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(2);

    const ticketsInDb = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsInDb.some((ticket) => ticket.status === TICKET_STATUS.CHECKED_IN),
    ).toBe(true);
  });
  it("refunds a pending order when the provider reports it became paid during cancellation", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      createTickets: false,
    });

    cancelPaymentSessionMock.mockResolvedValueOnce({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_order_access_123",

      status: "paid",
      rawStatus: "paid",

      terminated: false,
      terminal: true,
      paid: true,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order.id,

      reason: "Customer changed mind",
    });

    expect(result).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.COMPLETED,

        amount: 5000,

        refundedAt: expect.any(String),
      },
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_sql_order_access_123",

        amount: "50.00",

        currency: "EUR",

        idempotencyKey: `order-refund:${order.id}`,
      }),
    );

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(1);

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,

      refundedAmount: 5000,

      paymentProviderRefundId: "refund_pay_sql_order_access_123",
    });

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${order.id}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      status: PAYMENT_REFUND_STATUS.COMPLETED,

      amount: 5000,

      providerRefundId: "refund_pay_sql_order_access_123",
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("still cancels a pending order locally when provider cancellation fails", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createAccessTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      createTickets: false,
    });

    cancelPaymentSessionMock.mockRejectedValueOnce(
      new Error("Payment provider unavailable"),
    );

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order.id,

      reason: "Customer changed mind",
    });

    expect(result).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,

        refundedAt: null,
      },
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      refundedAmount: 0,
    });

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${order.id}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toBeNull();

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("allows a guest to cancel an own free order using the guest access token", async () => {
    const { order, ticketType, accessToken } = await createGuestOrderWithAccess(
      {
        quantity: 2,
      },
    );

    const result = await cancelGuestOrderByAccessTokenService({
      orderId: order.id,

      accessToken,

      reason: "Guest cannot attend",
    });

    expect(result).toMatchObject({
      id: order.id,

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Guest cannot attend",

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,
      },
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      guestAccessDownloadCount: 0,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("does not reissue guest access after the guest access window expired", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    const db = getDatabaseConnection();

    const beforeRecovery = await db("orders")
      .where({
        id: order.id,
      })
      .first();

    const expiredEventStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await db("orders")
      .where({
        id: order.id,
      })
      .update({
        event_starts_at_snapshot: expiredEventStart,

        guest_access_token_expires_at: new Date(
          expiredEventStart.getTime() + 24 * 60 * 60 * 1000,
        ),
      });

    await expect(
      reissueGuestAccessService({
        actor: buildHostServiceActor(),

        orderNumber: order.orderNumber,
        email: "guest@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "GUEST_ACCESS_WINDOW_EXPIRED",
    });

    const afterRecovery = await db("orders")
      .where({
        id: order.id,
      })
      .first();

    expect(afterRecovery.guest_access_token_hash).toBe(
      beforeRecovery.guest_access_token_hash,
    );
  });
});
