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

const TEST_JWT_SECRET = "integration-local-jwt-secret";

let app;
let EventUser;
let hashPassword;
let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

async function loadAdminAuthIntegrationApp() {
  vi.resetModules();

  /**
   * Make AdminAuth deterministic in integration tests.
   * The real service uses env.auth.localJwtSecret for local admin JWTs.
   */
  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: "integration-external-jwt-secret",
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
  const passwordServiceModule =
    await import("../../../src/core/security/password.service.js");
  const adminAuthRoutesModule =
    await import("../../../src/modules/adminAuth/adminAuth.routes.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EventUser = eventUserModelModule.EventUser;
  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;
  hashPassword = passwordServiceModule.hashPassword;

  app = createHttpTestApp({
    mountPath: "/api/admin/auth",
    router: adminAuthRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createLocalAdminUser({
  email = "admin@admin",
  password = "secret123",
  role = EVENT_USER_ROLES.ADMIN,
  isActive = true,
  mustChangePassword = false,
} = {}) {
  const passwordHash = await hashPassword(password);

  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot: email,
    passwordHash,
    firstNameSnapshot: "Test",
    lastNameSnapshot: "Admin",
    role,
    isActive,
    mustChangePassword,
  });
}

async function createExternalEventUser({
  email = "external@example.com",
  externalProvider = "dummy",
  externalUserId = "host-user-1",
  role = EVENT_USER_ROLES.ADMIN,
} = {}) {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
    emailSnapshot: email,
    passwordHash: null,
    externalProvider,
    externalUserId,
    firstNameSnapshot: "External",
    lastNameSnapshot: "User",
    role,
    isActive: true,
  });
}

describe("AdminAuth MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadAdminAuthIntegrationApp();
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

  it("logs in a local kiwi events admin with email and password", async () => {
    const admin = await createLocalAdminUser({
      email: "admin@example.com",
      password: "secret123",
    });

    const response = await request(app).post("/api/admin/auth/login").send({
      email: "admin@example.com",
      password: "secret123",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user).toMatchObject({
      id: String(admin._id),
      email: "admin@example.com",
      firstName: "Test",
      lastName: "Admin",
      displayName: "Test Admin",
      role: EVENT_USER_ROLES.ADMIN,
      mustChangePassword: false,
    });

    const updatedAdmin = await EventUser.findById(admin._id).lean();

    expect(updatedAdmin.lastLoginAt).toBeInstanceOf(Date);
  });

  it("supports username-style login by normalizing admin to admin@admin", async () => {
    await createLocalAdminUser({
      email: "admin@admin",
      password: "secret123",
    });

    const response = await request(app).post("/api/admin/auth/login").send({
      email: "admin",
      password: "secret123",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe("admin@admin");
  });

  it("uses the login token for /me and resolves the matching EventUser", async () => {
    const admin = await createLocalAdminUser({
      email: "me@example.com",
      password: "secret123",
    });

    const loginResponse = await request(app)
      .post("/api/admin/auth/login")
      .send({
        email: "me@example.com",
        password: "secret123",
      });

    expect(loginResponse.status).toBe(200);

    const accessToken = loginResponse.body.data.accessToken;

    const meResponse = await request(app)
      .get("/api/admin/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.success).toBe(true);
    expect(meResponse.body).toEqual({
      success: true,
      data: {
        user: {
          id: String(admin.id),
          email: "me@example.com",
          firstName: "Test",
          lastName: "Admin",
          displayName: "Test Admin",
          role: EVENT_USER_ROLES.ADMIN,
          mustChangePassword: false,
        },
      },
    });

    expect(meResponse.body.data).not.toHaveProperty("identity");
    expect(meResponse.body.data).not.toHaveProperty("eventUser");
    expect(JSON.stringify(meResponse.body)).not.toContain("passwordHash");
    expect(JSON.stringify(meResponse.body)).not.toContain("rawClaims");
  });

  it("rejects login with a wrong password", async () => {
    await createLocalAdminUser({
      email: "admin@example.com",
      password: "correct-password",
    });

    const response = await request(app).post("/api/admin/auth/login").send({
      email: "admin@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "Invalid email or password.",
      },
    });
  });

  it("rejects local login when EventUser role is not admin", async () => {
    await createLocalAdminUser({
      email: "manager@example.com",
      password: "secret123",
      role: EVENT_USER_ROLES.EVENT_MANAGER,
    });

    const response = await request(app).post("/api/admin/auth/login").send({
      email: "manager@example.com",
      password: "secret123",
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "Admin access is required.",
      },
    });
  });

  it("rejects local login for external-only EventUsers without passwordHash", async () => {
    await createExternalEventUser({
      email: "external@example.com",
      externalProvider: "dummy",
      externalUserId: "host-user-1",
    });

    const response = await request(app).post("/api/admin/auth/login").send({
      email: "external@example.com",
      password: "secret123",
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "Invalid email or password.",
      },
    });
  });

  it("rejects /me without token", async () => {
    const response = await request(app).get("/api/admin/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "Authentication token is required.",
      },
    });
  });
});
