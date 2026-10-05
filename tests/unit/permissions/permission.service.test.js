import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EVENT_PERMISSIONS } from "../../../src/modules/permissions/permission.constant.js";
import { EVENT_USER_ROLES } from "../../../src/modules/eventUsers/eventUser.constants.js";

let getAllRolePermissions;
let getEventUserPermissions;
let getRolePermissions;
let hasEventPermission;

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

function createEventUser(overrides = {}) {
  return {
    role: EVENT_USER_ROLES.EVENT_MANAGER,
    isActive: true,
    ...overrides,
  };
}

async function loadPermissionService() {
  vi.resetModules();
  resetRoleFixtures();

  vi.doMock(
    "../../../src/modules/eventRoles/repositories/eventRole.repository.js",
    () => ({
      findEventRoleByKey: vi.fn(async (key) => rolesByKey.get(key) || null),

      listEventRoles: vi.fn(async () => Array.from(rolesByKey.values())),
    }),
  );

  const permissionServiceModule =
    await import("../../../src/modules/permissions/permission.service.js");

  getAllRolePermissions = permissionServiceModule.getAllRolePermissions;

  getEventUserPermissions = permissionServiceModule.getEventUserPermissions;

  getRolePermissions = permissionServiceModule.getRolePermissions;

  hasEventPermission = permissionServiceModule.hasEventPermission;
}

beforeEach(async () => {
  await loadPermissionService();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("permission.service role permissions", () => {
  it("gives admin wildcard access", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual(["*"]);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_OWN),
    ).resolves.toBe(true);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_ALL),
    ).resolves.toBe(true);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.CHECKIN_ALL),
    ).resolves.toBe(true);
  });

  it("expands manage-all into own management and global check-in", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.EVENT_ADMIN,
    });

    const permissions = await getEventUserPermissions(eventUser);

    expect(permissions).toEqual([
      EVENT_PERMISSIONS.MANAGE_ALL,
      EVENT_PERMISSIONS.MANAGE_OWN,
      EVENT_PERMISSIONS.CHECKIN_ALL,
    ]);

    expect(permissions).not.toContain("*");
  });

  it("gives event managers only own-event management", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.EVENT_MANAGER,
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual([
      EVENT_PERMISSIONS.MANAGE_OWN,
    ]);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_OWN),
    ).resolves.toBe(true);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_ALL),
    ).resolves.toBe(false);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.CHECKIN_ALL),
    ).resolves.toBe(false);
  });

  it("gives check-in staff only global check-in access", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.CHECKIN_STAFF,
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual([
      EVENT_PERMISSIONS.CHECKIN_ALL,
    ]);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.CHECKIN_ALL),
    ).resolves.toBe(true);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_OWN),
    ).resolves.toBe(false);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_ALL),
    ).resolves.toBe(false);
  });

  it("returns no permissions for inactive users", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.ADMIN,
      isActive: false,
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual([]);

    await expect(
      hasEventPermission(eventUser, EVENT_PERMISSIONS.MANAGE_ALL),
    ).resolves.toBe(false);
  });

  it("returns no permissions for unknown roles", async () => {
    const eventUser = createEventUser({
      role: "unknown_role",
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual([]);

    await expect(getRolePermissions("unknown_role")).resolves.toEqual([]);
  });

  it("normalizes and deduplicates custom role permissions", async () => {
    rolesByKey.set(
      "custom_staff",
      createRole({
        key: "custom_staff",
        name: "Custom Staff",

        permissions: [
          ` ${EVENT_PERMISSIONS.MANAGE_OWN} `,
          EVENT_PERMISSIONS.MANAGE_OWN,
          EVENT_PERMISSIONS.CHECKIN_ALL,
          "",
          null,
        ],
      }),
    );

    const eventUser = createEventUser({
      role: "custom_staff",
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual([
      EVENT_PERMISSIONS.MANAGE_OWN,
      EVENT_PERMISSIONS.CHECKIN_ALL,
    ]);
  });

  it("expands manage-all for custom roles", async () => {
    rolesByKey.set(
      "custom_admin",
      createRole({
        key: "custom_admin",
        name: "Custom Admin",

        permissions: [EVENT_PERMISSIONS.MANAGE_ALL],
      }),
    );

    const eventUser = createEventUser({
      role: "custom_admin",
    });

    await expect(getEventUserPermissions(eventUser)).resolves.toEqual([
      EVENT_PERMISSIONS.MANAGE_ALL,
      EVENT_PERMISSIONS.MANAGE_OWN,
      EVENT_PERMISSIONS.CHECKIN_ALL,
    ]);
  });

  it("keeps stored role permissions separate from effective permissions", async () => {
    await expect(
      getRolePermissions(EVENT_USER_ROLES.EVENT_ADMIN),
    ).resolves.toEqual([EVENT_PERMISSIONS.MANAGE_ALL]);

    await expect(
      getRolePermissions(EVENT_USER_ROLES.EVENT_MANAGER),
    ).resolves.toEqual([EVENT_PERMISSIONS.MANAGE_OWN]);

    await expect(
      getRolePermissions(EVENT_USER_ROLES.CHECKIN_STAFF),
    ).resolves.toEqual([EVENT_PERMISSIONS.CHECKIN_ALL]);
  });

  it("returns false for empty or missing permission checks", async () => {
    const eventUser = createEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    await expect(hasEventPermission(eventUser, "")).resolves.toBe(false);

    await expect(hasEventPermission(eventUser, null)).resolves.toBe(false);

    await expect(
      hasEventPermission(null, EVENT_PERMISSIONS.MANAGE_OWN),
    ).resolves.toBe(false);
  });

  it("exposes stored permissions for all default roles", async () => {
    const allRolePermissions = await getAllRolePermissions();

    expect(allRolePermissions).toEqual({
      [EVENT_USER_ROLES.ADMIN]: ["*"],

      [EVENT_USER_ROLES.EVENT_ADMIN]: [EVENT_PERMISSIONS.MANAGE_ALL],

      [EVENT_USER_ROLES.EVENT_MANAGER]: [EVENT_PERMISSIONS.MANAGE_OWN],

      [EVENT_USER_ROLES.CHECKIN_STAFF]: [EVENT_PERMISSIONS.CHECKIN_ALL],
    });
  });
});
