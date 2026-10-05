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
let findTicketById;

let generateTicketsForOrderService;
let setInternalTicketCheckInService;
let cancelInternalTicketService;
let cancelTicketsForOrderService;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let EVENT_USER_ROLES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let TICKET_STATUS;
let TICKET_KIND;
let TICKET_DEPOSIT_REFUND_STATUS;

let createPaymentRefundMock;

async function loadTicketLifecycleSqlIntegrationModules({
  ticketing = true,
  guestCheckout = true,
  depositTickets = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
} = {}) {
  vi.resetModules();

  createPaymentRefundMock = vi.fn().mockResolvedValue({
    providerRefundId: "refund_sql_ticket_lifecycle_123",
    status: "refunded",
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
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

  const TEST_FEATURES = {
    ticketing,
    guestCheckout,
    depositTickets,
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

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
    createPaymentRefund: createPaymentRefundMock,
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
  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");
  const ticketConstantsModule =
    await import("../../../src/modules/tickets/ticket.constants.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");

  createEvent = eventRepositoryModule.createEvent;

  createTicketType = ticketTypeRepositoryModule.createTicketType;
  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;
  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  createOrder = orderRepositoryModule.createOrder;
  findOrderById = orderRepositoryModule.findOrderById;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  findTicketById = ticketRepositoryModule.findTicketById;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;
  setInternalTicketCheckInService =
    ticketServiceModule.setInternalTicketCheckInService;
  cancelInternalTicketService = ticketServiceModule.cancelInternalTicketService;
  cancelTicketsForOrderService =
    ticketServiceModule.cancelTicketsForOrderService;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;
  TICKET_KIND = ticketConstantsModule.TICKET_KIND;
  TICKET_DEPOSIT_REFUND_STATUS =
    ticketConstantsModule.TICKET_DEPOSIT_REFUND_STATUS;
}

function buildInternalActor() {
  return {
    eventUserId: "00000000-0000-4000-8000-000000000001",
    eventUser: {
      id: "00000000-0000-4000-8000-000000000001",
      role: EVENT_USER_ROLES.ADMIN,
      grants: [],
      denies: [],
    },
  };
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

async function createPublishedEvent(overrides = {}) {
  return createEvent({
    title: "SQL Ticket Lifecycle Event",
    slug: `sql-ticket-lifecycle-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL ticket lifecycle integration event",
    description: "Created by SQL ticket lifecycle integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["sql", "ticket-lifecycle"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    createdByEventUserId: buildInternalActor().eventUserId,
    updatedByEventUserId: buildInternalActor().eventUserId,
    notesInternal: "Created by SQL ticket lifecycle integration test",
    ...overrides,
  });
}

async function createLifecycleTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,
    name: `${event.title} - Lifecycle Ticket`,
    displayName: "SQL Lifecycle Ticket",
    description: "SQL ticket lifecycle test ticket",
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
    createdByEventUserId: buildInternalActor().eventUserId,
    updatedByEventUserId: buildInternalActor().eventUserId,
    ...overrides,
  });
}

async function createConfirmedOrderWithTickets({
  quantity = 1,
  ticketKind = TICKET_KIND.NORMAL,
  paymentProviderPaymentId = "pay_sql_ticket_lifecycle_123",
} = {}) {
  const event = await createPublishedEvent();

  const ticketType = await createLifecycleTicketType(event, {
    ticketKind,
    displayName:
      ticketKind === TICKET_KIND.DEPOSIT
        ? "SQL Lifecycle Deposit Ticket"
        : "SQL Lifecycle Ticket",
    pricingMode: "fixed",
    priceGross: 2500,
    stockTotal: 10,
    stockSold: 0,
  });

  const order = await createOrder({
    orderNumber: `ORD-SQL-LIFECYCLE-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    buyerExternalProvider: "dummy",
    buyerExternalUserId: "host-customer-sql-lifecycle-1",
    buyerEmailSnapshot: "sql.lifecycle.customer@example.com",
    buyerFirstNameSnapshot: "SQL",
    buyerLastNameSnapshot: "Lifecycle",
    buyerDisplayNameSnapshot: "SQL Lifecycle",
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
        unitPrice: 2500,
        lineTotal: 2500 * quantity,
        currency: "EUR",
        ticketTypeNameSnapshot: ticketType.displayName,
        ticketTypeDescriptionSnapshot: ticketType.description,
        ticketKindSnapshot: ticketKind,
      },
    ],

    currency: "EUR",
    subtotal: 2500 * quantity,
    totalPrice: 2500 * quantity,

    status: ORDER_STATUS.CONFIRMED,
    paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,
    paymentProviderPaymentId,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: new Date(),
    expiresAt: null,

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

  const tickets = await generateTicketsForOrderService(order.id, {
    createdByEventUserId: null,
    updatedByEventUserId: null,
  });

  return {
    event,
    ticketType,
    order,
    tickets,
  };
}

describe("Ticket lifecycle SQL integration", () => {
  beforeAll(async () => {
    await loadTicketLifecycleSqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
    createPaymentRefundMock?.mockClear();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("checks in an active ticket", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const result = await setInternalTicketCheckInService({
      actor,

      ticketId: ticket.id,

      checkedIn: true,
    });

    expect(result.statusChanged).toBe(true);

    expect(result.ticket).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),

        checkedInByEventUserId: actor.eventUserId,
      },
    });

    const ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

    expect(ticketInDb.checkedInAt).toBeTruthy();

    expect(String(ticketInDb.checkedInByEventUserId)).toBe(actor.eventUserId);
  });
  it("sets a normal checked-in ticket back to active", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    await setInternalTicketCheckInService({
      actor,

      ticketId: ticket.id,

      checkedIn: true,
    });

    const result = await setInternalTicketCheckInService({
      actor,

      ticketId: ticket.id,

      checkedIn: false,
    });

    expect(result.statusChanged).toBe(true);

    expect(result.ticket).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.ACTIVE,

      checkIn: {
        checkedInAt: null,

        checkedInByEventUserId: null,
      },
    });

    const ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.status).toBe(TICKET_STATUS.ACTIVE);

    expect(ticketInDb.checkedInAt).toBe(null);

    expect(ticketInDb.checkedInByEventUserId).toBe(null);
  });

  it("cancels an active ticket and releases one stock unit", async () => {
    const { ticketType, tickets } = await createConfirmedOrderWithTickets({
      quantity: 2,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const result = await cancelInternalTicketService({
      actor,
      ticketId: ticket.id,
      reason: "Customer requested cancellation",
    });

    expect(result.statusChanged).toBe(true);

    expect(result.ticket).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CANCELLED,

      cancellation: {
        cancelledAt: expect.any(String),

        reason: "Customer requested cancellation",
      },
    });

    const ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.status).toBe(TICKET_STATUS.CANCELLED);
    expect(ticketInDb.cancelledAt).toBeTruthy();
    expect(ticketInDb.cancellationReason).toBe(
      "Customer requested cancellation",
    );

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(1);
  });

  it("does not check in cancelled tickets", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    await cancelInternalTicketService({
      actor,
      ticketId: ticket.id,
      reason: "Cancelled before check-in",
    });

    await expect(
      setInternalTicketCheckInService({
        actor,

        ticketId: ticket.id,

        checkedIn: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cancelled tickets cannot be checked in.",
    });
  });

  it("cancels all tickets for an order and releases stock", async () => {
    const { order, ticketType } = await createConfirmedOrderWithTickets({
      quantity: 3,
    });

    const actor = buildInternalActor();

    await cancelTicketsForOrderService({
      orderId: order.id,
      actor,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(3);
    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("marks deposit refund as failed on check-in when payment provider payment id is missing", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
      ticketKind: TICKET_KIND.DEPOSIT,
      paymentProviderPaymentId: null,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const result = await setInternalTicketCheckInService({
      actor,
      ticketId: ticket.id,
      checkedIn: true,
    });

    expect(result.statusChanged).toBe(true);

    expect(result.ticket).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),

        checkedInByEventUserId: actor.eventUserId,
      },
    });

    const ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);
    expect(ticketInDb.depositRefundStatus).toBe(
      TICKET_DEPOSIT_REFUND_STATUS.FAILED,
    );
    expect(ticketInDb.depositRefundFailureReason).toBe(
      "Missing payment provider payment id",
    );

    expect(createPaymentRefundMock).not.toHaveBeenCalled();
  });

  it("refunds a deposit ticket on check-in when payment provider payment id is available", async () => {
    const { order, tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
      ticketKind: TICKET_KIND.DEPOSIT,
      paymentProviderPaymentId: "pay_sql_deposit_success_123",
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const result = await setInternalTicketCheckInService({
      actor,
      ticketId: ticket.id,
      checkedIn: true,
    });

    expect(result.statusChanged).toBe(true);

    expect(result.ticket).toMatchObject({
      id: ticket.id,

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),

        checkedInByEventUserId: actor.eventUserId,
      },
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        providerPaymentId: "pay_sql_deposit_success_123",
        amount: "25.00",
        currency: "EUR",
        description: expect.stringContaining(ticket.ticketCode),
        metadata: expect.objectContaining({
          source: "event_deposit_check_in",
          orderId: String(order.id),
          ticketId: String(ticket.id),
          eventId: String(ticket.eventId),
        }),
      }),
    );

    const ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);
    expect(ticketInDb.depositRefundStatus).toBe(
      TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
    );
    expect(ticketInDb.depositRefundProviderRefundId).toBe(
      "refund_sql_ticket_lifecycle_123",
    );
    expect(ticketInDb.depositRefundFailureReason).toBe(null);
    expect(String(ticketInDb.depositRefundTriggeredByEventUserId)).toBe(
      actor.eventUserId,
    );
  });
});
