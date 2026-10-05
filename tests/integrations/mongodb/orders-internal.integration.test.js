import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";
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
let Event;
let TicketType;
let Order;
let Ticket;

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;

let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;
let TICKET_TYPE_PRICING_MODE;
let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;
let ORDER_SOURCE;

let TICKET_STATUS;

let EVENT_USER_ROLES;

let generateTicketsForOrderService;
let listEventOrdersInternalService;
let getInternalOrderByIdService;
let createManualOrderForEventService;
let cancelInternalOrderService;
let updateInternalOrderBuyerService;
let deleteObjectMock;

async function loadOrdersInternalIntegrationModules({
  ticketing = true,
  guestCheckout = true,
  depositTickets = false,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
} = {}) {
  vi.resetModules();

  deleteObjectMock = vi.fn().mockResolvedValue({ success: true });

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
        depositTickets,
        ticketPdf,
        ticketQr,
        mail,
      },
      payments: {
        provider: "mollie",
        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",
          webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    withDatabaseTransaction: async (callback) => callback({}),
  }));

  vi.doMock("../../../src/config/features.js", () => {
    const mockedFeatures = {
      ticketing,
      guestCheckout,
      depositTickets,
      ticketPdf,
      ticketQr,
      mail,
    };

    return {
      features: mockedFeatures,
      isFeatureEnabled: (featureName) => Boolean(mockedFeatures[featureName]),
    };
  });

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    deleteObject: deleteObjectMock,
  }));

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),

    cancelPaymentSession: cancelPaymentSessionMock,

    createPaymentRefund: createPaymentRefundMock,
  }));

  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderCancelledMailSafe: sendOrderCancelledMailMock,
    sendOrderConfirmedMailSafe: sendOrderConfirmedMailMock,
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: vi.fn().mockResolvedValue({
      skipped: true,
      reason: "ticket_pdf_disabled_in_test",
    }),
    buildOfficialTicketAttachment: vi.fn().mockResolvedValue(null),
  }));

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

  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");
  const orderInternalServiceModule =
    await import("../../../src/modules/orders/internal/order.internal.service.js");

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
  ORDER_SOURCE = orderConstantsModule.ORDER_SOURCE;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;

  listEventOrdersInternalService =
    orderInternalServiceModule.listEventOrdersInternalService;
  getInternalOrderByIdService =
    orderInternalServiceModule.getInternalOrderByIdService;
  createManualOrderForEventService =
    orderInternalServiceModule.createManualOrderForEventService;
  cancelInternalOrderService =
    orderInternalServiceModule.cancelInternalOrderService;
  updateInternalOrderBuyerService =
    orderInternalServiceModule.updateInternalOrderBuyerService;
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

const OWNER_EVENT_USER_ID = "6a0000000000000000000001";

const FOREIGN_EVENT_USER_ID = "6a0000000000000000000009";

function buildInternalActor({
  eventUserId = OWNER_EVENT_USER_ID,
  role = EVENT_USER_ROLES.EVENT_MANAGER,
} = {}) {
  return {
    eventUserId,

    eventUser: {
      id: eventUserId,
      role,
      isActive: true,
    },
  };
}

function buildOwnManagerActor() {
  return buildInternalActor({
    eventUserId: OWNER_EVENT_USER_ID,
    role: EVENT_USER_ROLES.EVENT_MANAGER,
  });
}

function buildAllManagerActor() {
  return buildInternalActor({
    eventUserId: FOREIGN_EVENT_USER_ID,
    role: EVENT_USER_ROLES.EVENT_ADMIN,
  });
}

