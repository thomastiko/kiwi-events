// tests/middleware/permission.middleware.test.js

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpTestApp } from "../helpers/httpTestApp.js";
import { EVENT_PERMISSIONS } from "../../src/modules/permissions/permission.constant.js";
import { EVENT_USER_ROLES } from "../../src/modules/eventUsers/eventUser.constants.js";

let requireEventPermissions;
let errorHandler;

let rolesByKey;

function createRole({ key, name, permissions = [], isProtected = false }) {
  return {
    key,
    name,
    description: "",
    permissions,
    isProtected,
    sortOrder: 100,
  };
}

function resetRoleFixtures() {
  rolesByKey = new Map([
    [
      EVENT_USER_ROLES.ADMIN,
      createRole({
        key: EVENT_USER_ROLES.ADMIN,
        name: "Admin",
        permissions: ["*"],
        isProtected: true,
      }),
    ],

    [
      EVENT_USER_ROLES.EVENT_ADMIN,
      createRole({
        key: EVENT_USER_ROLES.EVENT_ADMIN,
        name: "Event Admin",
        permissions: [EVENT_PERMISSIONS.MANAGE_ALL],
      }),
    ],

    [
      EVENT_USER_ROLES.EVENT_MANAGER,
      createRole({
        key: EVENT_USER_ROLES.EVENT_MANAGER,
        name: "Event Manager",
        permissions: [EVENT_PERMISSIONS.MANAGE_OWN],
      }),
    ],

    [
      EVENT_USER_ROLES.CHECKIN_STAFF,
      createRole({
        key: EVENT_USER_ROLES.CHECKIN_STAFF,
        name: "Check-in Staff",
        permissions: [EVENT_PERMISSIONS.CHECKIN_ALL],
      }),
    ],
  ]);
}

async function loadPermissionMiddleware() {
  vi.resetModules();
  resetRoleFixtures();

  vi.doMock(
    "../../src/modules/eventRoles/repositories/eventRole.repository.js",
    () => ({
      findEventRoleByKey: vi.fn(async (key) => rolesByKey.get(key) || null),

      listEventRoles: vi.fn(async () => Array.from(rolesByKey.values())),
    }),
  );

  const permissionMiddlewareModule =
    await import("../../src/core/middleware/permission.middleware.js");

  const errorHandlerModule =
    await import("../../src/core/errors/errorHandler.js");

  requireEventPermissions = permissionMiddlewareModule.requireEventPermissions;

  errorHandler = errorHandlerModule.errorHandler;
}

function createEventUser(overrides = {}) {
  return {
    role: EVENT_USER_ROLES.EVENT_MANAGER,

    isActive: true,

    ...overrides,
  };
}

function createPermissionTestApp(eventUser, permissions, options = {}) {
  const router = express.Router();

  router.use((req, _res, next) => {
    req.eventUser = eventUser;
    next();
  });

  router.get(
    "/protected",

    requireEventPermissions(permissions, options),

    (_req, res) => {
      res.json({
        success: true,
        message: "Protected permission route reached",
      });
    },
  );

  return createHttpTestApp({
    mountPath: "/",
    router,
    errorHandler,
  });
}

async function expectAllowed(app) {
  const response = await request(app).get("/protected");

  expect(response.status).toBe(200);

  expect(response.body).toEqual({
    success: true,
    message: "Protected permission route reached",
  });
}

async function expectForbidden(
  app,
  expectedCode = "INSUFFICIENT_EVENT_PERMISSIONS",
) {
  const response = await request(app).get("/protected");

  expect(response.status).toBe(403);

  expect(response.body).toMatchObject({
    success: false,

    error: {
      code: expectedCode,
    },
  });

  return response;
}

