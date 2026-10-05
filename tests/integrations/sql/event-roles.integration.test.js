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
let authApp;

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEventUser;
let hashPassword;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

async function loadEventRolesSqlIntegrationApp() {
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

  const eventRoleRoutesModule =
    await import("../../../src/modules/eventRoles/eventRole.routes.js");

  const adminAuthRoutesModule =
    await import("../../../src/modules/adminAuth/adminAuth.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  createEventUser = eventUserRepositoryModule.createEventUser;

  hashPassword = passwordServiceModule.hashPassword;

  app = createHttpTestApp({
    mountPath: "/api/admin/event-roles",
    router: eventRoleRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });

  authApp = createHttpTestApp({
    mountPath: "/api/admin/auth",
    router: adminAuthRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminAndToken({
  email = "admin@example.com",
  password = "secret123",
} = {}) {
  const passwordHash = await hashPassword(password);

  await createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot: email,
    passwordHash,
    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",
    role: EVENT_USER_ROLES.ADMIN,
    isActive: true,
    mustChangePassword: false,
  });

  const loginResponse = await request(authApp)
    .post("/api/admin/auth/login")
    .send({
      email,
      password,
    });

  expect(loginResponse.status).toBe(200);

  return loginResponse.body.data.accessToken;
}

function expectCanonicalEventRole(role, expected = {}) {
  expect(role).toMatchObject(expected);

  expect(Object.keys(role).sort()).toEqual(
    [
      "id",
      "key",
      "name",
      "description",
      "permissions",
      "isProtected",
      "sortOrder",
      "createdAt",
      "updatedAt",
    ].sort(),
  );

  expect(role.id).toBe(role.key);
  expect(role._id).toBeUndefined();
  expect(role.__v).toBeUndefined();

  expect(role.createdAt).toEqual(expect.any(String));
  expect(role.updatedAt).toEqual(expect.any(String));
}

describe("EventRoles SQL integration", () => {
  beforeAll(async () => {
    await loadEventRolesSqlIntegrationApp();
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

  it("uses one canonical EventRole HTTP contract for create, list, detail, update and delete", async () => {
    const accessToken = await createAdminAndToken();

    const createResponse = await request(app)
      .post("/api/admin/event-roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        key: "custom_manager",
        name: "Custom Manager",
        description: "Custom event role",
        permissions: [],
        sortOrder: 80,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);

    expectCanonicalEventRole(createResponse.body.data, {
      id: "custom_manager",
      key: "custom_manager",
      name: "Custom Manager",
      description: "Custom event role",
      permissions: [],
      isProtected: false,
      sortOrder: 80,
    });

    const listResponse = await request(app)
      .get("/api/admin/event-roles")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);

    const listedRole = listResponse.body.data.find(
      (role) => role.key === "custom_manager",
    );

    expectCanonicalEventRole(listedRole, {
      id: "custom_manager",
      key: "custom_manager",
    });

    const detailResponse = await request(app)
      .get("/api/admin/event-roles/custom_manager")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.success).toBe(true);

    expectCanonicalEventRole(detailResponse.body.data, {
      id: "custom_manager",
      key: "custom_manager",
      name: "Custom Manager",
    });

    const updateResponse = await request(app)
      .patch("/api/admin/event-roles/custom_manager")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Updated Manager",
        description: "Updated description",
        sortOrder: 90,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);

    expectCanonicalEventRole(updateResponse.body.data, {
      id: "custom_manager",
      key: "custom_manager",
      name: "Updated Manager",
      description: "Updated description",
      sortOrder: 90,
    });

    const deleteResponse = await request(app)
      .delete("/api/admin/event-roles/custom_manager")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);

    expect(deleteResponse.body.data).toMatchObject({
      deleted: true,
      affectedUsers: 0,
    });

    expectCanonicalEventRole(deleteResponse.body.data.role, {
      id: "custom_manager",
      key: "custom_manager",
      name: "Updated Manager",
    });

    expect(JSON.stringify(deleteResponse.body)).not.toContain('"_id"');
    expect(JSON.stringify(deleteResponse.body)).not.toContain('"__v"');
  });

  it("returns canonical permission-group DTOs", async () => {
    const accessToken = await createAdminAndToken();

    const response = await request(app)
      .get("/api/admin/event-roles/permission-groups")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data.length).toBeGreaterThan(0);

    for (const group of response.body.data) {
      expect(Object.keys(group).sort()).toEqual(
        ["key", "label", "description", "permissions"].sort(),
      );

      expect(group.key).toEqual(expect.any(String));
      expect(group.label).toEqual(expect.any(String));
      expect(group.description).toEqual(expect.any(String));
      expect(Array.isArray(group.permissions)).toBe(true);

      expect(group._id).toBeUndefined();
      expect(group.__v).toBeUndefined();
    }
  });
});
