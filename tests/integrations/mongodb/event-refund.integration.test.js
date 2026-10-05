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

let EVENT_USER_ROLES;

let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let TICKET_STATUS;

let getEventRefundPreviewService;
let cancelEventWithOrdersService;

let EVENT_CANCELLATION_REFUND_MODE;
let cancelOrderExecutionService;
let generateTicketsForOrderService;

let createPaymentRefundMock;
let sendEventCancelledMailsSafeMock;
let withDatabaseTransactionMock;

let findPaymentRefundByIdempotencyKey;

let ensurePaymentRefundService;
let claimPaymentRefundService;

let recordPaymentRefundProviderSucceededService;
let recordPaymentRefundProviderFailureService;

let completePaymentRefundService;
let markPaymentRefundManualReviewService;

let PAYMENT_REFUND_SOURCE_TYPE;
let PAYMENT_REFUND_STATUS;
async function loadEventRefundIntegrationModules({
  ticketing = true,
  guestCheckout = true,
  depositTickets = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
} = {}) {
  vi.resetModules();

  createPaymentRefundMock = vi.fn().mockResolvedValue({
    providerRefundId: "refund_test_123",
    status: "refunded",
  });

  sendEventCancelledMailsSafeMock = vi.fn().mockResolvedValue({
    success: true,
    skipped: false,
    totalCount: 0,
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    sent: [],
    skipped: [],
    failed: [],
  });

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
  withDatabaseTransactionMock = vi.fn(async (callback) => callback({}));
  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",

    withDatabaseTransaction: withDatabaseTransactionMock,
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

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
    createPaymentRefund: createPaymentRefundMock,
  }));

  vi.doMock("../../../src/modules/events/event.mail.service.js", () => ({
    sendEventCancelledMailsSafe: sendEventCancelledMailsSafeMock,
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
  const eventRefundServiceModule =
    await import("../../../src/modules/events/internal/event.refund.service.js");
  const orderCancellationExecutionModule =
    await import("../../../src/modules/orders/order.cancellationExecution.service.js");
  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");
  const paymentRefundRepositoryModule =
    await import("../../../src/modules/paymentRefunds/repositories/paymentRefund.repository.js");

  const paymentRefundServiceModule =
    await import("../../../src/modules/paymentRefunds/paymentRefund.service.js");

  const paymentRefundConstantsModule =
    await import("../../../src/modules/paymentRefunds/paymentRefund.constants.js");
  Event = eventModelModule.Event;
  TicketType = ticketTypeModelModule.TicketType;
  Order = orderModelModule.Order;
  Ticket = ticketModelModule.Ticket;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  EVENT_CANCELLATION_REFUND_MODE =
    eventConstantsModule.EVENT_CANCELLATION_REFUND_MODE;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  getEventRefundPreviewService =
    eventRefundServiceModule.getEventRefundPreviewService;
  cancelEventWithOrdersService =
    eventRefundServiceModule.cancelEventWithOrdersService;
  cancelOrderExecutionService =
    orderCancellationExecutionModule.cancelOrderExecutionService;
  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;
  findPaymentRefundByIdempotencyKey =
    paymentRefundRepositoryModule.findPaymentRefundByIdempotencyKey;
  ensurePaymentRefundService =
    paymentRefundServiceModule.ensurePaymentRefundService;

  claimPaymentRefundService =
    paymentRefundServiceModule.claimPaymentRefundService;

  recordPaymentRefundProviderSucceededService =
    paymentRefundServiceModule.recordPaymentRefundProviderSucceededService;

  recordPaymentRefundProviderFailureService =
    paymentRefundServiceModule.recordPaymentRefundProviderFailureService;

  completePaymentRefundService =
    paymentRefundServiceModule.completePaymentRefundService;

  markPaymentRefundManualReviewService =
    paymentRefundServiceModule.markPaymentRefundManualReviewService;

  PAYMENT_REFUND_SOURCE_TYPE =
    paymentRefundConstantsModule.PAYMENT_REFUND_SOURCE_TYPE;

  PAYMENT_REFUND_STATUS = paymentRefundConstantsModule.PAYMENT_REFUND_STATUS;
}
function cancelEventWithAllRefunds(input) {
  return cancelEventWithOrdersService({
    refundMode: EVENT_CANCELLATION_REFUND_MODE.ALL,

    ...input,
  });
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

function buildInternalActor() {
  const eventUserId = "6a0000000000000000000001";

  return {
    eventUserId,
    eventUser: {
      id: eventUserId,
      role: EVENT_USER_ROLES.ADMIN,
      isActive: true,
    },
  };
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Event Refund Event",
    slug: `event-refund-event-${Date.now()}`,
    shortDescription: "Event refund integration event",
    description: "Created by event refund integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildFutureSession()],
    isFree: false,
    publishedAt: new Date(),
    createdByEventUserId: buildInternalActor().eventUserId,
    ...overrides,
  });
}

async function createTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Refund Ticket`,
    displayName: "Refund Ticket",
    description: "Refund test ticket",
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

async function createOrderWithTickets({
  event,
  ticketType,
  quantity = 1,
  totalPrice = 2500,
  paymentStatus = ORDER_PAYMENT_STATUS.PAID,
  paymentProviderPaymentId = "pay_refund_123",
} = {}) {
  const order = await Order.create({
    orderNumber: `ORD-REFUND-${Date.now()}-${Math.random()
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

    status:
      paymentStatus === ORDER_PAYMENT_STATUS.PAID
        ? ORDER_STATUS.CONFIRMED
        : ORDER_STATUS.CONFIRMED,
    paymentStatus,
    paymentProvider:
      totalPrice > 0
        ? ORDER_PAYMENT_PROVIDER.MOLLIE
        : ORDER_PAYMENT_PROVIDER.NONE,
    paymentProviderPaymentId,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: new Date(),
    expiresAt: null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,
  });

  await TicketType.findByIdAndUpdate(ticketType._id, {
    $inc: {
      stockSold: quantity,
    },
  });

  const tickets = await generateTicketsForOrderService(order._id, {
    createdByEventUserId: null,
    updatedByEventUserId: null,
  });

  return {
    order,
    tickets,
  };
}

