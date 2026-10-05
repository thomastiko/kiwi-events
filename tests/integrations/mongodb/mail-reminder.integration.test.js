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

import { findEventById } from "../../../src/modules/events/repositories/event.repository.js";

import { findOrderById } from "../../../src/modules/orders/repositories/order.repository.js";

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

let generateTicketsForOrderService;

let sendOrderConfirmedMailSafe;
let sendEventCancelledMailForOrderSafe;
let sendEventCancelledMailsSafe;
let findConfirmedOrdersWithActiveTicketsForEvent;
let findParticipantOrdersForEvent;
let sendTomorrowEventRemindersService;

let dispatchTemplateMailSafeMock;

async function loadMailReminderIntegrationModules({
  ticketing = true,
  payments = true,
  guestCheckout = true,
  ticketPdf = false,
  ticketQr = false,
  mail = true,
  mailOrderConfirmation = true,
  mailEventCancellation = true,
  mailEventReminder = true,
} = {}) {
  vi.resetModules();

  dispatchTemplateMailSafeMock = vi.fn().mockResolvedValue({
    success: true,
    emailLogId: "6a0000000000000000000009",
    providerMessageId: "mail_test_123",
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
      features: {
        ticketing,
        payments,
        guestCheckout,
        ticketPdf,
        ticketQr,
        mail,
        mailOrderConfirmation,
        mailEventCancellation,
        mailEventReminder,
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
      mailOrderConfirmation,
      mailEventCancellation,
      mailEventReminder,
    };

    return {
      features: mockedFeatures,
      isFeatureEnabled: (featureName) => Boolean(mockedFeatures[featureName]),
    };
  });

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

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");
  const orderMailServiceModule =
    await import("../../../src/modules/orders/order.mail.service.js");
  const eventMailServiceModule =
    await import("../../../src/modules/events/event.mail.service.js");
  const eventOrderAudienceServiceModule =
    await import("../../../src/modules/events/event.orderAudience.service.js");
  const eventReminderServiceModule =
    await import("../../../src/modules/events/event.reminder.service.js");

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

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;

  sendOrderConfirmedMailSafe =
    orderMailServiceModule.sendOrderConfirmedMailSafe;
  sendEventCancelledMailForOrderSafe =
    eventMailServiceModule.sendEventCancelledMailForOrderSafe;
  sendEventCancelledMailsSafe =
    eventMailServiceModule.sendEventCancelledMailsSafe;
  findConfirmedOrdersWithActiveTicketsForEvent =
    eventOrderAudienceServiceModule.findConfirmedOrdersWithActiveTicketsForEvent;
  findParticipantOrdersForEvent =
    eventOrderAudienceServiceModule.findParticipantOrdersForEvent;
  sendTomorrowEventRemindersService =
    eventReminderServiceModule.sendTomorrowEventRemindersService;
}

function buildSessionStartingAt(startAt) {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt: start,
    endAt: end,
    timezone: "Europe/Vienna",
    locationLabel: "Audimax",
    capacity: 100,
  };
}

