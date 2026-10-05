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
let EventUser;
let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

async function loadExternalEventUserIntegrationApp() {
  vi.resetModules();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    isMongoDatabase: () => true,
    isSqlDatabase: () => false,
    getDatabaseConnection: vi.fn(),
  }));

  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");

  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");

  const eventUserRoutesModule =
    await import("../../../src/modules/eventUsers/eventUser.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EventUser = eventUserModelModule.EventUser;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  app = createHttpTestApp({
    mountPath: "/api/admin/event-users",
    router: eventUserRoutesModule.default,
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
  firstName = "Thomas",
  lastName = "Hostuser",
  role = EVENT_USER_ROLES.EVENT_ADMIN,
  isActive = true,
} = {}) {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,

    externalProvider,
    externalUserId,

    emailSnapshot: email,
    passwordHash: null,

    firstNameSnapshot: firstName,
    lastNameSnapshot: lastName,

    profileBio: "External kiwi-events staff user for API testing.",

    role,
    isActive,

    notes: "Created from integration test as external EventUser",
  });
}

describe("External EventUser MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadExternalEventUserIntegrationApp();
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

  it("resolves an active external EventUser from a valid host JWT", async () => {
    const externalEventUser = await createExternalEventUser({
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      email: "thomas@example.com",
      role: EVENT_USER_ROLES.EVENT_ADMIN,
    });

    const token = signExternalToken({
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      email: "thomas@example.com",
    });

    const response = await request(app)
      .get("/api/admin/event-users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: String(externalEventUser._id),

      authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,

      emailSnapshot: "thomas@example.com",

      externalProvider: "dummy",
      externalUserId: "host-user-1",

      firstNameSnapshot: "Thomas",
      lastNameSnapshot: "Hostuser",

      role: EVENT_USER_ROLES.EVENT_ADMIN,
      isActive: true,
    });

    expect(response.body.data._id).toBeUndefined();
    expect(response.body.data.__v).toBeUndefined();
    expect(response.body.data.passwordHash).toBeUndefined();

    expect(Array.isArray(response.body.data.effectivePermissions)).toBe(true);
  });

  it("returns null when the external host user is not linked in kiwi-events", async () => {
    const token = signExternalToken({
      externalProvider: "dummy",
      externalUserId: "unknown-host-user",
      email: "unknown@example.com",
    });

    const response = await request(app)
      .get("/api/admin/event-users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: null,
    });
  });

  it("does not resolve inactive external EventUsers", async () => {
    await createExternalEventUser({
      externalProvider: "dummy",
      externalUserId: "inactive-host-user",
      email: "inactive@example.com",
      isActive: false,
    });

    const token = signExternalToken({
      externalProvider: "dummy",
      externalUserId: "inactive-host-user",
      email: "inactive@example.com",
    });

    const response = await request(app)
      .get("/api/admin/event-users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: null,
    });
  });

  it("rejects external JWTs signed with the wrong secret", async () => {
    const invalidToken = jwt.sign(
      {
        externalProvider: "dummy",
        externalUserId: "host-user-1",
        email: "thomas@example.com",
      },
      "wrong-secret",
    );

    const response = await request(app)
      .get("/api/admin/event-users/me")
      .set("Authorization", `Bearer ${invalidToken}`);

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "Authentication token is invalid.",
      },
    });
  });
});