async function createDepositRefundLedgerState({
  order,
  ticket,
  status,
  amount = 2500,
  providerRefundId = "refund_mongo_deposit_fixture",
}) {
  const orderId = String(order._id);

  const ticketId = ticket.id;

  const ensured = await ensurePaymentRefundService({
    sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,

    sourceId: ticketId,

    orderId,
    ticketId,

    provider: order.paymentProvider,

    providerPaymentId: order.paymentProviderPaymentId,

    amount,
    currency: order.currency || "EUR",

    idempotencyKey: `deposit-refund:${ticketId}`,

    metadata: {
      source: "event_refund_integration_fixture",
    },

    actor: buildInternalActor(),
  });

  if (status === PAYMENT_REFUND_STATUS.PENDING) {
    return ensured.paymentRefund;
  }

  const paymentRefundId = ensured.paymentRefund.id;

  const claim = await claimPaymentRefundService({
    paymentRefundId,
    now: new Date(),
    leaseMs: 60_000,
  });

  expect(claim).not.toBeNull();

  if (status === PAYMENT_REFUND_STATUS.PROCESSING) {
    return claim.paymentRefund;
  }

  if (status === PAYMENT_REFUND_STATUS.FAILED) {
    return recordPaymentRefundProviderFailureService({
      paymentRefundId,

      leaseToken: claim.leaseToken,

      error: "Injected deposit provider failure",

      failedAt: new Date(),

      nextRetryAt: new Date(Date.now() + 60_000),
    });
  }

  if (status === PAYMENT_REFUND_STATUS.MANUAL_REVIEW) {
    return markPaymentRefundManualReviewService({
      paymentRefundId,

      leaseToken: claim.leaseToken,

      error: "Injected ambiguous deposit refund",

      failedAt: new Date(),
    });
  }

  const providerSucceeded = await recordPaymentRefundProviderSucceededService({
    paymentRefundId,

    leaseToken: claim.leaseToken,

    providerRefundId,

    providerSucceededAt: new Date(),

    leaseMs: 60_000,
  });

  if (status === PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED) {
    return providerSucceeded;
  }

  if (status === PAYMENT_REFUND_STATUS.COMPLETED) {
    return completePaymentRefundService({
      paymentRefundId,

      leaseToken: claim.leaseToken,

      completedAt: new Date(),
    });
  }

  throw new Error(`Unsupported payment refund fixture status: ${status}`);
}
describe("Event refund MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadEventRefundIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    createPaymentRefundMock?.mockClear();

    sendEventCancelledMailsSafeMock?.mockClear();

    withDatabaseTransactionMock?.mockReset();

    withDatabaseTransactionMock?.mockImplementation(async (callback) =>
      callback({}),
    );
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a refund preview with refundable paid orders and non-refundable free orders", async () => {
    const event = await createPublishedEvent({
      title: "Refund Preview Event",
      slug: "refund-preview-event",
    });

    const paidTicketType = await createTicketType(event, {
      displayName: "Paid Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const freeTicketType = await createTicketType(event, {
      displayName: "Free Refund Ticket",
      pricingMode: "free",
      priceGross: 0,
    });

    const paid = await createOrderWithTickets({
      event,
      ticketType: paidTicketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_preview_123",
    });

    const free = await createOrderWithTickets({
      event,
      ticketType: freeTicketType,
      quantity: 1,
      totalPrice: 0,
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
      paymentProviderPaymentId: null,
    });

    const preview = await getEventRefundPreviewService(
      String(event._id),
      buildInternalActor(),
    );

    expect(preview.event).toMatchObject({
      title: "Refund Preview Event",
      status: EVENT_STATUSES.PUBLISHED,
    });

    expect(preview.summary).toMatchObject({
      orderCount: 2,
      refundableOrderCount: 1,
      refundAmountTotal: 5000,
    });

    expect(preview.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: String(paid.order._id),
          refundable: true,
          refundAmount: 5000,
          ticketCount: 2,
        }),
        expect.objectContaining({
          orderId: String(free.order._id),
          refundable: false,
          refundAmount: 0,
          ticketCount: 1,
        }),
      ]),
    );
  });

  it("cancels an event, cancels tickets and refunds paid orders", async () => {
    const event = await createPublishedEvent({
      title: "Cancel And Refund Event",
      slug: "cancel-and-refund-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Refundable Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_refund_123",
    });

    const actor = buildInternalActor();

    const result = await cancelEventWithAllRefunds({
      eventId: String(event._id),
      reason: "Event cancelled by organizer",
      actor,
    });

    expect(result).toMatchObject({
      eventId: String(event._id),
      cancelledOrders: 1,
    });

    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]).toMatchObject({
      orderId: String(order._id),
      refund: {
        skipped: false,
        refund: {
          providerRefundId: "refund_test_123",
        },
      },
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        providerPaymentId: "pay_refund_123",
        amount: "50.00",
        idempotencyKey: `order-refund:${String(order._id)}`,
        currency: "EUR",
        metadata: expect.objectContaining({
          source: "event_cancel_refund",
          orderId: String(order._id),
          eventId: String(event._id),
        }),
      }),
    );

    const eventInDb = await Event.findById(event._id).lean();

    expect(eventInDb.status).toBe(EVENT_STATUSES.CANCELLED);

    expect(eventInDb.cancelledAt).toBeTruthy();

    expect(eventInDb.cancellationReason).toBe("Event cancelled by organizer");

    expect(eventInDb.isCancellationFinalized).toBe(true);

    expect(String(eventInDb.updatedByEventUserId)).toBe(actor.eventUserId);

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CANCELLED);

    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.REFUNDED);

    expect(orderInDb.refundStatus).toBe("completed");

    expect(orderInDb.refundedAmount).toBe(5000);

    expect(orderInDb.paymentProviderRefundId).toBe("refund_test_123");

    expect(orderInDb.refundedAt).toBeTruthy();

    expect(orderInDb.refundFailureReason).toBeFalsy();

    expect(orderInDb.cancellationReason).toBe("Event cancelled by organizer");

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: "order",

      sourceId: String(order._id),

      orderId: String(order._id),

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_refund_123",

      providerRefundId: "refund_test_123",

      amount: 5000,
      currency: "EUR",

      status: "completed",
      attemptCount: 1,
    });

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(tickets).toHaveLength(2);
    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);
    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
    expect(sendEventCancelledMailsSafeMock).toHaveBeenCalledTimes(1);
    expect(sendEventCancelledMailsSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orders: [
          expect.objectContaining({
            orderNumber: order.orderNumber,
            status: ORDER_STATUS.CONFIRMED,
          }),
        ],
      }),
    );
    expect(
      sendEventCancelledMailsSafeMock.mock.invocationCallOrder[0],
    ).toBeLessThan(createPaymentRefundMock.mock.invocationCallOrder[0]);
  });
  it("refunds an already cancelled paid order without releasing stock twice", async () => {
    const event = await createPublishedEvent({
      title: "Delayed Refund Event",
      slug: "delayed-refund-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Delayed Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_delayed_refund_123",
    });

    const actor = buildInternalActor();

    /*
     * Schritt 1:
     * Die Order wird bewusst OHNE Refund storniert.
     */
    const cancellation = await cancelOrderExecutionService({
      order,
      reason: "Cancelled without refund",
      actor,
    });

    expect(cancellation.alreadyFinalized).toBe(false);

    const orderAfterCancellation = await Order.findById(order._id).lean();

    expect(orderAfterCancellation).toMatchObject({
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      cancellationReason: "Cancelled without refund",
    });

    const ticketsAfterCancellation = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsAfterCancellation.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const ticketTypeAfterCancellation = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(ticketTypeAfterCancellation.stockSold).toBe(0);

    /*
     * Bis hierhin darf noch überhaupt kein Geld
     * refundiert worden sein.
     */
    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    /*
     * Schritt 2:
     * Dieselbe bereits stornierte Order wird später
     * über die bestehende Refund-Saga refundiert.
     */
    const result = await cancelEventWithAllRefunds({
      eventId: String(event._id),
      reason: "Refund approved later",
      orderIds: [String(order._id)],
      actor,
    });

    expect(result.cancelledOrders).toBe(1);

    expect(result.refunds).toHaveLength(1);

    expect(result.refunds[0]).toMatchObject({
      orderId: String(order._id),

      refund: {
        skipped: false,

        refund: {
          providerRefundId: "refund_test_123",
        },
      },
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        providerPaymentId: "pay_delayed_refund_123",
        amount: "50.00",
        currency: "EUR",
        idempotencyKey: `order-refund:${String(order._id)}`,
      }),
    );

    const orderAfterRefund = await Order.findById(order._id).lean();

    expect(orderAfterRefund).toMatchObject({
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
      refundStatus: "completed",
      refundedAmount: 5000,

      /*
       * Der spätere Refund darf die ursprüngliche
       * Cancellation-Historie nicht überschreiben.
       */
      cancellationReason: "Cancelled without refund",

      refundReason: "Refund approved later",
    });

    /*
     * Entscheidend:
     * Stock wurde bereits bei der ersten Cancellation
     * freigegeben und darf beim Refund NICHT erneut
     * verändert werden.
     */
    const ticketTypeAfterRefund = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(ticketTypeAfterRefund.stockSold).toBe(0);

    const ticketsAfterRefund = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsAfterRefund.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: "order",
      sourceId: String(order._id),
      orderId: String(order._id),
      amount: 5000,
      status: "completed",
      providerRefundId: "refund_test_123",
    });
  });
  it("retries event order cancellation after a local cancellation failure before starting the refund", async () => {
    const event = await createPublishedEvent({
      title: "Mongo Local Refund Retry Event",

      slug: "mongo-local-refund-retry-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Mongo Retry Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_mongo_local_retry",
    });

    let requiredTransactionCalls = 0;

    withDatabaseTransactionMock.mockImplementation(
      async (callback, options = {}) => {
        if (options.required === true) {
          requiredTransactionCalls += 1;

          if (requiredTransactionCalls === 1) {
            throw new Error("Injected local finalization failure");
          }
        }

        return callback({});
      },
    );

    const firstResult = await cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Local finalization retry",

      actor: buildInternalActor(),
    });

    expect(firstResult).toMatchObject({
      cancelledOrders: 0,
      failedCancellations: 1,
      refundRequestedOrders: 1,
    });

    expect(firstResult.cancellationFailures).toHaveLength(1);

    expect(firstResult.cancellationFailures[0].reason).toContain(
      "Injected local finalization failure",
    );

    expect(firstResult.refunds[0].refund).toMatchObject({
      skipped: true,
      failed: true,
      reason: "order_cancellation_failed",
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const refundAfterFailure = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(refundAfterFailure).toBeNull();

    const orderAfterFailure = await Order.findById(order._id).lean();

    expect(orderAfterFailure).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      refundStatus: "none",
    });

    const ticketsAfterFailure = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsAfterFailure.every(
        (ticket) => ticket.status === TICKET_STATUS.ACTIVE,
      ),
    ).toBe(true);

    const ticketTypeAfterFailure = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(ticketTypeAfterFailure.stockSold).toBe(2);

    /*
     * Der nächste Versuch darf die lokale
     * Finalisierung ausführen, aber nicht den
     * Provider erneut aufrufen.
     */
    withDatabaseTransactionMock.mockImplementation(async (callback) =>
      callback({}),
    );

    const retryResult = await cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Local finalization retry",

      actor: buildInternalActor(),
    });

    expect(retryResult.cancelledOrders).toBe(1);

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    const refundAfterRetry = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(refundAfterRetry).toMatchObject({
      status: "completed",

      providerRefundId: "refund_test_123",

      attemptCount: 1,
    });
    const orderAfterRetry = await Order.findById(order._id).lean();

    expect(orderAfterRetry).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: "completed",

      refundedAmount: 5000,
    });

    const ticketsAfterRetry = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsAfterRetry.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const ticketTypeAfterRetry = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(ticketTypeAfterRetry.stockSold).toBe(0);

    /*
     * Auch ein weiterer Replay darf Stock
     * nicht nochmals reduzieren.
     */
    await cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Local finalization retry",

      actor: buildInternalActor(),
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    const ticketTypeAfterReplay = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(ticketTypeAfterReplay.stockSold).toBe(0);
  });
  it("allows only one provider refund for parallel order refund executions", async () => {
    const event = await createPublishedEvent({
      title: "Parallel Mongo Refund Event",

      slug: "parallel-mongo-refund-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Parallel Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_mongo_parallel_refund",
    });

    let releaseProvider;
    let markProviderStarted;

    const providerRelease = new Promise((resolve) => {
      releaseProvider = resolve;
    });

    const providerStarted = new Promise((resolve) => {
      markProviderStarted = resolve;
    });

    createPaymentRefundMock.mockImplementationOnce(async () => {
      markProviderStarted();

      await providerRelease;

      return {
        providerRefundId: "refund_mongo_parallel",

        status: "refunded",
      };
    });

    const actor = buildInternalActor();

    const firstExecution = cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Parallel refund test",

      actor,
    });

    await providerStarted;

    const secondExecution = cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Parallel refund test",

      actor,
    });

    releaseProvider();

    const results = await Promise.all([firstExecution, secondExecution]);

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    expect(results.some((result) => result.cancelledOrders === 1)).toBe(true);

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: "order",

      status: "completed",

      providerRefundId: "refund_mongo_parallel",

      attemptCount: 1,
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: "completed",

      refundedAmount: 5000,
    });

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);

    /*
     * Ein weiterer Replay darf weder Provider
     * noch Stock erneut verändern.
     */
    await cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Parallel refund test",

      actor,
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    const ticketTypeAfterReplay = await TicketType.findById(
      ticketType._id,
    ).lean();

    expect(ticketTypeAfterReplay.stockSold).toBe(0);
  });
  it("subtracts a completed deposit refund from the order refund", async () => {
    const event = await createPublishedEvent({
      title: "Mongo Deposit Deduction Event",

      slug: "mongo-deposit-deduction-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Deposit Deduction Ticket",

      ticketKind: TICKET_TYPE_KIND.DEPOSIT,
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_mongo_deposit_deduction",
    });

    const depositRefund = await createDepositRefundLedgerState({
      order,
      ticket: tickets[0],

      status: PAYMENT_REFUND_STATUS.COMPLETED,

      amount: 2500,

      providerRefundId: "refund_mongo_deposit_completed",
    });

    expect(depositRefund).toMatchObject({
      status: "completed",

      amount: 2500,

      providerRefundId: "refund_mongo_deposit_completed",
    });

    const preview = await getEventRefundPreviewService(
      event._id,
      buildInternalActor(),
    );

    expect(preview.orders[0]).toMatchObject({
      refundable: true,

      alreadyRefundedDepositAmount: 2500,

      refundAmount: 2500,

      refundBlocked: false,
    });

    const result = await cancelEventWithAllRefunds({
      eventId: event._id,

      reason: "Deposit deduction test",

      actor: buildInternalActor(),
    });

    expect(result.cancelledOrders).toBe(1);

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPaymentId: "pay_mongo_deposit_deduction",

        amount: "25.00",

        idempotencyKey: `order-refund:${String(order._id)}`,

        metadata: expect.objectContaining({
          orderTotal: 5000,

          alreadyRefundedDepositAmount: 2500,

          remainingRefundAmount: 2500,
        }),
      }),
    );

    expect(result.refunds[0].refund).toMatchObject({
      alreadyRefundedDepositAmount: 2500,

      remainingRefundAmount: 2500,
    });

    const orderRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(orderRefund).toMatchObject({
      sourceType: "order",

      amount: 2500,

      status: "completed",
    });

    const orderInDb = await Order.findById(order._id).lean();

    /*
     * refundedAmount bildet den insgesamt
     * ausgezahlten Betrag ab:
     * Deposit 2500 + Order-Refund 2500.
     */
    expect(orderInDb).toMatchObject({
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: "completed",

      refundedAmount: 5000,
    });

    const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

    expect(ticketTypeInDb.stockSold).toBe(0);
  });
  it.each([
    {
      status: "pending",

      expectedOrderRefundStatus: "processing",
    },
    {
      status: "processing",

      expectedOrderRefundStatus: "processing",
    },
    {
      status: "failed",

      expectedOrderRefundStatus: "failed",
    },
    {
      status: "manual_review",

      expectedOrderRefundStatus: "manual_review",
    },
  ])(
    "blocks an order refund while a deposit refund is $status",
    async ({ status, expectedOrderRefundStatus }) => {
      const event = await createPublishedEvent({
        title: `Mongo Blocking Deposit ${status}`,

        slug: `mongo-blocking-deposit-${status}`,
      });

      const ticketType = await createTicketType(event, {
        displayName: `Blocking Deposit ${status}`,

        ticketKind: TICKET_TYPE_KIND.DEPOSIT,
        pricingMode: "fixed",
        priceGross: 2500,
      });

      const { order, tickets } = await createOrderWithTickets({
        event,
        ticketType,

        quantity: 1,
        totalPrice: 2500,

        paymentStatus: ORDER_PAYMENT_STATUS.PAID,

        paymentProviderPaymentId: `pay_mongo_blocking_${status}`,
      });

      await createDepositRefundLedgerState({
        order,
        ticket: tickets[0],

        status,

        amount: 2500,
      });

      const preview = await getEventRefundPreviewService(
        event._id,
        buildInternalActor(),
      );

      expect(preview.orders[0]).toMatchObject({
        refundable: false,

        refundBlocked: true,

        refundBlockedReason: "deposit_refund_incomplete",

        refundAmount: 0,

        blockingDepositRefunds: [
          expect.objectContaining({
            status,
            amount: 2500,
          }),
        ],
      });

      const result = await cancelEventWithAllRefunds({
        eventId: event._id,

        reason: `Blocking deposit ${status}`,

        actor: buildInternalActor(),
      });

      expect(result.cancelledOrders).toBe(1);
      expect(result.failedCancellations).toBe(0);

      expect(result.refunds[0].refund).toMatchObject({
        skipped: true,
        failed: true,

        reason: "deposit_refund_incomplete",

        blockingDepositRefunds: [
          expect.objectContaining({
            status,
            amount: 2500,
          }),
        ],
      });

      expect(createPaymentRefundMock).not.toHaveBeenCalled();

      const orderRefund = await findPaymentRefundByIdempotencyKey(
        `order-refund:${String(order._id)}`,
        {
          lean: true,
        },
      );

      expect(orderRefund).toBeNull();

      const orderInDb = await Order.findById(order._id).lean();

      expect(orderInDb).toMatchObject({
        status: ORDER_STATUS.CANCELLED,

        paymentStatus: ORDER_PAYMENT_STATUS.PAID,

        refundStatus: expectedOrderRefundStatus,

        refundedAmount: 0,
      });
      const ticketsInDb = await Ticket.find({
        orderId: order._id,
      }).lean();

      expect(
        ticketsInDb.every(
          (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
        ),
      ).toBe(true);

      const ticketTypeInDb = await TicketType.findById(ticketType._id).lean();

      expect(ticketTypeInDb.stockSold).toBe(0);
    },
  );
  it("cancels free orders without creating payment refunds", async () => {
    const event = await createPublishedEvent({
      title: "Cancel Free Orders Event",
      slug: "cancel-free-orders-event",
      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      displayName: "Free Cancel Ticket",
      pricingMode: "free",
      priceGross: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 1,
      totalPrice: 0,
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
      paymentProviderPaymentId: null,
    });

    const result = await cancelEventWithAllRefunds({
      eventId: event._id,
      reason: "Free event cancelled",
      actor: buildInternalActor(),
    });

    expect(result.cancelledOrders).toBe(1);
    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]).toMatchObject({
      orderId: String(order._id),
      refund: {
        skipped: true,
        reason: "not_refundable",
      },
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CANCELLED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.NOT_REQUIRED);

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe(TICKET_STATUS.CANCELLED);
  });
  it("cancels all event orders without refunding any order in none mode", async () => {
    const event = await createPublishedEvent({
      title: "Cancel Without Refund Event",
      slug: "cancel-without-refund-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Cancel Without Refund Ticket",

      pricingMode: "fixed",

      priceGross: 2500,
    });

    const first = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 1,

      totalPrice: 2500,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_none_1",
    });

    const second = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 1,

      totalPrice: 2500,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_none_2",
    });

    const result = await cancelEventWithOrdersService({
      eventId: event._id,

      reason: "Event cancelled without refunds",

      refundMode: EVENT_CANCELLATION_REFUND_MODE.NONE,

      actor: buildInternalActor(),
    });

    expect(result).toMatchObject({
      refundMode: EVENT_CANCELLATION_REFUND_MODE.NONE,

      totalOrders: 2,

      cancelledOrders: 2,

      failedCancellations: 0,

      refundRequestedOrders: 0,

      refunds: [],
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const firstOrder = await Order.findById(first.order._id).lean();

    const secondOrder = await Order.findById(second.order._id).lean();

    for (const order of [firstOrder, secondOrder]) {
      expect(order).toMatchObject({
        status: ORDER_STATUS.CANCELLED,

        paymentStatus: ORDER_PAYMENT_STATUS.PAID,

        refundStatus: "none",

        refundedAmount: 0,

        cancellationReason: "Event cancelled without refunds",
      });
    }

    const tickets = await Ticket.find({
      orderId: {
        $in: [first.order._id, second.order._id],
      },
    }).lean();

    expect(tickets).toHaveLength(2);

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const storedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("cancels all orders but refunds only selected order ids", async () => {
    const event = await createPublishedEvent({
      title: "Partial Cancel Refund Event",
      slug: "partial-cancel-refund-event",
    });

    const ticketType = await createTicketType(event, {
      displayName: "Partial Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const first = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 1,
      totalPrice: 2500,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_selected_1",
    });

    const second = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 1,
      totalPrice: 2500,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_selected_2",
    });

    const result = await cancelEventWithOrdersService({
      eventId: event._id,
      reason: "Partial refund",

      refundMode: EVENT_CANCELLATION_REFUND_MODE.SELECTED,

      orderIds: [String(first.order._id)],

      actor: buildInternalActor(),
    });

    expect(result).toMatchObject({
      refundMode: EVENT_CANCELLATION_REFUND_MODE.SELECTED,

      totalOrders: 2,

      cancelledOrders: 2,

      failedCancellations: 0,

      refundRequestedOrders: 1,
    });

    expect(result.refunds).toHaveLength(1);

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_selected_1",

        amount: "25.00",

        idempotencyKey: `order-refund:${String(first.order._id)}`,

        currency: "EUR",

        metadata: expect.objectContaining({
          source: "event_cancel_refund",

          orderId: String(first.order._id),

          eventId: String(event._id),
        }),
      }),
    );
    const firstOrderInDb = await Order.findById(first.order._id).lean();

    const secondOrderInDb = await Order.findById(second.order._id).lean();
    expect(firstOrderInDb.status).toBe(ORDER_STATUS.CANCELLED);

    expect(firstOrderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.REFUNDED);

    /*
     * Auch nicht ausgewählte Orders werden
     * wegen der Event-Absage storniert.
     *
     * Nur das Geld bleibt unangetastet.
     */
    expect(secondOrderInDb.status).toBe(ORDER_STATUS.CANCELLED);

    expect(secondOrderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);

    expect(secondOrderInDb.refundStatus).toBe("none");

    expect(secondOrderInDb.refundedAmount).toBe(0);

    const firstTickets = await Ticket.find({
      orderId: first.order._id,
    }).lean();

    const secondTickets = await Ticket.find({
      orderId: second.order._id,
    }).lean();

    expect(
      firstTickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);
    expect(
      secondTickets.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);
  });

  it("throws when event does not exist", async () => {
    await expect(
      cancelEventWithAllRefunds({
        eventId: "6a0000000000000000000000",
        reason: "Missing event",
        actor: buildInternalActor(),
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "EVENT_NOT_FOUND",
      message: "Event not found.",
    });
  });
});
