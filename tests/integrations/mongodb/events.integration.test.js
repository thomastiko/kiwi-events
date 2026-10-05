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
let EVENT_CANCELLATION_REFUND_MODE;

async function loadEventsIntegrationApp() {
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
        mail: false,
      },
    },
  }));

  /**
   * Event cancellation may try to send mails.
   * For these event tests we do not test mail delivery.
   */
  vi.doMock("../../../src/modules/events/event.mail.service.js", () => ({
    sendEventCancelledMailsSafe: vi.fn().mockResolvedValue({
      sent: 0,
      failed: 0,
      skipped: true,
    }),
  }));

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");
  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
  const ticketTypeModelModule =
    await import("../../../src/modules/ticketTypes/ticketType.model.js");
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const internalEventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");
  const publicEventRoutesModule =
    await import("../../../src/modules/events/public/event.public.routes.js");
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
  EVENT_CANCELLATION_REFUND_MODE =
    eventConstantsModule.EVENT_CANCELLATION_REFUND_MODE;

  const router = (await import("express")).default.Router();

  router.use("/admin/events", internalEventRoutesModule.default);
  router.use("/public/events", publicEventRoutesModule.default);

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
    notes: "Created from events integration test",
  });
}

function buildCreateEventPayload(overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
  );

  return {
    title: "kiwi-events Integration Event",
    slug: `kiwi-events-integration-event-${Date.now()}`,
    shortDescription: "Integration test event",
    description: "This event was created by an integration test.",
    category: EVENT_CATEGORIES.EVENT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["integration", "kiwi-events"],
    sessions: [
      {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        timezone: "Europe/Vienna",
        locationLabel: "Audimax",
      },
    ],
    isFree: true,
    ...overrides,
  };
}

