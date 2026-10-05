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

let expirePendingOrdersService;
let cancelPaymentSessionMock;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

async function loadOrderExpirySqlIntegrationModules() {
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
  cancelPaymentSessionMock = vi.fn(async ({ provider, providerPaymentId }) => ({
    provider,
    providerPaymentId,
    status: "expired",
    rawStatus: "expired",
    terminated: true,
    terminal: true,
    paid: false,
  }));

  vi.doMock("../../../src/modules/payments/payment.service.js", async () => {
    const actual = await vi.importActual(
      "../../../src/modules/payments/payment.service.js",
    );

    return {
      ...actual,
      cancelPaymentSession: cancelPaymentSessionMock,
    };
  });

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

  const orderExpiryServiceModule =
    await import("../../../src/modules/orders/order.expiry.service.js");

  createEvent = eventRepositoryModule.createEvent;

  createTicketType = ticketTypeRepositoryModule.createTicketType;
  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;
  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  createOrder = orderRepositoryModule.createOrder;
  findOrderById = orderRepositoryModule.findOrderById;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  expirePendingOrdersService =
    orderExpiryServiceModule.expirePendingOrdersService;
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
    title: "SQL Order Expiry Event",
    slug: `sql-order-expiry-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL order expiry integration event",
    description: "Created by SQL order expiry integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["sql", "order-expiry"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    notesInternal: "Created by SQL order expiry integration test",
    ...overrides,
  });
}

async function createPaidTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,
    name: `${event.title} - Expiry Ticket`,
    displayName: "SQL Expiry Ticket",
    description: "SQL order expiry test ticket",
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

async function createReservedOrder({
  event,
  ticketType,
  quantity = 2,
  status = ORDER_STATUS.PENDING,
  paymentStatus = ORDER_PAYMENT_STATUS.PENDING,
  expiresAt = new Date(Date.now() - 60 * 1000),
  totalPrice = 5000,
  paymentProviderPaymentId = null,
} = {}) {
  const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;

  const resolvedPaymentProviderPaymentId =
    paymentProviderPaymentId ??
    (totalPrice > 0
      ? `pay_sql_expiry_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 10)}`
      : null);

  const order = await createOrder({
    orderNumber: `ORD-SQL-EXPIRY-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    buyerExternalProvider: "dummy",
    buyerExternalUserId: "host-customer-sql-expiry-1",
    buyerEmailSnapshot: "sql.expiry.customer@example.com",
    buyerFirstNameSnapshot: "SQL",
    buyerLastNameSnapshot: "Expiry",
    buyerDisplayNameSnapshot: "SQL Expiry",
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
    paymentProviderPaymentId: resolvedPaymentProviderPaymentId,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: status === ORDER_STATUS.CONFIRMED ? new Date() : null,
    expiresAt,

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

  return order;
}

