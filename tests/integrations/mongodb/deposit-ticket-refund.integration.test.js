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

import { KIWI_EVENTS_SECRET_PATHS } from "../../../src/config/kiwi-events/kiwi-events.secret.constants.js";

import { updateKiwiEventsSecrets } from "../../../src/config/kiwi-events/kiwi-events.secret.store.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let app;

let EventUser;
let Order;
let Ticket;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;

let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;
let TICKET_TYPE_PRICING_MODE;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let TICKET_STATUS;
let TICKET_KIND;
let TICKET_DEPOSIT_REFUND_STATUS;

let TICKET_CHECK_IN_STATE;

let createPaymentSessionMock;
let getPaymentSessionMock;
let createPaymentRefundMock;
let parsePaymentWebhookMock;

const PAYMENT_PROVIDER_CASES = [
  {
    name: "Mollie",
    provider: "mollie",

    providerPaymentId: "pay_deposit_e2e_123",
    providerIntentId: null,
    providerRefundId: "refund_deposit_e2e_123",

    checkoutUrl: "https://payments.example.test/pay_deposit_e2e_123",

    rawPaidStatus: "paid",

    webhookPath: "/api/webhooks/payments/mollie",

    webhookHeaders: {},

    buildWebhookBody: () => ({
      id: "pay_deposit_e2e_123",
    }),
  },

  {
    name: "Stripe",
    provider: "stripe",

    providerPaymentId: "cs_test_deposit_e2e_123",
    providerIntentId: "pi_test_deposit_e2e_123",
    providerRefundId: "re_test_deposit_e2e_123",

    checkoutUrl: "https://checkout.stripe.test/c/pay/cs_test_deposit_e2e_123",

    rawPaidStatus: "complete",

    webhookPath: "/api/webhooks/payments/stripe",

    webhookHeaders: {
      "stripe-signature": "test-signature",
    },

    buildWebhookBody: (orderId) => ({
      id: "evt_test_deposit_paid",
      type: "checkout.session.completed",

      data: {
        object: {
          id: "cs_test_deposit_e2e_123",
          payment_status: "paid",
          status: "complete",

          metadata: {
            orderId,
          },
        },
      },
    }),
  },
];

let activePaymentProviderCase = PAYMENT_PROVIDER_CASES[0];

function getPaymentProviderCase(provider = activePaymentProviderCase.provider) {
  const providerCase = PAYMENT_PROVIDER_CASES.find(
    (entry) => entry.provider === provider,
  );

  if (!providerCase) {
    throw new Error(
      `Unsupported payment provider in deposit refund test: ${provider}`,
    );
  }

  return providerCase;
}

function createPaymentProviderCheckoutConfigMock(
  provider = activePaymentProviderCase.provider,
) {
  getPaymentProviderCase(provider);

  if (provider === "stripe") {
    return {
      provider,

      redirectUrl:
        "https://frontend.example.test/payment-return?session_id={CHECKOUT_SESSION_ID}",

      webhookUrl: null,
    };
  }

  return {
    provider,

    redirectUrl: "https://frontend.example.test/payment-return",

    webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
  };
}

const TEST_TICKET_QR_SECRET =
  "test-ticket-qr-secret-123456789012345678901234567890";

function configureTestTicketQrSecret() {
  updateKiwiEventsSecrets({
    set: {
      [KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET]:
        TEST_TICKET_QR_SECRET,
    },
  });
}

