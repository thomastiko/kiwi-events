import jwt from "jsonwebtoken";
import request from "supertest";

import { createHttpTestApp } from "../../helpers/httpTestApp.js";
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
const HOST_SERVICE_PROVIDER = "demo-system";
const HOST_SERVICE_ID = "kiwi-events-demo-host";
const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let app;

let customerSelfServiceCancellationEnabled = true;
const {
  cancelPaymentSessionMock,
  createProviderRefundMock,
  sendRefundCompletedMailMock,
} = vi.hoisted(() => ({
  cancelPaymentSessionMock: vi.fn(),
  createProviderRefundMock: vi.fn(),
  sendRefundCompletedMailMock: vi.fn(),
}));
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
let getOwnTicketByIdService;

let listOwnTicketsService;

let listOwnOrdersService;
let getOwnOrderByIdService;
let cancelOwnOrderService;
let getGuestOrderByAccessTokenService;

let issueGuestAccessForOrderService;
let reissueGuestAccessService;

let ORDER_REFUND_STATUS;

let PAYMENT_REFUND_SOURCE_TYPE;
let PAYMENT_REFUND_STATUS;

let findPaymentRefundByIdempotencyKey;

let createPaymentRefundRecord;

async function loadOrderAccessIntegrationModules({
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
  vi.doMock(
    "../../../src/config/kiwi-events/kiwi-events.config.store.js",
    async (importOriginal) => {
      const actual = await importOriginal();

      return {
        ...actual,

        loadKiwiEventsConfig: (...args) => {
          const config = actual.loadKiwiEventsConfig(...args);

          return {
            ...config,

            orders: {
              ...(config.orders || {}),

              customerSelfServiceCancellation: {
                enabled: customerSelfServiceCancellationEnabled,

                refundDeadlineDaysBeforeSession: null,
              },
            },
          };
        },
      };
    },
  );

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

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),

    cancelPaymentSession: cancelPaymentSessionMock,

    createPaymentRefund: createProviderRefundMock,
  }));

  vi.doMock(
    "../../../src/modules/paymentRefunds/paymentRefund.mail.service.js",
    () => ({
      sendPaymentRefundCompletedMailSafe: sendRefundCompletedMailMock,
    }),
  );

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
  const orderPublicServiceModule =
    await import("../../../src/modules/orders/public/order.public.service.js");
  const guestAccessServiceModule =
    await import("../../../src/modules/orders/order.guestAccess.service.js");
  const guestAccessRecoveryServiceModule =
    await import("../../../src/modules/orders/order.guestAccessRecovery.service.js");
  const expressModule = await import("express");

  const publicOrderRoutesModule =
    await import("../../../src/modules/orders/public/order.public.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  const paymentRefundConstantsModule =
    await import("../../../src/modules/paymentRefunds/paymentRefund.constants.js");

  const paymentRefundRepositoryModule =
    await import("../../../src/modules/paymentRefunds/repositories/paymentRefund.repository.js");

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
  ORDER_REFUND_STATUS = orderConstantsModule.ORDER_REFUND_STATUS;

  PAYMENT_REFUND_SOURCE_TYPE =
    paymentRefundConstantsModule.PAYMENT_REFUND_SOURCE_TYPE;

  PAYMENT_REFUND_STATUS = paymentRefundConstantsModule.PAYMENT_REFUND_STATUS;

  findPaymentRefundByIdempotencyKey =
    paymentRefundRepositoryModule.findPaymentRefundByIdempotencyKey;
  createPaymentRefundRecord = paymentRefundRepositoryModule.createPaymentRefund;
  TICKET_STATUS = ticketConstantsModule.TICKET_STATUS;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;
  getOwnTicketByIdService = ticketServiceModule.getOwnTicketByIdService;
  listOwnTicketsService = ticketServiceModule.listOwnTicketsService;
  listOwnOrdersService = orderPublicServiceModule.listOwnOrdersService;
  getOwnOrderByIdService = orderPublicServiceModule.getOwnOrderByIdService;
  cancelOwnOrderService = orderPublicServiceModule.cancelOwnOrderService;
  getGuestOrderByAccessTokenService =
    orderPublicServiceModule.getGuestOrderByAccessTokenService;

  issueGuestAccessForOrderService =
    guestAccessServiceModule.issueGuestAccessForOrderService;

  reissueGuestAccessService =
    guestAccessRecoveryServiceModule.reissueGuestAccessService;
  const router = expressModule.default.Router();

  router.use("/public/orders", publicOrderRoutesModule.default);

  app = createHttpTestApp({
    mountPath: "/api",

    router,

    notFoundHandler: notFoundHandlerModule.notFoundHandler,

    errorHandler: errorHandlerModule.errorHandler,
  });
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

function buildExternalActor(overrides = {}) {
  return {
    externalProvider: "dummy",
    externalUserId: "host-customer-1",
    email: "kunde@example.com",
    rawClaims: {
      firstName: "Max",
      lastName: "Kunde",
    },
    ...overrides,
  };
}
function buildHostServiceActor(overrides = {}) {
  return {
    externalProvider: HOST_SERVICE_PROVIDER,
    externalUserId: null,

    isHostService: true,
    tokenType: "host-service",
    hostServiceId: HOST_SERVICE_ID,

    email: null,
    rawClaims: {
      sub: HOST_SERVICE_ID,
    },

    ...overrides,
  };
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
function signHostServiceToken(payload = {}) {
  return jwt.sign(
    {
      externalProvider: HOST_SERVICE_PROVIDER,
      tokenType: "host-service",
      sub: HOST_SERVICE_ID,

      ...payload,
    },
    EXTERNAL_SECRET,
  );
}
async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Order Access Event",
    slug: `order-access-event-${Date.now()}`,
    shortDescription: "Order access integration event",
    description: "Created by order access integration test.",
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
    name: `${event.title} - Access Ticket`,
    displayName: "Access Ticket",
    description: "Order access test ticket",
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
function createTestOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code +=
      ORDER_NUMBER_ALPHABET[
        Math.floor(Math.random() * ORDER_NUMBER_ALPHABET.length)
      ];
  }

  return `ORD-${datePart}-${code}`;
}
async function createOrderWithTickets({
  event,
  ticketType,
  quantity = 1,
  buyerType = ORDER_BUYER_TYPE.EXTERNAL_USER,
  externalProvider = "dummy",
  externalUserId = "host-customer-1",

  hostServiceProvider = null,
  hostServiceId = null,

  email = "kunde@example.com",
  firstName = "Max",
  lastName = "Kunde",
  totalPrice = 2500,
  status = ORDER_STATUS.CONFIRMED,
  paymentStatus = ORDER_PAYMENT_STATUS.PAID,
  paymentProvider = totalPrice > 0
    ? ORDER_PAYMENT_PROVIDER.MOLLIE
    : ORDER_PAYMENT_PROVIDER.NONE,
  paymentProviderPaymentId = totalPrice > 0 ? "pay_order_access_123" : null,
  createTickets = true,
} = {}) {
  const order = await Order.create({
    orderNumber: createTestOrderNumber(),
    hostServiceProvider,
    hostServiceId,
    buyerType,
    buyerExternalProvider:
      buyerType === ORDER_BUYER_TYPE.EXTERNAL_USER ? externalProvider : null,
    buyerExternalUserId:
      buyerType === ORDER_BUYER_TYPE.EXTERNAL_USER ? externalUserId : null,
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

    status,
    paymentStatus,
    paymentProvider,
    paymentProviderPaymentId,
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: status === ORDER_STATUS.CONFIRMED ? new Date() : null,
    expiresAt:
      status === ORDER_STATUS.PENDING ? new Date(Date.now() + 900000) : null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,
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

async function createGuestOrderWithAccess({ quantity = 2 } = {}) {
  const event = await createPublishedEvent({
    title: "Guest Access Event",
    slug: "guest-access-event",
    isFree: true,
  });

  const ticketType = await createTicketType(event, {
    displayName: "Guest Access Ticket",
    pricingMode: "free",
    priceGross: 0,
  });

  const { order, tickets } = await createOrderWithTickets({
    event,
    ticketType,
    quantity,
    buyerType: ORDER_BUYER_TYPE.GUEST,
    externalProvider: null,
    externalUserId: null,

    hostServiceProvider: HOST_SERVICE_PROVIDER,
    hostServiceId: HOST_SERVICE_ID,

    email: "guest@example.com",
    firstName: "Guest",
    lastName: "Tester",
    totalPrice: 0,
    paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,
    paymentProviderPaymentId: null,
    createTickets: true,
  });

  const issued = await issueGuestAccessForOrderService(order);

  return {
    event,
    ticketType,
    order: issued.order,
    tickets,
    accessToken: issued.guestAccess.token,
  };
}

describe("Order access MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadOrderAccessIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    customerSelfServiceCancellationEnabled = true;

    cancelPaymentSessionMock.mockReset();
    cancelPaymentSessionMock.mockImplementation(
      async ({ provider, providerPaymentId }) => ({
        provider: provider || "mollie",
        providerPaymentId,
        status: "canceled",
        rawStatus: "canceled",
        terminated: true,
        terminal: true,
        paid: false,
      }),
    );

    createProviderRefundMock.mockReset();
    createProviderRefundMock.mockImplementation(
      async ({ provider, providerPaymentId }) => ({
        provider,
        providerPaymentId,
        providerRefundId: `refund_${providerPaymentId}`,
        status: "refunded",
      }),
    );

    sendRefundCompletedMailMock.mockReset();
    sendRefundCompletedMailMock.mockResolvedValue({
      skipped: false,
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a guest order and tickets using the public DTO contracts and tracks access usage", async () => {
    const { event, ticketType, order, tickets, accessToken } =
      await createGuestOrderWithAccess({
        quantity: 2,
      });

    const result = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(Object.keys(result).sort()).toEqual([
      "cancellation",
      "order",
      "tickets",
    ]);
    expect(result.cancellation).toMatchObject({
      allowed: true,

      reason: null,
    });

    expect(result.order).toMatchObject({
      id: order.id,

      orderNumber: order.orderNumber,

      buyer: {
        type: ORDER_BUYER_TYPE.GUEST,

        email: "guest@example.com",

        firstName: "Guest",

        lastName: "Tester",

        displayName: "Guest Tester",
      },

      event: {
        id: String(event._id),

        title: event.title,

        slug: event.slug,

        category: event.category,

        location: event.location,
      },

      pricing: {
        currency: "EUR",

        subtotal: 0,

        total: 0,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(result.tickets).toHaveLength(2);

    expect(result.tickets.map((ticket) => ticket.id).sort()).toEqual(
      tickets.map((ticket) => String(ticket.id)).sort(),
    );

    for (const ticket of result.tickets) {
      expect(ticket).toMatchObject({
        orderId: order.id,

        buyer: {
          type: ORDER_BUYER_TYPE.GUEST,

          email: "guest@example.com",

          firstName: "Guest",

          lastName: "Tester",

          displayName: "Guest Tester",
        },

        holder: {
          type: "buyer",

          email: "guest@example.com",

          firstName: "Guest",

          lastName: "Tester",

          displayName: "Guest Tester",
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

          unitPrice: 0,
        },

        status: TICKET_STATUS.ACTIVE,

        depositRefund: {
          status: "not_required",

          amount: 0,

          currency: "EUR",

          triggeredAt: null,
        },
      });
    }

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",

      "guestAccessTokenHash",
      "guestAccessTokenExpiresAt",
      "guestAccessLastUsedAt",
      "guestAccessDownloadCount",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",

      "holderExternalProvider",
      "holderExternalUserId",
      "holderEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "paymentStatus",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "ticketPdfStorageKey",

      "fulfillmentStatus",
      "fulfillmentLeaseToken",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    const orderInDb = await Order.findById(order.id).lean();

    expect(orderInDb.guestAccessDownloadCount).toBe(1);

    expect(orderInDb.guestAccessLastUsedAt).toBeTruthy();
  });

  it("rejects guest order access with an invalid token", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      getGuestOrderByAccessTokenService({
        orderId: order.id,
        accessToken: "invalid-token",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "INVALID_GUEST_ACCESS_TOKEN",
      message: "Invalid guest access token.",
    });
  });
  it("reissues guest access, rotates the token and invalidates the previous token", async () => {
    const { order, accessToken: previousAccessToken } =
      await createGuestOrderWithAccess({
        quantity: 1,
      });

    const beforeRecovery = await Order.findById(order.id)
      .select("+guestAccessTokenHash")
      .lean();

    expect(beforeRecovery.guestAccessTokenHash).toBeTruthy();

    const result = await reissueGuestAccessService({
      actor: buildHostServiceActor(),

      orderNumber: order.orderNumber,
      email: "guest@example.com",
    });

    expect(result.order.id).toBe(order.id);

    expect(result.guestAccess).toMatchObject({
      orderId: order.id,
      token: expect.any(String),
      expiresAt: expect.any(Date),
    });

    expect(result.guestAccess.token).not.toBe(previousAccessToken);

    const afterRecovery = await Order.findById(order.id)
      .select("+guestAccessTokenHash")
      .lean();

    expect(afterRecovery.guestAccessTokenHash).toBeTruthy();

    expect(afterRecovery.guestAccessTokenHash).not.toBe(
      beforeRecovery.guestAccessTokenHash,
    );

    await expect(
      getGuestOrderByAccessTokenService({
        orderId: order.id,
        accessToken: previousAccessToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "INVALID_GUEST_ACCESS_TOKEN",
    });

    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken: result.guestAccess.token,
    });

    expect(guestResult.order).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
    });
  });
  it("does not reissue guest access when the email does not match", async () => {
    const { order, accessToken } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      reissueGuestAccessService({
        actor: buildHostServiceActor(),

        orderNumber: order.orderNumber,
        email: "wrong@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
    });

    /*
     * Failed recovery must not rotate the existing token.
     */
    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(guestResult.order.id).toBe(order.id);
  });
  it("does not reissue guest access for a different host service", async () => {
    const { order, accessToken } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      reissueGuestAccessService({
        actor: buildHostServiceActor({
          hostServiceId: "another-host-service",
        }),

        orderNumber: order.orderNumber,
        email: "guest@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
    });

    /*
     * A different host must not rotate the valid token.
     */
    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(guestResult.order.id).toBe(order.id);
  });
  it("requires a host-service actor for guest access recovery", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    await expect(
      reissueGuestAccessService({
        actor: buildExternalActor(),

        orderNumber: order.orderNumber,
        email: "guest@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "GUEST_ACCESS_RECOVERY_HOST_SERVICE_REQUIRED",
    });
  });
  it("lists only orders owned by the external user using the public order contract", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order: ownOrder } = await createOrderWithTickets({
      event,
      ticketType,
      externalUserId: "host-customer-1",
      email: "kunde@example.com",
      totalPrice: 2500,
    });

    await createOrderWithTickets({
      event,
      ticketType,
      externalUserId: "other-user",
      email: "other@example.com",
      totalPrice: 2500,
    });

    const result = await listOwnOrdersService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),

      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);

    const [listedOrder] = result.items;

    expect(listedOrder).toMatchObject({
      id: String(ownOrder._id),

      orderNumber: ownOrder.orderNumber,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

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

        location: event.location,
      },

      pricing: {
        currency: "EUR",

        subtotal: 2500,

        total: 2500,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(listedOrder.items).toHaveLength(1);

    expect(listedOrder.items[0]).toMatchObject({
      ticketType: {
        id: String(ticketType._id),

        displayName: ticketType.displayName,

        description: ticketType.description,

        kind: ticketType.ticketKind,
      },

      quantity: 1,
      unitPrice: 2500,
      lineTotal: 2500,
    });

    expect(listedOrder.event.startsAt).toBeTypeOf("string");

    expect(listedOrder.confirmedAt).toBeTypeOf("string");

    expect(listedOrder.createdAt).toBeTypeOf("string");

    expect(listedOrder.updatedAt).toBeTypeOf("string");

    const serialized = JSON.stringify(listedOrder);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "buyerRawExternalSnapshot",
      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",
      "fulfillmentStatus",
      "fulfillmentLeaseToken",
      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    });
  });

  it("returns an owned order and its tickets using the public DTO contracts", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 2500,
    });

    const result = await getOwnOrderByIdService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),

      orderId: order._id,
    });

    expect(Object.keys(result).sort()).toEqual([
      "cancellation",
      "order",
      "tickets",
    ]);
    expect(result.cancellation).toMatchObject({
      allowed: true,

      action: "refund_confirmed",

      reason: null,
    });

    expect(result.order).toMatchObject({
      id: String(order._id),

      orderNumber: order.orderNumber,

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

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

        location: event.location,
      },

      pricing: {
        currency: "EUR",

        subtotal: 2500,

        total: 2500,
      },

      status: ORDER_STATUS.CONFIRMED,

      payment: {
        status: ORDER_PAYMENT_STATUS.PAID,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },
    });

    expect(result.tickets).toHaveLength(1);

    expect(result.tickets[0]).toMatchObject({
      id: String(tickets[0].id),

      ticketCode: tickets[0].ticketCode,

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
      },

      cancellation: {
        cancelledAt: null,

        reason: null,
      },

      depositRefund: {
        status: "not_required",

        amount: 0,

        currency: "EUR",

        triggeredAt: null,
      },
    });

    expect(result.order.createdAt).toBeTypeOf("string");

    expect(result.order.updatedAt).toBeTypeOf("string");

    expect(result.tickets[0].createdAt).toBeTypeOf("string");

    expect(result.tickets[0].updatedAt).toBeTypeOf("string");

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",

      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "buyerRawExternalSnapshot",

      "holderExternalProvider",
      "holderExternalUserId",
      "holderEmailSnapshot",

      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "checkedInByEventUserId",

      "ticketPdfStorageKey",
      "depositRefundProviderRefundId",

      "fulfillmentStatus",
      "fulfillmentLeaseToken",

      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
  it("returns an owned ticket using the public ticket contract", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 2500,
    });

    const result = await getOwnTicketByIdService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),

      ticketId: tickets[0].id,
    });

    expect(result).toMatchObject({
      id: String(tickets[0].id),

      ticketCode: tickets[0].ticketCode,

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
      },

      cancellation: {
        cancelledAt: null,

        reason: null,
      },

      depositRefund: {
        status: "not_required",

        amount: 0,

        currency: "EUR",

        triggeredAt: null,
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

      "checkedInByEventUserId",
      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "depositRefundProviderRefundId",

      "metadata",
      "createdByEventUserId",
      "updatedByEventUserId",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
  it("lists only owned tickets using the public ticket contract and supports the order filter", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const firstResult = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    await createOrderWithTickets({
      event,
      ticketType,

      quantity: 1,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 2500,
    });

    await createOrderWithTickets({
      event,
      ticketType,

      quantity: 1,

      externalUserId: "other-user",

      email: "other@example.com",

      totalPrice: 2500,
    });

    const result = await listOwnTicketsService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),

      page: 1,
      limit: 20,

      orderId: firstResult.order._id,
    });

    expect(result.items).toHaveLength(2);

    expect(result.items.map((ticket) => ticket.orderId)).toEqual([
      String(firstResult.order._id),
      String(firstResult.order._id),
    ]);

    for (const ticket of result.items) {
      expect(ticket).toMatchObject({
        orderId: String(firstResult.order._id),

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
        },

        cancellation: {
          cancelledAt: null,

          reason: null,
        },

        depositRefund: {
          status: "not_required",

          amount: 0,

          currency: "EUR",

          triggeredAt: null,
        },
      });

      expect(ticket.id).toBeTypeOf("string");

      expect(ticket.event.startsAt).toBeTypeOf("string");

      expect(ticket.createdAt).toBeTypeOf("string");

      expect(ticket.updatedAt).toBeTypeOf("string");
    }

    const serialized = JSON.stringify(result.items);

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

      "checkedInByEventUserId",
      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "depositRefundProviderRefundId",

      "metadata",
      "createdByEventUserId",
      "updatedByEventUserId",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      pages: 1,
    });
  });

  it("does not return another external user's order", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      externalUserId: "other-user",
      email: "other@example.com",
      totalPrice: 2500,
    });

    await expect(
      getOwnOrderByIdService({
        actor: buildExternalActor({
          externalUserId: "host-customer-1",
        }),
        orderId: order._id,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "OWN_ORDER_NOT_FOUND",
      message: "Order not found.",
    });
  });

  it("refunds an own paid confirmed order, cancels tickets and releases stock", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      externalUserId: "host-customer-1",
      email: "kunde@example.com",
      totalPrice: 5000,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),
      orderId: order._id,
      reason: "Customer cannot attend",
    });

    expect(result).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Customer cannot attend",

      buyer: {
        type: ORDER_BUYER_TYPE.EXTERNAL_USER,

        email: "kunde@example.com",
      },

      event: {
        id: String(event._id),

        title: event.title,
      },

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.COMPLETED,
        amount: 5000,
        refundedAt: expect.any(String),
      },
    });

    expect(result.cancelledAt).toBeTypeOf("string");

    expect(result.updatedAt).toBeTypeOf("string");

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_order_access_123",

        idempotencyKey: `order-refund:${String(order._id)}`,

        amount: "50.00",

        currency: "EUR",
      }),
    );

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(1);

    const serializedCancelledOrder = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerEmailSnapshot",
      "eventTitleSnapshot",
      "paymentStatus",
      "paymentProviderPaymentId",
      "fulfillmentStatus",
      "guestAccessTokenHash",
      "metadata",
    ]) {
      expect(serializedCancelledOrder).not.toContain(`"${field}"`);
    }

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();
    const updatedOrder = await Order.findById(order._id).lean();
    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,

      sourceId: String(order._id),

      orderId: String(order._id),

      ticketId: null,

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_order_access_123",

      amount: 5000,

      currency: "EUR",

      status: PAYMENT_REFUND_STATUS.COMPLETED,

      providerRefundId: "refund_pay_order_access_123",
    });

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,

      refundedAmount: 5000,

      paymentProviderRefundId: "refund_pay_order_access_123",
    });

    expect(updatedOrder.refundedAt).toBeTruthy();

    expect(tickets).toHaveLength(2);
    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });

  it("cancels an own pending payment without tickets and releases reserved stock", async () => {
    const event = await createPublishedEvent();
    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,
      quantity: 2,
      externalUserId: "host-customer-1",
      email: "kunde@example.com",
      totalPrice: 5000,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      createTickets: false,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor({
        externalUserId: "host-customer-1",
      }),
      orderId: order._id,
      reason: "Customer changed mind",
    });

    expect(result).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Customer changed mind",

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        total: 5000,
      },

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,

        refundedAt: null,
      },
    });

    expect(result.cancelledAt).toBeTypeOf("string");

    expect(result.expiresAt).toBeTypeOf("string");

    expect(result._id).toBeUndefined();

    expect(result.paymentStatus).toBeUndefined();

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(cancelPaymentSessionMock).toHaveBeenCalledWith({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_order_access_123",
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      refundedAmount: 0,
    });

    expect(await Ticket.countDocuments({ orderId: order._id })).toBe(0);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("cancels an own confirmed free order without creating a refund", async () => {
    const event = await createPublishedEvent({
      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      pricingMode: "free",
      priceGross: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 0,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

      paymentProviderPaymentId: null,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order._id,

      reason: "Customer cannot attend",
    });

    expect(result).toMatchObject({
      id: String(order._id),

      status: ORDER_STATUS.CANCELLED,

      cancellationReason: "Customer cannot attend",

      payment: {
        status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

        provider: ORDER_PAYMENT_PROVIDER.NONE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,

        refundedAt: null,
      },
    });

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      refundedAmount: 0,
    });

    const tickets = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(tickets).toHaveLength(2);

    expect(
      tickets.every((ticket) => ticket.status === TICKET_STATUS.CANCELLED),
    ).toBe(true);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("refunds only the remaining amount when part of the order was already refunded as a deposit", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    const alreadyRefundedTicket = tickets[0];

    await createPaymentRefundRecord({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,

      sourceId: String(alreadyRefundedTicket.id),

      orderId: String(order._id),

      ticketId: String(alreadyRefundedTicket.id),

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_order_access_123",

      providerRefundId: "refund_existing_deposit",

      amount: 2500,

      currency: "EUR",

      idempotencyKey: `deposit-refund:${String(alreadyRefundedTicket.id)}`,

      status: PAYMENT_REFUND_STATUS.COMPLETED,

      providerSucceededAt: new Date(),

      completedAt: new Date(),

      metadata: {
        source: "customer_cancellation_test",
      },
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order._id,

      reason: "Customer cannot attend",
    });

    expect(result).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,
      },

      refund: {
        status: ORDER_REFUND_STATUS.COMPLETED,

        amount: 5000,
      },
    });

    /*
     * 25 EUR were already refunded.
     * Only the remaining 25 EUR may be sent
     * to Mollie now.
     */
    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_order_access_123",

        amount: "25.00",

        currency: "EUR",

        idempotencyKey: `order-refund:${String(order._id)}`,
      }),
    );

    const orderRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(orderRefund).toMatchObject({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,

      amount: 2500,

      status: PAYMENT_REFUND_STATUS.COMPLETED,
    });

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,

      /*
       * Financially the entire 50 EUR order
       * is now refunded:
       * 25 deposit + 25 order refund.
       */
      refundedAmount: 5000,
    });

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("blocks customer cancellation while a deposit refund is unresolved", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    const ticket = tickets[0];

    await createPaymentRefundRecord({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,

      sourceId: String(ticket.id),

      orderId: String(order._id),

      ticketId: String(ticket.id),

      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_order_access_123",

      amount: 2500,

      currency: "EUR",

      idempotencyKey: `deposit-refund:${String(ticket.id)}`,

      status: PAYMENT_REFUND_STATUS.PENDING,

      metadata: {
        source: "customer_cancellation_test",
      },
    });

    await expect(
      cancelOwnOrderService({
        actor: buildExternalActor(),

        orderId: order._id,

        reason: "Customer cannot attend",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED",

      details: expect.objectContaining({
        reason: "deposit_refund_incomplete",
      }),
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: ORDER_REFUND_STATUS.NONE,
    });

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(2);

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(
      ticketsInDb.every(
        (currentTicket) => currentTicket.status === TICKET_STATUS.ACTIVE,
      ),
    ).toBe(true);
  });
  it("blocks customer cancellation when any ticket is already checked in", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order, tickets } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,
    });

    await Ticket.findByIdAndUpdate(tickets[0].id, {
      $set: {
        status: TICKET_STATUS.CHECKED_IN,

        checkedInAt: new Date(),
      },
    });

    await expect(
      cancelOwnOrderService({
        actor: buildExternalActor(),

        orderId: order._id,

        reason: "Customer cannot attend",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,

      code: "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED",

      details: expect.objectContaining({
        reason: "ticket_already_checked_in",
      }),
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.PAID,

      refundStatus: ORDER_REFUND_STATUS.NONE,
    });

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(2);
  });
  it("refunds a pending order when the provider reports it became paid during cancellation", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      createTickets: false,
    });

    cancelPaymentSessionMock.mockResolvedValueOnce({
      provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

      providerPaymentId: "pay_order_access_123",

      status: "paid",
      rawStatus: "paid",

      terminated: false,
      terminal: true,
      paid: true,
    });

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order._id,

      reason: "Customer changed mind",
    });

    expect(result).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.REFUNDED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.COMPLETED,

        amount: 5000,

        refundedAt: expect.any(String),
      },
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,

        providerPaymentId: "pay_order_access_123",

        amount: "50.00",

        currency: "EUR",

        idempotencyKey: `order-refund:${String(order._id)}`,
      }),
    );

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(1);

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,

      refundedAmount: 5000,

      paymentProviderRefundId: "refund_pay_order_access_123",
    });

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toMatchObject({
      status: PAYMENT_REFUND_STATUS.COMPLETED,

      amount: 5000,

      providerRefundId: "refund_pay_order_access_123",
    });

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("still cancels a pending order locally when provider cancellation fails", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      email: "kunde@example.com",

      totalPrice: 5000,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      createTickets: false,
    });

    cancelPaymentSessionMock.mockRejectedValueOnce(
      new Error("Payment provider unavailable"),
    );

    const result = await cancelOwnOrderService({
      actor: buildExternalActor(),

      orderId: order._id,

      reason: "Customer changed mind",
    });

    expect(result).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      payment: {
        status: ORDER_PAYMENT_STATUS.FAILED,

        provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
      },

      refund: {
        status: ORDER_REFUND_STATUS.NONE,

        amount: 0,

        refundedAt: null,
      },
    });

    expect(cancelPaymentSessionMock).toHaveBeenCalledTimes(1);

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const updatedOrder = await Order.findById(order._id).lean();

    expect(updatedOrder).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

      refundStatus: ORDER_REFUND_STATUS.NONE,

      refundedAmount: 0,
    });

    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      `order-refund:${String(order._id)}`,
      {
        lean: true,
      },
    );

    expect(paymentRefund).toBeNull();

    expect(
      await Ticket.countDocuments({
        orderId: order._id,
      }),
    ).toBe(0);

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("refunds an own paid order through the public HTTP cancellation endpoint", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      quantity: 2,

      externalUserId: "host-customer-1",

      totalPrice: 5000,
    });

    const token = signExternalUserToken();

    const response = await request(app)
      .patch(`/api/public/orders/${String(order._id)}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        reason: "Customer cannot attend",
      });

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      success: true,

      data: {
        id: String(order._id),

        status: ORDER_STATUS.CANCELLED,

        cancellationReason: "Customer cannot attend",

        payment: {
          status: ORDER_PAYMENT_STATUS.REFUNDED,

          provider: ORDER_PAYMENT_PROVIDER.MOLLIE,
        },

        refund: {
          status: ORDER_REFUND_STATUS.COMPLETED,

          amount: 5000,
        },
      },
    });

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

      refundStatus: ORDER_REFUND_STATUS.COMPLETED,
    });
  });
  it("does not allow an external user to cancel another user's order through HTTP", async () => {
    const event = await createPublishedEvent();

    const ticketType = await createTicketType(event);

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      externalUserId: "other-user",

      email: "other@example.com",

      totalPrice: 2500,
    });

    const token = signExternalUserToken();

    const response = await request(app)
      .patch(`/api/public/orders/${String(order._id)}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        reason: "Should not work",
      });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "OWN_ORDER_NOT_FOUND",

        message: "Order not found.",
      },
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);
  });
  it("allows a guest to cancel an own free order through the guest HTTP endpoint", async () => {
    const { order, ticketType, accessToken } = await createGuestOrderWithAccess(
      {
        quantity: 2,
      },
    );

    const response = await request(app)
      .patch(`/api/public/orders/guest/${order.id}/cancel`)
      .send({
        accessToken,

        reason: "Guest cannot attend",
      });

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      success: true,

      data: {
        id: String(order.id),

        status: ORDER_STATUS.CANCELLED,

        cancellationReason: "Guest cannot attend",

        payment: {
          status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

          provider: ORDER_PAYMENT_PROVIDER.NONE,
        },

        refund: {
          status: ORDER_REFUND_STATUS.NONE,

          amount: 0,
        },
      },
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();

    expect(cancelPaymentSessionMock).not.toHaveBeenCalled();

    const orderInDb = await Order.findById(order.id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CANCELLED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      /*
       * Cancelling through the guest endpoint
       * must not count as a guest download.
       */
      guestAccessDownloadCount: 0,
    });

    const updatedTicketType = await TicketType.findById(ticketType._id).lean();

    expect(updatedTicketType.stockSold).toBe(0);
  });
  it("rejects guest cancellation with an invalid guest access token", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    const response = await request(app)
      .patch(`/api/public/orders/guest/${order.id}/cancel`)
      .send({
        accessToken: "invalid-guest-access-token-that-is-long-enough",

        reason: "Should not work",
      });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "INVALID_GUEST_ACCESS_TOKEN",

        message: "Invalid guest access token.",
      },
    });

    const orderInDb = await Order.findById(order.id).lean();

    expect(orderInDb.status).toBe(ORDER_STATUS.CONFIRMED);

    expect(createProviderRefundMock).not.toHaveBeenCalled();
  });
  it("rejects public self-service cancellation through HTTP when the feature is disabled", async () => {
    const event = await createPublishedEvent({
      isFree: true,
    });

    const ticketType = await createTicketType(event, {
      pricingMode: "free",

      priceGross: 0,
    });

    const { order } = await createOrderWithTickets({
      event,
      ticketType,

      externalUserId: "host-customer-1",

      totalPrice: 0,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,

      paymentProviderPaymentId: null,
    });

    customerSelfServiceCancellationEnabled = false;

    const token = signExternalUserToken();

    const response = await request(app)
      .patch(`/api/public/orders/${String(order._id)}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        reason: "Customer cannot attend",
      });

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED",

        details: {
          reason: "self_service_disabled",
        },
      },
    });

    const orderInDb = await Order.findById(order._id).lean();

    expect(orderInDb).toMatchObject({
      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    });

    expect(createProviderRefundMock).not.toHaveBeenCalled();
  });
  it("reissues guest access through the host-service HTTP endpoint", async () => {
    const { order, accessToken: previousAccessToken } =
      await createGuestOrderWithAccess({
        quantity: 1,
      });

    const token = signHostServiceToken();

    const response = await request(app)
      .post("/api/public/orders/guest-access/reissue")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderNumber: order.orderNumber,
        email: "guest@example.com",
      });

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      success: true,

      data: {
        orderId: order.id,
        accessToken: expect.any(String),
        expiresAt: expect.any(String),
      },
    });

    expect(Object.keys(response.body.data).sort()).toEqual([
      "accessToken",
      "expiresAt",
      "orderId",
    ]);

    expect(response.body.data.accessToken).not.toBe(previousAccessToken);

    /*
     * Recovery rotates the capability:
     * the previous link must stop working immediately.
     */
    await expect(
      getGuestOrderByAccessTokenService({
        orderId: order.id,
        accessToken: previousAccessToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "INVALID_GUEST_ACCESS_TOKEN",
    });

    /*
     * The freshly returned capability must work.
     */
    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken: response.body.data.accessToken,
    });

    expect(guestResult.order).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
    });
  });
  it("rejects guest access recovery from a normal external-user token", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    const token = signExternalUserToken();

    const response = await request(app)
      .post("/api/public/orders/guest-access/reissue")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderNumber: order.orderNumber,
        email: "guest@example.com",
      });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "HOST_SERVICE_IDENTITY_REQUIRED",
      },
    });
  });
  it("does not expose a guest order through HTTP when the recovery email is wrong", async () => {
    const { order, accessToken } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    const token = signHostServiceToken();

    const response = await request(app)
      .post("/api/public/orders/guest-access/reissue")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderNumber: order.orderNumber,
        email: "wrong@example.com",
      });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
      },
    });

    /*
     * A failed recovery attempt must not rotate
     * the existing valid capability.
     */
    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(guestResult.order.id).toBe(order.id);
  });
  it("does not reissue guest access through HTTP for another host service", async () => {
    const { order, accessToken } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    const token = signHostServiceToken({
      sub: "another-host-service",
    });

    const response = await request(app)
      .post("/api/public/orders/guest-access/reissue")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderNumber: order.orderNumber,
        email: "guest@example.com",
      });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
      },
    });

    const guestResult = await getGuestOrderByAccessTokenService({
      orderId: order.id,
      accessToken,
    });

    expect(guestResult.order.id).toBe(order.id);
  });
  it("rejects an invalid guest access recovery request body", async () => {
    const token = signHostServiceToken();

    const response = await request(app)
      .post("/api/public/orders/guest-access/reissue")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderNumber: "not-an-order-number",
        email: "not-an-email",
      });

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      success: false,
    });
  });
  it("does not reissue guest access after the guest access window expired", async () => {
    const { order } = await createGuestOrderWithAccess({
      quantity: 1,
    });

    const beforeRecovery = await Order.findById(order.id)
      .select("+guestAccessTokenHash")
      .lean();

    const expiredEventStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await Order.findByIdAndUpdate(order.id, {
      $set: {
        eventStartsAtSnapshot: expiredEventStart,
        guestAccessTokenExpiresAt: new Date(
          expiredEventStart.getTime() + 24 * 60 * 60 * 1000,
        ),
      },
    });

    await expect(
      reissueGuestAccessService({
        actor: buildHostServiceActor(),

        orderNumber: order.orderNumber,
        email: "guest@example.com",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "GUEST_ACCESS_WINDOW_EXPIRED",
    });

    const afterRecovery = await Order.findById(order.id)
      .select("+guestAccessTokenHash")
      .lean();

    expect(afterRecovery.guestAccessTokenHash).toBe(
      beforeRecovery.guestAccessTokenHash,
    );
  });
});
