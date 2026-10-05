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

let app;
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

async function loadEventsSqlIntegrationApp() {
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
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;

  app = createHttpTestApp({
    mountPath: "/api/admin/events",
    router: eventRoutesModule.default,
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
    title: "SQL Demo Event",
    slug: "sql-demo-event",
    shortDescription: "Short SQL event description",
    description: "Long SQL event description",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "Vienna",
    tags: ["sql", "integration"],
    sessions: [
      {
        startAt: "2030-01-10T10:00:00.000Z",
        endAt: "2030-01-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Main Hall",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    faqs: [
      {
        question: "Is this a test?",
        answer: "Yes.",
        sortOrder: 0,
      },
    ],
    isFree: true,
    salesStartAt: "2029-12-01T10:00:00.000Z",
    salesEndAt: "2030-01-09T10:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL integration test",
    ...overrides,
  };
}

describe("Events SQL integration", () => {
  beforeAll(async () => {
    await loadEventsSqlIntegrationApp();
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

  it("creates an event via admin API", async () => {
    const { accessToken, admin } = await createAdminAndToken();

    const response = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: expect.any(String),
      title: "SQL Demo Event",
      slug: "sql-demo-event",
      category: EVENT_CATEGORIES.EVENT,
      status: EVENT_STATUSES.DRAFT,
      visibility: EVENT_VISIBILITIES.PUBLIC,
      isFree: true,

      sessions: [
        expect.objectContaining({
          id: expect.any(String),
          startAt: expect.any(String),
          endAt: expect.any(String),
          timezone: "Europe/Vienna",
          locationLabel: "Main Hall",
          locationDetails: "Room 1",
          capacity: 100,
          isCancelled: false,
        }),
      ],

      faqs: [
        expect.objectContaining({
          id: expect.any(String),
          question: "Is this a test?",
          answer: "Yes.",
          sortOrder: 0,
        }),
      ],

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
      String(admin.id),
    );
    expect(String(response.body.data.updatedByEventUserId)).toBe(
      String(admin.id),
    );
  });

  it("lists events via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(createResponse.status).toBe(201);

    const response = await request(app)
      .get("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "SQL Demo Event",
          slug: "sql-demo-event",
        }),
      ]),
    );
    const listedEvent = response.body.data.find(
      (item) => item.id === createResponse.body.data.id,
    );

    expect(listedEvent).toBeDefined();

    expect(listedEvent.stats).toEqual({
      ordersCount: 0,
      paidOrdersCount: 0,
      ticketsSold: 0,
    });

    expect(listedEvent).not.toHaveProperty("_id");
    expect(listedEvent).not.toHaveProperty("ordersCount");
    expect(listedEvent).not.toHaveProperty("paidOrdersCount");
    expect(listedEvent).not.toHaveProperty("ticketsSold");

    expect(JSON.stringify(listedEvent)).not.toContain('"_id"');
  });

  it("gets an event by id via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const response = await request(app)
      .get(`/api/admin/events/${eventId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: eventId,
      title: "SQL Demo Event",
      slug: "sql-demo-event",
      ticketTypes: [],
      imageAssets: [],
    });

    expect(response.body.data).not.toHaveProperty("_id");
    expect(response.body.data).not.toHaveProperty("__v");

    expect(JSON.stringify(response.body.data)).not.toContain('"_id"');
  });

  it("updates an event via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const updateResponse = await request(app)
      .patch(`/api/admin/events/${eventId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Updated SQL Demo Event",
        shortDescription: "Updated short description",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.data).toMatchObject({
      id: eventId,
      title: "Updated SQL Demo Event",
      shortDescription: "Updated short description",
      ticketTypes: [],
      imageAssets: [],
    });

    expect(updateResponse.body.data).not.toHaveProperty("_id");
    expect(updateResponse.body.data).not.toHaveProperty("__v");

    expect(JSON.stringify(updateResponse.body.data)).not.toContain('"_id"');
  });
  it("features an event via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const featureResponse = await request(app)
      .patch(`/api/admin/events/${eventId}/feature`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        isFeatured: true,
        featuredOrder: 3,
      });

    expect(featureResponse.status).toBe(200);
    expect(featureResponse.body.success).toBe(true);

    expect(featureResponse.body.data).toMatchObject({
      id: eventId,
      isFeatured: true,
      featuredOrder: 3,
      ticketTypes: [],
      imageAssets: [],
    });

    expect(featureResponse.body.data).not.toHaveProperty("_id");
  });

  it("publishes an event via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const publishResponse = await request(app)
      .patch(`/api/admin/events/${eventId}/publish`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.success).toBe(true);
    expect(publishResponse.body.data.status).toBe(EVENT_STATUSES.PUBLISHED);
    expect(publishResponse.body.data).toMatchObject({
      id: eventId,
      status: EVENT_STATUSES.PUBLISHED,
      publishedAt: expect.any(String),
      ticketTypes: [],
      imageAssets: [],
    });

    expect(publishResponse.body.data).not.toHaveProperty("_id");
  });

  it("archives an event via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/events")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildEventPayload());

    expect(createResponse.status).toBe(201);

    const eventId = createResponse.body.data.id;

    const archiveResponse = await request(app)
      .patch(`/api/admin/events/${eventId}/archive`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.success).toBe(true);
    expect(archiveResponse.body.data.status).toBe(EVENT_STATUSES.ARCHIVED);
    expect(archiveResponse.body.data).toMatchObject({
      id: eventId,
      status: EVENT_STATUSES.ARCHIVED,
      archivedAt: expect.any(String),
      ticketTypes: [],
      imageAssets: [],
    });

    expect(archiveResponse.body.data).not.toHaveProperty("_id");
  });

  it("rejects event access without admin token", async () => {
    const response = await request(app).get("/api/admin/events");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
    });
  });
});
