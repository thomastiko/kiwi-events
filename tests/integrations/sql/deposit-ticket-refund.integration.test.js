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

import { KIWI_EVENTS_SECRET_PATHS } from "../../../src/config/kiwi-events/kiwi-events.secret.constants.js";
import { updateKiwiEventsSecrets } from "../../../src/config/kiwi-events/kiwi-events.secret.store.js";

const TEST_JWT_SECRET = "integration-local-jwt-secret";
const TEST_EXTERNAL_JWT_SECRET = "integration-external-jwt-secret";
const TEST_TICKET_QR_SECRET = "integration-ticket-qr-secret-with-enough-length";
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
const TEST_EXTERNAL_PROVIDER = "dummy";
const TEST_EXTERNAL_USER_ID = "host-customer-deposit-sql-1";
const TEST_EXTERNAL_EMAIL = "deposit.sql.customer@example.com";

let eventApp;
let ticketTypeApp;
let publicOrderApp;
let paymentWebhookApp;
let ticketApp;
let authApp;

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let hashPassword;
let createEventUser;
let findOrderById;
let findTicketsByOrderId;
let findTicketById;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;
let TICKET_TYPE_PRICING_MODE;
let ORDER_BUYER_TYPE;
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
let TEST_FEATURES;

const PAYMENT_PROVIDER_CASES = [
  {
    name: "Mollie",
    provider: "mollie",

    providerPaymentId: "pay_sql_deposit_flow_123",

    providerIntentId: null,

    providerRefundId: "refund_sql_deposit_flow_123",

    checkoutUrl: "https://payments.example.test/pay_sql_deposit_flow_123",

    rawPaidStatus: "paid",

    webhookPath: "/api/webhooks/payments/mollie",

    webhookHeaders: {},

    buildWebhookBody: () => ({
      id: "pay_sql_deposit_flow_123",
    }),
  },

  {
    name: "Stripe",
    provider: "stripe",

    providerPaymentId: "cs_test_sql_deposit_flow_123",

    providerIntentId: "pi_test_sql_deposit_flow_123",

    providerRefundId: "re_test_sql_deposit_flow_123",

    checkoutUrl:
      "https://checkout.stripe.test/c/pay/cs_test_sql_deposit_flow_123",

    rawPaidStatus: "complete",

    webhookPath: "/api/webhooks/payments/stripe",

    webhookHeaders: {
      "stripe-signature": "test-signature",
    },

    buildWebhookBody: (orderId) => ({
      id: "evt_test_sql_deposit_paid",
      type: "checkout.session.completed",

      data: {
        object: {
          id: "cs_test_sql_deposit_flow_123",
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
      `Unsupported payment provider in SQL deposit refund test: ${provider}`,
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

function parsePaymentWebhookMockImplementation({
  provider = activePaymentProviderCase.provider,
  body,
} = {}) {
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
}
async function loadDepositTicketRefundSqlIntegrationApp() {
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

  parsePaymentWebhookMock = vi.fn(parsePaymentWebhookMockImplementation);

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: TEST_JWT_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
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
      branding: {
        appName: "Kiwi Events Test",
      },
    },
  }));
  TEST_FEATURES = {
    ticketing: true,
    guestCheckout: true,
    depositTickets: true,
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

  vi.doMock("../../../src/modules/orders/order.mail.service.js", () => ({
    sendOrderConfirmedMailSafe: vi.fn().mockResolvedValue({
      success: false,
      skipped: true,
      reason: "mail_disabled_in_test",
    }),
  }));

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    generateOfficialTicketDocument: vi.fn().mockResolvedValue({
      skipped: true,
      reason: "ticket_pdf_disabled_in_test",
    }),
    buildOfficialTicketAttachment: vi.fn().mockResolvedValue(null),
  }));
  const expressModule = await import("express");
  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;
  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;
  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;

  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");
  const eventUserRepositoryModule =
    await import("../../../src/modules/eventUsers/repositories/eventUser.repository.js");
  const passwordServiceModule =
    await import("../../../src/core/security/password.service.js");

  const eventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const ticketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/internal/ticketType.internal.routes.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");

  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");
  const paymentWebhookRoutesModule =
    await import("../../../src/modules/payments/webhooks/paymentWebhook.routes.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");
  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");

  const adminTicketRoutesModule =
    await import("../../../src/modules/tickets/internal/ticket.internal.routes.js");

  const publicTicketRoutesModule =
    await import("../../../src/modules/tickets/public/ticket.public.routes.js");
  const ticketConstantsModule =
    await import("../../../src/modules/tickets/ticket.constants.js");
  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");

  const adminAuthRoutesModule =
    await import("../../../src/modules/adminAuth/adminAuth.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_PRICING_MODE = ticketTypeConstantsModule.TICKET_TYPE_PRICING_MODE;
  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;
  TICKET_KIND = ticketConstantsModule.TICKET_KIND;
  TICKET_DEPOSIT_REFUND_STATUS =
    ticketConstantsModule.TICKET_DEPOSIT_REFUND_STATUS;
  TICKET_CHECK_IN_STATE = ticketConstantsModule.TICKET_CHECK_IN_STATE;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;
  findOrderById = orderRepositoryModule.findOrderById;
  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  findTicketById = ticketRepositoryModule.findTicketById;

  authApp = createHttpTestApp({
    mountPath: "/api/admin/auth",
    router: adminAuthRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  eventApp = createHttpTestApp({
    mountPath: "/api/admin/events",
    router: eventRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  ticketTypeApp = createHttpTestApp({
    mountPath: "/api/admin/ticket-types",
    router: ticketTypeRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  publicOrderApp = createHttpTestApp({
    mountPath: "/api/public/orders",
    router: publicOrderRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  paymentWebhookApp = createHttpTestApp({
    mountPath: "/api/webhooks/payments",
    router: paymentWebhookRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  const ticketRouter = expressModule.default.Router();

  ticketRouter.use("/admin/tickets", adminTicketRoutesModule.default);

  ticketRouter.use("/public/tickets", publicTicketRoutesModule.default);

  ticketApp = createHttpTestApp({
    mountPath: "/api",
    router: ticketRouter,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminAndToken({
  emailSnapshot = "admin@example.com",
  password = "secret123",
  role = EVENT_USER_ROLES.ADMIN,
} = {}) {
  const passwordHash = await hashPassword(password);

  const admin = await createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot,
    passwordHash,
    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",
    role,
    isActive: true,
    mustChangePassword: false,
    grants: [],
    denies: [],
  });

  const loginResponse = await request(authApp)
    .post("/api/admin/auth/login")
    .send({
      email: emailSnapshot,
      password,
    });

  if (loginResponse.status !== 200) {
    console.dir(loginResponse.body, { depth: null });
  }

  expect(loginResponse.status).toBe(200);

  return {
    admin,
    accessToken: loginResponse.body.data.accessToken,
  };
}

function createExternalUserToken({
  externalProvider = TEST_EXTERNAL_PROVIDER,
  externalUserId = TEST_EXTERNAL_USER_ID,
  email = TEST_EXTERNAL_EMAIL,
  firstName = "Deposit",
  lastName = "Customer",
} = {}) {
  return jwt.sign(
    {
      sub: externalUserId,
      tokenType: "external_user",
      type: "external_user",
      role: "customer",
      roles: ["customer"],

      provider: externalProvider,
      externalProvider,
      externalUserId,

      email,
      firstName,
      lastName,
      given_name: firstName,
      family_name: lastName,
      name: `${firstName} ${lastName}`,
    },
    TEST_EXTERNAL_JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

function buildEventPayload(overrides = {}) {
  return {
    title: "SQL Deposit Refund Flow Event",
    slug: `sql-deposit-refund-flow-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL deposit refund flow event",
    description: "Created by SQL deposit refund integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "deposit", "refund"],
    sessions: [
      {
        startAt: "2030-06-10T10:00:00.000Z",
        endAt: "2030-06-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Main Hall",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    faqs: [],
    isFree: false,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-06-09T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL deposit refund integration test",
    ...overrides,
  };
}

function buildDepositTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "SQL Deposit Ticket",
    description: "A refundable SQL deposit test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.DEPOSIT,
    pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 10,
    minPerOrder: 1,
    maxPerOrder: 2,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-06-09T10:00:00.000Z",
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    ...overrides,
  };
}

async function createPublishedDepositEventWithTicketType(
  accessToken,
  { eventOverrides = {}, ticketTypeOverrides = {} } = {},
) {
  const eventCreateResponse = await request(eventApp)
    .post("/api/admin/events")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(buildEventPayload(eventOverrides));

  if (eventCreateResponse.status !== 201) {
    console.dir(eventCreateResponse.body, { depth: null });
  }

  expect(eventCreateResponse.status).toBe(201);

  const event = eventCreateResponse.body.data;

  const ticketTypeCreateResponse = await request(ticketTypeApp)
    .post("/api/admin/ticket-types")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(buildDepositTicketTypePayload(event.id, ticketTypeOverrides));

  if (ticketTypeCreateResponse.status !== 201) {
    console.dir(ticketTypeCreateResponse.body, { depth: null });
  }

  expect(ticketTypeCreateResponse.status).toBe(201);

  const publishResponse = await request(eventApp)
    .patch(`/api/admin/events/${event.id}/publish`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send();

  if (publishResponse.status !== 200) {
    console.dir(publishResponse.body, { depth: null });
  }

  expect(publishResponse.status).toBe(200);

  return {
    event: publishResponse.body.data,
    ticketType: ticketTypeCreateResponse.body.data,
  };
}

async function createPendingDepositOrder({
  accessToken,
  externalUserToken,
  providerCase,
}) {
  const { event, ticketType } = await createPublishedDepositEventWithTicketType(
    accessToken,
    {
      ticketTypeOverrides: {
        displayName: "SQL Deposit Flow Ticket",
        priceGross: 2500,
        stockTotal: 10,
      },
    },
  );

  const checkoutResponse = await request(publicOrderApp)
    .post("/api/public/orders/checkout")
    .set("Idempotency-Key", "test-417e3eaa-c513-4fcf-902e-a7366e063868")
    .set("Authorization", `Bearer ${externalUserToken}`)
    .send({
      eventId: event.id,
      items: [
        {
          ticketTypeId: ticketType.id,
          quantity: 1,
        },
      ],
    });

  if (checkoutResponse.status !== 201) {
    console.dir(checkoutResponse.body, { depth: null });
  }

  expect(checkoutResponse.status).toBe(201);

  expect(checkoutResponse.body.success).toBe(true);

  expect(checkoutResponse.body.meta.paymentInitializationFailed).toBe(false);

  expect(checkoutResponse.body.meta.idempotencyReplayed).toBe(false);

  expect(checkoutResponse.body.data.checkout).toEqual({
    provider: providerCase.provider,

    url: providerCase.checkoutUrl,

    status: "open",
  });

  expect(checkoutResponse.body.data.guestAccess).toBe(null);

  return {
    event,
    ticketType,

    order: checkoutResponse.body.data.order,
  };
}

async function confirmDepositOrderPaid(orderId, providerCase) {
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

  let webhookRequest = request(paymentWebhookApp).post(
    providerCase.webhookPath,
  );

  for (const [headerName, headerValue] of Object.entries(
    providerCase.webhookHeaders,
  )) {
    webhookRequest = webhookRequest.set(headerName, headerValue);
  }

  const webhookResponse = await webhookRequest.send(
    providerCase.buildWebhookBody(orderId),
  );

  if (webhookResponse.status !== 200) {
    console.log("Webhook failed with status:", webhookResponse.status);

    console.dir(webhookResponse.body, {
      depth: null,
    });
  }

  expect(webhookResponse.status).toBe(200);
  expect(webhookResponse.body.success).toBe(true);
}

describe(
  "Deposit ticket refund SQL integration",
  {
    concurrent: false,
  },
  () => {
    beforeAll(async () => {
      await loadDepositTicketRefundSqlIntegrationApp();
      await connectSqlTestDb();

      configureTestTicketQrSecret();
    });

    beforeEach(async () => {
      await clearSqlTestDb();

      configureTestTicketQrSecret();

      TEST_FEATURES.ticketing = true;
      TEST_FEATURES.guestCheckout = true;
      TEST_FEATURES.depositTickets = true;
      TEST_FEATURES.ticketPdf = false;
      TEST_FEATURES.ticketQr = true;
      TEST_FEATURES.mail = false;
      TEST_FEATURES.mailOrderConfirmation = false;
      TEST_FEATURES.mailEventCancellation = false;
      TEST_FEATURES.mailEventReminder = false;
      TEST_FEATURES.media = false;
      TEST_FEATURES.reminders = false;

      createPaymentSessionMock?.mockClear();
      getPaymentSessionMock?.mockClear();
      createPaymentRefundMock?.mockClear();
      parsePaymentWebhookMock?.mockClear();
    });

    afterAll(async () => {
      await clearSqlTestDb();

      removeTestTicketQrSecret();

      await disconnectSqlTestDb();

      vi.restoreAllMocks();
      vi.resetModules();
    });
    describe.each(PAYMENT_PROVIDER_CASES)("$name", (providerCase) => {
      beforeEach(() => {
        activePaymentProviderCase = providerCase;
      });
      it("creates a paid deposit order, confirms payment and refunds exactly once on manual check-in", async () => {
        const { admin, accessToken } = await createAdminAndToken();
        const externalUserToken = createExternalUserToken();

        const { event, ticketType, order } = await createPendingDepositOrder({
          accessToken,
          externalUserToken,
          providerCase,
        });

        expect(order).toMatchObject({
          event: {
            id: event.id,

            title: event.title,

            slug: event.slug,
          },

          buyer: {
            type: ORDER_BUYER_TYPE.EXTERNAL_USER,

            email: TEST_EXTERNAL_EMAIL,

            firstName: "Deposit",

            lastName: "Customer",

            displayName: "Deposit Customer",
          },

          items: [
            {
              ticketType: {
                id: ticketType.id,

                displayName: ticketType.displayName,

                description: ticketType.description,

                kind: TICKET_TYPE_KIND.DEPOSIT,
                pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
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

          refund: {
            status: "none",

            amount: 0,

            refundedAt: null,
          },
        });

        expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);
        expect(createPaymentSessionMock).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: providerCase.provider,
            amount: 25,
            currency: "EUR",
            orderId: order.id,
            metadata: expect.objectContaining({
              orderNumber: expect.any(String),
              eventId: event.id,
              isGuest: false,
            }),
          }),
        );

        await confirmDepositOrderPaid(order.id, providerCase);

        const orderInDb = await findOrderById(order.id, {
          lean: true,
        });

        expect(orderInDb).toBeDefined();
        expect(orderInDb).toMatchObject({
          id: order.id,
          status: ORDER_STATUS.CONFIRMED,
          paymentStatus: ORDER_PAYMENT_STATUS.PAID,
          paymentProvider: providerCase.provider,

          paymentProviderPaymentId: providerCase.providerPaymentId,
        });
        expect(orderInDb.confirmedAt).toBeTruthy();

        const tickets = await findTicketsByOrderId(order.id, {
          lean: true,
        });

        expect(tickets).toHaveLength(1);

        const ticket = tickets[0];

        expect(ticket).toMatchObject({
          orderId: order.id,
          ticketTypeId: ticketType.id,
          status: TICKET_STATUS.ACTIVE,
          ticketKind: TICKET_KIND.DEPOSIT,
          unitPrice: 2500,
          currency: "EUR",
          depositRefundStatus: TICKET_DEPOSIT_REFUND_STATUS.ELIGIBLE,
          depositRefundAmount: 2500,
          depositRefundCurrency: "EUR",
          depositRefundProviderRefundId: null,
          depositRefundFailureReason: null,
        });

        const checkInResponse = await request(ticketApp)
          .patch(`/api/admin/tickets/${ticket.id}/check-in`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
            checkedIn: true,
          });

        expect(checkInResponse.status).toBe(200);

        expect(checkInResponse.body.success).toBe(true);

        expect(checkInResponse.body.data).toMatchObject({
          id: ticket.id,

          status: TICKET_STATUS.CHECKED_IN,

          ticketType: {
            kind: TICKET_KIND.DEPOSIT,
          },

          checkIn: {
            checkedInAt: expect.any(String),

            checkedInByEventUserId: admin.id,
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
            idempotencyKey: `deposit-refund:${ticket.id}`,
            description: expect.stringContaining(ticket.ticketCode),
            metadata: expect.objectContaining({
              source: "event_deposit_check_in",
              orderId: order.id,
              ticketId: ticket.id,
              eventId: ticket.eventId,
            }),
          }),
        );

        const ticketInDb = await findTicketById(ticket.id, {
          lean: true,
        });

        expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);
        expect(ticketInDb.checkedInAt).toBeTruthy();
        expect(ticketInDb.checkedInByEventUserId).toBe(admin.id);
        expect(ticketInDb.depositRefundStatus).toBe(
          TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
        );
        expect(ticketInDb.depositRefundProviderRefundId).toBe(
          providerCase.providerRefundId,
        );
        expect(ticketInDb.depositRefundFailureReason).toBe(null);
        expect(ticketInDb.depositRefundTriggeredByEventUserId).toBe(admin.id);

        const duplicateCheckInResponse = await request(ticketApp)
          .patch(`/api/admin/tickets/${ticket.id}/check-in`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
            checkedIn: true,
          });

        expect(duplicateCheckInResponse.status).toBe(200);

        expect(duplicateCheckInResponse.body.success).toBe(true);

        expect(duplicateCheckInResponse.body.data).toMatchObject({
          id: ticket.id,

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
        const { admin, accessToken } = await createAdminAndToken({
          emailSnapshot: "qr-admin@example.com",
        });

        const externalUserToken = createExternalUserToken({
          externalUserId: "host-customer-deposit-sql-qr-1",
          email: "deposit.sql.qr.customer@example.com",
        });

        const { order } = await createPendingDepositOrder({
          accessToken,
          externalUserToken,
          providerCase,
        });

        await confirmDepositOrderPaid(order.id, providerCase);

        const [ticket] = await findTicketsByOrderId(order.id, {
          lean: true,
        });

        expect(ticket).toBeDefined();
        expect(ticket.ticketKind).toBe(TICKET_KIND.DEPOSIT);

        const qrResponse = await request(ticketApp)
          .get(`/api/public/tickets/${ticket.id}/qr`)
          .set("Authorization", `Bearer ${externalUserToken}`);

        expect(qrResponse.status).toBe(200);
        expect(qrResponse.body.success).toBe(true);

        expect(qrResponse.body.data).toEqual({
          ticket: {
            id: ticket.id,

            code: ticket.ticketCode,
          },

          qr: {
            payload: expect.any(String),

            dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
          },
        });

        const qrPayload = qrResponse.body.data.qr.payload;

        const serializedPublicQrResponse = JSON.stringify(qrResponse.body.data);

        for (const field of [
          "_id",
          "__v",
          "ticketId",
          "ticketCode",
          "qrDataUrl",
          "encryptedCheckInToken",
          "checkInTokenHash",
        ]) {
          expect(serializedPublicQrResponse).not.toContain(`"${field}"`);
        }

        /*
         * Der QR-Lookup muss denselben kanonischen Vertrag
         * wie der Ticketcode-Lookup liefern.
         */
        const lookupResponse = await request(ticketApp)
          .post("/api/admin/tickets/check-in/qr/lookup")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
            payload: qrPayload,
          });

        expect(lookupResponse.status).toBe(200);
        expect(lookupResponse.body.success).toBe(true);

        expect(lookupResponse.body.data).toMatchObject({
          id: ticket.id,

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
        expect(lookupResponse.body.ticketType).toBeUndefined();
        expect(lookupResponse.body.allowed).toBeUndefined();
        expect(lookupResponse.body.state).toBeUndefined();
        expect(lookupResponse.body.refund).toBeUndefined();
        expect(lookupResponse.body.message).toBeUndefined();
        expect(lookupResponse.body.data.ticket).toBeUndefined();

        /*
         * Der erste Confirm checkt das Ticket ein
         * und löst genau einen Deposit-Refund aus.
         */
        const qrCheckInResponse = await request(ticketApp)
          .post("/api/admin/tickets/check-in/qr/confirm")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
            payload: qrPayload,
          });

        expect(qrCheckInResponse.status).toBe(200);
        expect(qrCheckInResponse.body.success).toBe(true);

        expect(qrCheckInResponse.body.data).toMatchObject({
          id: ticket.id,

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.CHECKED_IN,

          ticketType: {
            kind: TICKET_KIND.DEPOSIT,
          },

          checkIn: {
            checkedInAt: expect.any(String),

            checkedInByEventUserId: admin.id,
          },
        });

        expect(qrCheckInResponse.body.meta).toEqual({
          checkIn: {
            requestedCheckedIn: true,

            statusChanged: true,
          },
        });

        expect(qrCheckInResponse.body.event).toBeUndefined();
        expect(qrCheckInResponse.body.ticketType).toBeUndefined();
        expect(qrCheckInResponse.body.allowed).toBeUndefined();
        expect(qrCheckInResponse.body.state).toBeUndefined();
        expect(qrCheckInResponse.body.refund).toBeUndefined();
        expect(qrCheckInResponse.body.message).toBeUndefined();
        expect(qrCheckInResponse.body.data.ticket).toBeUndefined();
        expect(qrCheckInResponse.body.data.refund).toBeUndefined();

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

        expect(createPaymentRefundMock).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: providerCase.provider,

            providerPaymentId: providerCase.providerPaymentId,

            amount: "25.00",

            currency: "EUR",

            idempotencyKey: `deposit-refund:${ticket.id}`,
          }),
        );

        /*
         * Ein wiederholter Confirm ist ein idempotenter No-op.
         * Er darf weder auschecken noch erneut refunden.
         */
        const replayResponse = await request(ticketApp)
          .post("/api/admin/tickets/check-in/qr/confirm")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
            payload: qrPayload,
          });

        expect(replayResponse.status).toBe(200);
        expect(replayResponse.body.success).toBe(true);

        expect(replayResponse.body.data).toMatchObject({
          id: ticket.id,

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.CHECKED_IN,

          checkIn: {
            checkedInAt: qrCheckInResponse.body.data.checkIn.checkedInAt,

            checkedInByEventUserId: admin.id,
          },
        });

        expect(replayResponse.body.meta).toEqual({
          checkIn: {
            requestedCheckedIn: true,

            statusChanged: false,
          },
        });

        expect(replayResponse.body.refund).toBeUndefined();
        expect(replayResponse.body.message).toBeUndefined();
        expect(replayResponse.body.data.ticket).toBeUndefined();
        expect(replayResponse.body.data.refund).toBeUndefined();

        expect(createPaymentRefundMock).toHaveBeenCalledTimes(1);

        /*
         * Der nachfolgende Lookup muss den bereits
         * eingecheckten Zustand ausweisen.
         */
        const checkedInLookupResponse = await request(ticketApp)
          .post("/api/admin/tickets/check-in/qr/lookup")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
            payload: qrPayload,
          });

        expect(checkedInLookupResponse.status).toBe(200);
        expect(checkedInLookupResponse.body.success).toBe(true);

        expect(checkedInLookupResponse.body.data).toMatchObject({
          id: ticket.id,

          ticketCode: ticket.ticketCode,

          status: TICKET_STATUS.CHECKED_IN,

          checkIn: {
            checkedInAt: qrCheckInResponse.body.data.checkIn.checkedInAt,

            checkedInByEventUserId: admin.id,
          },
        });

        expect(checkedInLookupResponse.body.meta).toEqual({
          checkIn: {
            allowed: false,

            state: TICKET_CHECK_IN_STATE.ALREADY_CHECKED_IN,
          },
        });

        expect(checkedInLookupResponse.body.allowed).toBeUndefined();
        expect(checkedInLookupResponse.body.state).toBeUndefined();
        expect(checkedInLookupResponse.body.refund).toBeUndefined();
        expect(checkedInLookupResponse.body.data.ticket).toBeUndefined();

        /*
         * Kein Admin-QR-Response darf Datenbank-, Token-
         * oder Storage-Interna enthalten.
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

        const ticketInDb = await findTicketById(ticket.id, {
          lean: true,
        });

        expect(ticketInDb.status).toBe(TICKET_STATUS.CHECKED_IN);

        expect(ticketInDb.checkedInAt).toBeTruthy();

        expect(String(ticketInDb.checkedInByEventUserId)).toBe(admin.id);

        expect(ticketInDb.depositRefundStatus).toBe(
          TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,
        );

        expect(ticketInDb.depositRefundProviderRefundId).toBe(
          providerCase.providerRefundId,
        );
      });
    });
  },
);
