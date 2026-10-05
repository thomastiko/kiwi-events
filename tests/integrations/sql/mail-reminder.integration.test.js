import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEvent;
let createTicketTypeRepository;
let reserveTicketTypeStock;

let createOrder;

let findTicketsByOrderId;
let updateTicketById;
let generateTicketsForOrderService;

let sendTomorrowEventRemindersService;
let findParticipantOrdersForEvent;

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

let MAIL_TEMPLATE_KEYS;

let TEST_FEATURES;
let dispatchTemplateMailSafeMock;

async function loadMailReminderSqlIntegrationModules({
  ticketing = true,
  guestCheckout = true,
  ticketPdf = false,
  ticketQr = false,
  mail = true,
  mailOrderConfirmation = true,
  mailOrderCancellation = true,
  mailEventCancellation = true,
  mailEventReminder = true,
} = {}) {
  vi.resetModules();

  dispatchTemplateMailSafeMock = vi.fn().mockResolvedValue({
    success: true,
    emailLogId: "sql-mail-reminder-log-1",
    providerMessageId: "mail_sql_reminder_123",
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      branding: {
        appName: "Kiwi Events Test",
      },
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      payments: {
        provider: "mollie",
        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",
          webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
        },
      },
      mail: {
        provider: "smtp",
      },
    },
  }));

  TEST_FEATURES = {
    ticketing,
    guestCheckout,
    depositTickets: false,
    ticketPdf,
    ticketQr,
    mail,
    mailOrderConfirmation,
    mailOrderCancellation,
    mailEventCancellation,
    mailEventReminder,
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

  vi.doMock("../../../src/modules/mail/mail.dispatch.service.js", () => ({
    dispatchTemplateMailSafe: dispatchTemplateMailSafeMock,
  }));

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
    createPaymentRefund: vi.fn(),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: vi.fn().mockResolvedValue({
      skipped: true,
      reason: "ticket_pdf_disabled_in_test",
    }),
    buildOfficialTicketAttachment: vi.fn().mockResolvedValue(null),
    buildExistingOfficialTicketAttachment: vi.fn().mockResolvedValue(null),
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
  const mailConstantsModule =
    await import("../../../src/modules/mail/mail.constants.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");
  const eventReminderServiceModule =
    await import("../../../src/modules/events/event.reminder.service.js");
  const eventOrderAudienceServiceModule =
    await import("../../../src/modules/events/event.orderAudience.service.js");

  createEvent = eventRepositoryModule.createEvent;

  createTicketTypeRepository = ticketTypeRepositoryModule.createTicketType;
  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;

  createOrder = orderRepositoryModule.createOrder;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  updateTicketById = ticketRepositoryModule.updateTicketById;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;

  sendTomorrowEventRemindersService =
    eventReminderServiceModule.sendTomorrowEventRemindersService;
  findParticipantOrdersForEvent =
    eventOrderAudienceServiceModule.findParticipantOrdersForEvent;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  MAIL_TEMPLATE_KEYS = mailConstantsModule.MAIL_TEMPLATE_KEYS;
}

function buildSessionStartingAt(startAt) {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt: start,
    endAt: end,
    timezone: "Europe/Vienna",
    locationLabel: "Audimax",
    locationDetails: "Room 1",
    capacity: 100,
    status: "scheduled",
  };
}