function removeTestTicketQrSecret() {
  updateKiwiEventsSecrets({
    remove: [KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET],
  });
}
async function loadDepositTicketRefundIntegrationApp() {
  vi.resetModules();

  createPaymentSessionMock = vi.fn(
    async ({ provider = activePaymentProviderCase.provider }) => {
      const providerCase = getPaymentProviderCase(provider);

      return {
        provider: providerCase.provider,

        providerPaymentId: providerCase.providerPaymentId,

        providerIntentId: providerCase.providerIntentId,

        checkoutUrl: providerCase.checkoutUrl,

        status: "open",
      };
    },
  );

  getPaymentSessionMock = vi.fn();

  parsePaymentWebhookMock = vi.fn(
    async ({ provider = activePaymentProviderCase.provider, body }) => {
      const providerCase = getPaymentProviderCase(provider);

      return {
        provider: providerCase.provider,

        providerPaymentId:
          body?.data?.object?.id ||
          body?.id ||
          body?.paymentId ||
          body?.resource?.id ||
          null,

        eventType: body?.type || null,
        ignored: false,
        rawEvent: body,
      };
    },
  );

  createPaymentRefundMock = vi.fn(
    async ({ provider = activePaymentProviderCase.provider }) => {
      const providerCase = getPaymentProviderCase(provider);

      return {
        provider: providerCase.provider,

        providerPaymentId: providerCase.providerPaymentId,

        providerRefundId: providerCase.providerRefundId,

        status: "refunded",

        rawStatus:
          providerCase.provider === "stripe" ? "succeeded" : "refunded",
      };
    },
  );

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      features: {
        ticketing: true,
        depositTickets: true,
        guestCheckout: true,
        ticketPdf: false,
        ticketQr: true,
        mail: false,
      },
      payments: {
        get provider() {
          return activePaymentProviderCase.provider;
        },

        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",

          webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
        },

        stripe: {
          successUrl:
            "https://frontend.example.test/payment-return?session_id={CHECKOUT_SESSION_ID}",

          cancelUrl: "https://frontend.example.test/payment-cancelled",
        },
      },
    },
  }));
  vi.doMock(
    "../../../src/config/kiwi-events/kiwi-events.config.store.js",
    () => ({
      loadKiwiEventsConfig: () => ({
        features: TEST_FEATURES,
      }),
    }),
  );

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    isMongoDatabase: () => true,
    isSqlDatabase: () => false,
    assertDatabaseConnected: () => true,
    getDatabaseConnection: () => null,
    withDatabaseTransaction: async (callback) => callback({}),
  }));

  const TEST_FEATURES = {
    ticketing: true,
    depositTickets: true,
    guestCheckout: true,
    ticketPdf: false,
    ticketQr: true,
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

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: createPaymentSessionMock,
    getPaymentSession: getPaymentSessionMock,
    createPaymentRefund: createPaymentRefundMock,
    parsePaymentWebhook: parsePaymentWebhookMock,
    getPaymentProviderCheckoutConfig: vi.fn(
      (provider = activePaymentProviderCase.provider) =>
        createPaymentProviderCheckoutConfigMock(provider),
    ),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: vi.fn().mockResolvedValue({
      skipped: true,
      reason: "ticket_pdf_disabled_in_test",
    }),
    buildOfficialTicketAttachment: vi.fn().mockResolvedValue(null),
  }));

  const expressModule = await import("express");

  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
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

  const eventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");
  const ticketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/internal/ticketType.internal.routes.js");
  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");
  const paymentWebhookRoutesModule =
    await import("../../../src/modules/payments/webhooks/paymentWebhook.routes.js");
  const adminTicketRoutesModule =
    await import("../../../src/modules/tickets/internal/ticket.internal.routes.js");

  const publicTicketRoutesModule =
    await import("../../../src/modules/tickets/public/ticket.public.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EventUser = eventUserModelModule.EventUser;
  Order = orderModelModule.Order;
  Ticket = ticketModelModule.Ticket;

  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_PRICING_MODE = ticketTypeConstantsModule.TICKET_TYPE_PRICING_MODE;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;
  TICKET_KIND = ticketConstantsModule.TICKET_KIND;
  TICKET_CHECK_IN_STATE = ticketConstantsModule.TICKET_CHECK_IN_STATE;
  TICKET_DEPOSIT_REFUND_STATUS =
    ticketConstantsModule.TICKET_DEPOSIT_REFUND_STATUS;

  const router = expressModule.default.Router();

  router.use("/admin/events", eventRoutesModule.default);
  router.use("/admin/ticket-types", ticketTypeRoutesModule.default);
  router.use("/public/orders", publicOrderRoutesModule.default);
  router.use("/webhooks/payments", paymentWebhookRoutesModule.default);
  router.use("/admin/tickets", adminTicketRoutesModule.default);
  router.use("/public/tickets", publicTicketRoutesModule.default);

  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminUser() {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot: "admin@example.com",
    passwordHash: "not-used-in-this-test",
    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",
    role: EVENT_USER_ROLES.ADMIN,
    isActive: true,
    mustChangePassword: false,
    grants: [],
    denies: [],
  });
}

