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

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;
let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;
let TICKET_TYPE_PRICING_MODE;

async function loadTicketTypesIntegrationApp({
  depositTickets = false,
  paymentProvider = "disabled",
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
        ticketing: true,
        depositTickets,
      },
      payments: {
        provider: paymentProvider,
      },
    },
  }));

  /**
   * ticketType.internal.service imports `features` directly from config/features.js.
   * We mock it here so feature-flag behavior is deterministic in this integration test.
   */
  vi.doMock("../../../src/config/features.js", () => ({
    features: {
      ticketing: true,
      depositTickets,
    },
  }));

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");
  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
  const ticketTypeModelModule =
    await import("../../../src/modules/ticketTypes/ticketType.model.js");
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");

  const internalTicketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/internal/ticketType.internal.routes.js");
  const publicTicketTypeRoutesModule =
    await import("../../../src/modules/ticketTypes/public/ticketType.public.routes.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  Event = eventModelModule.Event;
  EventUser = eventUserModelModule.EventUser;
  TicketType = ticketTypeModelModule.TicketType;

  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_PRICING_MODE = ticketTypeConstantsModule.TICKET_TYPE_PRICING_MODE;

  const router = (await import("express")).default.Router();

  router.use("/admin/ticket-types", internalTicketTypeRoutesModule.default);
  router.use("/public/ticket-types", publicTicketTypeRoutesModule.default);

  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

function signExternalToken(payload = {}) {
  return jwt.sign(
    {
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      email: "thomas@example.com",
      role: "host_user",
      ...payload,
    },
    EXTERNAL_SECRET,
  );
}

async function createExternalEventUser({
  externalProvider = "dummy",
  externalUserId = "host-user-1",
  email = "thomas@example.com",
  role = EVENT_USER_ROLES.EVENT_ADMIN,
  isActive = true,
} = {}) {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
    externalProvider,
    externalUserId,
    emailSnapshot: email,
    passwordHash: null,
    firstNameSnapshot: "Thomas",
    lastNameSnapshot: "Hostuser",
    role,
    isActive,
    notes: "Created from ticket-types integration test",
  });
}

function buildEventPayload(overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
  );

  return {
    title: "TicketType Integration Event",
    slug: `ticket-type-integration-event-${Date.now()}`,
    shortDescription: "Integration test event",
    description: "This event was created for ticket type integration tests.",
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
        capacity: 100,
      },
    ],
    isFree: true,
    publishedAt: new Date(),
    ...overrides,
  };
}

async function createEventDirectly(overrides = {}) {
  return Event.create(buildEventPayload(overrides));
}

function buildTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId: String(eventId),
    displayName: "Free Demo Ticket",
    description: "A free ticket created by an integration test.",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
    priceGross: 0,
    currency: "EUR",
    stockTotal: 100,
    minPerOrder: 1,
    maxPerOrder: 10,
    isPersonalized: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe("TicketTypes MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadTicketTypesIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("allows an external event_admin to create a free ticket type for an event", async () => {
    const eventUser = await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });
    const event = await createEventDirectly({
      title: "Free Ticket Event",
      slug: "free-ticket-event",
    });

    const token = signExternalToken();

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Free Entry",
          priceGross: 0,
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: expect.any(String),
      eventId: String(event._id),
      displayName: "Free Entry",
      description: "A free ticket created by an integration test.",
      status: TICKET_TYPE_STATUS.ACTIVE,
      ticketKind: TICKET_TYPE_KIND.NORMAL,
      pricingMode: TICKET_TYPE_PRICING_MODE.FREE,
      priceGross: 0,
      currency: "EUR",
      stockTotal: 100,
      stockSold: 0,
      stockRemaining: 100,
      minPerOrder: 1,
      maxPerOrder: 10,
      salesStartAt: null,
      salesEndAt: null,
      isPersonalized: false,
      sessionIds: [],
      sortOrder: 0,
      isSoldOut: false,
      isSalesOpen: true,
      createdByEventUserId: String(eventUser._id),
      updatedByEventUserId: String(eventUser._id),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(response.body.data).not.toHaveProperty("_id");
    expect(response.body.data).not.toHaveProperty("name");
    expect(response.body.data).not.toHaveProperty("__v");

    const inDb = await TicketType.findById(response.body.data.id).lean();

    expect(inDb).toBeDefined();
    expect(inDb.displayName).toBe("Free Entry");
  });

  it("blocks users whose role has no ticket type create permission", async () => {
    await createExternalEventUser({
      externalUserId: "blocked-ticket-type-user-1",
      email: "blocked-ticket-type@example.com",
      role: "no_ticket_type_create",
    });

    const event = await createEventDirectly({
      title: "Blocked Ticket Type Event",
      slug: "blocked-ticket-type-event",
    });

    const token = signExternalToken({
      externalUserId: "blocked-ticket-type-user-1",
      email: "blocked-ticket-type@example.com",
    });

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(buildTicketTypePayload(event._id));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "INSUFFICIENT_EVENT_PERMISSIONS",
        message: "Insufficient event permissions.",
      },
    });
  });

  it("rejects ticket type creation for a missing related event", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const missingEventId = "64f00000000000000000eeee";

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(buildTicketTypePayload(missingEventId));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "TICKET_TYPE_EVENT_NOT_FOUND",
        message: "Related event not found.",
      },
    });
  });

  it("lists active public ticket types for a published public event", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Public Ticket Event",
      slug: "public-ticket-event",
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Public Free Ticket",
          priceGross: 0,
          stockTotal: 5,
        }),
      );

    expect(createResponse.status).toBe(201);

    await TicketType.findByIdAndUpdate(createResponse.body.data.id, {
      stockSold: 2,
    });

    const publicResponse = await request(app)
      .get("/api/public/ticket-types")
      .query({ eventId: String(event._id) })
      .set("Authorization", `Bearer ${token}`);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.success).toBe(true);
    expect(publicResponse.body.data).toHaveLength(1);

    expect(publicResponse.body.data[0]).toMatchObject({
      id: String(createResponse.body.data.id),
      eventId: String(event._id),
      displayName: "Public Free Ticket",
      status: TICKET_TYPE_STATUS.ACTIVE,
      priceGross: 0,
      currency: "EUR",
      stockRemaining: 3,
      isSoldOut: false,
      isSalesOpen: true,
    });

    expect(publicResponse.body.data[0]).not.toHaveProperty("_id");
    expect(publicResponse.body.data[0]).not.toHaveProperty("name");
    expect(publicResponse.body.data[0]).not.toHaveProperty("stockTotal");
    expect(publicResponse.body.data[0]).not.toHaveProperty("stockSold");
  });

  it("does not expose Inactive ticket types through the public API", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Inactive Ticket Event",
      slug: "Inactive-ticket-event",
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Inactive Ticket",
          status: TICKET_TYPE_STATUS.INACTIVE,
        }),
      );

    expect(createResponse.status).toBe(201);

    const publicResponse = await request(app)
      .get("/api/public/ticket-types")
      .query({ eventId: String(event._id) })
      .set("Authorization", `Bearer ${token}`);

    expect(publicResponse.status).toBe(200);

    const names = publicResponse.body.data.map(
      (ticketType) => ticketType.displayName,
    );

    expect(names).not.toContain("Inactive Ticket");
  });

  it("returns only bookable ticket types when onlyBookable=true", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Bookable Ticket Event",
      slug: "bookable-ticket-event",
    });

    const token = signExternalToken();

    const now = Date.now();

    await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Currently Bookable",
          salesStartAt: new Date(now - 60 * 1000).toISOString(),
          salesEndAt: new Date(now + 60 * 60 * 1000).toISOString(),
        }),
      );

    await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Future Ticket",
          salesStartAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
          salesEndAt: new Date(now + 25 * 60 * 60 * 1000).toISOString(),
        }),
      );

    const publicResponse = await request(app)
      .get("/api/public/ticket-types")
      .query({
        eventId: String(event._id),
        onlyBookable: true,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(publicResponse.status).toBe(200);

    const names = publicResponse.body.data.map(
      (ticketType) => ticketType.displayName,
    );

    expect(names).toContain("Currently Bookable");
    expect(names).not.toContain("Future Ticket");
  });

  it("allows fixed-price normal ticket creation without an online payment provider", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Fixed Price Event",
      slug: "fixed-price-event",
      isFree: false,
    });

    const token = signExternalToken();

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Fixed Price Ticket",
          pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
          priceGross: 2500,
        }),
      );

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
      displayName: "Fixed Price Ticket",
      ticketKind: TICKET_TYPE_KIND.NORMAL,
      pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
      priceGross: 2500,
    });

    const inDb = await TicketType.findById(response.body.data.id).lean();

    expect(inDb).toMatchObject({
      ticketKind: TICKET_TYPE_KIND.NORMAL,
      pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
      priceGross: 2500,
    });
  });
  it("allows donation ticket creation with zero base price", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Donation Event",
      slug: "donation-event",
      isFree: false,
    });

    const token = signExternalToken();

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Donation Ticket",
          pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
          priceGross: 0,
        }),
      );

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
      displayName: "Donation Ticket",
      ticketKind: TICKET_TYPE_KIND.NORMAL,
      pricingMode: TICKET_TYPE_PRICING_MODE.DONATION,
      priceGross: 0,
    });
  });
  it.each([
    {
      name: "FREE with a positive fixed price",
      pricingMode: "free",
      priceGross: 2500,
    },
    {
      name: "FIXED with zero price",
      pricingMode: "fixed",
      priceGross: 0,
    },
    {
      name: "DONATION with a fixed base price",
      pricingMode: "donation",
      priceGross: 2500,
    },
  ])(
    "rejects invalid pricing combination: $name",
    async ({ pricingMode, priceGross }) => {
      await createExternalEventUser({
        role: EVENT_USER_ROLES.ADMIN,
      });

      const event = await createEventDirectly();

      const token = signExternalToken();

      const response = await request(app)
        .post("/api/admin/ticket-types")
        .set("Authorization", `Bearer ${token}`)
        .send(
          buildTicketTypePayload(event._id, {
            pricingMode,
            priceGross,
          }),
        );

      expect(response.status).toBe(400);

      expect(await TicketType.countDocuments()).toBe(0);
    },
  );
  it("rejects a deposit ticket when no payment provider is configured", async () => {
    await loadTicketTypesIntegrationApp({
      depositTickets: true,
      paymentProvider: "disabled",
    });

    await clearMongoTestDb();

    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Deposit Without Provider Event",
      slug: "deposit-without-provider-event",
      isFree: false,
    });

    const token = signExternalToken();

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Deposit Ticket",
          ticketKind: TICKET_TYPE_KIND.DEPOSIT,
          pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
          priceGross: 2500,
        }),
      );

    expect(response.status).toBe(400);

    expect(await TicketType.countDocuments()).toBe(0);

    await loadTicketTypesIntegrationApp();
  });
  it("allows a fixed-price deposit ticket when deposit tickets and a payment provider are enabled", async () => {
    await loadTicketTypesIntegrationApp({
      depositTickets: true,
      paymentProvider: "mollie",
    });

    await clearMongoTestDb();

    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Deposit Enabled Event",
      slug: "deposit-enabled-event",
      isFree: false,
    });

    const token = signExternalToken();

    const response = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Deposit Ticket",
          ticketKind: TICKET_TYPE_KIND.DEPOSIT,
          pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
          priceGross: 2500,
        }),
      );

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
      displayName: "Deposit Ticket",
      ticketKind: TICKET_TYPE_KIND.DEPOSIT,
      pricingMode: TICKET_TYPE_PRICING_MODE.FIXED,
      priceGross: 2500,
    });

    await loadTicketTypesIntegrationApp();
  });

  it("blocks hard deletion when the ticket type has sold stock", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createEventDirectly({
      title: "Sold Ticket Type Event",
      slug: "sold-ticket-type-event",
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildTicketTypePayload(event._id, {
          displayName: "Ticket With Sales",
          stockTotal: 5,
        }),
      );

    expect(createResponse.status).toBe(201);

    await TicketType.findByIdAndUpdate(createResponse.body.data.id, {
      stockSold: 1,
    });

    const deleteResponse = await request(app)
      .delete(`/api/admin/ticket-types/${createResponse.body.data.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(409);
    expect(deleteResponse.body).toMatchObject({
      success: false,
      error: {
        code: "TICKET_TYPE_DELETE_BLOCKED_BY_SALES",
        message:
          "Ticket type cannot be deleted because tickets have already been sold.",
        details: {
          stockSold: 1,
        },
      },
    });

    const stillExists = await TicketType.findById(
      createResponse.body.data.id,
    ).lean();

    expect(stillExists).toBeTruthy();
  });
});
