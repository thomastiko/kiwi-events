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

let eventApp;
let ticketTypeApp;

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let hashPassword;
let createEventUser;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

async function loadTicketTypesSqlIntegrationApp() {
  vi.resetModules();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: "integration-external-jwt-secret",
      },
    },
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

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;

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

function buildEventPayload(overrides = {}) {
  return {
    title: "SQL Ticket Event",
    slug: "sql-ticket-event",
    shortDescription: "Short SQL ticket event description",
    description: "Long SQL ticket event description",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "tickets"],
    sessions: [
      {
        startAt: "2030-02-10T10:00:00.000Z",
        endAt: "2030-02-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Main Hall",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    faqs: [],
    isFree: true,
    salesStartAt: "2029-12-01T10:00:00.000Z",
    salesEndAt: "2030-02-09T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL ticket type integration test",
    ...overrides,
  };
}

function buildTicketTypePayload(eventId, overrides = {}) {
  return {
    eventId,
    displayName: "Free Demo Ticket",
    description: "A free demo ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "free",
    priceGross: 0,
    currency: "EUR",
    stockTotal: 100,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: "2029-12-01T10:00:00.000Z",
    salesEndAt: "2030-02-09T10:00:00.000Z",
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    ...overrides,
  };
}

async function createEventForTicketType(accessToken, overrides = {}) {
  const createResponse = await request(eventApp)
    .post("/api/admin/events")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(buildEventPayload(overrides));

  expect(createResponse.status).toBe(201);

  return createResponse.body.data;
}

describe("TicketTypes SQL integration", () => {
  beforeAll(async () => {
    await loadTicketTypesSqlIntegrationApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates a ticket type via admin API", async () => {
    const { accessToken, admin } = await createAdminAndToken();
    const event = await createEventForTicketType(accessToken);

    const response = await request(ticketTypeApp)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildTicketTypePayload(event.id));

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      eventId: event.id,
      id: expect.any(String),
      stockRemaining: 100,
      isSoldOut: false,
      isSalesOpen: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      displayName: "Free Demo Ticket",
      description: "A free demo ticket",
      status: TICKET_TYPE_STATUS.ACTIVE,
      ticketKind: TICKET_TYPE_KIND.NORMAL,
      pricingMode: "free",
      priceGross: 0,
      currency: "EUR",
      stockTotal: 100,
      stockSold: 0,
      minPerOrder: 1,
      maxPerOrder: 5,
      isPersonalized: false,
    });
    expect(response.body.data).not.toHaveProperty("_id");
    expect(response.body.data).not.toHaveProperty("name");
    expect(response.body.data).not.toHaveProperty("__v");

    expect(String(response.body.data.createdByEventUserId)).toBe(
      String(admin.id),
    );
    expect(String(response.body.data.updatedByEventUserId)).toBe(
      String(admin.id),
    );
  });

  it("lists ticket types via admin API", async () => {
    const { accessToken } = await createAdminAndToken();
    const event = await createEventForTicketType(accessToken);

    const createResponse = await request(ticketTypeApp)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildTicketTypePayload(event.id));

    expect(createResponse.status).toBe(201);

    const response = await request(ticketTypeApp)
      .get("/api/admin/ticket-types")
      .query({
        eventId: event.id,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: event.id,
          displayName: "Free Demo Ticket",
          status: TICKET_TYPE_STATUS.ACTIVE,
        }),
      ]),
    );
    const listedTicketType = response.body.data.find(
      (item) => item.id === createResponse.body.data.id,
    );

    expect(listedTicketType).toBeDefined();
    expect(listedTicketType).not.toHaveProperty("_id");
    expect(listedTicketType).not.toHaveProperty("name");
    expect(listedTicketType).not.toHaveProperty("__v");
  });

  it("gets a ticket type by id via admin API", async () => {
    const { accessToken } = await createAdminAndToken();
    const event = await createEventForTicketType(accessToken);

    const createResponse = await request(ticketTypeApp)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildTicketTypePayload(event.id));

    expect(createResponse.status).toBe(201);

    const ticketTypeId = createResponse.body.data.id;

    const response = await request(ticketTypeApp)
      .get(`/api/admin/ticket-types/${ticketTypeId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: ticketTypeId,
      eventId: event.id,
      displayName: "Free Demo Ticket",
    });
    expect(response.body.data).not.toHaveProperty("_id");
    expect(response.body.data).not.toHaveProperty("name");
    expect(response.body.data).not.toHaveProperty("__v");
  });

  it("updates a ticket type via admin API", async () => {
    const { accessToken, admin } = await createAdminAndToken();
    const event = await createEventForTicketType(accessToken);

    const createResponse = await request(ticketTypeApp)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildTicketTypePayload(event.id));

    expect(createResponse.status).toBe(201);

    const ticketTypeId = createResponse.body.data.id;

    const updateResponse = await request(ticketTypeApp)
      .patch(`/api/admin/ticket-types/${ticketTypeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        displayName: "Updated Ticket",
        description: "Updated ticket description",
        maxPerOrder: 10,
        sortOrder: 5,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.data).toMatchObject({
      id: ticketTypeId,
      eventId: event.id,
      displayName: "Updated Ticket",
      description: "Updated ticket description",
      maxPerOrder: 10,
      sortOrder: 5,
    });
    expect(updateResponse.body.data).not.toHaveProperty("_id");
    expect(updateResponse.body.data).not.toHaveProperty("name");
    expect(updateResponse.body.data).not.toHaveProperty("__v");

    expect(String(updateResponse.body.data.updatedByEventUserId)).toBe(
      String(admin.id),
    );
  });

  it("deletes a ticket type via admin API", async () => {
    const { accessToken } = await createAdminAndToken();
    const event = await createEventForTicketType(accessToken);

    const createResponse = await request(ticketTypeApp)
      .post("/api/admin/ticket-types")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildTicketTypePayload(event.id));

    expect(createResponse.status).toBe(201);

    const ticketTypeId = createResponse.body.data.id;

    const deleteResponse = await request(ticketTypeApp)
      .delete(`/api/admin/ticket-types/${ticketTypeId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
    expect(deleteResponse.body.data).toMatchObject({
      deleted: true,
    });

    const getAfterDeleteResponse = await request(ticketTypeApp)
      .get(`/api/admin/ticket-types/${ticketTypeId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getAfterDeleteResponse.status).toBe(404);
  });

  it("rejects ticket type access without admin token", async () => {
    const response = await request(ticketTypeApp).get(
      "/api/admin/ticket-types",
    );

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
    });
  });
});
