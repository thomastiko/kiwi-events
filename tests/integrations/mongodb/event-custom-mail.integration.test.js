import jwt from "jsonwebtoken";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createHttpTestApp } from "../../helpers/httpTestApp.js";
import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let app;

let Event;
let EventUser;
let TicketType;
let Order;
let Ticket;
let EmailLog;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CUSTOM_MAIL_AUDIENCE;
let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;
let TICKET_STATUS;

let sendMailMock;

async function loadCustomMailMongoIntegrationApp() {
  vi.resetModules();

  sendMailMock = vi.fn().mockResolvedValue({
    messageId: "custom_mail_provider_message_1",
    response: "250 queued",
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

      mail: {
        provider: "smtp",

        defaults: {
          fromName: "Kiwi Events Test",
          fromEmail: "noreply@example.test",
          replyTo: "reply@example.test",
        },
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

  vi.doMock("../../../src/config/features.js", () => {
    const mockedFeatures = {
      ticketing: true,
      guestCheckout: true,
      depositTickets: true,
      ticketPdf: false,
      ticketQr: false,

      mail: true,
      mailOrderConfirmation: true,
      mailOrderCancellation: true,
      mailOrderRefunded: true,
      mailEventCancellation: true,
      mailEventReminder: true,
      mailEventCustom: true,

      media: true,
    };

    return {
      features: mockedFeatures,
      getFeatures: () => mockedFeatures,
      isFeatureEnabled: (featureName) => Boolean(mockedFeatures[featureName]),
    };
  });

  vi.doMock("../../../src/modules/mail/mail.transport.service.js", () => ({
    getDefaultMailSender: () => ({
      fromName: "Kiwi Events Test",
      fromEmail: "noreply@example.test",
      replyTo: "reply@example.test",
    }),

    sendMail: sendMailMock,

    clearCachedMailTransporter: vi.fn(),
    verifyMailTransport: vi.fn().mockResolvedValue(true),
  }));

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");

  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");

  const ticketTypeModelModule =
    await import("../../../src/modules/ticketTypes/ticketType.model.js");

  const orderModelModule =
    await import("../../../src/modules/orders/order.model.js");

  const ticketModelModule =
    await import("../../../src/modules/tickets/ticket.model.js");

  const mailLogModelModule =
    await import("../../../src/modules/mail/mailLog.model.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");

  const ticketConstantsModule =
    await import("../../../src/modules/tickets/ticket.constants.js");

  const internalEventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  Event = eventModelModule.Event;
  EventUser = eventUserModelModule.EventUser;
  TicketType = ticketTypeModelModule.TicketType;
  Order = orderModelModule.Order;
  Ticket = ticketModelModule.Ticket;
  EmailLog = mailLogModelModule.EmailLog;

  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;

  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  EVENT_CUSTOM_MAIL_AUDIENCE = eventConstantsModule.EVENT_CUSTOM_MAIL_AUDIENCE;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;

  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;

  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;

  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  app = createHttpTestApp({
    mountPath: "/api/admin/events",
    router: internalEventRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminToken() {
  const admin = await EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot: "admin@example.com",

    passwordHash: "not-used-in-this-test",

    firstNameSnapshot: "Admin",

    lastNameSnapshot: "User",

    role: EVENT_USER_ROLES.ADMIN,

    isActive: true,
    mustChangePassword: false,
  });

  const token = jwt.sign(
    {
      eventUserId: String(admin._id),

      email: admin.emailSnapshot,

      role: EVENT_USER_ROLES.ADMIN,

      type: "KIWI_EVENTS_admin",
    },
    LOCAL_SECRET,
  );

  return {
    admin,
    token,
  };
}

async function createParticipantOrder({ admin }) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  const event = await Event.create({
    title: "Custom Mail Integration Event",

    slug: `custom-mail-integration-${Date.now()}`,

    shortDescription: "Custom mail integration test",

    description: "Tests the real custom-mail HTTP flow.",

    category: EVENT_CATEGORIES.EVENT,

    status: EVENT_STATUSES.PUBLISHED,

    visibility: EVENT_VISIBILITIES.PUBLIC,

    location: "WU Wien",

    sessions: [
      {
        startAt,
        endAt,

        timezone: "Europe/Vienna",

        locationLabel: "Audimax",
      },
    ],

    isFree: true,

    createdByEventUserId: admin._id,

    updatedByEventUserId: admin._id,

    publishedAt: new Date(),
  });

  const ticketType = await TicketType.create({
    eventId: event._id,

    name: "custom-mail-ticket",

    displayName: "Custom Mail Ticket",

    description: "Ticket for custom mail integration test",

    status: "active",

    ticketKind: "normal",

    pricingMode: "free",

    priceGross: 0,

    currency: "EUR",

    stockTotal: 10,

    stockSold: 1,

    minPerOrder: 1,

    maxPerOrder: 5,

    isPersonalized: false,

    sessionIds: [event.sessions[0]._id],

    sortOrder: 0,
  });

  const order = await Order.create({
    orderNumber: `ORD-CUSTOM-MAIL-${Date.now()}`,

    buyerType: ORDER_BUYER_TYPE.GUEST,

    buyerEmailSnapshot: "participant@example.test",

    buyerFirstNameSnapshot: "Max",

    buyerLastNameSnapshot: "Mustermann",

    buyerDisplayNameSnapshot: "Max Mustermann",

    eventId: event._id,

    eventTitleSnapshot: event.title,

    eventSlugSnapshot: event.slug,

    eventCategorySnapshot: event.category,

    eventLocationSnapshot: event.location,

    eventStartsAtSnapshot: event.sessions[0].startAt,

    eventTimezoneSnapshot: "Europe/Vienna",

    items: [
      {
        ticketTypeId: ticketType._id,

        eventId: event._id,

        quantity: 1,

        unitPrice: 0,

        lineTotal: 0,

        currency: "EUR",

        ticketTypeNameSnapshot: ticketType.displayName,

        ticketTypeDescriptionSnapshot: ticketType.description,

        ticketKindSnapshot: ticketType.ticketKind,

        pricingModeSnapshot: ticketType.pricingMode,
      },
    ],

    currency: "EUR",

    subtotal: 0,

    totalPrice: 0,

    status: ORDER_STATUS.CONFIRMED,

    paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

    paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

    source: "public",

    confirmedAt: new Date(),
  });

  await Ticket.create({
    ticketCode: `TKT-CUSTOM-MAIL-${Date.now()}`,

    orderId: order._id,

    orderItemIndex: 0,

    orderItemUnitIndex: 0,

    eventId: event._id,

    ticketTypeId: ticketType._id,

    buyerType: "guest",

    buyerEmailSnapshot: order.buyerEmailSnapshot,

    buyerFirstNameSnapshot: order.buyerFirstNameSnapshot,

    buyerLastNameSnapshot: order.buyerLastNameSnapshot,

    buyerDisplayNameSnapshot: order.buyerDisplayNameSnapshot,

    holderType: "buyer",

    holderEmailSnapshot: order.buyerEmailSnapshot,

    holderFirstNameSnapshot: order.buyerFirstNameSnapshot,

    holderLastNameSnapshot: order.buyerLastNameSnapshot,

    holderDisplayNameSnapshot: order.buyerDisplayNameSnapshot,

    eventTitleSnapshot: event.title,

    eventSlugSnapshot: event.slug,

    eventCategorySnapshot: event.category,

    eventStartsAtSnapshot: event.sessions[0].startAt,

    ticketTypeNameSnapshot: ticketType.displayName,

    ticketTypeDescriptionSnapshot: ticketType.description,

    ticketKind: "normal",

    unitPrice: 0,

    currency: "EUR",

    status: TICKET_STATUS.ACTIVE,
  });

  return {
    event,
    order,
  };
}

function sendCustomMailRequest({ token, eventId, orderId, requestId }) {
  return request(app)
    .post(`/api/admin/events/${eventId}/custom-mail`)
    .set("Authorization", `Bearer ${token}`)
    .field("requestId", requestId)
    .field("audience", EVENT_CUSTOM_MAIL_AUDIENCE.SELECTED)
    .field("orderIds", JSON.stringify([String(orderId)]))
    .field("subject", "Hallo {{firstName}}")
    .field("html", "<p>Info zu <strong>{{eventTitle}}</strong></p>")
    .field("text", "Info zu {{eventTitle}}")
    .attach("attachments", Buffer.from("integration-pdf-content"), {
      filename: "info.pdf",

      contentType: "application/pdf",
    });
}

describe("Custom event mail MongoDB HTTP integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();

    await loadCustomMailMongoIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    sendMailMock.mockClear();

    sendMailMock.mockResolvedValue({
      messageId: "custom_mail_provider_message_1",

      response: "250 queued",
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();

    await disconnectMongoTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends a selected custom mail with multipart attachment and keeps retries idempotent", async () => {
    const { admin, token } = await createAdminToken();

    const { event, order } = await createParticipantOrder({
      admin,
    });

    const requestId = "550e8400-e29b-41d4-a716-446655440100";

    const firstResponse = await sendCustomMailRequest({
      token,

      eventId: event._id,

      orderId: order._id,

      requestId,
    });

    expect(firstResponse.status).toBe(200);

    expect(firstResponse.body.success).toBe(true);

    expect(firstResponse.body.data).toMatchObject({
      requestId,

      eventId: String(event._id),

      audience: EVENT_CUSTOM_MAIL_AUDIENCE.SELECTED,

      audienceOrderCount: 1,

      recipientCount: 1,

      attachmentCount: 1,

      attachmentNames: ["info.pdf"],

      sentCount: 1,

      skippedCount: 0,

      failedCount: 0,
    });

    expect(firstResponse.body.data.sent).toHaveLength(1);

    expect(firstResponse.body.data.sent[0]).toMatchObject({
      orderIds: [String(order._id)],

      email: "participant@example.test",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          email: "participant@example.test",

          name: "Max Mustermann",
        },

        subject: "Hallo Max",

        attachments: [
          expect.objectContaining({
            filename: "info.pdf",

            contentType: "application/pdf",

            content: expect.any(Buffer),
          }),
        ],
      }),
    );

    const log = await EmailLog.findOne({
      templateKey: "event.custom",

      "to.email": "participant@example.test",
    }).lean();

    expect(log).toBeTruthy();

    expect(log.status).toBe("sent");

    expect(log.providerMessageId).toBe("custom_mail_provider_message_1");

    expect(log.variablesSnapshot).toMatchObject({
      customMailRequestId: requestId,

      eventId: String(event._id),

      audience: EVENT_CUSTOM_MAIL_AUDIENCE.SELECTED,

      attachmentNames: ["info.pdf"],
    });

    expect(log.variablesSnapshot.participantOrderIds.map(String)).toEqual([
      String(order._id),
    ]);

    /*
     * Replay with the same requestId.
     *
     * The HTTP request itself is valid again,
     * but the provider must not receive a
     * duplicate mail.
     */
    const replayResponse = await sendCustomMailRequest({
      token,

      eventId: event._id,

      orderId: order._id,

      requestId,
    });

    expect(replayResponse.status).toBe(200);

    expect(replayResponse.body.success).toBe(true);

    expect(replayResponse.body.data).toMatchObject({
      sentCount: 0,

      skippedCount: 1,

      failedCount: 0,
    });

    expect(replayResponse.body.data.skipped[0]).toMatchObject({
      orderIds: [String(order._id)],

      email: "participant@example.test",

      reason: "mail_already_sent",
    });

    /*
     * Important:
     * the provider was still called exactly once.
     */
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    expect(await EmailLog.countDocuments()).toBe(1);
  });
});
