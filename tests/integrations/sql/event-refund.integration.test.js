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
let findEventById;

let createTicketType;
let findTicketTypeById;
let reserveTicketTypeStock;

let createOrder;
let findOrderById;
let updateOrderById;

let findTicketsByOrderId;
let generateTicketsForOrderService;

let getEventRefundPreviewService;
let cancelEventWithOrdersService;

let EVENT_CANCELLATION_REFUND_MODE;
let cancelOrderExecutionService;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let TICKET_STATUS;

let EVENT_USER_ROLES;

let createPaymentRefundMock;
let sendEventCancelledMailsSafeMock;

let findPaymentRefundByIdempotencyKey;

let ensurePaymentRefundService;
let claimPaymentRefundService;

let recordPaymentRefundProviderSucceededService;
let recordPaymentRefundProviderFailureService;

let completePaymentRefundService;
let markPaymentRefundManualReviewService;

let PAYMENT_REFUND_SOURCE_TYPE;
let PAYMENT_REFUND_STATUS;

async function loadEventRefundSqlIntegrationModules({
  ticketing = true,
  payments = true,
  guestCheckout = true,
  depositTickets = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
} = {}) {
  vi.resetModules();

  createPaymentRefundMock = vi.fn().mockResolvedValue({
    providerRefundId: "refund_sql_test_123",
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
  const paymentRefundRepositoryModule =
    await import("../../../src/modules/paymentRefunds/repositories/paymentRefund.repository.js");
  const paymentRefundServiceModule =
    await import("../../../src/modules/paymentRefunds/paymentRefund.service.js");

  const paymentRefundConstantsModule =
    await import("../../../src/modules/paymentRefunds/paymentRefund.constants.js");
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

  createEvent = eventRepositoryModule.createEvent;
  findEventById = eventRepositoryModule.findEventById;

  createTicketType = ticketTypeRepositoryModule.createTicketType;

  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;

  createOrder = orderRepositoryModule.createOrder;
  findOrderById = orderRepositoryModule.findOrderById;
  updateOrderById = orderRepositoryModule.updateOrderById;
  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;

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
  getEventRefundPreviewService =
    eventRefundServiceModule.getEventRefundPreviewService;
  cancelEventWithOrdersService =
    eventRefundServiceModule.cancelEventWithOrdersService;
  cancelOrderExecutionService =
    orderCancellationExecutionModule.cancelOrderExecutionService;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CANCELLATION_REFUND_MODE =
    eventConstantsModule.EVENT_CANCELLATION_REFUND_MODE;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;
  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;
}
function cancelEventWithAllRefunds(input) {
  return cancelEventWithOrdersService({
    refundMode: EVENT_CANCELLATION_REFUND_MODE.ALL,

    ...input,
  });
}
function buildInternalActor() {
  const eventUserId = "00000000-0000-4000-8000-000000000001";

  return {
    eventUserId,
    eventUser: {
      id: eventUserId,
      role: EVENT_USER_ROLES.ADMIN,
      isActive: true,
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
    title: "SQL Event Refund Event",
    slug: `sql-event-refund-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL event refund integration event",
    description: "Created by SQL event refund integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["sql", "event-refund"],
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
    notesInternal: "Created by SQL event refund integration test",
    ...overrides,
  });
}

async function createRefundTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,
    name: `${event.title} - Refund Ticket`,
    displayName: "SQL Refund Ticket",
    description: "SQL event refund test ticket",
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

async function createOrderWithTickets({
  event,
  ticketType,
  quantity = 1,
  totalPrice = 2500,
  paymentStatus = ORDER_PAYMENT_STATUS.PAID,
  paymentProviderPaymentId = "pay_sql_refund_123",
  externalUserId = "host-customer-sql-refund-1",
  email = "sql.refund.customer@example.com",
} = {}) {
  const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;

  const order = await createOrder({
    orderNumber: `ORD-SQL-REFUND-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    buyerExternalProvider: "dummy",
    buyerExternalUserId: externalUserId,
    buyerEmailSnapshot: email,
    buyerFirstNameSnapshot: "SQL",
    buyerLastNameSnapshot: "Refund",
    buyerDisplayNameSnapshot: "SQL Refund",
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

    status: ORDER_STATUS.CONFIRMED,
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
    order,
    tickets,
  };
}

async function createDepositRefundLedgerState({
  order,
  ticket,
  status,
  amount = 2500,
  providerRefundId = "refund_sql_deposit_fixture",
}) {
  const orderId = order.id;

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
describe("Event refund SQL integration", () => {
  beforeAll(async () => {
    await loadEventRefundSqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
    createPaymentRefundMock?.mockClear();
    sendEventCancelledMailsSafeMock?.mockClear();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a refund preview with refundable paid orders and non-refundable free orders", async () => {
    const event = await createPublishedEvent({
      title: "SQL Refund Preview Event",
      slug: "sql-refund-preview-event",
    });

    const paidTicketType = await createRefundTicketType(event, {
      displayName: "SQL Paid Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const freeTicketType = await createRefundTicketType(event, {
      displayName: "SQL Free Refund Ticket",
      pricingMode: "free",
      priceGross: 0,
    });

    const paid = await createOrderWithTickets({
      event,
      ticketType: paidTicketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_sql_preview_123",
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
      event.id,
      buildInternalActor(),
    );

    expect(preview.event).toMatchObject({
      id: event.id,
      title: "SQL Refund Preview Event",
      status: EVENT_STATUSES.PUBLISHED,
    });

    expect(preview.event).not.toHaveProperty("_id");

    expect(preview.summary).toMatchObject({
      orderCount: 2,
      refundableOrderCount: 1,
      refundAmountTotal: 5000,
    });

    expect(preview.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: paid.order.id,
          refundable: true,
          refundAmount: 5000,
          ticketCount: 2,
        }),
        expect.objectContaining({
          orderId: free.order.id,
          refundable: false,
          refundAmount: 0,
          ticketCount: 1,
        }),
      ]),
    );
  });
  it("retries SQL event order cancellation after a local cancellation failure before starting the refund", async () => {
    const event = await createPublishedEvent({
      title: "SQL Local Refund Retry Event",

      slug: "sql-local-refund-retry-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Retry Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,
      totalPrice: 5000,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_sql_local_retry",
    });

    const originalItems = order.items.map((item) => ({
      ...item,
    }));

    /*
     * Wir erzeugen bewusst einen lokalen Fehler:
     * Der Provider kann erfolgreich sein, aber
     * die Stock-Freigabe findet den Tickettyp
     * nicht.
     *
     * Die TicketType-ID liegt nur im JSON-Snapshot
     * der Order und kann daher für diesen Test
     * kontrolliert verändert werden.
     */
    await updateOrderById(
      order.id,
      {
        items: originalItems.map((item, index) =>
          index === 0
            ? {
                ...item,

                ticketTypeId: "00000000-0000-4000-8000-000000000099",
              }
            : item,
        ),
      },
      {
        lean: true,
      },
    );

    const firstResult = await cancelEventWithAllRefunds({
      eventId: event.id,

      reason: "SQL local finalization retry",

      actor: buildInternalActor(),
    });

    expect(firstResult).toMatchObject({
      cancelledOrders: 0,
      failedCancellations: 1,
      refundRequestedOrders: 1,
    });

    expect(firstResult.cancellationFailures).toHaveLength(1);

    expect(firstResult.cancellationFailures[0].reason).toContain(
      "could not release stock",
    );

    expect(firstResult.refunds[0].refund).toMatchObject({
      skipped: true,
      failed: true,
      reason: "order_cancellation_failed",
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const refundAfterFailure = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order.id)}`,
      {
        lean: true,
      },
    );

    expect(refundAfterFailure).toBeNull();

    const orderAfterFailure = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderAfterFailure).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: "none",
    });

    const ticketsAfterFailure = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsAfterFailure.every(
        (ticket) => ticket.status === TICKET_STATUS.ACTIVE,
      ),
    ).toBe(true);

    const ticketTypeAfterFailure = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterFailure.stockSold).toBe(2);

    /*
     * Reparatur der lokalen Order-Projektion.
     * Der Refund selbst bleibt unverändert
     * provider_succeeded.
     */
    await updateOrderById(
      order.id,
      {
        items: originalItems,
      },
      {
        lean: true,
      },
    );

    const retryResult = await cancelEventWithAllRefunds({
      eventId: event.id,

      reason: "SQL local finalization retry",

      actor: buildInternalActor(),
    });

    expect(retryResult.cancelledOrders).toBe(1);

    /*
     * Wichtigste Garantie:
     * kein zweiter Provider-Aufruf.
     */
    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    const refundAfterRetry = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order.id)}`,
      {
        lean: true,
      },
    );

    expect(refundAfterRetry).toMatchObject({
      status: "completed",

      providerRefundId: "refund_sql_test_123",

      attemptCount: 1,
    });

    const orderAfterRetry = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderAfterRetry).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: "completed",

      refundedAmount: 5000,
    });

    const ticketsAfterRetry = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsAfterRetry.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const ticketTypeAfterRetry = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterRetry.stockSold).toBe(0);

    /*
     * Ein weiterer Replay darf Stock nicht
     * nochmals freigeben.
     */
    await cancelEventWithAllRefunds({
      eventId: event.id,

      reason: "SQL local finalization retry",

      actor: buildInternalActor(),
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    const ticketTypeAfterReplay = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterReplay.stockSold).toBe(0);
  });
  it("allows only one provider refund for parallel SQL order refund executions", async () => {
    const event = await createPublishedEvent({
      title: "Parallel SQL Refund Event",
      slug: "parallel-sql-refund-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "Parallel SQL Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_sql_parallel_refund",
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
        providerRefundId: "refund_sql_parallel",
        status: "refunded",
      };
    });

    const actor = buildInternalActor();

    const firstExecution = cancelEventWithAllRefunds({
      eventId: event.id,
      reason: "Parallel SQL refund test",
      actor,
    });

    /*
     * Erst wenn der erste Worker sicher beim Provider
     * angekommen ist, starten wir den zweiten.
     */
    await providerStarted;

    const secondExecution = cancelEventWithAllRefunds({
      eventId: event.id,
      reason: "Parallel SQL refund test",
      actor,
    });

    releaseProvider();

    const results = await Promise.all([firstExecution, secondExecution]);

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    expect(results.some((result) => result.cancelledOrders === 1)).toBe(true);

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order.id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: "order",
      sourceId: String(order.id),
      orderId: String(order.id),
      status: "completed",
      providerRefundId: "refund_sql_parallel",
      attemptCount: 1,
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
      refundStatus: "completed",
      refundedAmount: 5000,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeInDb.stockSold).toBe(0);

    /*
     * Auch ein späterer Replay darf weder den
     * Provider noch den Stock nochmals verändern.
     */
    await cancelEventWithAllRefunds({
      eventId: event.id,
      reason: "Parallel SQL refund test",
      actor,
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    const ticketTypeAfterReplay = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterReplay.stockSold).toBe(0);
  });
  it("subtracts a completed SQL deposit refund from the order refund", async () => {
    const event = await createPublishedEvent({
      title: "SQL Deposit Deduction Event",
      slug: "sql-deposit-deduction-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Deposit Deduction Ticket",
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
      paymentProviderPaymentId: "pay_sql_deposit_deduction",
    });

    /*
     * Von zwei Deposit-Tickets wurde bereits genau
     * eines über die Deposit-Saga refundiert.
     */
    const depositRefund = await createDepositRefundLedgerState({
      order,
      ticket: tickets[0],
      status: PAYMENT_REFUND_STATUS.COMPLETED,
      amount: 2500,
      providerRefundId: "refund_sql_deposit_completed",
    });

    expect(depositRefund).toMatchObject({
      sourceType: "deposit_ticket",
      status: "completed",
      amount: 2500,
      providerRefundId: "refund_sql_deposit_completed",
    });

    const preview = await getEventRefundPreviewService(
      event.id,
      buildInternalActor(),
    );

    expect(preview.orders).toHaveLength(1);

    expect(preview.orders[0]).toMatchObject({
      refundable: true,
      refundBlocked: false,
      alreadyRefundedDepositAmount: 2500,
      refundAmount: 2500,
    });

    const result = await cancelEventWithAllRefunds({
      eventId: event.id,
      reason: "SQL deposit deduction test",
      actor: buildInternalActor(),
    });

    expect(result.cancelledOrders).toBe(1);

    /*
     * Statt 50,00 EUR dürfen nur noch die
     * verbleibenden 25,00 EUR refundiert werden.
     */
    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        providerPaymentId: "pay_sql_deposit_deduction",
        amount: "25.00",
        currency: "EUR",

        idempotencyKey: `order-refund:${String(order.id)}`,

        metadata: expect.objectContaining({
          source: "event_cancel_refund",
          orderId: String(order.id),
          eventId: String(event.id),
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
      `order-refund:${String(order.id)}`,
      {
        lean: true,
      },
    );

    expect(orderRefund).toMatchObject({
      sourceType: "order",
      sourceId: String(order.id),
      orderId: String(order.id),
      amount: 2500,
      status: "completed",
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    /*
     * refundedAmount ist die vollständige Auszahlung:
     * 2500 Deposit + 2500 Order-Refund.
     */
    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
      refundStatus: "completed",
      refundedAmount: 5000,
    });

    const ticketsInDb = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsInDb.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

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
    "blocks an SQL order refund while a deposit refund is $status",
    async ({ status, expectedOrderRefundStatus }) => {
      const event = await createPublishedEvent({
        title: `SQL Blocking Deposit ${status}`,
        slug: `sql-blocking-deposit-${status}`,
      });

      const ticketType = await createRefundTicketType(event, {
        displayName: `SQL Blocking Deposit ${status}`,
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
        paymentProviderPaymentId: `pay_sql_blocking_${status}`,
      });

      await createDepositRefundLedgerState({
        order,
        ticket: tickets[0],
        status,
        amount: 2500,
      });

      const preview = await getEventRefundPreviewService(
        event.id,
        buildInternalActor(),
      );

      expect(preview.orders).toHaveLength(1);

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
        eventId: event.id,
        reason: `SQL blocking deposit ${status}`,
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

      /*
       * Bei einem unfertigen oder unklaren
       * Deposit-Refund darf niemals ein zusätzlicher
       * Order-Refund beim Provider gestartet werden.
       */
      expect(createPaymentRefundMock).not.toHaveBeenCalled();

      const orderRefund = await findPaymentRefundByIdempotencyKey(
        `order-refund:${String(order.id)}`,
        {
          lean: true,
        },
      );

      expect(orderRefund).toBeNull();

      const orderInDb = await findOrderById(order.id, {
        lean: true,
      });

      expect(orderInDb).toMatchObject({
        status: ORDER_STATUS.CANCELLED,

        paymentStatus: ORDER_PAYMENT_STATUS.PAID,

        refundStatus: expectedOrderRefundStatus,

        refundedAmount: 0,
      });

      const ticketsInDb = await findTicketsByOrderId(order.id, {
        lean: true,
      });

      expect(
        ticketsInDb.every(
          (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
        ),
      ).toBe(true);

      const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
        lean: true,
      });

      expect(ticketTypeInDb.stockSold).toBe(0);
    },
  );
  it("cancels an event, cancels tickets and refunds paid orders", async () => {
    const event = await createPublishedEvent({
      title: "SQL Cancel And Refund Event",
      slug: "sql-cancel-and-refund-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Refundable Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_sql_refund_123",
    });

    const actor = buildInternalActor();

    const result = await cancelEventWithAllRefunds({
      eventId: event.id,
      reason: "Event cancelled by organizer",
      actor,
    });

    expect(result).toMatchObject({
      eventId: event.id,
      cancelledOrders: 1,
    });

    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]).toMatchObject({
      orderId: order.id,
      refund: {
        skipped: false,
        refund: {
          providerRefundId: "refund_sql_test_123",
        },
      },
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_sql_refund_123",

        amount: "50.00",

        idempotencyKey: `order-refund:${String(order.id)}`,

        currency: "EUR",

        metadata: expect.objectContaining({
          source: "event_cancel_refund",

          orderId: String(order.id),

          eventId: String(event.id),
        }),
      }),
    );

    const eventInDb = await findEventById(event.id, {
      lean: true,
    });

    expect(eventInDb.status).toBe(EVENT_STATUSES.CANCELLED);
    expect(eventInDb.cancelledAt).toBeTruthy();
    expect(eventInDb.cancellationReason).toBe("Event cancelled by organizer");
    expect(eventInDb.isCancellationFinalized).toBe(true);
    expect(String(eventInDb.updatedByEventUserId)).toBe(actor.eventUserId);

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb.status).toBe(ORDER_STATUS.CANCELLED);

    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.REFUNDED);

    expect(orderInDb.refundStatus).toBe("completed");

    expect(orderInDb.refundedAmount).toBe(5000);

    expect(orderInDb.paymentProviderRefundId).toBe("refund_sql_test_123");

    expect(orderInDb.refundedAt).toBeTruthy();

    expect(orderInDb.refundFailureReason).toBeFalsy();

    expect(orderInDb.cancellationReason).toBe("Event cancelled by organizer");

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order.id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: "order",

      sourceId: String(order.id),

      orderId: String(order.id),

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_sql_refund_123",

      providerRefundId: "refund_sql_test_123",

      amount: 5000,
      currency: "EUR",

      status: "completed",
      attemptCount: 1,
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(2);
    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const ticketTypeInDb = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeInDb.stockSold).toBe(0);

    expect(sendEventCancelledMailsSafeMock).toHaveBeenCalledTimes(1);
    expect(sendEventCancelledMailsSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orders: [
          expect.objectContaining({
            id: order.id,
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
      title: "SQL Delayed Refund Event",
      slug: "sql-delayed-refund-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Delayed Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      totalPrice: 5000,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_sql_delayed_refund_123",
    });

    const actor = buildInternalActor();

    /*
     * Schritt 1:
     * Order bewusst ohne Refund stornieren.
     */
    const cancellation = await cancelOrderExecutionService({
      order,
      reason: "Cancelled without refund",
      actor,
    });

    expect(cancellation.alreadyFinalized).toBe(false);

    const orderAfterCancellation = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderAfterCancellation).toMatchObject({
      status: ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      cancellationReason: "Cancelled without refund",
    });

    const ticketsAfterCancellation = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsAfterCancellation.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const ticketTypeAfterCancellation = await findTicketTypeById(
      ticketType.id,
      {
        lean: true,
      },
    );

    expect(ticketTypeAfterCancellation.stockSold).toBe(0);

    /*
     * Noch kein Payment-Refund.
     */
    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    /*
     * Schritt 2:
     * Später Refund für dieselbe bereits
     * stornierte Order.
     */
    const result = await cancelEventWithAllRefunds({
      eventId: event.id,
      reason: "Refund approved later",
      orderIds: [String(order.id)],
      actor,
    });

    expect(result.cancelledOrders).toBe(1);

    expect(result.refunds).toHaveLength(1);

    expect(result.refunds[0]).toMatchObject({
      orderId: String(order.id),

      refund: {
        skipped: false,

        refund: {
          providerRefundId: "refund_sql_test_123",
        },
      },
    });

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

    expect(createPaymentRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_sql_delayed_refund_123",

        amount: "50.00",

        currency: "EUR",

        idempotencyKey: `order-refund:${String(order.id)}`,
      }),
    );

    const orderAfterRefund = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderAfterRefund).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: "completed",

      refundedAmount: 5000,

      /*
       * Cancellation und Refund bleiben
       * fachlich getrennt.
       */
      cancellationReason: "Cancelled without refund",

      refundReason: "Refund approved later",
    });

    /*
     * Ganz entscheidend:
     * kein zweites Stock-Release.
     */
    const ticketTypeAfterRefund = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(ticketTypeAfterRefund.stockSold).toBe(0);

    const ticketsAfterRefund = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(
      ticketsAfterRefund.every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order.id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: "order",

      sourceId: String(order.id),

      orderId: String(order.id),

      amount: 5000,

      status: "completed",

      providerRefundId: "refund_sql_test_123",
    });
  });
  it("cancels free orders without creating payment refunds", async () => {
    const event = await createPublishedEvent({
      title: "SQL Cancel Free Orders Event",
      slug: "sql-cancel-free-orders-event",
      isFree: true,
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Free Cancel Ticket",
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
      eventId: event.id,
      reason: "Free event cancelled",
      actor: buildInternalActor(),
    });

    expect(result.cancelledOrders).toBe(1);
    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]).toMatchObject({
      orderId: order.id,
      refund: {
        skipped: true,
        reason: "not_refundable",
      },
    });

    expect(createPaymentRefundMock).not.toHaveBeenCalled();

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb.status).toBe(ORDER_STATUS.CANCELLED);
    expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.NOT_REQUIRED);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe(TICKET_STATUS.CANCELLED);
  });
  it("cancels all SQL event orders without refunding any order in none mode", async () => {
    const event = await createPublishedEvent({
      title: "SQL Cancel Without Refund Event",

      slug: "sql-cancel-without-refund-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Cancel Without Refund Ticket",

      pricingMode: "fixed",

      priceGross: 2500,
    });

    const first = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 1,

      totalPrice: 2500,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_sql_none_1",

      externalUserId: "sql-none-user-1",

      email: "sql-none-1@example.com",
    });

    const second = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 1,

      totalPrice: 2500,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      paymentProviderPaymentId: "pay_sql_none_2",

      externalUserId: "sql-none-user-2",

      email: "sql-none-2@example.com",
    });

    const result = await cancelEventWithOrdersService({
      eventId: event.id,

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

    const firstOrder = await findOrderById(first.order.id, {
      lean: true,
    });

    const secondOrder = await findOrderById(second.order.id, {
      lean: true,
    });

    for (const order of [firstOrder, secondOrder]) {
      expect(order).toMatchObject({
        status: ORDER_STATUS.CANCELLED,

        paymentStatus: ORDER_PAYMENT_STATUS.PAID,

        refundStatus: "none",

        refundedAmount: 0,

        cancellationReason: "Event cancelled without refunds",
      });
    }

    const firstTickets = await findTicketsByOrderId(first.order.id, {
      lean: true,
    });

    const secondTickets = await findTicketsByOrderId(second.order.id, {
      lean: true,
    });

    expect(
      [...firstTickets, ...secondTickets].every(
        (ticket) => ticket.status === TICKET_STATUS.CANCELLED,
      ),
    ).toBe(true);

    const storedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(storedTicketType.stockSold).toBe(0);
  });
  it("cancels all orders but refunds only selected order ids", async () => {
    const event = await createPublishedEvent({
      title: "SQL Partial Cancel Refund Event",
      slug: "sql-partial-cancel-refund-event",
    });

    const ticketType = await createRefundTicketType(event, {
      displayName: "SQL Partial Refund Ticket",
      pricingMode: "fixed",
      priceGross: 2500,
    });

    const first = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 1,
      totalPrice: 2500,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_sql_selected_1",
      externalUserId: "host-customer-sql-selected-1",
      email: "selected.one@example.com",
    });

    const second = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 1,
      totalPrice: 2500,
      paymentStatus: ORDER_PAYMENT_STATUS.PAID,
      paymentProviderPaymentId: "pay_sql_selected_2",
      externalUserId: "host-customer-sql-selected-2",
      email: "selected.two@example.com",
    });

    const result = await cancelEventWithOrdersService({
      eventId: event.id,
      reason: "Partial refund",

      refundMode: EVENT_CANCELLATION_REFUND_MODE.SELECTED,

      orderIds: [String(first.order.id)],

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

        providerPaymentId: "pay_sql_selected_1",

        amount: "25.00",

        idempotencyKey: `order-refund:${String(first.order.id)}`,

        currency: "EUR",

        metadata: expect.objectContaining({
          source: "event_cancel_refund",

          orderId: String(first.order.id),

          eventId: String(event.id),
        }),
      }),
    );

    const firstOrderInDb = await findOrderById(first.order.id, {
      lean: true,
    });
    const secondOrderInDb = await findOrderById(second.order.id, {
      lean: true,
    });

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

    const firstTickets = await findTicketsByOrderId(first.order.id, {
      lean: true,
    });

    const secondTickets = await findTicketsByOrderId(second.order.id, {
      lean: true,
    });

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
        eventId: "00000000-0000-4000-8000-000000000099",
        reason: "Missing event",
        actor: buildInternalActor(),
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Event not found.",
    });
  });
});
