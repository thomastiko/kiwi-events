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
let ORDER_FULFILLMENT_STATUS;
let ORDER_FULFILLMENT_STEP;

let recoverOrderFulfillmentsService;

let generateOfficialTicketDocumentMock;

let generateTicketsForOrderService;

async function loadOrderFulfillmentRecoveryModules() {
  vi.resetModules();

  generateOfficialTicketDocumentMock = vi.fn().mockResolvedValue({
    ticket: {
      ticketPdfStorageKey: "tickets/recovery-ticket.pdf",
    },
    document: {
      mimeType: "application/pdf",
      filename: "recovery-ticket.pdf",
      version: 1,
    },
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,

      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
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

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",

    withDatabaseTransaction: async (callback) => callback({}),
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

  const fulfillmentServiceModule =
    await import("../../../src/modules/orders/order.fulfillment.service.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");

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

  ORDER_FULFILLMENT_STATUS = orderConstantsModule.ORDER_FULFILLMENT_STATUS;

  ORDER_FULFILLMENT_STEP = orderConstantsModule.ORDER_FULFILLMENT_STEP;

  recoverOrderFulfillmentsService =
    fulfillmentServiceModule.recoverOrderFulfillmentsService;

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
    capacity: 100,
  };
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Fulfillment Recovery Event",

    slug: `fulfillment-recovery-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    shortDescription: "Fulfillment recovery integration event",

    description: "Created by fulfillment recovery integration test.",

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

    name: `${event.title} - Recovery Ticket`,

    displayName: "Recovery Ticket",

    description: "Fulfillment recovery test ticket",

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

  const order = await Order.create({
    orderNumber: `ORD-RECOVERY-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,

    buyerExternalProvider: "dummy",

    buyerExternalUserId: "host-customer-recovery-1",

    buyerEmailSnapshot: "recovery@example.com",

    buyerFirstNameSnapshot: "Recovery",

    buyerLastNameSnapshot: "Customer",

    buyerDisplayNameSnapshot: "Recovery Customer",

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

    paymentProviderPaymentId: `pay_recovery_${Date.now()}_${Math.random()
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

  await TicketType.findByIdAndUpdate(ticketType._id, {
    $inc: {
      stockSold: quantity,
    },
  });

  return order;
}

describe("Order fulfillment recovery MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();

    await loadOrderFulfillmentRecoveryModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    generateOfficialTicketDocumentMock.mockReset();

    generateOfficialTicketDocumentMock.mockResolvedValue({
      ticket: {
        ticketPdfStorageKey: "tickets/recovery-ticket.pdf",
      },

      document: {
        mimeType: "application/pdf",
        filename: "recovery-ticket.pdf",
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();

    await disconnectMongoTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("recovers a paid order whose fulfillment never started", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

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

      completedOrderIds: [String(order._id)],

      failedOrderIds: [],
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 1,
    });

    expect(orderInDb.fulfillmentCompletedAt).toBeTruthy();

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(1);
  });

  it("does not retry a failed fulfillment before nextRetryAt", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

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

      completedOrderIds: [],
      failedOrderIds: [],
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentAttemptCount: 1,
    });

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);

    expect(generateOfficialTicketDocumentMock).not.toHaveBeenCalled();
  });

  it("retries a failed fulfillment when nextRetryAt is due without duplicating tickets", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
    });

    generateOfficialTicketDocumentMock
      .mockRejectedValueOnce(new Error("Simulated recovery document failure"))
      .mockResolvedValue({
        ticket: {
          ticketPdfStorageKey: "tickets/recovered-ticket.pdf",
        },

        document: {
          mimeType: "application/pdf",
          filename: "recovered-ticket.pdf",
          version: 1,
        },
      });

    const firstResult = await recoverOrderFulfillmentsService();

    expect(firstResult).toMatchObject({
      candidates: 1,
      completed: 0,
      failed: 1,
    });

    let orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.DOCUMENTS,

      fulfillmentAttemptCount: 1,
    });

    expect(orderInDb.fulfillmentNextRetryAt).toBeTruthy();

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(1);

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        fulfillmentNextRetryAt: new Date(Date.now() - 1000),
      },
    });

    const secondResult = await recoverOrderFulfillmentsService();

    expect(secondResult).toMatchObject({
      candidates: 1,
      completed: 1,
      failed: 0,

      completedOrderIds: [String(order._id)],
    });

    orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 2,
    });

    expect(orderInDb.fulfillmentNextRetryAt).toBe(null);

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(1);

    expect(generateOfficialTicketDocumentMock).toHaveBeenCalledTimes(2);
  });

  it("reclaims fulfillment when a processing lease is stale", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,

      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.TICKETS,

      fulfillmentAttemptCount: 1,

      fulfillmentLeaseToken: "stale-recovery-lease",

      fulfillmentLeaseExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    const result = await recoverOrderFulfillmentsService();

    expect(result).toMatchObject({
      candidates: 1,
      completed: 1,
      failed: 0,
    });

    const orderInDb = await Order.findById(order._id)
      .select("+fulfillmentLeaseToken")
      .lean();

    expect(orderInDb).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,

      fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,

      fulfillmentAttemptCount: 2,
    });

    expect(orderInDb.fulfillmentLeaseToken).toBe(null);

    expect(orderInDb.fulfillmentLeaseExpiresAt).toBe(null);

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(1);
  });

  it("moves fulfillment to manual review after five failed attempts and stops automatic retries", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
    });

    generateOfficialTicketDocumentMock.mockRejectedValue(
      new Error("Persistent document failure"),
    );

    for (let expectedAttempt = 1; expectedAttempt <= 5; expectedAttempt += 1) {
      if (expectedAttempt > 1) {
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            fulfillmentNextRetryAt: new Date(Date.now() - 1000),
          },
        });
      }

      const result = await recoverOrderFulfillmentsService();

      expect(result).toMatchObject({
        candidates: 1,
        completed: 0,
        failed: 1,
      });

      const currentOrder = await Order.findById(order._id).lean();

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

    const finalOrder = await Order.findById(order._id).lean();

    expect(finalOrder).toMatchObject({
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW,

      fulfillmentAttemptCount: 5,
    });

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(1);

    expect(generateOfficialTicketDocumentMock).toHaveBeenCalledTimes(5);
  });
  it("recreates only a missing ticket slot when an order is partially fulfilled", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
      quantity: 3,
    });

    const initialTickets = await generateTicketsForOrderService(
      String(order._id),
    );

    expect(initialTickets).toHaveLength(3);

    expect(
      new Set(
        initialTickets.map(
          (ticket) => `${ticket.orderItemIndex}:${ticket.orderItemUnitIndex}`,
        ),
      ),
    ).toEqual(new Set(["0:0", "0:1", "0:2"]));

    await Ticket.deleteOne({
      orderId: order._id,
      orderItemIndex: 0,
      orderItemUnitIndex: 1,
    });

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(2);

    const recoveredTickets = await generateTicketsForOrderService(
      String(order._id),
    );

    expect(recoveredTickets).toHaveLength(3);

    const recoveredSlots = new Set(
      recoveredTickets.map(
        (ticket) => `${ticket.orderItemIndex}:${ticket.orderItemUnitIndex}`,
      ),
    );

    expect(recoveredSlots).toEqual(new Set(["0:0", "0:1", "0:2"]));

    expect(recoveredSlots.size).toBe(3);

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(3);
  });
  it("creates exactly one ticket per order slot when generation runs concurrently", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const order = await createConfirmedPaidOrder({
      event,
      ticketType,
      quantity: 3,
    });

    const [firstResult, secondResult] = await Promise.all([
      generateTicketsForOrderService(String(order._id)),

      generateTicketsForOrderService(String(order._id)),
    ]);

    expect(firstResult).toHaveLength(3);
    expect(secondResult).toHaveLength(3);

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(tickets).toHaveLength(3);

    const slotKeys = tickets.map(
      (ticket) => `${ticket.orderItemIndex}:${ticket.orderItemUnitIndex}`,
    );

    expect(new Set(slotKeys)).toEqual(new Set(["0:0", "0:1", "0:2"]));

    expect(new Set(slotKeys).size).toBe(3);
  });
});