async function createDraftEventDirectly(overrides = {}) {
  const payload = buildCreateEventPayload({
    slug: `direct-draft-${Date.now()}`,
    status: EVENT_STATUSES.DRAFT,
    ...overrides,
  });

  return Event.create(payload);
}
async function createTicketTypeDirectly(eventId, overrides = {}) {
  return TicketType.create({
    eventId,
    name: "guarded-ticket-type",
    displayName: "Guarded Ticket Type",
    description: "Ticket type created directly for event delete guard tests.",
    status: "active",
    ticketKind: "normal",
    pricingMode: "fixed",
    priceGross: 0,
    currency: "EUR",
    stockTotal: 10,
    stockSold: 0,
    minPerOrder: 1,
    maxPerOrder: 10,
    isPersonalized: false,
    sortOrder: 0,
    ...overrides,
  });
}
describe("Events MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadEventsIntegrationApp();
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

  it("allows an external event_admin to create an event", async () => {
    const eventUser = await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken({
      externalUserId: "host-user-1",
      email: "thomas@example.com",
    });

    const payload = buildCreateEventPayload({
      slug: "external-admin-created-event",
    });
    const response = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: expect.any(String),
      title: "kiwi-events Integration Event",
      slug: "external-admin-created-event",
      category: EVENT_CATEGORIES.EVENT,
      visibility: EVENT_VISIBILITIES.PUBLIC,
      status: EVENT_STATUSES.DRAFT,
      isFree: true,

      sessions: [
        expect.objectContaining({
          id: expect.any(String),
          startAt: expect.any(String),
          endAt: expect.any(String),
          timezone: "Europe/Vienna",
          locationLabel: "Audimax",
          isCancelled: false,
        }),
      ],

      faqs: [],
      imageAssets: [],
      imageAssetIds: [],
      ticketTypes: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(response.body.data).not.toHaveProperty("_id");
    expect(response.body.data).not.toHaveProperty("__v");

    expect(JSON.stringify(response.body.data)).not.toContain('"_id"');

    expect(String(response.body.data.createdByEventUserId)).toBe(
      String(eventUser._id),
    );

    const eventInDb = await Event.findOne({
      slug: "external-admin-created-event",
    }).lean();

    expect(eventInDb).toBeDefined();
    expect(eventInDb.title).toBe("kiwi-events Integration Event");
  });

  it("blocks users whose role has no event create permission", async () => {
    await createExternalEventUser({
      externalUserId: "blocked-user-1",
      email: "blocked@example.com",
      role: "no_event_create",
    });

    const token = signExternalToken({
      externalUserId: "blocked-user-1",
      email: "blocked@example.com",
    });

    const response = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildCreateEventPayload({
          slug: "role-without-event-create-should-not-create-event",
        }),
      );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "INSUFFICIENT_EVENT_PERMISSIONS",
        message: "Insufficient event permissions.",
      },
    });
  });

  it("publishes a draft event and sets publishedAt", async () => {
    const eventUser = await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildCreateEventPayload({
          slug: "event-to-publish",
        }),
      );

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const publishResponse = await request(app)
      .patch(`/api/admin/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.success).toBe(true);
    expect(publishResponse.body.data.status).toBe(EVENT_STATUSES.PUBLISHED);
    expect(publishResponse.body.data.publishedAt).toBeTruthy();

    expect(publishResponse.body.data).toMatchObject({
      id: eventId,
      status: EVENT_STATUSES.PUBLISHED,
      publishedAt: expect.any(String),
      ticketTypes: [],
      imageAssets: [],
    });

    expect(publishResponse.body.data).not.toHaveProperty("_id");

    expect(JSON.stringify(publishResponse.body.data)).not.toContain('"_id"');

    expect(String(publishResponse.body.data.updatedByEventUserId)).toBe(
      String(eventUser._id),
    );
  });
  it.each([
    {
      refundMode: "none",
      body: {
        reason: "Cancelled without refunds",
        refundMode: "none",
      },
    },
    {
      refundMode: "selected",
      body: {
        reason: "Cancelled with selected refunds",
        refundMode: "selected",
        orderIds: ["6a0000000000000000000099"],
      },
    },
    {
      refundMode: "all",
      body: {
        reason: "Cancelled with all refunds",
        refundMode: "all",
      },
    },
  ])(
    "cancels an event through HTTP with refundMode=$refundMode",
    async ({ refundMode, body }) => {
      const eventUser = await createExternalEventUser({
        role: EVENT_USER_ROLES.ADMIN,
      });

      const token = signExternalToken();

      const createResponse = await request(app)
        .post("/api/admin/events")
        .set("Authorization", `Bearer ${token}`)
        .send(
          buildCreateEventPayload({
            slug: `event-to-cancel-${refundMode}`,
          }),
        );

      expect(createResponse.status).toBe(201);

      const eventId = createResponse.body.data.id;

      const cancelResponse = await request(app)
        .patch(`/api/admin/events/${eventId}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send(body);

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.success).toBe(true);

      /*
       * Neuer Contract:
       *
       * data.event        -> finaler Event-Zustand
       * data.cancellation -> Cancel-/Refund-Ausführung
       */
      expect(cancelResponse.body.data.event).toMatchObject({
        id: eventId,
        status: EVENT_STATUSES.CANCELLED,
        cancellationReason: body.reason,
        cancelledAt: expect.any(String),
        ticketTypes: [],
        imageAssets: [],
      });

      expect(String(cancelResponse.body.data.event.updatedByEventUserId)).toBe(
        String(eventUser._id),
      );

      expect(cancelResponse.body.data.cancellation).toMatchObject({
        eventId,
        refundMode,

        totalOrders: 0,
        cancelledOrders: 0,
        failedCancellations: 0,
        refundRequestedOrders: 0,

        refunds: [],
      });

      expect(cancelResponse.body.meta).toMatchObject({
        mail: {
          sent: 0,
          failed: 0,
          skipped: true,
        },
      });

      expect(cancelResponse.body.data.event).not.toHaveProperty("_id");

      expect(JSON.stringify(cancelResponse.body.data)).not.toContain('"_id"');

      const eventInDb = await Event.findById(eventId).lean();

      expect(eventInDb).toMatchObject({
        status: EVENT_STATUSES.CANCELLED,
        cancellationReason: body.reason,
        isCancellationFinalized: true,
      });
    },
  );
  it.each([
    {
      name: "missing refundMode",

      body: {
        reason: "Missing mode",
      },
    },

    {
      name: "selected without orderIds",

      body: {
        reason: "Missing order ids",
        refundMode: "selected",
      },
    },

    {
      name: "none with orderIds",

      body: {
        refundMode: "none",

        orderIds: ["6a0000000000000000000099"],
      },
    },

    {
      name: "all with orderIds",

      body: {
        refundMode: "all",

        orderIds: ["6a0000000000000000000099"],
      },
    },

    {
      name: "duplicate selected orderIds",

      body: {
        refundMode: "selected",

        orderIds: ["6a0000000000000000000099", "6a0000000000000000000099"],
      },
    },

    {
      name: "unknown refundMode",

      body: {
        refundMode: "invalid",
      },
    },
  ])("rejects invalid event cancellation payload: $name", async ({ body }) => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildCreateEventPayload({
          slug: `invalid-cancel-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
        }),
      );

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const response = await request(app)
      .patch(`/api/admin/events/${eventId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "VALIDATION_FAILED",
      },
    });

    /*
     * Validation muss vor jeder Cancellation
     * abbrechen.
     */
    const eventInDb = await Event.findById(eventId).lean();

    expect(eventInDb.status).toBe(EVENT_STATUSES.DRAFT);
  });
  it("does not expose the legacy cancel-and-refund endpoint", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildCreateEventPayload({
          slug: "legacy-cancel-and-refund-endpoint",
        }),
      );

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const response = await request(app)
      .post(`/api/admin/events/${eventId}/cancel-and-refund`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        reason: "Legacy request",
        orderIds: [],
      });

    expect(response.status).toBe(404);

    const eventInDb = await Event.findById(eventId).lean();

    expect(eventInDb.status).toBe(EVENT_STATUSES.DRAFT);
  });
  it("lists a published public event through the public API", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${token}`)
      .send(
        buildCreateEventPayload({
          slug: "published-public-event",
        }),
      );

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const publishResponse = await request(app)
      .patch(`/api/admin/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(publishResponse.status).toBe(200);

    const listResponse = await request(app)
      .get("/api/public/events")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);

    const slugs = listResponse.body.data.map((event) => event.slug);

    expect(slugs).toContain("published-public-event");
    const publicEvent = listResponse.body.data.find(
      (event) => event.slug === "published-public-event",
    );

    expect(publicEvent).toBeDefined();

    expect(publicEvent).toMatchObject({
      id: expect.any(String),
      title: "kiwi-events Integration Event",
      slug: "published-public-event",
      status: EVENT_STATUSES.PUBLISHED,
      visibility: EVENT_VISIBILITIES.PUBLIC,
      location: "WU Wien",
      tags: ["integration", "kiwi-events"],
      startsAt: expect.any(String),
      endsAt: expect.any(String),
      sessions: [
        expect.objectContaining({
          id: expect.any(String),
          startAt: expect.any(String),
          endAt: expect.any(String),
          timezone: "Europe/Vienna",
          locationLabel: "Audimax",
          isCancelled: false,
        }),
      ],
      imageAssets: [],
      ticketTypes: [],
      isBookable: false,
    });

    const serializedPublicEvent = JSON.stringify(publicEvent);

    expect(serializedPublicEvent).not.toContain('"_id"');

    expect(serializedPublicEvent).not.toContain('"notesInternal"');

    expect(serializedPublicEvent).not.toContain('"imageAssetIds"');

    expect(serializedPublicEvent).not.toContain('"createdByEventUserId"');

    expect(serializedPublicEvent).not.toContain('"updatedByEventUserId"');

    expect(serializedPublicEvent).not.toContain('"__v"');
  });

  it("does not expose draft events through the public API", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    await createDraftEventDirectly({
      slug: "draft-event-should-not-be-public",
      visibility: EVENT_VISIBILITIES.PUBLIC,
      status: EVENT_STATUSES.DRAFT,
    });

    const response = await request(app)
      .get("/api/public/events")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const slugs = response.body.data.map((event) => event.slug);

    expect(slugs).not.toContain("draft-event-should-not-be-public");
  });

  it("does not expose private events through the public API", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    await createDraftEventDirectly({
      slug: "private-event-should-not-be-public",
      visibility: EVENT_VISIBILITIES.PRIVATE,
      status: EVENT_STATUSES.PUBLISHED,
      publishedAt: new Date(),
    });

    const response = await request(app)
      .get("/api/public/events")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    const slugs = response.body.data.map((event) => event.slug);

    expect(slugs).not.toContain("private-event-should-not-be-public");
  });
  it("blocks hard deletion when the event already has ticket sales", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const event = await createDraftEventDirectly({
      slug: "event-delete-blocked-by-ticket-sales",
    });

    await createTicketTypeDirectly(event._id, {
      name: "sold-ticket-type",
      displayName: "Sold Ticket Type",
      stockTotal: 10,
      stockSold: 1,
    });

    const response = await request(app)
      .delete(`/api/admin/events/${event._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "EVENT_DELETE_BLOCKED_BY_USAGE",
        message:
          "Event cannot be deleted because it already has orders, tickets or ticket sales.",
        details: {
          eventId: String(event._id),
          ordersCount: 0,
          ticketsCount: 0,
          ticketsSold: 1,
        },
      },
    });

    const stillExists = await Event.findById(event._id).lean();

    expect(stillExists).toBeTruthy();
  });
});