describe("Order expiry SQL integration", () => {
  beforeAll(async () => {
    await loadOrderExpirySqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
    cancelPaymentSessionMock.mockClear();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("expires pending expired paid orders and releases reserved stock", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const order = await createReservedOrder({
      event,
      ticketType,
      quantity: 2,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 5000,
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 1,
      expiredOrderIds: [String(order.id)],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      id: order.id,
      status: ORDER_STATUS.EXPIRED,
      paymentStatus: ORDER_PAYMENT_STATUS.EXPIRED,
      cancellationReason: "Order expired",
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeInDb.stockSold).toBe(0);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);
  });

  it("does not expire pending orders that have not reached expiresAt", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const order = await createReservedOrder({
      event,
      ticketType,
      quantity: 2,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      totalPrice: 5000,
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 0,
      expiredOrderIds: [],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      id: order.id,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    });

    expect(ticketTypeInDb.stockSold).toBe(2);
  });

  it("does not expire confirmed orders even if expiresAt is in the past", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const order = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
      paymentProviderPaymentId: "pay_sql_confirmed_123",
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 0,
      expiredOrderIds: [],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      id: order.id,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    expect(ticketTypeInDb.stockSold).toBe(1);
  });

  it("does not expire failed or paid pending orders", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const failedOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    const paidPendingOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
      paymentProviderPaymentId: "pay_sql_pending_paid_123",
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 0,
      expiredOrderIds: [],
    });

    const failedOrderInDb = await findOrderById(failedOrder.id, {
      lean: true,
    });

    const paidPendingOrderInDb = await findOrderById(paidPendingOrder.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(failedOrderInDb).toMatchObject({
      id: failedOrder.id,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
    });

    expect(paidPendingOrderInDb).toMatchObject({
      id: paidPendingOrder.id,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    expect(ticketTypeInDb.stockSold).toBe(2);
  });

  it("processes expired pending orders up to the provided limit", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const firstOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 2 * 60 * 1000),
      totalPrice: 2500,
    });

    const secondOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 1,
    });

    expect(result.processed).toBe(1);
    expect(result.expiredOrderIds).toHaveLength(1);

    const firstOrderInDb = await findOrderById(firstOrder.id, {
      lean: true,
    });

    const secondOrderInDb = await findOrderById(secondOrder.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    const expiredStatuses = [firstOrderInDb.status, secondOrderInDb.status];

    expect(
      expiredStatuses.filter((status) => status === ORDER_STATUS.EXPIRED),
    ).toHaveLength(1);
    expect(
      expiredStatuses.filter((status) => status === ORDER_STATUS.PENDING),
    ).toHaveLength(1);

    expect(ticketTypeInDb.stockSold).toBe(1);
  });

  it("does not let failed or paid pending orders consume the expiry limit", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const failedOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      expiresAt: new Date(Date.now() - 3 * 60 * 1000),
      totalPrice: 2500,
    });

    const paidPendingOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      expiresAt: new Date(Date.now() - 2 * 60 * 1000),
      totalPrice: 2500,
      paymentProviderPaymentId: "pay_sql_limit_paid_123",
    });

    const validExpiredOrder = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 1,
    });

    expect(result).toMatchObject({
      processed: 1,
      expiredOrderIds: [String(validExpiredOrder.id)],
    });

    const failedOrderInDb = await findOrderById(failedOrder.id, {
      lean: true,
    });

    const paidPendingOrderInDb = await findOrderById(paidPendingOrder.id, {
      lean: true,
    });

    const validExpiredOrderInDb = await findOrderById(validExpiredOrder.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(failedOrderInDb).toMatchObject({
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
    });

    expect(paidPendingOrderInDb).toMatchObject({
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    expect(validExpiredOrderInDb).toMatchObject({
      status: ORDER_STATUS.EXPIRED,
      paymentStatus: ORDER_PAYMENT_STATUS.EXPIRED,
      cancellationReason: "Order expired",
    });

    expect(ticketTypeInDb.stockSold).toBe(2);
  });
  it("expires the order and releases stock when the provider payment cannot be terminated", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const order = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    cancelPaymentSessionMock.mockResolvedValueOnce({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      providerPaymentId: order.paymentProviderPaymentId,
      status: "open",
      rawStatus: "open",
      terminated: false,
      terminal: false,
      paid: false,
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 1,
      expiredOrderIds: [String(order.id)],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.EXPIRED,
      paymentStatus: ORDER_PAYMENT_STATUS.EXPIRED,
    });

    expect(ticketTypeInDb.stockSold).toBe(0);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);
  });
  it("expires the order and releases stock when payment termination throws", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const order = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    cancelPaymentSessionMock.mockRejectedValueOnce(
      new Error("Provider unavailable"),
    );

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 1,
      expiredOrderIds: [String(order.id)],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.EXPIRED,
      paymentStatus: ORDER_PAYMENT_STATUS.EXPIRED,
    });

    expect(ticketTypeInDb.stockSold).toBe(0);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);
  });
  it("confirms the order instead of expiring it when the provider reports it as paid", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createPaidTicketType(event);

    const order = await createReservedOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    cancelPaymentSessionMock.mockResolvedValueOnce({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      providerPaymentId: order.paymentProviderPaymentId,
      status: "paid",
      rawStatus: "paid",
      terminated: false,
      terminal: true,
      paid: true,
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 0,
      expiredOrderIds: [],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    });

    expect(ticketTypeInDb.stockSold).toBe(1);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);
  });
});
