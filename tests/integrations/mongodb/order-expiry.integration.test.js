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

let expirePendingOrdersService;
let cancelPaymentSessionMock;

async function loadOrderExpiryIntegrationModules({
  ticketing = true,
  payments = true,
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
      payments,
      guestCheckout,
      ticketPdf,
      ticketQr,
      mail,
    };

    return {
      features: mockedFeatures,
      isFeatureEnabled: (featureName) => Boolean(mockedFeatures[featureName]),
    };
  });
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

  const orderExpiryServiceModule =
    await import("../../../src/modules/orders/order.expiry.service.js");

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
    capacity: 100,
  };
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Order Expiry Event",
    slug: `order-expiry-event-${Date.now()}`,
    shortDescription: "Order expiry integration event",
    description: "Created by order expiry integration test.",
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

async function createTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Expiry Ticket`,
    displayName: "Expiry Ticket",
    description: "Order expiry test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "fixed",
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

async function createOrder({
  event,
  ticketType,
  quantity = 2,
  status = ORDER_STATUS.PENDING,
  paymentStatus = ORDER_PAYMENT_STATUS.PENDING,
  expiresAt = new Date(Date.now() - 60 * 1000),
  totalPrice = 5000,
  paymentProviderPaymentId = null,
} = {}) {
  const resolvedPaymentProviderPaymentId =
    paymentProviderPaymentId ??
    (totalPrice > 0
      ? `pay_expiry_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      : null);
  const order = await Order.create({
    orderNumber: `ORD-EXPIRY-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    buyerExternalProvider: "dummy",
    buyerExternalUserId: "host-customer-1",
    buyerEmailSnapshot: "kunde@example.com",
    buyerFirstNameSnapshot: "Max",
    buyerLastNameSnapshot: "Kunde",
    buyerDisplayNameSnapshot: "Max Kunde",
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
    paymentProviderPaymentId: resolvedPaymentProviderPaymentId,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: status === ORDER_STATUS.CONFIRMED ? new Date() : null,
    expiresAt,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,
  });

  await TicketType.findByIdAndUpdate(ticketType._id, {
    $inc: {
      stockSold: quantity,
    },
  });

  return order;
}

describe("Order expiry MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadOrderExpiryIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    cancelPaymentSessionMock.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("expires pending expired paid orders and releases reserved stock", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const order = await createOrder({
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
      expiredOrderIds: [String(order._id)],
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.EXPIRED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.EXPIRED);
    expect(orderInDb.cancellationReason).toBe("Order expired");

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
    expect(await Ticket.countDocuments({ orderId: order._id })).toBe(0);
  });

  it("does not expire pending orders that have not reached expiresAt", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const order = await createOrder({
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

    const orderInDb = await Order.findById(order._id).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.PENDING);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PENDING);
    expect(ticketTypeInDb.stockSold).toBe(2);
  });

  it("does not expire confirmed orders even if expiresAt is in the past", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const order = await createOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
      paymentProviderPaymentId: "pay_confirmed_123",
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 0,
      expiredOrderIds: [],
    });

    const orderInDb = await Order.findById(order._id).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);
    expect(ticketTypeInDb.stockSold).toBe(1);
  });

  it("does not expire failed or paid pending orders", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const failedOrder = await createOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
    });

    const paidPendingOrder = await createOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      expiresAt: new Date(Date.now() - 60 * 1000),
      totalPrice: 2500,
      paymentProviderPaymentId: "pay_pending_paid_123",
    });

    const result = await expirePendingOrdersService({
      now: new Date(),
      limit: 100,
    });

    expect(result).toMatchObject({
      processed: 0,
      expiredOrderIds: [],
    });

    const failedOrderInDb = await Order.findById(failedOrder._id).lean();
    const paidPendingOrderInDb = await Order.findById(
      paidPendingOrder._id,
    ).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(failedOrderInDb.status).toBe(ORDER_STATUS.PENDING);
    expect(failedOrderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.FAILED);

    expect(paidPendingOrderInDb.status).toBe(ORDER_STATUS.PENDING);
    expect(paidPendingOrderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);

    expect(ticketTypeInDb.stockSold).toBe(2);
  });

  it("processes expired pending orders up to the provided limit", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const firstOrder = await createOrder({
      event,
      ticketType,
      quantity: 1,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() - 2 * 60 * 1000),
      totalPrice: 2500,
    });

    const secondOrder = await createOrder({
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

    const firstOrderInDb = await Order.findById(firstOrder._id).lean();
    const secondOrderInDb = await Order.findById(secondOrder._id).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    const expiredStatuses = [firstOrderInDb.status, secondOrderInDb.status];

    expect(
      expiredStatuses.filter((status) => status === ORDER_STATUS.EXPIRED),
    ).toHaveLength(1);
    expect(
      expiredStatuses.filter((status) => status === ORDER_STATUS.PENDING),
    ).toHaveLength(1);

    expect(ticketTypeInDb.stockSold).toBe(1);
  });
  it("expires the order and releases stock when the provider payment cannot be terminated", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const order = await createOrder({
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
      expiredOrderIds: [String(order._id)],
    });

    const orderInDb = await Order.findById(order._id).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.EXPIRED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.EXPIRED);

    expect(ticketTypeInDb.stockSold).toBe(0);

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);
  });
  it("expires the order and releases stock when payment termination throws", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const order = await createOrder({
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
      expiredOrderIds: [String(order._id)],
    });

    const orderInDb = await Order.findById(order._id).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.EXPIRED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.EXPIRED);
    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it("confirms the order instead of expiring it when the provider reports it as paid", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const order = await createOrder({
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

    const orderInDb = await Order.findById(order._id).lean();
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);

    // Stock stays reserved because this customer actually paid.
    expect(ticketTypeInDb.stockSold).toBe(1);

    // Successful payment must be fulfilled normally.
    expect(await Ticket.countDocuments({ orderId: order._id })).toBe(1);
  });
});