async function createEventWithSession({ startAt, overrides = {} } = {}) {
  const sessionStartAt =
    startAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return createEvent({
    title: "SQL Mail Reminder Event",
    slug: `sql-mail-reminder-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL mail reminder integration event",
    description: "Created by SQL mail reminder integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["sql", "mail-reminder"],
    sessions: [buildSessionStartingAt(sessionStartAt)],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    notesInternal: "Created by SQL mail reminder integration test",
    ...overrides,
  });
}

async function createReminderTicketType(event, overrides = {}) {
  return createTicketTypeRepository({
    eventId: event.id,
    name: `${event.title} - Reminder Ticket`,
    displayName: "SQL Reminder Ticket",
    description: "SQL mail reminder test ticket",
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

async function createConfirmedOrderWithTickets({
  event,
  ticketType,
  quantity = 1,
  email = "kunde@example.com",
  firstName = "Max",
  lastName = "Kunde",
  buyerExternalUserId = "host-customer-1",
  totalPrice = 2500,
  createTickets = true,
  orderOverrides = {},
} = {}) {
  const order = await createOrder({
    orderNumber: `ORD-SQL-MAIL-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    buyerExternalProvider: "dummy",
    buyerExternalUserId,
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

    status: ORDER_STATUS.CONFIRMED,
    paymentStatus:
      totalPrice > 0
        ? ORDER_PAYMENT_STATUS.PAID
        : ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    paymentProvider:
      totalPrice > 0
        ? ORDER_PAYMENT_PROVIDER.MOLLIE
        : ORDER_PAYMENT_PROVIDER.NONE,
    paymentProviderPaymentId: totalPrice > 0 ? "pay_sql_mail_123" : null,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: new Date(),
    expiresAt: null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,

    ...orderOverrides,
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

describe("Mail reminder SQL integration", () => {
  beforeAll(async () => {
    await loadMailReminderSqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    TEST_FEATURES.ticketing = true;
    TEST_FEATURES.guestCheckout = true;
    TEST_FEATURES.depositTickets = false;
    TEST_FEATURES.ticketPdf = false;
    TEST_FEATURES.ticketQr = false;
    TEST_FEATURES.mail = true;
    TEST_FEATURES.mailOrderConfirmation = true;
    TEST_FEATURES.mailOrderCancellation = true;
    TEST_FEATURES.mailEventCancellation = true;
    TEST_FEATURES.mailEventReminder = true;
    TEST_FEATURES.media = false;
    TEST_FEATURES.reminders = false;

    dispatchTemplateMailSafeMock?.mockClear();
    dispatchTemplateMailSafeMock?.mockResolvedValue({
      success: true,
      emailLogId: "sql-mail-reminder-log-1",
      providerMessageId: "mail_sql_reminder_123",
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("treats ACTIVE and CHECKED_IN tickets as participant-mail audience", async () => {
    const event = await createEventWithSession();
    const ticketType = await createReminderTicketType(event);

    const active = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "active@example.com",
      buyerExternalUserId: "active-user",
    });
    const checkedIn = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "checked@example.com",
      buyerExternalUserId: "checked-user",
    });
    const cancelled = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "cancelled@example.com",
      buyerExternalUserId: "cancelled-user",
    });

    for (const ticket of await findTicketsByOrderId(checkedIn.order.id, {
      lean: true,
    })) {
      await updateTicketById(
        ticket.id,
        { status: TICKET_STATUS.CHECKED_IN },
        { lean: true },
      );
    }

    for (const ticket of await findTicketsByOrderId(cancelled.order.id, {
      lean: true,
    })) {
      await updateTicketById(
        ticket.id,
        { status: TICKET_STATUS.CANCELLED },
        { lean: true },
      );
    }

    const audience = await findParticipantOrdersForEvent(event.id);
    const orderNumbers = audience.map((order) => order.orderNumber).sort();

    expect(orderNumbers).toEqual(
      [active.order.orderNumber, checkedIn.order.orderNumber].sort(),
    );
  });

  it("sends tomorrow reminders for confirmed orders with active tickets", async () => {
    const now = new Date("2026-06-08T10:00:00.000Z");
    const tomorrow = new Date("2026-06-09T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: tomorrow,
      overrides: {
        title: "SQL Tomorrow Reminder Event",
        slug: "sql-tomorrow-reminder-event",
      },
    });

    const ticketType = await createReminderTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "reminder@example.com",
      firstName: "Rita",
      lastName: "Reminder",
    });

    const result = await sendTomorrowEventRemindersService({
      now,
    });

    expect(result).toMatchObject({
      success: true,
      eventsChecked: 1,
      ordersChecked: 1,
      sent: 1,
      skippedCount: 0,
      failed: 0,
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledTimes(1);
    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: MAIL_TEMPLATE_KEYS.EVENT_REMINDER_TOMORROW,
        to: {
          email: "reminder@example.com",
          name: "Rita Reminder",
        },
        variables: expect.objectContaining({
          firstName: "Rita",
          lastName: "Reminder",
          displayName: "Rita Reminder",
          eventTitle: "SQL Tomorrow Reminder Event",
          eventDate: "09.06.2026, 14:00",
          eventLocation: "Audimax – Room 1",
          eventTeamName: "Kiwi Events Test",
        }),
        source: {
          module: "events",
          entityType: "Order",
          entityId: order.id,
        },
        context: {
          eventUserId: null,
        },
      }),
    );
  });

  it("skips already sent tomorrow reminders using SQL email logs", async () => {
    const now = new Date("2026-06-08T10:00:00.000Z");
    const tomorrow = new Date("2026-06-09T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: tomorrow,
      overrides: {
        title: "SQL Already Sent Reminder Event",
        slug: "sql-already-sent-reminder-event",
      },
    });

    const ticketType = await createReminderTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "already.sent@example.com",
      firstName: "Already",
      lastName: "Sent",
    });

    dispatchTemplateMailSafeMock.mockResolvedValueOnce({
      success: true,
      skipped: true,
      reason: "mail_already_sent",
      emailLogId: "sql-mail-reminder-log-1",
    });

    const result = await sendTomorrowEventRemindersService({
      now,
    });

    expect(result).toMatchObject({
      success: true,
      eventsChecked: 1,
      ordersChecked: 1,
      sent: 0,
      skippedCount: 1,
      failed: 0,
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledTimes(1);
    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: MAIL_TEMPLATE_KEYS.EVENT_REMINDER_TOMORROW,
        source: {
          module: "events",
          entityType: "Order",
          entityId: order.id,
        },
      }),
    );
  });

  it("ignores events that are not tomorrow", async () => {
    const now = new Date("2026-06-08T10:00:00.000Z");
    const dayAfterTomorrow = new Date("2026-06-10T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: dayAfterTomorrow,
      overrides: {
        title: "SQL Future Reminder Event",
        slug: "sql-future-reminder-event",
      },
    });

    const ticketType = await createReminderTicketType(event);

    await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "future@example.com",
    });

    const result = await sendTomorrowEventRemindersService({
      now,
    });

    expect(result).toMatchObject({
      success: true,
      eventsChecked: 0,
      ordersChecked: 0,
      sent: 0,
      skippedCount: 0,
      failed: 0,
    });

    expect(dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("does not send reminders for orders whose tickets are cancelled", async () => {
    const now = new Date("2026-06-08T10:00:00.000Z");
    const tomorrow = new Date("2026-06-09T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: tomorrow,
      overrides: {
        title: "SQL Cancelled Ticket Reminder Event",
        slug: "sql-cancelled-ticket-reminder-event",
      },
    });

    const ticketType = await createReminderTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "cancelled.ticket@example.com",
      firstName: "Cancelled",
      lastName: "Ticket",
    });

    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    for (const ticket of tickets) {
      await updateTicketById(
        ticket.id,
        {
          status: TICKET_STATUS.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: "Cancelled before reminder",
        },
        {
          lean: true,
        },
      );
    }

    const result = await sendTomorrowEventRemindersService({
      now,
    });

    expect(result).toMatchObject({
      success: true,
      eventsChecked: 1,
      ordersChecked: 0,
      sent: 0,
      skippedCount: 0,
      failed: 0,
    });

    expect(dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("skips reminder processing when mail feature is disabled", async () => {
    TEST_FEATURES.mail = false;
    TEST_FEATURES.mailEventReminder = true;

    const result = await sendTomorrowEventRemindersService({
      now: new Date("2026-06-08T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      reason: "mail_feature_disabled",
      eventsChecked: 0,
      ordersChecked: 0,
      sent: 0,
      skippedCount: 0,
      failed: 0,
    });

    expect(dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("skips reminder processing when event reminder mail feature is disabled", async () => {
    TEST_FEATURES.mail = true;
    TEST_FEATURES.mailEventReminder = false;

    const result = await sendTomorrowEventRemindersService({
      now: new Date("2026-06-08T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      reason: "mail_event_reminder_disabled",
      eventsChecked: 0,
      ordersChecked: 0,
      sent: 0,
      skippedCount: 0,
      failed: 0,
    });

    expect(dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("counts failed reminder dispatches", async () => {
    const now = new Date("2026-06-08T10:00:00.000Z");
    const tomorrow = new Date("2026-06-09T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: tomorrow,
      overrides: {
        title: "SQL Failed Reminder Event",
        slug: "sql-failed-reminder-event",
      },
    });

    const ticketType = await createReminderTicketType(event);

    await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "failed.reminder@example.com",
      firstName: "Failed",
      lastName: "Reminder",
    });

    dispatchTemplateMailSafeMock.mockResolvedValueOnce({
      success: false,
      error: "Mail provider failed",
    });

    const result = await sendTomorrowEventRemindersService({
      now,
    });

    expect(result).toMatchObject({
      success: true,
      eventsChecked: 1,
      ordersChecked: 1,
      sent: 0,
      skippedCount: 0,
      failed: 1,
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledTimes(1);
  });
});
