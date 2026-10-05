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

async function loadEventUsersSqlIntegrationApp() {
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
  const eventUserRoutesModule =
    await import("../../../src/modules/eventUsers/eventUser.routes.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  createEventUser = eventUserRepositoryModule.createEventUser;
  hashPassword = passwordServiceModule.hashPassword;

  app = createHttpTestApp({
    mountPath: "/api/admin/event-users",
    router: eventUserRoutesModule.default,
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

describe("EventUsers SQL integration", () => {
  beforeAll(async () => {
    await loadEventUsersSqlIntegrationApp();
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

  it("creates a local EventUser via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const response = await request(app)
      .post("/api/admin/event-users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
        emailSnapshot: "staff@example.com",
        password: "secret123",
        firstNameSnapshot: "Staff",
        lastNameSnapshot: "Member",
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
      emailSnapshot: "staff@example.com",
      firstNameSnapshot: "Staff",
      lastNameSnapshot: "Member",
      role: EVENT_USER_ROLES.ADMIN,
      isActive: true,
    });

    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("creates an external EventUser via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const response = await request(app)
      .post("/api/admin/event-users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
        emailSnapshot: "external@example.com",
        firstNameSnapshot: "External",
        lastNameSnapshot: "Manager",
        externalProvider: "dummy",
        externalUserId: "host-user-1",
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
      emailSnapshot: "external@example.com",
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      firstNameSnapshot: "External",
      lastNameSnapshot: "Manager",
      role: EVENT_USER_ROLES.EVENT_MANAGER,
      isActive: true,
    });
  });

  it("lists EventUsers via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/event-users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
        emailSnapshot: "staff@example.com",
        password: "secret123",
        firstNameSnapshot: "Staff",
        lastNameSnapshot: "Member",
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      });

    expect(createResponse.status).toBe(201);

    const response = await request(app)
      .get("/api/admin/event-users")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailSnapshot: "staff@example.com",
          role: EVENT_USER_ROLES.ADMIN,
        }),
      ]),
    );
  });

  it("updates an EventUser via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/event-users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
        emailSnapshot: "staff@example.com",
        password: "secret123",
        firstNameSnapshot: "Staff",
        lastNameSnapshot: "Member",
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      });

    expect(createResponse.status).toBe(201);

    const eventUserId = createResponse.body.data.id;

    const updateResponse = await request(app)
      .patch(`/api/admin/event-users/${eventUserId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstNameSnapshot: "Updated",
        lastNameSnapshot: "Person",
        role: EVENT_USER_ROLES.ADMIN,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);
    expect(updateResponse.body.data).toMatchObject({
      firstNameSnapshot: "Updated",
      lastNameSnapshot: "Person",
      role: EVENT_USER_ROLES.ADMIN,
    });
  });

  it("deactivates and reactivates an EventUser via admin API", async () => {
    const { accessToken } = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/event-users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
        emailSnapshot: "staff@example.com",
        password: "secret123",
        firstNameSnapshot: "Staff",
        lastNameSnapshot: "Member",
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      });

    expect(createResponse.status).toBe(201);

    const eventUserId = createResponse.body.data.id;

    const deactivateResponse = await request(app)
      .patch(`/api/admin/event-users/${eventUserId}/deactivate`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.data.isActive).toBe(false);

    const reactivateResponse = await request(app)
      .patch(`/api/admin/event-users/${eventUserId}/reactivate`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();

    expect(reactivateResponse.status).toBe(200);
    expect(reactivateResponse.body.data.isActive).toBe(true);
  });

  it("rejects EventUser access without admin token", async () => {
    const response = await request(app).get("/api/admin/event-users");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
    });
  });
});
