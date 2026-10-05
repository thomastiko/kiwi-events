import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let loginAdminUser;
let findAdminEventUserByEmailMock;
let updateAdminEventUserLastLoginMock;
let verifyPasswordMock;

const TEST_JWT_SECRET = "test-admin-jwt-secret";

function createAdminEventUser(overrides = {}) {
  return {
    id: "64f000000000000000000001",
    authProvider: "local",
    emailSnapshot: "admin@admin",
    firstNameSnapshot: "Event",
    lastNameSnapshot: "Admin",
    passwordHash: "hashed-password",
    role: "admin",
    mustChangePassword: false,
    ...overrides,
  };
}

async function loadAdminAuthService() {
  vi.resetModules();

  findAdminEventUserByEmailMock = vi.fn();
  updateAdminEventUserLastLoginMock = vi.fn();
  verifyPasswordMock = vi.fn();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        localJwtSecret: TEST_JWT_SECRET,
      },
    },
  }));

  vi.doMock("../../../src/core/security/password.service.js", () => ({
    verifyPassword: verifyPasswordMock,
  }));

  vi.doMock("../../../src/modules/adminAuth/adminAuth.repository.js", () => ({
    findAdminEventUserByEmail: findAdminEventUserByEmailMock,
    updateAdminEventUserLastLogin: updateAdminEventUserLastLoginMock,
  }));

  const module =
    await import("../../../src/modules/adminAuth/adminAuth.service.js");

  loginAdminUser = module.loginAdminUser;
}

beforeEach(async () => {
  await loadAdminAuthService();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("adminAuth.service loginAdminUser", () => {
  it("rejects login when email is missing", async () => {
    await expect(
      loginAdminUser({
        password: "secret",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });

    expect(findAdminEventUserByEmailMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects login when password is missing", async () => {
    await expect(
      loginAdminUser({
        email: "admin@admin",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });

    expect(findAdminEventUserByEmailMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("normalizes username-style login identifiers to @admin emails", async () => {
    findAdminEventUserByEmailMock.mockResolvedValue(null);

    await expect(
      loginAdminUser({
        email: "Admin",
        password: "secret",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(findAdminEventUserByEmailMock).toHaveBeenCalledWith("admin@admin");
  });

  it("normalizes real email addresses to lowercase", async () => {
    findAdminEventUserByEmailMock.mockResolvedValue(null);

    await expect(
      loginAdminUser({
        email: "ADMIN@EXAMPLE.COM",
        password: "secret",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(findAdminEventUserByEmailMock).toHaveBeenCalledWith(
      "admin@example.com",
    );
  });

  it("rejects login when no admin EventUser exists for the email", async () => {
    findAdminEventUserByEmailMock.mockResolvedValue(null);

    await expect(
      loginAdminUser({
        email: "admin@admin",
        password: "secret",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });

    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(updateAdminEventUserLastLoginMock).not.toHaveBeenCalled();
  });

  it("rejects login when EventUser has no local password hash", async () => {
    findAdminEventUserByEmailMock.mockResolvedValue(
      createAdminEventUser({
        passwordHash: null,
      }),
    );

    await expect(
      loginAdminUser({
        email: "admin@admin",
        password: "secret",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });

    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(updateAdminEventUserLastLoginMock).not.toHaveBeenCalled();
  });

  it("rejects login when password does not match", async () => {
    const eventUser = createAdminEventUser();

    findAdminEventUserByEmailMock.mockResolvedValue(eventUser);
    verifyPasswordMock.mockResolvedValue(false);

    await expect(
      loginAdminUser({
        email: "admin@admin",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password.",
    });

    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "wrong-password",
      "hashed-password",
    );
    expect(updateAdminEventUserLastLoginMock).not.toHaveBeenCalled();
  });

  it("rejects login when EventUser role is not admin", async () => {
    const eventUser = createAdminEventUser({
      role: "event_admin",
    });

    findAdminEventUserByEmailMock.mockResolvedValue(eventUser);
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      loginAdminUser({
        email: "admin@admin",
        password: "secret",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Admin access is required.",
    });

    expect(updateAdminEventUserLastLoginMock).not.toHaveBeenCalled();
  });

  it("returns token and public admin user when admin login is valid", async () => {
    const eventUser = createAdminEventUser({
      id: "64f000000000000000000abc",
      emailSnapshot: "owner@example.com",
      firstNameSnapshot: "Thomas",
      lastNameSnapshot: "Admin",
      role: "admin",
      mustChangePassword: true,
    });

    findAdminEventUserByEmailMock.mockResolvedValue(eventUser);
    verifyPasswordMock.mockResolvedValue(true);
    updateAdminEventUserLastLoginMock.mockResolvedValue();

    const result = await loginAdminUser({
      email: "owner@example.com",
      password: "secret",
    });

    expect(updateAdminEventUserLastLoginMock).toHaveBeenCalledWith(
      "64f000000000000000000abc",
    );

    expect(result.user).toEqual({
      id: "64f000000000000000000abc",
      email: "owner@example.com",
      firstName: "Thomas",
      lastName: "Admin",
      displayName: "Thomas Admin",
      role: "admin",
      mustChangePassword: true,
    });

    expect(result.accessToken).toEqual(expect.any(String));

    const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET);

    expect(decoded).toMatchObject({
      sub: "64f000000000000000000abc",
      eventUserId: "64f000000000000000000abc",
      email: "owner@example.com",
      role: "admin",
      type: "KIWI_EVENTS_admin",
    });
  });
});