beforeEach(async () => {
  await loadPermissionMiddleware();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("permission.middleware requireEventPermissions", () => {
  it("allows manage-own routes for event managers", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      }),

      EVENT_PERMISSIONS.MANAGE_OWN,
    );

    await expectAllowed(app);
  });

  it("blocks manage-all routes for event managers", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      }),

      EVENT_PERMISSIONS.MANAGE_ALL,
    );

    const response = await expectForbidden(app);

    expect(response.body.error).toMatchObject({
      message: "Insufficient event permissions.",

      details: {
        permission: EVENT_PERMISSIONS.MANAGE_ALL,
      },
    });
  });

  it("allows manage-all routes for event admins", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.EVENT_ADMIN,
      }),

      EVENT_PERMISSIONS.MANAGE_ALL,
    );

    await expectAllowed(app);
  });

  it("allows event admins on manage-own routes because manage-all implies manage-own", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.EVENT_ADMIN,
      }),

      EVENT_PERMISSIONS.MANAGE_OWN,
    );

    await expectAllowed(app);
  });

  it("allows event admins on check-in routes because manage-all implies global check-in", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.EVENT_ADMIN,
      }),

      EVENT_PERMISSIONS.CHECKIN_ALL,
    );

    await expectAllowed(app);
  });

  it("allows global check-in routes for check-in staff", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.CHECKIN_STAFF,
      }),

      EVENT_PERMISSIONS.CHECKIN_ALL,
    );

    await expectAllowed(app);
  });

  it("blocks event management for check-in staff", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.CHECKIN_STAFF,
      }),

      EVENT_PERMISSIONS.MANAGE_OWN,
    );

    await expectForbidden(app);
  });

  it("allows access when any one of multiple required permissions is present", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.CHECKIN_STAFF,
      }),

      [EVENT_PERMISSIONS.MANAGE_OWN, EVENT_PERMISSIONS.CHECKIN_ALL],
    );

    await expectAllowed(app);
  });

  it("blocks access when none of multiple required permissions is present", async () => {
    rolesByKey.set(
      "no_permissions",
      createRole({
        key: "no_permissions",
        name: "No Permissions",
        permissions: [],
      }),
    );

    const app = createPermissionTestApp(
      createEventUser({
        role: "no_permissions",
      }),

      [EVENT_PERMISSIONS.MANAGE_OWN, EVENT_PERMISSIONS.CHECKIN_ALL],
    );

    const response = await expectForbidden(app);

    expect(response.body.error).toMatchObject({
      details: {
        permissions: [
          EVENT_PERMISSIONS.MANAGE_OWN,
          EVENT_PERMISSIONS.CHECKIN_ALL,
        ],

        mode: "any",
      },
    });
  });

  it("requires every permission when mode is all", async () => {
    rolesByKey.set(
      "manage_and_checkin",
      createRole({
        key: "manage_and_checkin",
        name: "Manage and Check-in",

        permissions: [
          EVENT_PERMISSIONS.MANAGE_OWN,
          EVENT_PERMISSIONS.CHECKIN_ALL,
        ],
      }),
    );

    const app = createPermissionTestApp(
      createEventUser({
        role: "manage_and_checkin",
      }),

      [EVENT_PERMISSIONS.MANAGE_OWN, EVENT_PERMISSIONS.CHECKIN_ALL],

      {
        mode: "all",
      },
    );

    await expectAllowed(app);
  });

  it("blocks mode all when one required permission is missing", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.EVENT_MANAGER,
      }),

      [EVENT_PERMISSIONS.MANAGE_OWN, EVENT_PERMISSIONS.CHECKIN_ALL],

      {
        mode: "all",
      },
    );

    const response = await expectForbidden(app);

    expect(response.body.error).toMatchObject({
      details: {
        permissions: [
          EVENT_PERMISSIONS.MANAGE_OWN,
          EVENT_PERMISSIONS.CHECKIN_ALL,
        ],

        mode: "all",
      },
    });
  });

  it("allows admin through every permission because admin has wildcard access", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    for (const permission of [
      EVENT_PERMISSIONS.MANAGE_OWN,
      EVENT_PERMISSIONS.MANAGE_ALL,
      EVENT_PERMISSIONS.CHECKIN_ALL,
    ]) {
      const app = createPermissionTestApp(eventUser, permission);

      await expectAllowed(app);
    }
  });

  it("blocks inactive EventUsers even when their role normally has access", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.ADMIN,

        isActive: false,
      }),

      EVENT_PERMISSIONS.MANAGE_ALL,
    );

    await expectForbidden(app);
  });

  it("blocks requests without an EventUser context", async () => {
    const app = createPermissionTestApp(null, EVENT_PERMISSIONS.MANAGE_OWN);

    const response = await expectForbidden(app, "EVENT_USER_CONTEXT_MISSING");

    expect(response.body.error).toMatchObject({
      message: "Event user context is missing.",
    });
  });

  it("fails closed when the route has no configured permissions", async () => {
    const app = createPermissionTestApp(
      createEventUser({
        role: EVENT_USER_ROLES.ADMIN,
      }),

      [],
    );

    const response = await expectForbidden(
      app,
      "EVENT_PERMISSIONS_NOT_CONFIGURED",
    );

    expect(response.body.error).toMatchObject({
      message: "No event permissions configured.",
    });
  });
});
