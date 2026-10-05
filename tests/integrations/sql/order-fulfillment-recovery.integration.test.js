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

let createOrder;
let findOrderById;
let updateOrderById;

let findTicketsByOrderId;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;
let ORDER_FULFILLMENT_STATUS;
let ORDER_FULFILLMENT_STEP;

let recoverOrderFulfillmentsService;

let generateOfficialTicketDocumentMock;

let getDatabaseConnection;
let generateTicketsForOrderService;

async function loadOrderFulfillmentRecoverySqlModules() {
  vi.resetModules();

  generateOfficialTicketDocumentMock = vi.fn().mockResolvedValue({
    ticket: {
      ticketPdfStorageKey: "tickets/sql-recovery-ticket.pdf",
    },
    document: {
      mimeType: "application/pdf",
      filename: "sql-recovery-ticket.pdf",
      version: 1,
    },
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: TEST_JWT_SECRET,

      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
      },

      branding: {
        appName: "Kiwi Events Test",
      },
    },
  }));

  const TEST_FEATURES = {
    ticketing: true,
    payments: true,
    guestCheckout: true,
    depositTickets: false,

    ticketPdf: true,
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

  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderConfirmedMailSafe: vi.fn().mockResolvedValue({
      success: false,
      skipped: true,
      reason: "mail_disabled_in_test",
    }),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: generateOfficialTicketDocumentMock,

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

  const fulfillmentServiceModule =
    await import("../../../src/modules/orders/order.fulfillment.service.js");
  const databaseServiceModule =
    await import("../../../src/modules/database/database.service.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");

  createEvent = eventRepositoryModule.createEvent;

  createTicketType = ticketTypeRepositoryModule.createTicketType;

  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;

  createOrder = orderRepositoryModule.createOrder;

  findOrderById = orderRepositoryModule.findOrderById;

  updateOrderById = orderRepositoryModule.updateOrderById;

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

  ORDER_FULFILLMENT_STATUS = orderConstantsModule.ORDER_FULFILLMENT_STATUS;

  ORDER_FULFILLMENT_STEP = orderConstantsModule.ORDER_FULFILLMENT_STEP;

  recoverOrderFulfillmentsService =
    fulfillmentServiceModule.recoverOrderFulfillmentsService;

  getDatabaseConnection = databaseServiceModule.getDatabaseConnection;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;
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
    title: "SQL Fulfillment Recovery Event",

    slug: `sql-fulfillment-recovery-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    shortDescription: "SQL fulfillment recovery integration event",

    description: "Created by SQL fulfillment recovery integration test.",

    category: EVENT_CATEGORIES.EVENT,

    status: EVENT_STATUSES.PUBLISHED,

    visibility: EVENT_VISIBILITIES.PUBLIC,

    location: "WU Wien",

    tags: ["sql", "fulfillment-recovery"],

    sessions: [buildFutureSession()],

    faqs: [],

    isFree: false,

    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),

    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),

    isFeatured: false,

    featuredOrder: 0,

    publishedAt: new Date(),

    notesInternal: "Created by SQL fulfillment recovery integration test",

    ...overrides,
  });
}

async function createPaidTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,

    name: `${event.title} - Recovery Ticket`,

    displayName: "SQL Recovery Ticket",

    description: "SQL fulfillment recovery test ticket",

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

async function createConfirmedPaidOrder({
  event,
  ticketType,

  quantity = 1,

  fulfillmentStatus = ORDER_FULFILLMENT_STATUS.NOT_STARTED,

  fulfillmentStep = ORDER_FULFILLMENT_STEP.NOT_STARTED,

  fulfillmentAttemptCount = 0,

  fulfillmentLeaseToken = null,
  fulfillmentLeaseExpiresAt = null,

  fulfillmentNextRetryAt = null,
  fulfillmentManualReviewAt = null,
} = {}) {
  const totalPrice = 2500 * quantity;

  const order = await createOrder({
    orderNumber: `ORD-SQL-RECOVERY-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,

    buyerExternalProvider: "dummy",

    buyerExternalUserId: "host-customer-sql-recovery-1",

    buyerEmailSnapshot: "sql.recovery@example.com",

    buyerFirstNameSnapshot: "SQL",

    buyerLastNameSnapshot: "Recovery",

    buyerDisplayNameSnapshot: "SQL Recovery",

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

    paymentStatus: ORDER_PAYMENT_STATUS.PAID,

    paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,

    paymentProviderPaymentId: `pay_sql_recovery_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    paymentCheckoutUrl: null,

    source: "public",

    confirmedAt: new Date(),

    expiresAt: null,

    fulfillmentStatus,

    fulfillmentStep,

    fulfillmentAttemptCount,

    fulfillmentLeaseToken,

    fulfillmentLeaseExpiresAt,

    fulfillmentNextRetryAt,

    fulfillmentManualReviewAt,

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

describe("Order fulfillment recovery SQL integration", () => {
  beforeAll(async () => {
    await loadOrderFulfillmentRecoverySqlModules();

    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    generateOfficialTicketDocumentMock.mockReset();

    generateOfficialTicketDocumentMock.mockResolvedValue({
      ticket: {
        ticketPdfStorageKey: "tickets/sql-recovery-ticket.pdf",
      },

      document: {
        mimeType: "application/pdf",
        filename: "sql-recovery-ticket.pdf",
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();

    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("recovers a paid order whose fulfillment never started", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
    });

    const result = await recoverOrderFulfillmentsService();

    expect(result).toMatchObject({
      candidates: 1,
      completed: 1,
      failed: 0,
      ignored: 0,

      completedOrderIds: [String(order.id)],

      failedOrderIds: [],
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 1,
    });

    expect(orderInDb.fulfillmentCompletedAt).toBeTruthy();

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);
  });

  it("does not retry a failed fulfillment before nextRetryAt", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.DOCUMENTS,

      fulfillmentAttemptCount: 1,

      fulfillmentNextRetryAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const result = await recoverOrderFulfillmentsService();

    expect(result).toMatchObject({
      candidates: 0,
      completed: 0,
      failed: 0,
      ignored: 0,
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentAttemptCount: 1,
    });

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(0);

    expect(generateOfficialTicketDocumentMock).not.toHaveBeenCalled();
  });

  it("retries a failed fulfillment when nextRetryAt is due without duplicating tickets", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
    });

    generateOfficialTicketDocumentMock
      .mockRejectedValueOnce(
        new Error("Simulated SQL recovery document failure"),
      )
      .mockResolvedValue({
        ticket: {
          ticketPdfStorageKey: "tickets/sql-recovered-ticket.pdf",
        },

        document: {
          mimeType: "application/pdf",
          filename: "sql-recovered-ticket.pdf",
          version: 1,
        },
      });

    const firstResult = await recoverOrderFulfillmentsService();

    expect(firstResult).toMatchObject({
      candidates: 1,
      completed: 0,
      failed: 1,
    });

    let orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.DOCUMENTS,

      fulfillmentAttemptCount: 1,
    });

    expect(orderInDb.fulfillmentNextRetryAt).toBeTruthy();

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(1);

    await updateOrderById(
      order.id,
      {
        fulfillmentNextRetryAt: new Date(Date.now() - 1000),
      },
      {
        lean: true,
      },
    );

    const secondResult = await recoverOrderFulfillmentsService();

    expect(secondResult).toMatchObject({
      candidates: 1,
      completed: 1,
      failed: 0,

      completedOrderIds: [String(order.id)],
    });

    orderInDb = await findOrderById(order.id, {
      lean: true,
    });

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 2,

      fulfillmentNextRetryAt: null,
    });

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(1);

    expect(generateOfficialTicketDocumentMock).toHaveBeenCalledTimes(2);
  });

  it("reclaims fulfillment when a processing lease is stale", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.TICKETS,

      fulfillmentAttemptCount: 1,

      fulfillmentLeaseToken: "stale-sql-recovery-lease",

      fulfillmentLeaseExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    const result = await recoverOrderFulfillmentsService();

    expect(result).toMatchObject({
      candidates: 1,
      completed: 1,
      failed: 0,
    });

    const orderInDb = await findOrderById(order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 2,

      fulfillmentLeaseToken: null,

      fulfillmentLeaseExpiresAt: null,
    });

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(1);
  });

  it("moves fulfillment to manual review after five failed attempts and stops automatic retries", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
    });

    generateOfficialTicketDocumentMock.mockRejectedValue(
      new Error("Persistent SQL document failure"),
    );

    for (let expectedAttempt = 1; expectedAttempt <= 5; expectedAttempt += 1) {
      if (expectedAttempt > 1) {
        await updateOrderById(
          order.id,
          {
            fulfillmentNextRetryAt: new Date(Date.now() - 1000),
          },
          {
            lean: true,
          },
        );
      }

      const result = await recoverOrderFulfillmentsService();

      expect(result).toMatchObject({
        candidates: 1,
        completed: 0,
        failed: 1,
      });

      const currentOrder = await findOrderById(order.id, {
        lean: true,
      });

      expect(currentOrder.fulfillmentAttemptCount).toBe(expectedAttempt);

      if (expectedAttempt < 5) {
        expect(currentOrder.fulfillmentStatus).toBe(
          ORDER_FULFILLMENT_STATUS.FAILED,
        );

        expect(currentOrder.fulfillmentNextRetryAt).toBeTruthy();

        expect(currentOrder.fulfillmentManualReviewAt).toBe(null);
      } else {
        expect(currentOrder.fulfillmentStatus).toBe(
          ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW,
        );

        expect(currentOrder.fulfillmentNextRetryAt).toBe(null);

        expect(currentOrder.fulfillmentManualReviewAt).toBeTruthy();
      }
    }

    const resultAfterManualReview = await recoverOrderFulfillmentsService();

    expect(resultAfterManualReview).toMatchObject({
      candidates: 0,
      completed: 0,
      failed: 0,
      ignored: 0,
    });

    const finalOrder = await findOrderById(order.id, {
      lean: true,
    });

    expect(finalOrder).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW,

      fulfillmentAttemptCount: 5,
    });

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(1);

    expect(generateOfficialTicketDocumentMock).toHaveBeenCalledTimes(5);
  });
  it("recreates only a missing SQL ticket slot when an order is partially fulfilled", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
      quantity: 3,
    });

    const initialTickets = await generateTicketsForOrderService(order.id);

    expect(initialTickets).toHaveLength(3);

    expect(
      new Set(
        initialTickets.map(
          (ticket) => `${ticket.orderItemIndex}:${ticket.orderItemUnitIndex}`,
        ),
      ),
    ).toEqual(new Set(["0:0", "0:1", "0:2"]));

    const db = getDatabaseConnection();

    await db("tickets")
      .where({
        order_id: order.id,
        order_item_index: 0,
        order_item_unit_index: 1,
      })
      .delete();

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(2);

    const recoveredTickets = await generateTicketsForOrderService(order.id);

    expect(recoveredTickets).toHaveLength(3);

    const recoveredSlots = new Set(
      recoveredTickets.map(
        (ticket) => `${ticket.orderItemIndex}:${ticket.orderItemUnitIndex}`,
      ),
    );

    expect(recoveredSlots).toEqual(new Set(["0:0", "0:1", "0:2"]));

    expect(recoveredSlots.size).toBe(3);

    expect(
      await findTicketsByOrderId(order.id, {
        lean: true,
      }),
    ).toHaveLength(3);
  });
  it("creates exactly one SQL ticket per order slot when generation runs concurrently", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createPaidTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
      quantity: 3,
    });

    const [firstResult, secondResult] = await Promise.all([
      generateTicketsForOrderService(order.id),
      generateTicketsForOrderService(order.id),
    ]);

    expect(firstResult).toHaveLength(3);
    expect(secondResult).toHaveLength(3);

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(3);

    const slotKeys = tickets.map(
      (ticket) => `${ticket.orderItemIndex}:${ticket.orderItemUnitIndex}`,
    );

    expect(new Set(slotKeys)).toEqual(new Set(["0:0", "0:1", "0:2"]));

    expect(new Set(slotKeys).size).toBe(3);
  });
});