function signAdminToken(eventUser) {
  return jwt.sign(
    {
      sub: String(eventUser._id),
      eventUserId: String(eventUser._id),
      role: EVENT_USER_ROLES.ADMIN,
      roles: [EVENT_USER_ROLES.ADMIN],
      email: eventUser.emailSnapshot,
    },
    LOCAL_SECRET,
  );
}

function signExternalUserToken(payload = {}) {
  return jwt.sign(
    {
      externalProvider: "dummy",
      externalUserId: "host-customer-1",
      role: "host_user",
      email: "kunde@example.com",
      firstName: "Max",
      lastName: "Kunde",
      ...payload,
    },
    EXTERNAL_SECRET,
  );
}

function buildFutureSession() {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: "Europe/Vienna",
    locationLabel: "Audimax",
    capacity: 100,
  };
}

function buildEventPayload(overrides = {}) {
  return {
    title: "Deposit Refund Flow Event",
    slug: `deposit-refund-flow-event-${Date.now()}`,
    shortDescription: "Deposit refund integration event",
    description: "Created by deposit refund integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildFutureSession()],
    isFree: false,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-01-01T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    tags: ["deposit", "refund"],
    faqs: [],
    ...overrides,
  };
}

function buildDepositTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "Deposit Ticket",
    description: "Refundable deposit ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.DEPOSIT,
    pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 10,
    minPerOrder: 1,
    maxPerOrder: 2,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-01-01T10:00:00.000Z",
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    ...overrides,
  };
}

async function createEventAndDepositTicketType(adminToken) {
  const eventResponse = await request(app)
    .post("/api/admin/events")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(buildEventPayload());

  expect(eventResponse.status).toBe(201);
  expect(eventResponse.body.success).toBe(true);

  const event = eventResponse.body.data;

  const ticketTypeResponse = await request(app)
    .post("/api/admin/ticket-types")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(buildDepositTicketTypePayload(event.id));

  expect(ticketTypeResponse.status).toBe(201);
  expect(ticketTypeResponse.body.success).toBe(true);

  return {
    event,
    ticketType: ticketTypeResponse.body.data,
  };
}

async function startDepositCheckout({
  event,
  ticketType,
  externalToken,
  providerCase,
}) {
  const response = await request(app)
    .post("/api/public/orders/checkout")
    .set("Idempotency-Key", "test-0fea915f-d1bd-4f07-a607-bf833be2d515")
    .set("Authorization", `Bearer ${externalToken}`)
    .send({
      eventId: event.id,

      items: [
        {
          ticketTypeId: ticketType.id,

          quantity: 1,
        },
      ],
    });

  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);

  expect(response.body.meta.paymentInitializationFailed).toBe(false);

  expect(response.body.meta.idempotencyReplayed).toBe(false);

  expect(response.body.data.checkout).toEqual({
    provider: providerCase.provider,

    url: providerCase.checkoutUrl,

    status: "open",
  });

  expect(response.body.data.guestAccess).toBe(null);

  return response.body.data;
}

async function confirmPaidPayment(orderId, providerCase) {
  getPaymentSessionMock.mockResolvedValueOnce({
    provider: providerCase.provider,

    providerPaymentId: providerCase.providerPaymentId,

    providerIntentId: providerCase.providerIntentId,

    orderId,

    metadata: {
      orderId,
    },

    status: "paid",
    rawStatus: providerCase.rawPaidStatus,
  });

  let webhookRequest = request(app).post(providerCase.webhookPath);

  for (const [headerName, headerValue] of Object.entries(
    providerCase.webhookHeaders,
  )) {
    webhookRequest = webhookRequest.set(headerName, headerValue);
  }

  const response = await webhookRequest.send(
    providerCase.buildWebhookBody(orderId),
  );

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
}

