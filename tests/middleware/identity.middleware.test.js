import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpTestApp } from "../helpers/httpTestApp.js";

const LOCAL_SECRET = "test-local-secret";
const EXTERNAL_SECRET = "test-external-secret";

let requireIdentity;
let optionalIdentity;
let errorHandler;

async function loadIdentityMiddleware(authProvider = "hybrid") {
  vi.resetModules();

  vi.doMock("../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: authProvider,
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
    },
  }));

  const identityModule =
    await import("../../src/core/middleware/identity.middleware.js");
  const errorHandlerModule =
    await import("../../src/core/errors/errorHandler.js");

  requireIdentity = identityModule.requireIdentity;
  optionalIdentity = identityModule.optionalIdentity;
  errorHandler = errorHandlerModule.errorHandler;
}

function createIdentityTestApp() {
  const router = express.Router();

  router.get("/required", requireIdentity, (req, res) => {
    res.json({
      success: true,
      identity: req.identity,
    });
  });

  router.get("/optional", optionalIdentity, (req, res) => {
    res.json({
      success: true,
      identity: req.identity,
    });
  });

  return createHttpTestApp({
    mountPath: "/",
    router,
    errorHandler,
  });
}

function signLocalToken(payload = {}) {
  return jwt.sign(
    {
      sub: "64f000000000000000000001",
      eventUserId: "64f000000000000000000001",
      email: "admin@example.com",
      role: "admin",
      type: "KIWI_EVENTS_admin",
      ...payload,
    },
    LOCAL_SECRET,
  );
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

beforeEach(async () => {
  await loadIdentityMiddleware("hybrid");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("identity.middleware requireIdentity", () => {
  it("rejects requests without a bearer token", async () => {
    const app = createIdentityTestApp();

    const response = await request(app).get("/required");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_REQUIRED",
        message: "Authentication token is required.",
      },
    });
  });

  it("rejects invalid bearer tokens", async () => {
    const app = createIdentityTestApp();

    const response = await request(app)
      .get("/required")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_INVALID",
        message: "Authentication token is invalid.",
      },
    });
  });

  it("accepts a valid local admin token in hybrid mode", async () => {
    const app = createIdentityTestApp();

    const token = signLocalToken();

    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.identity).toMatchObject({
      eventUserId: "64f000000000000000000001",
      externalProvider: null,
      externalUserId: null,
      email: "admin@example.com",
      role: "admin",
      roles: ["admin"],
      authProvider: "local",
      verifiedProvider: "local",
      isSetupAdmin: false,
      setupMode: false,
      isHostService: false,
    });
  });

  it("accepts a valid external JWT in hybrid mode and maps provider/user id", async () => {
    const app = createIdentityTestApp();

    const token = signExternalToken();

    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.identity).toMatchObject({
      eventUserId: null,
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      email: "thomas@example.com",
      role: "host_user",
      verifiedProvider: "external-jwt",
      authProvider: "external-jwt",
      isHostService: false,
    });
  });

  it("rejects external JWTs that only contain legacy sub/provider claims", async () => {
    const app = createIdentityTestApp();

    const token = jwt.sign(
      {
        sub: "host-user-1",
        provider: "dummy",
        email: "thomas@example.com",
        role: "host_user",
      },
      EXTERNAL_SECRET,
    );

    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_INVALID",
        message: "Authentication token is invalid.",
      },
    });
  });

  it("recognizes host-service tokens", async () => {
    const app = createIdentityTestApp();

    const token = signExternalToken({
      externalUserId: undefined,
      role: "host_service",
      tokenType: "host-service",
      sub: "dummy-host-service",
    });
    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.identity).toMatchObject({
      externalProvider: "dummy",
      externalUserId: null,
      role: "host_service",
      tokenType: "host-service",
      verifiedProvider: "external-jwt",
      isHostService: true,
      hostServiceId: "dummy-host-service",
    });
  });

  it("rejects legacy dummy host-service tokens", async () => {
    const app = createIdentityTestApp();

    const token = jwt.sign(
      {
        externalProvider: "dummy",
        role: "host_service",
        tokenType: "dummy-host-service",
      },
      EXTERNAL_SECRET,
    );

    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_INVALID",
        message: "Authentication token is invalid.",
      },
    });
  });

  it("rejects external tokens when auth provider is local only", async () => {
    await loadIdentityMiddleware("local");

    const app = createIdentityTestApp();
    const token = signExternalToken();

    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_INVALID",
        message: "Authentication token is invalid.",
      },
    });
  });

  it("rejects local tokens when auth provider is external-jwt only", async () => {
    await loadIdentityMiddleware("external-jwt");

    const app = createIdentityTestApp();
    const token = signLocalToken();

    const response = await request(app)
      .get("/required")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_INVALID",
        message: "Authentication token is invalid.",
      },
    });
  });
});

describe("identity.middleware optionalIdentity", () => {
  it("continues with identity null when no token is provided", async () => {
    const app = createIdentityTestApp();

    const response = await request(app).get("/optional");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      identity: null,
    });
  });

  it("continues with identity null when an invalid token is provided", async () => {
    const app = createIdentityTestApp();

    const response = await request(app)
      .get("/optional")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      identity: null,
    });
  });

  it("attaches identity when a valid token is provided", async () => {
    const app = createIdentityTestApp();

    const token = signExternalToken();

    const response = await request(app)
      .get("/optional")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.identity).toMatchObject({
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      verifiedProvider: "external-jwt",
    });
  });
});