function buildCheckinOnlyActor() {
  return buildInternalActor({
    eventUserId: FOREIGN_EVENT_USER_ID,
    role: EVENT_USER_ROLES.CHECKIN_STAFF,
  });
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Internal Orders Event",
    slug: `internal-orders-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "Internal orders integration event",
    description: "Created by internal orders integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildFutureSession()],
    isFree: false,
    publishedAt: new Date(),
    createdByEventUserId: OWNER_EVENT_USER_ID,
    ...overrides,
  });
}

async function createTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Internal Ticket`,
    displayName: "Internal Ticket",
    description: "Internal order test ticket",
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

async function createOrderWithTickets({
  event,
  ticketType,
  quantity = 1,
  buyerType = ORDER_BUYER_TYPE.EXTERNAL_USER,
  externalProvider = "dummy",
  externalUserId = "host-customer-1",
  email = "kunde@example.com",
  firstName = "Max",
  lastName = "Kunde",
  status = ORDER_STATUS.CONFIRMED,
  paymentStatus = ORDER_PAYMENT_STATUS.PAID,
  totalPrice = 2500,
  createTickets = true,
  guestAccessTokenHash = null,
  guestAccessTokenExpiresAt = null,
} = {}) {
  const order = await Order.create({
    orderNumber: `ORD-INTERNAL-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

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

    eventId: event._id,
    eventTitleSnapshot: event.title,
    eventSlugSnapshot: event.slug,
    eventCategorySnapshot: event.category,
    eventLocationSnapshot: event.location,
    eventStartsAtSnapshot: event.sessions[0].startAt,

    items: [
      {
        ticketTypeId: ticketType._id,
        eventId: event._id,
        quantity,
        unitPrice: quantity > 0 ? totalPrice / quantity : totalPrice,
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
    paymentProvider:
      totalPrice > 0
        ? ORDER_PAYMENT_PROVIDER.MOLLIE
        : ORDER_PAYMENT_PROVIDER.NONE,
    paymentProviderPaymentId: totalPrice > 0 ? "pay_internal_123" : null,
    paymentCheckoutUrl: null,

    guestAccessTokenHash,
    guestAccessTokenExpiresAt,

    source: ORDER_SOURCE.PUBLIC,
    confirmedAt: status === ORDER_STATUS.CONFIRMED ? new Date() : null,
    expiresAt:
      status === ORDER_STATUS.PENDING ? new Date(Date.now() + 900000) : null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,
  });

  await TicketType.findByIdAndUpdate(ticketType._id, {
    $inc: {
      stockSold: quantity,
    },
  });

  let tickets = [];

  if (createTickets) {
    tickets = await generateTicketsForOrderService(order._id, {
      createdByEventUserId: null,
      updatedByEventUserId: null,
    });
  }

  return {
    order,
    tickets,
  };
}

describe("Internal orders MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadOrdersInternalIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    cancelPaymentSessionMock.mockReset();

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
    createPaymentRefundMock.mockReset();

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
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("lists guest and external orders for an event", async () => {
    const event = await createPublishedEvent();

    const paidTicketType = await createTicketType(event);

    const freeTicketType = await createTicketType(event, {
      name: `${event.title} - Free Internal Ticket`,
      displayName: "Free Internal Ticket",
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,
    });

    await createOrderWithTickets({
      event,
      ticketType: paidTicketType,
      buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
      externalUserId: "host-customer-1",
      email: "external@example.com",
      firstName: "External",
      lastName: "Buyer",
    });

    await createOrderWithTickets({
      event,
      ticketType: freeTicketType,
      totalPrice: 0,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "Buyer",
      totalPrice: 0,
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    });

    const result = await listEventOrdersInternalService({
      actor: buildOwnManagerActor(),
      eventId: event._id,
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(2);
    for (const order of result.items) {
      expect(order.id).toEqual(expect.any(String));
      expect(order._id).toBeUndefined();
      expect(order.__v).toBeUndefined();
    }
    expect(result.meta).toEqual({
      event: {
        id: String(event._id),

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
      },
    });

    expect(result.items.map((order) => order.buyer.email).sort()).toEqual([
      "external@example.com",
      "guest@example.com",
    ]);

    expect(result.pagination).toBeUndefined();
    expect(result.summary).toBeUndefined();
    expect(result.event).toBeUndefined();
  });

  it("filters internal orders by order status and payment status", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    await createOrderWithTickets({
      event,
      ticketType,
      email: "confirmed@example.com",
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    await createOrderWithTickets({
      event,
      ticketType,
      email: "pending@example.com",
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      createTickets: false,
    });

    const confirmedResult = await listEventOrdersInternalService({
      actor: buildOwnManagerActor(),
      eventId: event._id,
      status: ORDER_STATUS.CONFIRMED,
      page: 1,
      limit: 20,
    });

    expect(confirmedResult.items).toHaveLength(1);
    expect(confirmedResult.items[0].buyer.email).toBe("confirmed@example.com");

    const pendingPaymentResult = await listEventOrdersInternalService({
      actor: buildOwnManagerActor(),
      eventId: event._id,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      page: 1,
      limit: 20,
    });

    expect(pendingPaymentResult.items).toHaveLength(1);
    expect(pendingPaymentResult.items[0].buyer.email).toBe(
      "pending@example.com",
    );
  });

  it("searches internal orders by buyer email and order number", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const first = await createOrderWithTickets({
      event,
      ticketType,
      email: "search-me@example.com",
      firstName: "Search",
      lastName: "Me",
    });

    await createOrderWithTickets({
      event,
      ticketType,
      email: "other@example.com",
      firstName: "Other",
      lastName: "Buyer",
    });

    const emailResult = await listEventOrdersInternalService({
      actor: buildOwnManagerActor(),
      eventId: event._id,
      search: "search-me@example.com",
      page: 1,
      limit: 20,
    });

    expect(emailResult.items).toHaveLength(1);
    expect(emailResult.items[0].buyer.email).toBe("search-me@example.com");

    const orderNumberResult = await listEventOrdersInternalService({
      actor: buildOwnManagerActor(),
      eventId: event._id,
      search: first.order.orderNumber,
      page: 1,
      limit: 20,
    });

    expect(orderNumberResult.items).toHaveLength(1);
    expect(orderNumberResult.items[0].id).toBe(String(first.order._id));

    expect(orderNumberResult.items[0]._id).toBeUndefined();
    expect(orderNumberResult.items[0].__v).toBeUndefined();
  });

  it("returns an internal order by id with event, tickets and summary", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      email: "details@example.com",
      totalPrice: 5000,
    });

    const result = await getInternalOrderByIdService({
      actor: buildOwnManagerActor(),
      orderId: order._id,
    });

    expect(result.order).toMatchObject({
      id: String(order._id),

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "details@example.com",

        firstName: "Max",

        lastName: "Kunde",

        displayName: "Max Kunde",

        externalIdentity: {
          provider: "dummy",

          userId: "host-customer-1",
        },
      },

      event: {
        id: String(event._id),

        title: event.title,

        slug: event.slug,

        category: event.category,
      },

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      source: ORDER_SOURCE.PUBLIC,
    });

    expect(result.order.tickets).toHaveLength(2);

    expect(result.order.tickets.map((ticket) => ticket.id).sort()).toEqual(
      tickets.map((ticket) => ticket.id).sort(),
    );

    for (const ticket of result.order.tickets) {
      expect(ticket.id).toEqual(expect.any(String));

      expect(ticket.orderId).toBe(String(order._id));

      expect(ticket.event.id).toBe(String(event._id));

      expect(ticket._id).toBeUndefined();
      expect(ticket.__v).toBeUndefined();
    }

    expect(result.meta).toEqual({
      summary: {
        ticketsCount: 2,

        totalPrice: 5000,

        currency: "EUR",
      },

      actions: {
        editBuyer: {
          allowed: false,
          reason: "buyer_not_guest",
        },

        cancel: {
          allowed: true,
          reason: null,
        },

        refund: {
          allowed: true,
          reason: null,
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

    expect(result.event).toBeUndefined();
    expect(result.tickets).toBeUndefined();
    expect(result.summary).toBeUndefined();

    expect(result.order._id).toBeUndefined();
    expect(result.order.__v).toBeUndefined();
  });

  it("updates guest buyer snapshots across order and tickets without rotating ticket credentials", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const guestAccessTokenHash = "guest-access-hash-before-change";
    const guestAccessTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      externalProvider: null,
      externalUserId: null,
      email: "old@example.com",
      firstName: "Old",
      lastName: "Buyer",
      guestAccessTokenHash,
      guestAccessTokenExpiresAt,
    });

    const ticket = tickets[0];

    await Ticket.findByIdAndUpdate(ticket.id, {
      $set: {
        checkInTokenHash: "check-in-hash-before-change",
        encryptedCheckInToken: "encrypted-check-in-token-before-change",
        ticketPdfStorageKey: "tickets/original.pdf",
        ticketPdfStorageTarget: "private",
        ticketPdfGeneratedAt: new Date(),
      },
    });

    const beforeTicket = await Ticket.findById(ticket.id)
      .select("+checkInTokenHash +encryptedCheckInToken")
      .lean();

    const result = await updateInternalOrderBuyerService({
      actor: buildOwnManagerActor(),
      orderId: order._id,
      payload: {
        firstName: "New",
        lastName: "Name",
        email: "NEW@example.com",
      },
    });

    expect(result.order.buyer).toMatchObject({
      type: ORDER_BUYER_TYPE.GUEST,
      email: "new@example.com",
      firstName: "New",
      lastName: "Name",
      displayName: "New Name",
      externalIdentity: null,
    });

    expect(result.meta.actions.editBuyer).toEqual({
      allowed: true,
      reason: null,
    });

    const orderInDb = await Order.findById(order._id)
      .select("+guestAccessTokenHash")
      .lean();

    expect(orderInDb).toMatchObject({
      buyerEmailSnapshot: "new@example.com",
      buyerFirstNameSnapshot: "New",
      buyerLastNameSnapshot: "Name",
      buyerDisplayNameSnapshot: "New Name",
      guestAccessTokenHash: null,
      guestAccessTokenExpiresAt: null,
    });

    const ticketInDb = await Ticket.findById(ticket.id)
      .select("+checkInTokenHash +encryptedCheckInToken")
      .lean();

    expect(ticketInDb).toMatchObject({
      buyerEmailSnapshot: "new@example.com",
      buyerFirstNameSnapshot: "New",
      buyerLastNameSnapshot: "Name",
      buyerDisplayNameSnapshot: "New Name",

      holderType: "buyer",
      holderEmailSnapshot: "new@example.com",
      holderFirstNameSnapshot: "New",
      holderLastNameSnapshot: "Name",
      holderDisplayNameSnapshot: "New Name",

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
      key: "tickets/original.pdf",
      storageTarget: "private",
    });
  });

  it("keeps the guest access token when only the guest name changes", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const guestAccessTokenHash = "guest-access-hash-name-only";
    const guestAccessTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      externalProvider: null,
      externalUserId: null,
      email: "same@example.com",
      firstName: "Old",
      lastName: "Name",
      guestAccessTokenHash,
      guestAccessTokenExpiresAt,
    });

    await updateInternalOrderBuyerService({
      actor: buildOwnManagerActor(),
      orderId: order._id,
      payload: {
        firstName: "New",
        lastName: "Name",
        email: "same@example.com",
      },
    });

    const orderInDb = await Order.findById(order._id)
      .select("+guestAccessTokenHash")
      .lean();

    expect(orderInDb.guestAccessTokenHash).toBe(guestAccessTokenHash);

    expect(new Date(orderInDb.guestAccessTokenExpiresAt).getTime()).toBe(
      guestAccessTokenExpiresAt.getTime(),
    );
  });

  it("blocks buyer editing for external-user orders", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    });

    await expect(
      updateInternalOrderBuyerService({
        actor: buildOwnManagerActor(),
        orderId: order._id,
        payload: {
          firstName: "Changed",
          lastName: "Buyer",
          email: "changed@example.com",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "ORDER_BUYER_UPDATE_NOT_ALLOWED",
      details: expect.objectContaining({
        reason: "buyer_not_guest",
      }),
    });
  });

  it("blocks buyer editing after any ticket has been checked in", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      externalProvider: null,
      externalUserId: null,
      email: "checked@example.com",
    });

    await Ticket.findByIdAndUpdate(tickets[0].id, {
      $set: {
        status: TICKET_STATUS.CHECKED_IN,
        checkedInAt: new Date(),
      },
    });

    await expect(
      updateInternalOrderBuyerService({
        actor: buildOwnManagerActor(),
        orderId: order._id,
        payload: {
          firstName: "Changed",
          lastName: "Buyer",
          email: "changed@example.com",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "ORDER_BUYER_UPDATE_NOT_ALLOWED",
      details: expect.objectContaining({
        reason: "ticket_already_checked_in",
      }),
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb.buyerEmailSnapshot).toBe("checked@example.com");
  });

  it("blocks manage-own users from editing buyers of foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      externalProvider: null,
      externalUserId: null,
    });

    await expect(
      updateInternalOrderBuyerService({
        actor: buildOwnManagerActor(),
        orderId: order._id,
        payload: {
          firstName: "Changed",
          lastName: "Buyer",
          email: "changed@example.com",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ORDER_MANAGE_FORBIDDEN",
    });
  });

  it("allows manage-all users to edit guest buyers of foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      externalProvider: null,
      externalUserId: null,
      email: "foreign@example.com",
    });

    const result = await updateInternalOrderBuyerService({
      actor: buildAllManagerActor(),
      orderId: order._id,
      payload: {
        firstName: "Admin",
        lastName: "Changed",
        email: "admin.changed@example.com",
      },
    });

    expect(result.order.buyer).toMatchObject({
      email: "admin.changed@example.com",
      firstName: "Admin",
      lastName: "Changed",
      displayName: "Admin Changed",
    });
  });

  it("blocks check-in-only users from reading event orders", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    await createOrderWithTickets({
      event,
      ticketType,
    });

    await expect(
      listEventOrdersInternalService({
        actor: buildCheckinOnlyActor(),

        eventId: event._id,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",

      message: "You do not have permission to manage orders for this event.",
    });
  });

  it("blocks manage-own users from reading orders of foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
    });

    await expect(
      listEventOrdersInternalService({
        actor: buildOwnManagerActor(),

        eventId: event._id,

        page: 1,

        limit: 20,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",
    });

    await expect(
      getInternalOrderByIdService({
        actor: buildOwnManagerActor(),

        orderId: order._id,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",
    });
  });

  it("allows manage-all users to read orders of foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
    });

    const listResult = await listEventOrdersInternalService({
      actor: buildAllManagerActor(),

      eventId: event._id,

      page: 1,

      limit: 20,
    });

    expect(listResult.items).toHaveLength(1);

    expect(listResult.items[0].id).toBe(String(order._id));

    const detailResult = await getInternalOrderByIdService({
      actor: buildAllManagerActor(),

      orderId: order._id,
    });

    expect(detailResult.order.id).toBe(String(order._id));

    expect(detailResult.order.event.id).toBe(String(event._id));
  });

  it("creates a canonical manual order, reserves stock and creates tickets", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event, {
      stockTotal: 10,

      stockSold: 0,

      priceGross: 2500,
    });

    const result = await createManualOrderForEventService({
      actor: buildOwnManagerActor(),

      eventId: event._id,

      payload: {
        email: "manual@example.com",

        firstName: "Manual",

        lastName: "Buyer",

        reason: "Manual assignment by admin",

        items: [
          {
            ticketTypeId: ticketType._id,

            quantity: 2,
          },
        ],
      },
    });

    expect(result.data).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.MANUAL,

        email: "manual@example.com",

        firstName: "Manual",

        lastName: "Buyer",

        displayName: "Manual Buyer",

        externalIdentity: null,
      },

      event: {
        id: String(event._id),

        title: event.title,
      },

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      source: ORDER_SOURCE.MANUAL,

      manualAssignmentReason: "Manual assignment by admin",

      audit: {
        createdByEventUserId: "6a0000000000000000000001",

        updatedByEventUserId: "6a0000000000000000000001",
      },
    });

    expect(result.data.tickets).toHaveLength(2);

    expect(sendOrderConfirmedMailMock).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmedMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        order: expect.objectContaining({
          id: result.data.id,
          source: ORDER_SOURCE.MANUAL,
        }),
        context: {
          eventUserId: "6a0000000000000000000001",
        },
      }),
    );

    expect(
      result.data.tickets.every(
        (ticket) => ticket.status === TICKET_STATUS.ACTIVE,
      ),
    ).toBe(true);

    expect(result.meta).toEqual({
      summary: {
        ticketsCount: 2,

        totalPrice: 5000,

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

    expect(result.order).toBeUndefined();

    expect(result.buyer).toBeUndefined();

    expect(result.tickets).toBeUndefined();

    expect(result.documents).toBeUndefined();

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(2);

    const orderInDb = await Order.findById(result.data.id).lean();

    expect(orderInDb).toMatchObject({
      source: ORDER_SOURCE.MANUAL,

      totalPrice: 5000,
    });

    const ticketsInDb = await Ticket.find({
      orderId: result.data.id,
    }).lean();

    expect(ticketsInDb).toHaveLength(2);

    const serialized = JSON.stringify(result);

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

  it("blocks check-in-only users from creating manual orders", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    await expect(
      createManualOrderForEventService({
        actor: buildCheckinOnlyActor(),

        eventId: event._id,

        payload: {
          email: "manual-checkin@example.com",

          firstName: "Checkin",

          lastName: "Only",

          reason: "Must not be allowed",

          items: [
            {
              ticketTypeId: ticketType._id,

              quantity: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",

      message: "You do not have permission to manage orders for this event.",
    });
  });
  it("allows a manage-own user to cancel a paid order without refunding it", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event, {
      stockTotal: 10,
      stockSold: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    const result = await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "Cancelled by organizer",
    });

    expect(result.order).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      cancellationReason: "Cancelled by organizer",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(ticketsInDb).toHaveLength(2);

    expect(
      ticketsInDb.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);

    expect(sendOrderCancelledMailMock).toHaveBeenCalledTimes(1);
    expect(sendOrderCancelledMailMock).toHaveBeenCalledWith({
      order: expect.objectContaining({
        status: ORDER_STATUS.CANCELLED,
        cancellationReason: "Cancelled by organizer",
      }),
      context: {
        eventUserId: OWNER_EVENT_USER_ID,
      },
    });
  });
  it("blocks manage-own users from cancelling orders of foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
    });

    await expect(
      cancelInternalOrderService({
        actor: buildOwnManagerActor(),

        orderId: order._id,

        reason: "Must not be allowed",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsInDb.every((ticket) => ticket.status === TICKET_STATUS.ACTIVE),
    ).toBe(true);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(1);
  });
  it("allows manage-all users to cancel orders of foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
    });

    const result = await cancelInternalOrderService({
      actor: buildAllManagerActor(),

      orderId: order._id,

      reason: "Cancelled globally",
    });

    expect(result.order).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,
      },
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      cancellationReason: "Cancelled globally",
    });

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsInDb.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("keeps repeated internal order cancellation idempotent without releasing stock twice", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event, {
      stockTotal: 10,
      stockSold: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
    });

    await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "First cancellation",
    });

    const afterFirstCancellation = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(afterFirstCancellation.stockSold).toBe(0);

    /*
     * Zweiter identischer fachlicher Command.
     *
     * Es darf insbesondere KEIN zweites
     * Stock-Release geben.
     */
    const secondResult = await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "Second cancellation",
    });

    expect(secondResult.order.status).toBe(ORDER_STATUS.CANCELLED);

    const afterSecondCancellation = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(afterSecondCancellation.stockSold).toBe(0);

    const orderInDb = await Order.findById(order._id).lean();

    /*
     * Ein idempotenter Retry darf die ursprüngliche
     * Cancellation-Historie nicht überschreiben.
     */
    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "First cancellation",

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",
    });

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsInDb.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    expect(sendOrderCancelledMailMock).toHaveBeenCalledTimes(1);
  });
  it("cancels a free internal order without attempting a payment operation", async () => {
    const event = await createPublishedEvent({
      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 0,

      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    });

    const result = await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "Free order cancelled",
    });

    expect(result.order).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

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

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

      cancellationReason: "Free order cancelled",

      refundStatus: "none",

      refundedAmount: 0,
    });

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(ticketsInDb).toHaveLength(2);

    expect(
      ticketsInDb.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("terminates and cancels a pending internal order without refunding it", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      /*
       * Pending Checkout hat noch keine
       * ausgestellten Tickets.
       */
      createTickets: false,
    });

    const result = await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "Pending order cancelled",
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(cancelPaymentSessionMock).toHaveBeenCalledWith({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_internal_123",
    });

    expect(result.order).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",
        amount: 0,
        refundedAt: null,
      },
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      /*
       * Besonders wichtig:
       * Provider-ID bleibt für Audit /
       * Late-Payment-Erkennung erhalten.
       */
      paymentProviderPaymentId: "pay_internal_123",

      cancellationReason: "Pending order cancelled",

      refundStatus: "none",

      refundedAmount: 0,
    });

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("rejects cancellation of an already expired order without touching stock", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      status: ORDER_STATUS.EXPIRED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      createTickets: false,
    });

    /*
     * Simuliert den bereits vollständig
     * ausgeführten Expiry-Flow:
     * Stock wurde schon freigegeben.
     */
    await TicketType.findByIdAndUpdate(ticketType._id, {
      $set: {
        stockSold: 0,
      },
    });

    await expect(
      cancelInternalOrderService({
        actor: buildOwnManagerActor(),

        orderId: order._id,

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

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.EXPIRED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
    });

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("still cancels a pending internal order when provider cancellation fails", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      createTickets: false,
    });

    cancelPaymentSessionMock.mockRejectedValueOnce(
      new Error("Payment provider unavailable"),
    );

    const result = await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "Cancelled despite provider failure",
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    expect(result.order).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_internal_123",

      cancellationReason: "Cancelled despite provider failure",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("blocks manage-own users from creating manual orders for foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,
    });

    const ticketType = await createTicketType(event);

    await expect(
      createManualOrderForEventService({
        actor: buildOwnManagerActor(),

        eventId: event._id,

        payload: {
          email: "manual-foreign@example.com",

          firstName: "Foreign",

          lastName: "Buyer",

          reason: "Must not be allowed",

          items: [
            {
              ticketTypeId: ticketType._id,

              quantity: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,

      code: "ORDER_MANAGE_FORBIDDEN",
    });

    expect(await Order.countDocuments()).toBe(0);

    expect(await Ticket.countDocuments()).toBe(0);
  });
  it("cancels a pending internal order without refund when the provider reports it became paid during cancellation", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      createTickets: false,
    });

    cancelPaymentSessionMock.mockResolvedValueOnce({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_internal_123",

      status: "paid",
      rawStatus: "paid",

      terminated: false,
      terminal: true,
      paid: true,
    });

    const result = await cancelInternalOrderService({
      actor: buildOwnManagerActor(),

      orderId: order._id,

      reason: "Organizer cancelled without refund",
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    /*
     * DAS ist der entscheidende Unterschied
     * zum Customer-Cancel:
     *
     * Der Admin hat nur "cancel" gewählt.
     * Also wird trotz inzwischen erfolgter
     * Zahlung kein Refund automatisch gestartet.
     */
    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    expect(result.order).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

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

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      /*
       * Zahlung ist wirklich eingegangen.
       * Deshalb darf sie NICHT auf FAILED
       * gesetzt werden.
       */
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      paymentProviderPaymentId: "pay_internal_123",

      cancellationReason: "Organizer cancelled without refund",

      refundStatus: "none",

      refundedAmount: 0,

      paymentProviderRefundId: null,
    });

    /*
     * Keine Tickets wurden für die Pending-Order
     * ausgestellt.
     */
    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);

    /*
     * Die Reservierung wird durch den Admin-Cancel
     * trotzdem genau einmal freigegeben.
     */
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("rejects internal order cancellation when any ticket is already checked in", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event, {
      stockTotal: 10,
      stockSold: 0,
    });

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      totalPrice: 5000,

      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    await Ticket.findByIdAndUpdate(tickets[0].id, {
      $set: {
        status: TICKET_STATUS.CHECKED_IN,

        checkedInAt: new Date(),
      },
    });

    await expect(
      cancelInternalOrderService({
        actor: buildOwnManagerActor(),

        orderId: order._id,

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

    const storedOrder = await Order.findById(order._id).lean();

    expect(storedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",

      refundedAmount: 0,
    });

    const storedTickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      storedTickets.some(
        (ticket) => ticket.status === TICKET_STATUS.CHECKED_IN,
      ),
    ).toBe(true);

    expect(
      storedTickets.some((ticket) => ticket.status === TICKET_STATUS.ACTIVE),
    ).toBe(true);

    const storedTicketType = await TicketType.findById(ticketType._id).lean();

    /*
     * Kein Cancel bedeutet auch:
     * kein Stock-Release.
     */
    expect(storedTicketType.stockSold).toBe(2);
  });
  it("allows manage-all users to create manual orders for foreign events", async () => {
    const event = await createPublishedEvent({
      createdByEventUserId: FOREIGN_EVENT_USER_ID,

      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,

      stockTotal: 10,

      stockSold: 0,
    });

    const result = await createManualOrderForEventService({
      actor: buildAllManagerActor(),

      eventId: event._id,

      payload: {
        email: "manual-all@example.com",

        firstName: "Manage",

        lastName: "All",

        reason: "Global event management",

        items: [
          {
            ticketTypeId: ticketType._id,

            quantity: 1,
          },
        ],
      },
    });

    expect(result.data).toMatchObject({
      event: {
        id: String(event._id),
      },

      buyer: {
        email: "manual-all@example.com",
      },

      source: ORDER_SOURCE.MANUAL,

      status: ORDER_STATUS.CONFIRMED,
    });

    expect(result.data.tickets).toHaveLength(1);
  });
  it("rejects manual orders for inactive ticket types", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event, {
      status: TICKET_TYPE_STATUS.INACTIVE,
      stockTotal: 10,
      stockSold: 0,
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,
    });

    await expect(
      createManualOrderForEventService({
        actor: buildOwnManagerActor(),
        eventId: event._id,
        payload: {
          email: "manual-inactive@example.com",
          firstName: "Manual",
          lastName: "Inactive",
          reason: "Should be blocked",
          items: [
            {
              ticketTypeId: ticketType._id,
              quantity: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    const ordersInDb = await Order.find({}).lean();
    const ticketsInDb = await Ticket.find({}).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ordersInDb).toHaveLength(0);
    expect(ticketsInDb).toHaveLength(0);
    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("rejects manual orders when stock is insufficient", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event, {
      status: TICKET_TYPE_STATUS.ACTIVE,
      stockTotal: 1,
      stockSold: 0,
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,
      minPerOrder: 1,
      maxPerOrder: 5,
    });

    await expect(
      createManualOrderForEventService({
        actor: buildOwnManagerActor(),
        eventId: event._id,
        payload: {
          email: "manual-stock@example.com",
          firstName: "Manual",
          lastName: "Stock",
          reason: "Should be blocked",
          items: [
            {
              ticketTypeId: ticketType._id,
              quantity: 2,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/bestand|stock|verfügbar|available/i),
    });

    const ordersInDb = await Order.find({}).lean();
    const ticketsInDb = await Ticket.find({}).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ordersInDb).toHaveLength(0);
    expect(ticketsInDb).toHaveLength(0);
    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("rejects manual orders when quantity exceeds maxPerOrder", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event, {
      status: TICKET_TYPE_STATUS.ACTIVE,
      stockTotal: 10,
      stockSold: 0,
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,
      minPerOrder: 1,
      maxPerOrder: 2,
    });

    await expect(
      createManualOrderForEventService({
        actor: buildOwnManagerActor(),
        eventId: event._id,
        payload: {
          email: "manual-max@example.com",
          firstName: "Manual",
          lastName: "Max",
          reason: "Should be blocked",
          items: [
            {
              ticketTypeId: ticketType._id,
              quantity: 3,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    const ordersInDb = await Order.find({}).lean();
    const ticketsInDb = await Ticket.find({}).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ordersInDb).toHaveLength(0);
    expect(ticketsInDb).toHaveLength(0);
    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("rejects manual orders for missing ticket types", async () => {
    const event = await createPublishedEvent();

    await expect(
      createManualOrderForEventService({
        actor: buildOwnManagerActor(),
        eventId: event._id,
        payload: {
          email: "manual-missing-ticket-type@example.com",
          firstName: "Manual",
          lastName: "Missing",
          reason: "Should be blocked",
          items: [
            {
              ticketTypeId: "6a0000000000000000000999",
              quantity: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const ordersInDb = await Order.find({}).lean();
    const ticketsInDb = await Ticket.find({}).lean();

    expect(ordersInDb).toHaveLength(0);
    expect(ticketsInDb).toHaveLength(0);
  });
  it("creates a confirmed free manual order with canonical buyer and tickets", async () => {
    const event = await createPublishedEvent({
      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      status: TICKET_TYPE_STATUS.ACTIVE,

      stockTotal: 10,

      stockSold: 0,
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,

      minPerOrder: 1,

      maxPerOrder: 5,
    });

    const result = await createManualOrderForEventService({
      actor: buildOwnManagerActor(),

      eventId: event._id,

      payload: {
        email: "manual-free@example.com",

        firstName: "Manual",

        lastName: "Free",

        reason: "Free manual assignment",

        items: [
          {
            ticketTypeId: ticketType._id,

            quantity: 2,
          },
        ],
      },
    });

    expect(result.data).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.MANUAL,

        email: "manual-free@example.com",

        firstName: "Manual",

        lastName: "Free",

        displayName: "Manual Free",

        externalIdentity: null,
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

      source: ORDER_SOURCE.MANUAL,

      manualAssignmentReason: "Free manual assignment",
    });

    expect(result.data.tickets).toHaveLength(2);

    expect(sendOrderConfirmedMailMock).toHaveBeenCalledTimes(1);

    expect(result.meta).toEqual({
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

    const orderInDb = await Order.findById(result.data.id).lean();

    const ticketsInDb = await Ticket.find({
      orderId: result.data.id,
    }).lean();

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(orderInDb).toMatchObject({
      buyerEmailSnapshot: "manual-free@example.com",

      totalPrice: 0,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      source: ORDER_SOURCE.MANUAL,
    });

    expect(ticketsInDb).toHaveLength(2);

    expect(ticketsInDb.map((ticket) => ticket.holderEmailSnapshot)).toEqual([
      "manual-free@example.com",
      "manual-free@example.com",
    ]);

    expect(ticketTypeInDb.stockSold).toBe(2);

    expect(ticketTypeInDb.stockReserved || 0).toBe(0);
  });
  it("creates distinct orders for repeated manual allocation commands", async () => {
    const event = await createPublishedEvent({
      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,

      stockTotal: 10,

      stockSold: 0,
    });

    const input = {
      actor: buildOwnManagerActor(),

      eventId: event._id,

      payload: {
        email: "manual-repeat@example.com",

        firstName: "Manual",

        lastName: "Repeat",

        reason: "Repeated explicit allocation",

        items: [
          {
            ticketTypeId: ticketType._id,

            quantity: 1,
          },
        ],
      },
    };

    const first = await createManualOrderForEventService(input);

    const second = await createManualOrderForEventService(input);

    expect(first.data.id).not.toBe(second.data.id);

    expect(first.data.orderNumber).not.toBe(second.data.orderNumber);

    expect(first.data.tickets[0].id).not.toBe(second.data.tickets[0].id);

    const ordersInDb = await Order.find({}).lean();

    const ticketsInDb = await Ticket.find({}).lean();

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ordersInDb).toHaveLength(2);

    expect(ticketsInDb).toHaveLength(2);

    expect(ticketTypeInDb.stockSold).toBe(2);
  });
  it("creates a confirmed manual donation order with the selected donation amount", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event, {
      displayName: "Donation Ticket",
      pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
      priceGross: 0,
      stockTotal: 10,
      stockSold: 0,
    });

    const result = await createManualOrderForEventService({
      actor: buildOwnManagerActor(),
      eventId: event._id,
      payload: {
        email: "manual-donation@example.com",
        firstName: "Manual",
        lastName: "Donation",
        reason: "Donation manual assignment",
        items: [
          {
            ticketTypeId: ticketType._id,
            quantity: 2,
            donationAmountGross: 1500,
          },
        ],
      },
    });

    expect(result.data).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.MANUAL,
        email: "manual-donation@example.com",
      },

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

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      source: ORDER_SOURCE.MANUAL,
    });

    expect(result.data.tickets).toHaveLength(2);

    const orderInDb = await Order.findById(result.data.id).lean();

    expect(orderInDb).toMatchObject({
      totalPrice: 3000,
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,
    });

    expect(orderInDb.items[0]).toMatchObject({
      pricingModeSnapshot: TICKET_TYPE_PRICING_MODE.DONATION,
      unitPrice: 1500,
      lineTotal: 3000,
    });

    expect(await Ticket.countDocuments({ orderId: orderInDb._id })).toBe(2);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(2);
  });
  it("rejects deposit tickets in manual orders", async () => {
    await loadOrdersInternalIntegrationModules({
      depositTickets: true,
    });

    await clearMongoTestDb();

    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event, {
      displayName: "Deposit Ticket",
      ticketKind: TICKET_TYPE_KIND.DEPOSIT,
      pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
      priceGross: 2500,
      stockTotal: 10,
      stockSold: 0,
    });

    await expect(
      createManualOrderForEventService({
        actor: buildOwnManagerActor(),
        eventId: event._id,
        payload: {
          email: "manual-deposit@example.com",
          firstName: "Manual",
          lastName: "Deposit",
          reason: "Must be rejected",
          items: [
            {
              ticketTypeId: ticketType._id,
              quantity: 1,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "MANUAL_DEPOSIT_TICKET_NOT_ALLOWED",
    });

    expect(await Order.countDocuments()).toBe(0);
    expect(await Ticket.countDocuments()).toBe(0);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);

    await loadOrdersInternalIntegrationModules();
  });
});