async function createEventWithSession({ startAt, overrides = {} } = {}) {
  const sessionStartAt =
    startAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return Event.create({
    title: "Mail Reminder Event",
    slug: `mail-reminder-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "Mail reminder integration event",
    description: "Created by mail reminder integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildSessionStartingAt(sessionStartAt)],
    isFree: false,
    publishedAt: new Date(),
    ...overrides,
  });
}

async function createTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Mail Ticket`,
    displayName: "Mail Ticket",
    description: "Mail test ticket",
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
  const order = await Order.create({
    orderNumber: `ORD-MAIL-${Date.now()}-${Math.random()
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

    status: ORDER_STATUS.CONFIRMED,
    paymentStatus:
      totalPrice > 0
        ? ORDER_PAYMENT_STATUS.PAID
        : ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    paymentProvider:
      totalPrice > 0
        ? ORDER_PAYMENT_PROVIDER.MOLLIE
        : ORDER_PAYMENT_PROVIDER.NONE,
    paymentProviderPaymentId: totalPrice > 0 ? "pay_mail_123" : null,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: new Date(),
    expiresAt: null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,

    ...orderOverrides,
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

describe("Mail and reminder MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadMailReminderIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    dispatchTemplateMailSafeMock?.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends order confirmation mail using buyer snapshot data", async () => {
    const event = await createEventWithSession();
    const ticketType = await createTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      email: "kunde@example.com",
      firstName: "Max",
      lastName: "Kunde",
    });

    const result = await sendOrderConfirmedMailSafe({
      order: await findOrderById(String(order._id), {
        lean: true,
      }),
      context: {
        eventUserId: "6a0000000000000000000001",
      },
    });

    expect(result).toMatchObject({
      skipped: false,
      email: "kunde@example.com",
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledTimes(1);
    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "order.confirmed",
        to: {
          email: "kunde@example.com",
          name: "Max Kunde",
        },
        variables: expect.objectContaining({
          firstName: "Max",
          lastName: "Kunde",
          displayName: "Max Kunde",
          eventTitle: event.title,
          orderNumber: order.orderNumber,
          eventTeamName: "Kiwi Events Test",
        }),
        source: expect.objectContaining({
          module: "orders",
          entityType: "Order",
          entityId: String(order._id),
        }),
        context: expect.objectContaining({
          eventUserId: "6a0000000000000000000001",
        }),
      }),
    );
  });

  it("skips order confirmation mail when mail feature is disabled", async () => {
    await loadMailReminderIntegrationModules({
      mail: false,
      mailOrderConfirmation: true,
    });

    await clearMongoTestDb();

    const event = await createEventWithSession();
    const ticketType = await createTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
    });

    const result = await sendOrderConfirmedMailSafe({
      order: await findOrderById(String(order._id), {
        lean: true,
      }),
    });

    expect(result).toMatchObject({
      skipped: true,
      reason: "mail_feature_disabled",
    });

    expect(dispatchTemplateMailSafeMock).not.toHaveBeenCalled();

    await loadMailReminderIntegrationModules();
  });

  it("skips order confirmation mail when buyer email snapshot is missing", async () => {
    const event = await createEventWithSession();
    const ticketType = await createTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "",
    });

    const result = await sendOrderConfirmedMailSafe({
      order: await Order.findById(order._id).lean(),
    });

    expect(result).toMatchObject({
      skipped: true,
      reason: "missing_buyer_email_snapshot",
    });

    expect(dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("resolves the event cancellation audience before sending mails", async () => {
    const event = await createEventWithSession();
    const ticketType = await createTicketType(event);

    const first = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "first@example.com",
      buyerExternalUserId: "first-user",
    });

    const second = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "second@example.com",
      buyerExternalUserId: "second-user",
    });

    await Ticket.updateMany(
      {
        orderId: second.order._id,
      },
      {
        $set: {
          status: TICKET_STATUS.CANCELLED,
        },
      },
    );

    const audience = await findConfirmedOrdersWithActiveTicketsForEvent(
      String(event._id),
    );

    expect(audience).toHaveLength(1);
    expect(audience[0].orderNumber).toBe(first.order.orderNumber);

    const result = await sendEventCancelledMailsSafe({
      event: await findEventById(String(event._id), {
        lean: true,
      }),

      orders: audience,

      cancellationReason: "Cancelled for test",
      context: {
        eventUserId: "6a0000000000000000000001",
      },
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      sentCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(result.sentItems).toHaveLength(1);
    expect(result.skippedItems).toHaveLength(0);
    expect(result.failedItems).toHaveLength(0);

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledTimes(1);
    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "event.cancelled",
        to: {
          email: "first@example.com",
          name: "Max Kunde",
        },
        variables: expect.objectContaining({
          firstName: "Max",
          eventTitle: event.title,
          cancellationReason: "Cancelled for test",
        }),
        source: {
          module: "events",
          entityType: "Order",
          entityId: String(first.order._id),
        },
      }),
    );
  });

  it("treats ACTIVE and CHECKED_IN tickets as participant-mail audience", async () => {
    const event = await createEventWithSession();
    const ticketType = await createTicketType(event);

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

    await Ticket.updateMany(
      { orderId: checkedIn.order._id },
      { $set: { status: TICKET_STATUS.CHECKED_IN } },
    );
    await Ticket.updateMany(
      { orderId: cancelled.order._id },
      { $set: { status: TICKET_STATUS.CANCELLED } },
    );

    const audience = await findParticipantOrdersForEvent(String(event._id));
    const orderNumbers = audience.map((order) => order.orderNumber).sort();

    expect(orderNumbers).toEqual(
      [active.order.orderNumber, checkedIn.order.orderNumber].sort(),
    );
  });

  it("allows an explicit event cancellation resend without automatic deduplication", async () => {
    const event = await createEventWithSession({
      overrides: {
        status: EVENT_STATUSES.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: "Event cancelled",
      },
    });

    const ticketType = await createTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "resend@example.com",
      firstName: "Resend",
      lastName: "Buyer",
    });

    const result = await sendEventCancelledMailForOrderSafe({
      event: await findEventById(String(event._id), {
        lean: true,
      }),
      order: await findOrderById(String(order._id), {
        lean: true,
      }),
      cancellationReason: "Event cancelled",
      deliveryMode: "always",
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "event.cancelled",
        to: {
          email: "resend@example.com",
          name: "Resend Buyer",
        },
        source: {
          module: "events",
          entityType: "Order",
          entityId: String(order._id),
        },
      }),
    );

    expect(result).toMatchObject({
      skipped: false,
      email: "resend@example.com",
    });
  });

  it("sends tomorrow reminders for confirmed orders with active tickets", async () => {
    const now = new Date("2026-06-08T10:00:00.000Z");
    const tomorrow = new Date("2026-06-09T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: tomorrow,
      overrides: {
        title: "Tomorrow Reminder Event",
        slug: "tomorrow-reminder-event",
      },
    });

    const ticketType = await createTicketType(event);

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
        templateKey: "event.reminder.tomorrow",
        to: {
          email: "reminder@example.com",
          name: "Rita Reminder",
        },
        variables: expect.objectContaining({
          firstName: "Rita",
          eventTitle: "Tomorrow Reminder Event",
          eventTeamName: "Kiwi Events Test",
        }),
        source: {
          module: "events",
          entityType: "Order",
          entityId: String(order._id),
        },
      }),
    );
  });

  it("skips already sent tomorrow reminders", async () => {
    dispatchTemplateMailSafeMock.mockResolvedValueOnce({
      success: true,
      skipped: true,
      reason: "mail_already_sent",
      emailLogId: "6a0000000000000000000009",
    });

    const now = new Date("2026-06-08T10:00:00.000Z");
    const tomorrow = new Date("2026-06-09T12:00:00.000Z");

    const event = await createEventWithSession({
      startAt: tomorrow,
      overrides: {
        title: "Already Sent Reminder Event",
        slug: "already-sent-reminder-event",
      },
    });

    const ticketType = await createTicketType(event);

    const { order } = await createConfirmedOrderWithTickets({
      event,
      ticketType,
      email: "already.sent@example.com",
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
        templateKey: "event.reminder.tomorrow",
        source: {
          module: "events",
          entityType: "Order",
          entityId: String(order._id),
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
        title: "Future Reminder Event",
        slug: "future-reminder-event",
      },
    });

    const ticketType = await createTicketType(event);

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
});