describe(
  "Deposit ticket refund MongoDB integration",
  {
    concurrent: false,
  },
  () => {
    beforeAll(async () => {
      await connectMongoTestDb();

      await loadDepositTicketRefundIntegrationApp();

      configureTestTicketQrSecret();
    });

    beforeEach(async () => {
      await clearMongoTestDb();

      configureTestTicketQrSecret();

      createPaymentSessionMock?.mockClear();
      getPaymentSessionMock?.mockClear();
      createPaymentRefundMock?.mockClear();
      parsePaymentWebhookMock?.mockClear();
    });

    afterAll(async () => {
      await clearMongoTestDb();

      removeTestTicketQrSecret();

      await disconnectMongoTestDb();

      vi.restoreAllMocks();
      vi.resetModules();
    });

    describe.each(PAYMENT_PROVIDER_CASES)("$name", (providerCase) => {
      beforeEach(() => {
        activePaymentProviderCase = providerCase;
      });

      it("creates a paid deposit order, confirms payment and refunds exactly once on manual check-in", async () => {
        const adminUser = await createAdminUser();

        const adminToken = signAdminToken(adminUser);

        const externalToken = signExternalUserToken();

        const { event, ticketType } =
          await createEventAndDepositTicketType(adminToken);

        const checkout = await startDepositCheckout({
          event,
          ticketType,
          externalToken,
          providerCase,
        });

        expect(checkout.checkout).toEqual({
          provider: providerCase.provider,

          url: providerCase.checkoutUrl,

          status: "open",
        });

        expect(checkout.order).toMatchObject({
          event: {
            id: event.id,
          },

          items: [
            {
              ticketType: {
                id: ticketType.id,

                kind: TICKET_TYPE_KIND.DEPOSIT,
              },

              quantity: 1,

              unitPrice: 2500,

              lineTotal: 2500,
            },
          ],

          pricing: {
            currency: "EUR",

            subtotal: 2500,

            total: 2500,
          },

          status: ORDER_STATUS.PENDING,

          payment: {
            status: ORDER_PAYMENT_STATUS.PENDING,

            provider: providerCase.provider,
          },
        });

        expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);

        expect(createPaymentSessionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: providerCase.provider,

            amount: 25,
            currency: "EUR",
            orderId: expect.anything(),

            metadata: expect.objectContaining({
              orderId: checkout.order.id,

              eventId: event.id,
            }),
          }),
        );

        await confirmPaidPayment(checkout.order.id, providerCase);

        const orderInDb = await Order.findById(checkout.order.id).lean();

        expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);

        expect(orderInDb.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);

        expect(orderInDb.paymentProviderPaymentId).toBe(
          providerCase.providerPaymentId,
        );

        const tickets = await Ticket.find({
          orderId: orderInDb._id,
        }).lean();

        expect(tickets).toHaveLength(1);

        const ticket = tickets[0];

        expect(ticket).toMatchObject({
          status: TICKET_STATUS.ACTIVE,
          ticketKind: TICKET_KIND.DEPOSIT,
          unitPrice: 2500,
          currency: "EUR",

          depositRefundStatus: TICKET_DEPOSIT_REFUND_STATUS.ELIGIBLE,

          depositRefundAmount: 2500,
          depositRefundCurrency: "EUR",

          depositRefundProviderRefundId: null,
        });

        const checkInResponse = await request(app)
          .patch(`/api/admin/tickets/${String(ticket._id)}/check-in`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            checkedIn: true,
          });

        expect(checkInResponse.status).toBe(200);

        expect(checkInResponse.body.success).toBe(true);

        expect(checkInResponse.body.data).toMatchObject({
          id: String(ticket._id),

          status: TICKET_STATUS.CHECKED_IN,

          ticketType: {
            kind: TICKET_KIND.DEPOSIT,
          },

          checkIn: {
            checkedInAt: expect.any(String),

            checkedInByEventUserId: String(adminUser._id),
          },
        });

        expect(checkInResponse.body.meta).toEqual({
          checkIn: {
            requestedCheckedIn: true,

            statusChanged: true,
          },
        });

        expect(checkInResponse.body.refund).toBeUndefined();

        expect(checkInResponse.body.checkIn).toBeUndefined();

        expect(checkInResponse.body.event).toBeUndefined();

        expect(checkInResponse.body.ticketType).toBeUndefined();

        expect(checkInResponse.body.message).toBeUndefined();

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

        expect(createPaymentRefundMock).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: providerCase.provider,

            providerPaymentId: providerCase.providerPaymentId,

            amount: "25.00",
            currency: "EUR",

            idempotencyKey: `deposit-refund:${String(ticket._id)}`,

            description: expect.stringContaining(ticket.ticketCode),

            metadata: expect.objectContaining({
              source: "event_deposit_check_in",

              orderId: String(orderInDb._id),

              ticketId: String(ticket._id),

              eventId: String(ticket.eventId),
            }),
          }),
        );

        const ticketInDb = await Ticket.findById(ticket._id).lean();

        expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

        expect(ticketInDb.checkedInAt).toBeTruthy();

        expect(String(ticketInDb.checkedInByEventUserId)).toBe(
          String(adminUser._id),
        );

        expect(ticketInDb.depositRefundStatus).toBe(
          TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
        );

        expect(ticketInDb.depositRefundProviderRefundId).toBe(
          providerCase.providerRefundId,
        );

        expect(ticketInDb.depositRefundFailureReason).toBe(null);

        expect(String(ticketInDb.depositRefundTriggeredByEventUserId)).toBe(
          String(adminUser._id),
        );

        const duplicateCheckInResponse = await request(app)
          .patch(`/api/admin/tickets/${String(ticket._id)}/check-in`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            checkedIn: true,
          });

        expect(duplicateCheckInResponse.status).toBe(200);

        expect(duplicateCheckInResponse.body.success).toBe(true);

        expect(duplicateCheckInResponse.body.data).toMatchObject({
          id: String(ticket._id),

          status: TICKET_STATUS.CHECKED_IN,

          ticketType: {
            kind: TICKET_KIND.DEPOSIT,
          },
        });

        expect(duplicateCheckInResponse.body.meta).toEqual({
          checkIn: {
            requestedCheckedIn: true,

            statusChanged: false,
          },
        });

        expect(duplicateCheckInResponse.body.refund).toBeUndefined();

        expect(duplicateCheckInResponse.body.checkIn).toBeUndefined();

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);
      });

      it("also refunds a paid deposit ticket when check-in is confirmed through QR payload", async () => {
        const adminUser = await createAdminUser();

        const adminToken = signAdminToken(adminUser);

        const externalToken = signExternalUserToken();

        const { event, ticketType } =
          await createEventAndDepositTicketType(adminToken);

        const checkout = await startDepositCheckout({
          event,
          ticketType,
          externalToken,
          providerCase,
        });

        await confirmPaidPayment(checkout.order.id, providerCase);

        const [ticket] = await Ticket.find({
          orderId: checkout.order.id,
        }).lean();

        expect(ticket).toBeTruthy();

        expect(ticket.ticketKind).toBe(TICKET_KIND.DEPOSIT);

        const qrResponse = await request(app)
          .get(`/api/public/tickets/${String(ticket._id)}/qr`)
          .set("Authorization", `Bearer ${externalToken}`);

        expect(qrResponse.status).toBe(200);

        expect(qrResponse.body.success).toBe(true);

        expect(qrResponse.body.data).toEqual({
          ticket: {
            id: String(ticket._id),

            code: ticket.ticketCode,
          },

          qr: {
            payload: expect.any(String),

            dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
          },
        });

        const qrPayload = qrResponse.body.data.qr.payload;

        /*
         * Der QR-Lookup muss denselben kanonischen Vertrag
         * wie der Ticketcode-Lookup liefern.
         */
        const lookupResponse = await request(app)
          .post("/api/admin/tickets/check-in/qr/lookup")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: qrPayload,
          });

        expect(lookupResponse.status).toBe(200);

        expect(lookupResponse.body.success).toBe(true);

        expect(lookupResponse.body.data).toMatchObject({
          id: String(ticket._id),

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.ACTIVE,

          ticketType: {
            kind: TICKET_KIND.DEPOSIT,
          },

          checkIn: {
            checkedInAt: null,

            checkedInByEventUserId: null,
          },
        });

        expect(lookupResponse.body.meta).toEqual({
          checkIn: {
            allowed: true,

            state: TICKET_CHECK_IN_STATE.ALLOWED,
          },
        });

        expect(lookupResponse.body.event).toBeUndefined();
        expect(lookupResponse.body.allowed).toBeUndefined();
        expect(lookupResponse.body.state).toBeUndefined();
        expect(lookupResponse.body.message).toBeUndefined();
        expect(lookupResponse.body.refund).toBeUndefined();

        const qrCheckInResponse = await request(app)
          .post("/api/admin/tickets/check-in/qr/confirm")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: qrPayload,
          });

        expect(qrCheckInResponse.status).toBe(200);

        expect(qrCheckInResponse.body.success).toBe(true);

        expect(qrCheckInResponse.body.data).toMatchObject({
          id: String(ticket._id),

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.CHECKED_IN,

          ticketType: {
            kind: TICKET_KIND.DEPOSIT,
          },

          checkIn: {
            checkedInAt: expect.any(String),

            checkedInByEventUserId: String(adminUser._id),
          },
        });

        expect(qrCheckInResponse.body.meta).toEqual({
          checkIn: {
            requestedCheckedIn: true,

            statusChanged: true,
          },
        });

        expect(qrCheckInResponse.body.message).toBeUndefined();
        expect(qrCheckInResponse.body.refund).toBeUndefined();
        expect(qrCheckInResponse.body.allowed).toBeUndefined();
        expect(qrCheckInResponse.body.state).toBeUndefined();

        expect(qrCheckInResponse.body.data.ticket).toBeUndefined();
        expect(qrCheckInResponse.body.data.refund).toBeUndefined();

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

        expect(createPaymentRefundMock).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: providerCase.provider,

            providerPaymentId: providerCase.providerPaymentId,

            amount: "25.00",

            currency: "EUR",

            idempotencyKey: `deposit-refund:${String(ticket._id)}`,
          }),
        );

        /*
         * Ein erneuter QR-Confirm darf weder auschecken
         * noch einen zweiten Deposit-Refund auslösen.
         */
        const replayResponse = await request(app)
          .post("/api/admin/tickets/check-in/qr/confirm")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: qrPayload,
          });

        expect(replayResponse.status).toBe(200);

        expect(replayResponse.body.success).toBe(true);

        expect(replayResponse.body.data).toMatchObject({
          id: String(ticket._id),

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.CHECKED_IN,

          checkIn: {
            checkedInAt: qrCheckInResponse.body.data.checkIn.checkedInAt,

            checkedInByEventUserId: String(adminUser._id),
          },
        });

        expect(replayResponse.body.meta).toEqual({
          checkIn: {
            requestedCheckedIn: true,

            statusChanged: false,
          },
        });

        expect(replayResponse.body.message).toBeUndefined();
        expect(replayResponse.body.refund).toBeUndefined();
        expect(replayResponse.body.data.ticket).toBeUndefined();
        expect(replayResponse.body.data.refund).toBeUndefined();

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

        /*
         * Nach dem Confirm muss auch der QR-Lookup
         * den bereits eingecheckten Zustand ausweisen.
         */
        const checkedInLookupResponse = await request(app)
          .post("/api/admin/tickets/check-in/qr/lookup")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: qrPayload,
          });

        expect(checkedInLookupResponse.status).toBe(200);

        expect(checkedInLookupResponse.body.success).toBe(true);

        expect(checkedInLookupResponse.body.data).toMatchObject({
          id: String(ticket._id),

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.CHECKED_IN,

          checkIn: {
            checkedInAt: qrCheckInResponse.body.data.checkIn.checkedInAt,

            checkedInByEventUserId: String(adminUser._id),
          },
        });

        expect(checkedInLookupResponse.body.meta).toEqual({
          checkIn: {
            allowed: false,

            state: TICKET_CHECK_IN_STATE.ALREADY_CHECKED_IN,
          },
        });

        /*
         * Keiner der Admin-QR-Responses darf interne
         * Datenbank-, QR-Token- oder Storage-Felder enthalten.
         */
        const serializedAdminQrResponses = JSON.stringify([
          lookupResponse.body,
          qrCheckInResponse.body,
          replayResponse.body,
          checkedInLookupResponse.body,
        ]);

        for (const field of [
          "_id",
          "__v",

          "checkInTokenHash",
          "encryptedCheckInToken",
          "checkInPayloadVersion",
          "checkInTokenCreatedAt",
          "checkInTokenRotatedAt",
          "checkInTokenLastUsedAt",

          "ticketPdfStorageKey",
          "metadata",
        ]) {
          expect(serializedAdminQrResponses).not.toContain(`"${field}"`);
        }

        const ticketInDb = await Ticket.findById(ticket._id).lean();

        expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

        expect(ticketInDb.depositRefundStatus).toBe(
          TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
        );

        expect(ticketInDb.depositRefundProviderRefundId).toBe(
          providerCase.providerRefundId,
        );
      });
    });
    it("looks up and confirms a MongoDB ticket check-in by ticket code", async () => {
      const providerCase = PAYMENT_PROVIDER_CASES.find(
        ({ provider }) => provider === "mollie",
      );

      activePaymentProviderCase = providerCase;

      const adminUser = await createAdminUser();

      const adminToken = signAdminToken(adminUser);

      const externalToken = signExternalUserToken();

      const { event, ticketType } =
        await createEventAndDepositTicketType(adminToken);

      const checkout = await startDepositCheckout({
        event,
        ticketType,
        externalToken,
        providerCase,
      });

      await confirmPaidPayment(checkout.order.id, providerCase);

      const [ticket] = await Ticket.find({
        orderId: checkout.order.id,
      }).lean();

      expect(ticket).toBeTruthy();

      expect(ticket.status).toBe(TICKET_STATUS.ACTIVE);

      expect(ticket.ticketCode).toMatch(
        /^TKT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/,
      );

      /*
       * Kleingeschrieben senden, damit die
       * Validation-Normalisierung geprüft wird.
       */
      const lookupResponse = await request(app)
        .post("/api/admin/tickets/check-in/lookup")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ticketCode: ticket.ticketCode.toLowerCase(),
        });

      expect(lookupResponse.status).toBe(200);

      expect(lookupResponse.body.success).toBe(true);

      expect(lookupResponse.body.data).toMatchObject({
        id: String(ticket._id),

        ticketCode: ticket.ticketCode,

        status: TICKET_STATUS.ACTIVE,

        ticketType: {
          kind: TICKET_KIND.DEPOSIT,
        },

        checkIn: {
          checkedInAt: null,

          checkedInByEventUserId: null,
        },
      });

      expect(lookupResponse.body.meta).toEqual({
        checkIn: {
          allowed: true,

          state: TICKET_CHECK_IN_STATE.ALLOWED,
        },
      });

      expect(lookupResponse.body.event).toBeUndefined();

      expect(lookupResponse.body.allowed).toBeUndefined();

      expect(lookupResponse.body.state).toBeUndefined();

      expect(lookupResponse.body.message).toBeUndefined();

      const serializedLookup = JSON.stringify(lookupResponse.body);

      for (const field of [
        "_id",
        "__v",

        "checkInTokenHash",
        "encryptedCheckInToken",
        "checkInPayloadVersion",
        "checkInTokenCreatedAt",
        "checkInTokenRotatedAt",
        "checkInTokenLastUsedAt",

        "ticketPdfStorageKey",
        "metadata",
      ]) {
        expect(serializedLookup).not.toContain(`"${field}"`);
      }

      const confirmResponse = await request(app)
        .post("/api/admin/tickets/check-in/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ticketCode: ticket.ticketCode,
        });

      expect(confirmResponse.status).toBe(200);

      expect(confirmResponse.body.success).toBe(true);

      expect(confirmResponse.body.data).toMatchObject({
        id: String(ticket._id),

        ticketCode: ticket.ticketCode,

        status: TICKET_STATUS.CHECKED_IN,

        ticketType: {
          kind: TICKET_KIND.DEPOSIT,
        },

        checkIn: {
          checkedInAt: expect.any(String),

          checkedInByEventUserId: String(adminUser._id),
        },
      });

      expect(confirmResponse.body.meta).toEqual({
        checkIn: {
          requestedCheckedIn: true,

          statusChanged: true,
        },
      });

      expect(confirmResponse.body.message).toBeUndefined();

      expect(confirmResponse.body.refund).toBeUndefined();

      expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

      /*
       * Ein erneuter Confirm darf weder
       * auschecken noch erneut refundieren.
       */
      const replayResponse = await request(app)
        .post("/api/admin/tickets/check-in/confirm")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ticketCode: ticket.ticketCode,
        });

      expect(replayResponse.status).toBe(200);

      expect(replayResponse.body.data).toMatchObject({
        id: String(ticket._id),

        status: TICKET_STATUS.CHECKED_IN,

        checkIn: {
          checkedInAt: confirmResponse.body.data.checkIn.checkedInAt,

          checkedInByEventUserId: String(adminUser._id),
        },
      });

      expect(replayResponse.body.meta).toEqual({
        checkIn: {
          requestedCheckedIn: true,

          statusChanged: false,
        },
      });

      expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

      /*
       * Lookup nach dem Confirm muss den
       * bereits eingecheckten Zustand liefern.
       */
      const checkedInLookupResponse = await request(app)
        .post("/api/admin/tickets/check-in/lookup")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ticketCode: ticket.ticketCode,
        });

      expect(checkedInLookupResponse.status).toBe(200);

      expect(checkedInLookupResponse.body.data).toMatchObject({
        id: String(ticket._id),

        status: TICKET_STATUS.CHECKED_IN,
      });

      expect(checkedInLookupResponse.body.meta).toEqual({
        checkIn: {
          allowed: false,

          state: TICKET_CHECK_IN_STATE.ALREADY_CHECKED_IN,
        },
      });

      const ticketInDb = await Ticket.findById(ticket._id).lean();

      expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

      expect(ticketInDb.depositRefundStatus).toBe(
        TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
      );

      expect(ticketInDb.depositRefundProviderRefundId).toBe(
        providerCase.providerRefundId,
      );
    });
    it("rejects invalid or missing ticket codes in MongoDB check-in routes", async () => {
      const adminUser = await createAdminUser();

      const adminToken = signAdminToken(adminUser);

      const paths = [
        "/api/admin/tickets/check-in/lookup",
        "/api/admin/tickets/check-in/confirm",
      ];

      for (const path of paths) {
        const invalidResponse = await request(app)
          .post(path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            ticketCode: "invalid-ticket-code",
          });

        expect(invalidResponse.status).toBe(400);

        expect(invalidResponse.body.success).toBe(false);

        expect(invalidResponse.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: "body.ticketCode",

              field: "ticketCode",

              message: "Ticket code is invalid.",
            }),
          ]),
        );

        const missingResponse = await request(app)
          .post(path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({});

        expect(missingResponse.status).toBe(400);

        expect(missingResponse.body.success).toBe(false);

        expect(missingResponse.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: "ticketCode",
            }),
          ]),
        );
      }
    });
    it("rejects invalid or missing QR payloads in MongoDB check-in routes", async () => {
      const adminUser = await createAdminUser();

      const adminToken = signAdminToken(adminUser);

      const paths = [
        "/api/admin/tickets/check-in/qr/lookup",
        "/api/admin/tickets/check-in/qr/confirm",
      ];

      for (const path of paths) {
        const tooShortResponse = await request(app)
          .post(path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: "too-short",
          });

        expect(tooShortResponse.status).toBe(400);

        expect(tooShortResponse.body.success).toBe(false);

        expect(tooShortResponse.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: "body.payload",

              field: "payload",

              message: "QR code payload is invalid.",
            }),
          ]),
        );

        const whitespaceResponse = await request(app)
          .post(path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: "              ",
          });

        expect(whitespaceResponse.status).toBe(400);

        expect(whitespaceResponse.body.success).toBe(false);

        expect(whitespaceResponse.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: "body.payload",

              field: "payload",

              message: "QR code payload is invalid.",
            }),
          ]),
        );

        const tooLongResponse = await request(app)
          .post(path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            payload: "x".repeat(4001),
          });

        expect(tooLongResponse.status).toBe(400);

        expect(tooLongResponse.body.success).toBe(false);

        expect(tooLongResponse.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: "body.payload",

              field: "payload",

              message: "QR code payload is too long.",
            }),
          ]),
        );

        const missingResponse = await request(app)
          .post(path)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({});

        expect(missingResponse.status).toBe(400);

        expect(missingResponse.body.success).toBe(false);

        expect(missingResponse.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: "body.payload",

              field: "payload",

              message: "QR code payload is required.",
            }),
          ]),
        );
      }
    });
  },
);
