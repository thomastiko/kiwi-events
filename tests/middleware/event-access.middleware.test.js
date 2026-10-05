import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpTestApp } from "../helpers/httpTestApp.js";

let attachEventUserIfExists;
let requireEventUser;
let errorHandler;

let findActiveEventUserByIdMock;
let findActiveEventUserByExternalIdentityMock;

function createEventUser(overrides = {}) {
  return {
    id: "64f000000000000000000001",
    emailSnapshot: "thomas@example.com",
    externalProvider: "dummy",
    externalUserId: "host-user-1",
    role: "event_admin",
    isActive: true,
    ...overrides,
  };
}

async function loadEventAccessMiddleware() {
  vi.resetModules();

  findActiveEventUserByIdMock = vi.fn();
  findActiveEventUserByExternalIdentityMock = vi.fn();

  vi.doMock("../../src/modules/database/database.service.js", () => ({
    isMongoDatabase: () => true,
    isSqlDatabase: () => false,
  }));

  vi.doMock(
    "../../src/modules/eventUsers/repositories/eventUser.repository.js",
    () => ({
      findActiveEventUserById: findActiveEventUserByIdMock,
      findActiveEventUserByExternalIdentity:
        findActiveEventUserByExternalIdentityMock,
    }),
  );

  const eventAccessModule =
    await import("../../src/core/middleware/eventAccess.middleware.js");
  const errorHandlerModule =
    await import("../../src/core/errors/errorHandler.js");

  attachEventUserIfExists = eventAccessModule.attachEventUserIfExists;
  requireEventUser = eventAccessModule.requireEventUser;
  errorHandler = errorHandlerModule.errorHandler;
}

function createEventAccessTestApp(identity) {
  const router = express.Router();

  router.use((req, _res, next) => {
    req.identity = identity;
    next();
  });

  router.get("/attach", attachEventUserIfExists, (req, res) => {
    res.json({
      success: true,
      eventUser: req.eventUser || null,
    });
  });

  router.get("/required", requireEventUser, (req, res) => {
    res.json({
      success: true,
      eventUser: req.eventUser,
    });
  });

  return createHttpTestApp({
    mountPath: "/",
    router,
    errorHandler,
  });
}

beforeEach(async () => {
  await loadEventAccessMiddleware();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("eventAccess.middleware attachEventUserIfExists", () => {
  it("attaches an active EventUser by local eventUserId", async () => {
    const eventUser = createEventUser({
      id: "64f000000000000000000abc",
      emailSnapshot: "admin@example.com",
    });

    findActiveEventUserByIdMock.mockResolvedValue(eventUser);

    const app = createEventAccessTestApp({
      eventUserId: "64f000000000000000000abc",
    });

    const response = await request(app).get("/attach");

    expect(response.status).toBe(200);
    expect(response.body.eventUser).toEqual(eventUser);

    expect(findActiveEventUserByIdMock).toHaveBeenCalledWith(
      "64f000000000000000000abc",
    );
    expect(findActiveEventUserByExternalIdentityMock).not.toHaveBeenCalled();
  });

  it("attaches an active EventUser by external provider and external user id", async () => {
    const eventUser = createEventUser({
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      emailSnapshot: "thomas@example.com",
    });

    findActiveEventUserByExternalIdentityMock.mockResolvedValue(eventUser);

    const app = createEventAccessTestApp({
      eventUserId: null,
      externalProvider: "dummy",
      externalUserId: "host-user-1",
    });

    const response = await request(app).get("/attach");

    expect(response.status).toBe(200);
    expect(response.body.eventUser).toEqual(eventUser);

    expect(findActiveEventUserByIdMock).not.toHaveBeenCalled();
    expect(findActiveEventUserByExternalIdentityMock).toHaveBeenCalledWith({
      provider: "dummy",
      externalUserId: "host-user-1",
    });
  });

  it("normalizes external provider to lowercase before lookup", async () => {
    const eventUser = createEventUser({
      externalProvider: "dummy",
      externalUserId: "host-user-1",
    });

    findActiveEventUserByExternalIdentityMock.mockResolvedValue(eventUser);

    const app = createEventAccessTestApp({
      externalProvider: "DUMMY",
      externalUserId: "host-user-1",
    });

    const response = await request(app).get("/attach");

    expect(response.status).toBe(200);
    expect(response.body.eventUser).toEqual(eventUser);

    expect(findActiveEventUserByExternalIdentityMock).toHaveBeenCalledWith({
      provider: "dummy",
      externalUserId: "host-user-1",
    });
  });

  it("sets eventUser to null when no matching EventUser exists", async () => {
    findActiveEventUserByExternalIdentityMock.mockResolvedValue(null);

    const app = createEventAccessTestApp({
      externalProvider: "dummy",
      externalUserId: "unknown-host-user",
    });

    const response = await request(app).get("/attach");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      eventUser: null,
    });

    expect(findActiveEventUserByExternalIdentityMock).toHaveBeenCalledWith({
      provider: "dummy",
      externalUserId: "unknown-host-user",
    });
  });
});

describe("eventAccess.middleware requireEventUser", () => {
  it("allows access when an active EventUser exists", async () => {
    const eventUser = createEventUser();

    findActiveEventUserByExternalIdentityMock.mockResolvedValue(eventUser);

    const app = createEventAccessTestApp({
      externalProvider: "dummy",
      externalUserId: "host-user-1",
    });

    const response = await request(app).get("/required");

    expect(response.status).toBe(200);
    expect(response.body.eventUser).toEqual(eventUser);

    expect(findActiveEventUserByExternalIdentityMock).toHaveBeenCalledWith({
      provider: "dummy",
      externalUserId: "host-user-1",
    });
  });

  it("blocks access with 403 when no EventUser exists for the identity", async () => {
    findActiveEventUserByExternalIdentityMock.mockResolvedValue(null);

    const app = createEventAccessTestApp({
      externalProvider: "dummy",
      externalUserId: "missing-user",
    });

    const response = await request(app).get("/required");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "No active kiwi-events user was found for this identity.",
      },
    });

    expect(findActiveEventUserByExternalIdentityMock).toHaveBeenCalledWith({
      provider: "dummy",
      externalUserId: "missing-user",
    });
  });

  it("blocks access with 403 when identity is missing", async () => {
    const app = createEventAccessTestApp(null);

    const response = await request(app).get("/required");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        message: "No active kiwi-events user was found for this identity.",
      },
    });

    expect(findActiveEventUserByIdMock).not.toHaveBeenCalled();
    expect(findActiveEventUserByExternalIdentityMock).not.toHaveBeenCalled();
  });
});
