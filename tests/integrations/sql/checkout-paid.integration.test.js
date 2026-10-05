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

const TEST_JWT_SECRET = "integration-local-jwt-secret";
const TEST_EXTERNAL_JWT_SECRET = "integration-external-jwt-secret";

const TEST_EXTERNAL_PROVIDER = "dummy";
const TEST_EXTERNAL_USER_ID = "host-customer-paid-1";
const TEST_EXTERNAL_EMAIL = "paid.customer@example.com";

let eventApp;
let ticketTypeApp;
let publicOrderApp;

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let hashPassword;
let createEventUser;
let findOrderById;
let findTicketsByOrderId;
let findTicketTypeById;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;
let TICKET_TYPE_PRICING_MODE;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let createPaymentSessionMock;
let createDiscountCodeGroup;
let insertDiscountCodes;
let TEST_FEATURES;
let activePaymentProvider = "mollie";

function createPaymentProviderCheckoutConfigMock(provider = "mollie") {
  return {
    provider,
    redirectUrl: "https://frontend.example.test/payment-return",
    webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
  };
}

async function loadPaidCheckoutSqlIntegrationApp({
  ticketing = true,
  guestCheckout = true,
  ticketPdf = false,
  ticketQr = false,
  mail = false,
  discountCodes = true,
  paymentSessionResult = {
    provider: "mollie",
    providerPaymentId: "pay_sql_test_123",
    checkoutUrl: "https://payments.example.test/pay_sql_test_123",
    status: "open",
  },
  paymentSessionError = null,
} = {}) {
  vi.resetModules();

  createPaymentSessionMock = vi.fn();

  if (paymentSessionError) {
    createPaymentSessionMock.mockRejectedValue(paymentSessionError);
  } else {
    createPaymentSessionMock.mockResolvedValue(paymentSessionResult);
  }

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
      },
      payments: {
        get provider() {
          return activePaymentProvider;
        },
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

  TEST_FEATURES = {
    ticketing,
    guestCheckout,
    depositTickets: false,
    ticketPdf,
    ticketQr,
    mail,
    mailOrderConfirmation: mail,
    mailEventCancellation: mail,
    mailEventReminder: false,
    discountCodes,
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
    getPaymentSession: vi.fn(),
    parsePaymentWebhook: vi.fn(),
    getPaymentProviderCheckoutConfig: vi.fn(
      (provider = activePaymentProvider) =>
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
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");
  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");

  const discountCodeRepositoryModule =
    await import("../../../src/modules/discountCodes/repositories/discountCode.repository.js");

  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");
  const ticketTypeRepositoryModule =
    await import("../../../src/modules/ticketTypes/repositories/ticketType.repository.js");

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
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;
  findOrderById = orderRepositoryModule.findOrderById;
  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  findTicketTypeById = ticketTypeRepositoryModule.findTicketTypeById;

  createDiscountCodeGroup =
    discountCodeRepositoryModule.createDiscountCodeGroup;
  insertDiscountCodes = discountCodeRepositoryModule.insertDiscountCodes;

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

  const adminAuthRoutesModule =
    await import("../../../src/modules/adminAuth/adminAuth.routes.js");

  const authApp = createHttpTestApp({
    mountPath: "/api/admin/auth",
    router: adminAuthRoutesModule.default,
  });

  const loginResponse = await request(authApp)
    .post("/api/admin/auth/login")
    .send({
      email: emailSnapshot,
      password,
    });

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
  firstName = "Paid",
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

function createHostServiceToken() {
  return jwt.sign(
    {
      sub: "dummy-host-service-paid",
      tokenType: "host-service",
      role: "host_service",
      roles: ["host_service"],
      provider: TEST_EXTERNAL_PROVIDER,
      externalProvider: TEST_EXTERNAL_PROVIDER,
    },
    TEST_EXTERNAL_JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

function buildEventPayload(overrides = {}) {
  return {
    title: "SQL Paid Checkout Event",
    slug: "sql-paid-checkout-event",
    shortDescription: "Short paid checkout event description",
    description: "Long paid checkout event description",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "paid", "checkout"],
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
    notesInternal: "Created by SQL paid checkout integration test",
    ...overrides,
  };
}

function buildTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "Paid Checkout Ticket",
    description: "A paid checkout test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 100,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: "2020-01-01T10:00:00.000Z",
    salesEndAt: "2030-06-09T10:00:00.000Z",
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    ...overrides,
  };
}

async function createPublishedPaidEventWithTicketType(
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
    .send(buildTicketTypePayload(event.id, ticketTypeOverrides));

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

async function createDiscountForEvent(
  event,
  {
    name = "Partner",
    discountPercent = 10,
    groupIsActive = true,
    code = "PARTNER10",
    codeIsActive = true,
  } = {},
) {
  const group = await createDiscountCodeGroup(
    {
      eventId: event.id,
      name,
      discountPercent,
      isActive: groupIsActive,
    },
    {
      lean: true,
    },
  );

  const [createdCode] = await insertDiscountCodes(
    [
      {
        eventId: event.id,
        groupId: group.id,
        code: String(code).trim().toUpperCase(),
        isActive: codeIsActive,
      },
    ],
    {
      lean: true,
    },
  );

  return {
    group,
    code: createdCode,
  };
}

describe("Paid checkout SQL integration", () => {
  beforeAll(async () => {
    await loadPaidCheckoutSqlIntegrationApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
    activePaymentProvider = "mollie";

    TEST_FEATURES.ticketing = true;
    TEST_FEATURES.guestCheckout = true;
    TEST_FEATURES.depositTickets = false;
    TEST_FEATURES.ticketPdf = false;
    TEST_FEATURES.ticketQr = false;
    TEST_FEATURES.mail = false;
    TEST_FEATURES.mailOrderConfirmation = false;
    TEST_FEATURES.mailEventCancellation = false;
    TEST_FEATURES.mailEventReminder = false;
    TEST_FEATURES.discountCodes = true;
    TEST_FEATURES.media = false;
    TEST_FEATURES.reminders = false;

    createPaymentSessionMock?.mockReset();
    createPaymentSessionMock?.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_sql_test_123",
      checkoutUrl: "https://payments.example.test/pay_sql_test_123",
      status: "open",
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates a pending paid external-user order, initializes payment and reserves stock without creating tickets", async () => {
    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-paid-external-checkout-event",
        },
        ticketTypeOverrides: {
          displayName: "SQL Paid External Ticket",
          priceGross: 2500,
          stockTotal: 10,
        },
      },
    );

    const checkoutResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-7e7a70ab-2b78-4c2c-8314-ff07d9736a8c")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 2,
          },
        ],
      });

    if (checkoutResponse.status !== 201) {
      console.dir(checkoutResponse.body, { depth: null });
    }

    expect(checkoutResponse.status).toBe(201);

    expect(checkoutResponse.body.success).toBe(true);

    expect(checkoutResponse.headers["idempotency-replayed"]).toBe("false");

    expect(checkoutResponse.body.data.checkout).toEqual({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      url: "https://payments.example.test/pay_sql_test_123",

      status: "open",
    });

    expect(checkoutResponse.body.data.guestAccess).toBe(null);

    expect(checkoutResponse.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: TEST_EXTERNAL_EMAIL,

        firstName: "Paid",

        lastName: "Customer",

        displayName: "Paid Customer",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: "Main Hall – Room 1",
      },

      items: [
        {
          ticketType: {
            id: ticketType.id,

            displayName: ticketType.displayName,

            description: ticketType.description,

            kind: ticketType.ticketKind,
          },

          quantity: 2,

          unitPrice: 2500,

          lineTotal: 5000,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      status: ORDER_STATUS.PENDING,

      payment: {
        status: ORDER_PAYMENT_STATUS.PENDING,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(checkoutResponse.body.data.order.createdAt).toBeTypeOf("string");

    expect(checkoutResponse.body.data.order.updatedAt).toBeTypeOf("string");

    expect(checkoutResponse.body.data.order.expiresAt).toBeTypeOf("string");

    expect(checkoutResponse.body.meta).toEqual({
      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: null,

      fulfillment: {
        documents: null,

        mail: null,
      },
    });

    const serializedCheckout = JSON.stringify(checkoutResponse.body);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",

      "providerPaymentId",
    ]) {
      expect(serializedCheckout).not.toContain(`"${field}"`);
    }

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(createPaymentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        amount: 50,
        currency: "EUR",
        orderId: checkoutResponse.body.data.order.id,
        metadata: expect.objectContaining({
          orderNumber: expect.any(String),
          eventId: event.id,
          isGuest: false,
        }),
      }),
    );

    const orderInDb = await findOrderById(checkoutResponse.body.data.order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(orderInDb).toBeDefined();
    expect(orderInDb).toMatchObject({
      id: checkoutResponse.body.data.order.id,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      paymentProviderPaymentId: "pay_sql_test_123",
      paymentCheckoutUrl: "https://payments.example.test/pay_sql_test_123",
    });

    const tickets = await findTicketsByOrderId(orderInDb.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(2);
  });

  it("confirms a fixed-price order without online payment when no payment provider is configured", async () => {
    activePaymentProvider = "disabled";

    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-external-payment-checkout-event",
        },
        ticketTypeOverrides: {
          priceGross: 2500,
          stockTotal: 10,
        },
      },
    );

    const checkoutResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-sql-external-payment-checkout-0001")
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

    expect(checkoutResponse.status).toBe(201);
    expect(checkoutResponse.body.success).toBe(true);

    expect(checkoutResponse.body.data.checkout).toBe(null);
    expect(checkoutResponse.body.data.guestAccess).toBe(null);

    expect(checkoutResponse.body.data.order).toMatchObject({
      items: [
        {
          ticketType: {
            id: ticketType.id,
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

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },
    });

    expect(checkoutResponse.body.meta).toMatchObject({
      idempotencyReplayed: false,
      paymentInitializationFailed: false,
      message: "Order confirmed. Payment is handled externally.",
    });

    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const orderInDb = await findOrderById(checkoutResponse.body.data.order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,
    });

    expect(orderInDb.confirmedAt).toBeTruthy();
    expect(orderInDb.expiresAt).toBeNull();

    const tickets = await findTicketsByOrderId(orderInDb.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(1);
  });

  it("marks order as failed and releases stock when payment session creation fails", async () => {
    createPaymentSessionMock.mockRejectedValueOnce(
      new Error("Payment provider unavailable"),
    );

    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-payment-session-fails-event",
        },
        ticketTypeOverrides: {
          priceGross: 2500,
          stockTotal: 10,
        },
      },
    );

    const checkoutResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-d9d59ae9-f826-4ae3-9202-6cdf5c90ff18")
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

    expect(checkoutResponse.headers["idempotency-replayed"]).toBe("false");

    expect(checkoutResponse.body.data.checkout).toBe(null);

    expect(checkoutResponse.body.data.guestAccess).toBe(null);

    expect(checkoutResponse.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: TEST_EXTERNAL_EMAIL,

        firstName: "Paid",

        lastName: "Customer",

        displayName: "Paid Customer",
      },

      event: {
        id: event.id,

        title: event.title,
      },

      items: [
        {
          ticketType: {
            id: ticketType.id,

            displayName: ticketType.displayName,

            kind: ticketType.ticketKind,
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

      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      cancellationReason: "Payment initialization failed",
    });

    expect(checkoutResponse.body.data.order.cancelledAt).toBeTypeOf("string");

    expect(checkoutResponse.body.meta).toEqual({
      idempotencyReplayed: false,

      paymentInitializationFailed: true,

      message: "Payment provider unavailable",

      fulfillment: {
        documents: null,

        mail: null,
      },
    });

    const serializedFailedCheckout = JSON.stringify(checkoutResponse.body);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",

      "providerPaymentId",
    ]) {
      expect(serializedFailedCheckout).not.toContain(`"${field}"`);
    }

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);

    const tickets = await findTicketsByOrderId(
      checkoutResponse.body.data.order.id,
      {
        lean: true,
      },
    );

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("creates guest access for paid guest checkout and initializes payment", async () => {
    const { accessToken } = await createAdminAndToken();
    const hostServiceToken = createHostServiceToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-paid-guest-checkout-event",
        },
        ticketTypeOverrides: {
          priceGross: 1200,
          stockTotal: 10,
        },
      },
    );

    const checkoutResponse = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "test-078ea14d-cd34-427a-bff6-6fcddc430761")
      .set("Authorization", `Bearer ${hostServiceToken}`)
      .send({
        eventId: event.id,
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
          },
        ],
        guest: {
          firstName: "Paid",
          lastName: "Guest",
          email: "paid.guest@example.com",
        },
      });

    if (checkoutResponse.status !== 201) {
      console.dir(checkoutResponse.body, { depth: null });
    }

    expect(checkoutResponse.status).toBe(201);

    expect(checkoutResponse.body.success).toBe(true);

    expect(checkoutResponse.headers["idempotency-replayed"]).toBe("false");

    expect(checkoutResponse.body.data.checkout).toEqual({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      url: "https://payments.example.test/pay_sql_test_123",

      status: "open",
    });

    expect(checkoutResponse.body.data.guestAccess).toMatchObject({
      orderId: expect.any(String),

      accessToken: expect.any(String),

      expiresAt: expect.any(String),
    });

    expect(checkoutResponse.body.data.order).toMatchObject({
      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "paid.guest@example.com",

        firstName: "Paid",

        lastName: "Guest",

        displayName: "Paid Guest",
      },

      event: {
        id: event.id,

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: "Main Hall – Room 1",
      },

      items: [
        {
          ticketType: {
            id: ticketType.id,

            displayName: ticketType.displayName,

            description: ticketType.description,

            kind: ticketType.ticketKind,
          },

          quantity: 1,

          unitPrice: 1200,

          lineTotal: 1200,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 1200,

        total: 1200,
      },

      status: ORDER_STATUS.PENDING,

      payment: {
        status: ORDER_PAYMENT_STATUS.PENDING,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(checkoutResponse.body.data.guestAccess.orderId).toBe(
      checkoutResponse.body.data.order.id,
    );

    expect(checkoutResponse.body.meta).toEqual({
      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: null,

      fulfillment: {
        documents: null,

        mail: null,
      },
    });

    const serializedGuestCheckout = JSON.stringify(checkoutResponse.body);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",

      "providerPaymentId",
    ]) {
      expect(serializedGuestCheckout).not.toContain(`"${field}"`);
    }

    const orderInDb = await findOrderById(checkoutResponse.body.data.order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(orderInDb).toBeDefined();
    expect(orderInDb.guestAccessTokenHash).toBeTruthy();
    expect(orderInDb.guestAccessTokenExpiresAt).toBeTruthy();
    expect(orderInDb.guestAccessDownloadCount).toBe(0);

    const tickets = await findTicketsByOrderId(orderInDb.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(0);

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(1);
  });

  it("applies an active percentage discount and persists the SQL snapshot", async () => {
    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-paid-discount-checkout-event",
        },
        ticketTypeOverrides: {
          priceGross: 2500,
          stockTotal: 10,
        },
      },
    );

    const discount = await createDiscountForEvent(event, {
      name: "SQL Partner 10",
      discountPercent: 10,
      code: "SQLPARTNER10",
    });

    const response = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "sql-paid-discount-checkout-0001")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        discountCode: "sqlpartner10",
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 2,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data.order.pricing).toEqual({
      currency: "EUR",
      subtotal: 5000,
      discount: {
        codeId: discount.code.id,
        code: "SQLPARTNER10",
        group: {
          id: discount.group.id,
          name: "SQL Partner 10",
        },
        percent: 10,
        amount: 500,
      },
      total: 4500,
    });

    expect(createPaymentSessionMock).toHaveBeenCalledTimes(1);
    expect(createPaymentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45,
        currency: "EUR",
      }),
    );

    const orderInDb = await findOrderById(response.body.data.order.id, {
      lean: true,
      includeSecrets: true,
    });

    expect(orderInDb).toMatchObject({
      subtotal: 5000,
      discountCodeIdSnapshot: discount.code.id,
      discountCodeSnapshot: "SQLPARTNER10",
      discountCodeGroupIdSnapshot: discount.group.id,
      discountCodeGroupNameSnapshot: "SQL Partner 10",
      discountPercent: 10,
      discountAmount: 500,
      totalPrice: 4500,
    });
  });

  it("rejects inactive discount codes before SQL stock is reserved", async () => {
    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-inactive-discount-checkout-event",
        },
      },
    );

    await createDiscountForEvent(event, {
      code: "SQLINACTIVE10",
      codeIsActive: false,
    });

    const response = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "sql-inactive-discount-checkout-0001")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        discountCode: "SQLINACTIVE10",
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODE_INVALID",
      },
    });

    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("rejects a discount for a donation-only SQL order", async () => {
    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-donation-discount-not-applicable-event",
        },
        ticketTypeOverrides: {
          pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
          priceGross: 0,
        },
      },
    );

    await createDiscountForEvent(event, {
      code: "SQLDONATION10",
    });

    const response = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "sql-donation-discount-not-applicable-0001")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        discountCode: "SQLDONATION10",
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
            donationAmountGross: 1500,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODE_NOT_APPLICABLE",
      },
    });

    expect(createPaymentSessionMock).not.toHaveBeenCalled();
  });

  it("confirms a 100 percent discounted SQL order without payment", async () => {
    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-full-discount-checkout-event",
        },
        ticketTypeOverrides: {
          priceGross: 2500,
        },
      },
    );

    const discount = await createDiscountForEvent(event, {
      name: "SQL Full Discount",
      discountPercent: 100,
      code: "SQLFREE100",
    });

    const response = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "sql-full-discount-checkout-0001")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        discountCode: "sqlfree100",
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.checkout).toBe(null);
    expect(response.body.data.order).toMatchObject({
      pricing: {
        currency: "EUR",
        subtotal: 2500,
        discount: {
          codeId: discount.code.id,
          code: "SQLFREE100",
          group: {
            id: discount.group.id,
            name: "SQL Full Discount",
          },
          percent: 100,
          amount: 2500,
        },
        total: 0,
      },
      status: ORDER_STATUS.CONFIRMED,
      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },
    });

    expect(response.body.meta.message).toBe("Order confirmed.");
    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const tickets = await findTicketsByOrderId(response.body.data.order.id, {
      lean: true,
    });

    expect(tickets).toHaveLength(1);
  });

  it("rejects mixed ticket currencies before creating a SQL order", async () => {
    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType: eurTicket } =
      await createPublishedPaidEventWithTicketType(accessToken, {
        eventOverrides: {
          slug: "sql-mixed-currency-checkout-event",
        },
        ticketTypeOverrides: {
          displayName: "EUR Ticket",
          currency: "EUR",
        },
      });

    const usdTicketResponse = await request(ticketTypeApp)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        buildTicketTypePayload(event.id, {
          displayName: "USD Ticket",
          currency: "USD",
        }),
      );

    expect(usdTicketResponse.status).toBe(201);

    const response = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "sql-mixed-currency-checkout-0001")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        items: [
          {
            ticketTypeId: eurTicket.id,
            quantity: 1,
          },
          {
            ticketTypeId: usdTicketResponse.body.data.id,
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ORDER_CURRENCY_MISMATCH",
      },
    });

    expect(createPaymentSessionMock).not.toHaveBeenCalled();
  });

  it("rejects submitted discount codes when the SQL feature flag is disabled", async () => {
    TEST_FEATURES.discountCodes = false;

    const { accessToken } = await createAdminAndToken();
    const externalUserToken = createExternalUserToken();

    const { event, ticketType } = await createPublishedPaidEventWithTicketType(
      accessToken,
      {
        eventOverrides: {
          slug: "sql-discount-feature-disabled-event",
        },
      },
    );

    const response = await request(publicOrderApp)
      .post("/api/public/orders/checkout")
      .set("Idempotency-Key", "sql-discount-feature-disabled-0001")
      .set("Authorization", `Bearer ${externalUserToken}`)
      .send({
        eventId: event.id,
        discountCode: "ANYCODE",
        items: [
          {
            ticketTypeId: ticketType.id,
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODES_DISABLED",
      },
    });

    expect(createPaymentSessionMock).not.toHaveBeenCalled();

    const updatedTicketType = await findTicketTypeById(ticketType.id, {
      lean: true,
    });

    expect(updatedTicketType.stockSold).toBe(0);
  });
});
