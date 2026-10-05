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

let TICKET_STATUS;
let TICKET_KIND;
let TICKET_DEPOSIT_REFUND_STATUS;

let EVENT_USER_ROLES;

let generateTicketsForOrderService;
let setInternalTicketCheckInService;
let cancelInternalTicketService;
let cancelTicketsForOrderService;
let getInternalTicketByIdService;
let createPaymentRefundMock;
let listEventTicketsInternalService;

async function loadTicketLifecycleIntegrationModules({
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

  createPaymentRefundMock = vi.fn().mockResolvedValue({
    providerRefundId: "refund_test_123",
    status: "refunded",
  });

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

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;
  TICKET_KIND = ticketConstantsModule.TICKET_KIND;
  TICKET_DEPOSIT_REFUND_STATUS =
    ticketConstantsModule.TICKET_DEPOSIT_REFUND_STATUS;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;
  getInternalTicketByIdService =
    ticketServiceModule.getInternalTicketByIdService;
  setInternalTicketCheckInService =
    ticketServiceModule.setInternalTicketCheckInService;
  cancelInternalTicketService = ticketServiceModule.cancelInternalTicketService;
  cancelTicketsForOrderService =
    ticketServiceModule.cancelTicketsForOrderService;
  listEventTicketsInternalService =
    ticketServiceModule.listEventTicketsInternalService;
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
  return {
    eventUserId: "6a0000000000000000000001",
    eventUser: {
      id: "6a0000000000000000000001",
      role: EVENT_USER_ROLES.ADMIN,
      grants: [],
      denies: [],
    },
  };
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Ticket Lifecycle Event",
    slug: `ticket-lifecycle-event-${Date.now()}`,
    shortDescription: "Ticket lifecycle integration event",
    description: "Created by ticket lifecycle integration test.",
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
    name: `${event.title} - Lifecycle Ticket`,
    displayName: "Lifecycle Ticket",
    description: "Ticket lifecycle test ticket",
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

async function createConfirmedOrderWithTickets({
  quantity = 1,
  ticketKind = TICKET_TYPE_KIND.NORMAL,
  paymentProviderPaymentId = "pay_lifecycle_123",
} = {}) {
  const event = await createPublishedEvent();

  const ticketType = await createTicketType(event, {
    ticketKind,
    pricingMode: "fixed",
    priceGross: 2500,
    stockTotal: 10,
    stockSold: quantity,
  });

  const order = await Order.create({
    orderNumber: `ORD-LIFECYCLE-${Date.now()}`,

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
        unitPrice: 2500,
        lineTotal: 2500 * quantity,
        currency: "EUR",
        ticketTypeNameSnapshot: ticketType.displayName,
        ticketTypeDescriptionSnapshot: ticketType.description,
        ticketKindSnapshot: ticketKind,
        pricingModeSnapshot: ticketType.pricingMode,
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

  const tickets = await generateTicketsForOrderService(order._id, {
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

describe("Ticket lifecycle MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadTicketLifecycleIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    createPaymentRefundMock?.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });
  it("lists event tickets using the admin ticket contract", async () => {
    const { event, order, ticketType, tickets } =
      await createConfirmedOrderWithTickets({
        quantity: 2,
      });

    const actor = buildInternalActor();

    await Ticket.findByIdAndUpdate(tickets[1].id, {
      status: TICKET_STATUS.CHECKED_IN,

      checkedInAt: new Date(),

      checkedInByEventUserId: actor.eventUserId,

      updatedByEventUserId: actor.eventUserId,
    });

    const result = await listEventTicketsInternalService({
      actor,

      eventId: String(event._id),

      page: 1,
      limit: 20,
      sortBy: "createdAt",

      sortOrder: "desc",
    });

    expect(Object.keys(result).sort()).toEqual(["items", "meta"]);

    expect(result.items).toHaveLength(2);

    for (const ticket of result.items) {
      expect(ticket).toMatchObject({
        orderId: String(order._id),

        buyer: {
          type: ORDER_BUYER_TYPE.EXTERNAL_USER,

          email: "kunde@example.com",

          displayName: "Max Kunde",
        },

        event: {
          id: String(event._id),

          title: event.title,
        },

        ticketType: {
          id: String(ticketType._id),

          displayName: ticketType.displayName,

          kind: ticketType.ticketKind,
        },

        pricing: {
          currency: "EUR",

          unitPrice: 2500,
        },

        document: {
          available: false,

          generatedAt: null,
        },
      });

      expect(ticket.id).toBeTypeOf("string");

      expect(ticket.createdAt).toBeTypeOf("string");

      expect(ticket.updatedAt).toBeTypeOf("string");
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
        active: 1,
        checkedIn: 1,
        cancelled: 0,
        refunded: 0,
      },
    });

    const serialized = JSON.stringify(result);

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
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
  it("returns an admin ticket detail using the stable DTO contract", async () => {
    const { event, order, ticketType, tickets } =
      await createConfirmedOrderWithTickets({
        quantity: 1,
      });

    const ticket = tickets[0];

    const result = await getInternalTicketByIdService({
      actor: buildInternalActor(),

      ticketId: ticket.id,
    });

    expect(result).toMatchObject({
      id: String(ticket.id),

      ticketCode: ticket.ticketCode,

      orderId: String(order._id),

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
        id: String(event._id),

        title: event.title,

        slug: event.slug,

        category: event.category,
      },

      ticketType: {
        id: String(ticketType._id),

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

        checkedInByEventUserId: null,
      },

      cancellation: {
        cancelledAt: null,

        reason: null,
      },

      document: {
        available: false,

        generatedAt: null,
      },

      depositRefund: {
        status: "not_required",

        amount: 0,

        currency: "EUR",

        providerRefundId: null,

        triggeredAt: null,

        triggeredByEventUserId: null,

        failureReason: null,
      },

      audit: {
        createdByEventUserId: null,

        updatedByEventUserId: null,
      },
    });

    expect(result.event.startsAt).toBeTypeOf("string");

    expect(result.createdAt).toBeTypeOf("string");

    expect(result.updatedAt).toBeTypeOf("string");

    const serialized = JSON.stringify(result);

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
      "checkInPayloadVersion",
      "checkInTokenCreatedAt",
      "checkInTokenRotatedAt",
      "checkInTokenLastUsedAt",

      "ticketPdfStorageKey",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
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
      id: String(ticket.id),

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),

        checkedInByEventUserId: actor.eventUserId,
      },
    });

    const ticketInDb = await Ticket.findById(ticket.id).lean();

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

    expect(ticketInDb.checkedInAt).toBeTruthy();

    expect(String(ticketInDb.checkedInByEventUserId)).toBe(actor.eventUserId);
  });
  it("keeps a checked-in normal ticket unchanged when checkedIn true is repeated", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const firstResult = await setInternalTicketCheckInService({
      actor,
      ticketId: ticket.id,
      checkedIn: true,
    });

    const replayResult = await setInternalTicketCheckInService({
      actor,
      ticketId: ticket.id,
      checkedIn: true,
    });

    expect(firstResult.statusChanged).toBe(true);

    expect(replayResult.statusChanged).toBe(false);

    expect(replayResult.ticket).toMatchObject({
      id: String(ticket.id),

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: firstResult.ticket.checkIn.checkedInAt,

        checkedInByEventUserId: actor.eventUserId,
      },
    });
  });
  it("keeps an active ticket unchanged when checkedIn false is requested", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const result = await setInternalTicketCheckInService({
      actor,
      ticketId: ticket.id,
      checkedIn: false,
    });

    expect(result.statusChanged).toBe(false);

    expect(result.ticket).toMatchObject({
      id: String(ticket.id),

      status: TICKET_STATUS.ACTIVE,

      checkIn: {
        checkedInAt: null,

        checkedInByEventUserId: null,
      },
    });

    const ticketInDb = await Ticket.findById(ticket.id).lean();

    expect(ticketInDb.status).toBe(TICKET_STATUS.ACTIVE);

    expect(ticketInDb.checkedInAt).toBe(null);
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
      id: String(ticket.id),

      status: TICKET_STATUS.ACTIVE,

      checkIn: {
        checkedInAt: null,

        checkedInByEventUserId: null,
      },
    });

    const ticketInDb = await Ticket.findById(ticket.id).lean();

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
      id: String(ticket.id),

      status: TICKET_STATUS.CANCELLED,

      cancellation: {
        cancelledAt: expect.any(String),

        reason: "Customer requested cancellation",
      },
    });

    const ticketInDb = await Ticket.findById(ticket.id).lean();

    expect(ticketInDb.status).toBe(TICKET_STATUS.CANCELLED);

    expect(ticketInDb.cancelledAt).toBeTruthy();

    expect(ticketInDb.cancellationReason).toBe(
      "Customer requested cancellation",
    );

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(1);
  });
  it("does not cancel or release stock twice", async () => {
    const { ticketType, tickets } = await createConfirmedOrderWithTickets({
      quantity: 2,
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    const firstResult = await cancelInternalTicketService({
      actor,
      ticketId: ticket.id,

      reason: "First cancellation",
    });

    const replayResult = await cancelInternalTicketService({
      actor,
      ticketId: ticket.id,

      reason: "Must not overwrite",
    });

    expect(firstResult.statusChanged).toBe(true);

    expect(replayResult.statusChanged).toBe(false);

    expect(replayResult.ticket).toMatchObject({
      id: String(ticket.id),

      status: TICKET_STATUS.CANCELLED,

      cancellation: {
        cancelledAt: expect.any(String),

        reason: "First cancellation",
      },
    });

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

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

      code: "CANCELLED_TICKET_CHECK_IN_FORBIDDEN",

      message: "Cancelled tickets cannot be checked in.",
    });
  });

  it("cancels all tickets for an order and releases stock", async () => {
    const { order, ticketType } = await createConfirmedOrderWithTickets({
      quantity: 3,
    });

    const actor = buildInternalActor();

    await cancelTicketsForOrderService({
      orderId: order._id,
      actor,
    });

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(tickets).toHaveLength(3);
    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("does not check out a deposit ticket after check-in", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,

      ticketKind: TICKET_KIND.DEPOSIT,

      paymentProviderPaymentId: "pay_deposit_checkout_forbidden",
    });

    const ticket = tickets[0];
    const actor = buildInternalActor();

    await setInternalTicketCheckInService({
      actor,
      ticketId: ticket.id,

      checkedIn: true,
    });

    await expect(
      setInternalTicketCheckInService({
        actor,
        ticketId: ticket.id,

        checkedIn: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,

      code: "DEPOSIT_TICKET_CHECKOUT_FORBIDDEN",

      message: "Deposit tickets cannot be checked out after check-in.",
    });

    const ticketInDb = await Ticket.findById(ticket.id).lean();

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

    expect(ticketInDb.depositRefundStatus).toBe(
      TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
    );

    expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
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
      id: String(ticket.id),

      status: TICKET_STATUS.CHECKED_IN,

      checkIn: {
        checkedInAt: expect.any(String),

        checkedInByEventUserId: actor.eventUserId,
      },
    });

    const ticketInDb = await Ticket.findById(ticket.id).lean();

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);
    expect(ticketInDb.depositRefundStatus).toBe(
      TICKET_DEPOSIT_REFUND_STATUS.FAILED,
    );
    expect(ticketInDb.depositRefundFailureReason).toBe(
      "Missing payment provider payment id",
    );
  });
  it("refunds a deposit ticket on check-in when payment provider payment id is available", async () => {
    const { order, tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
      ticketKind: TICKET_KIND.DEPOSIT,
      paymentProviderPaymentId: "pay_deposit_success_123",
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
      id: String(ticket.id),

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
        providerPaymentId: "pay_deposit_success_123",
        amount: "25.00",
        currency: "EUR",
        description: expect.stringContaining(ticket.ticketCode),
        metadata: expect.objectContaining({
          source: "event_deposit_check_in",
          orderId: String(order._id),
          ticketId: String(ticket.id),
          eventId: String(ticket.eventId),
        }),
      }),
    );

    const ticketInDb = await Ticket.findById(ticket.id).lean();

    expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);
    expect(ticketInDb.depositRefundStatus).toBe(
      TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
    );
    expect(ticketInDb.depositRefundProviderRefundId).toBe("refund_test_123");
    expect(ticketInDb.depositRefundFailureReason).toBe(null);
    expect(String(ticketInDb.depositRefundTriggeredByEventUserId)).toBe(
      actor.eventUserId,
    );
  });
});
