import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

let AppError;
let errorHandler;
let notFoundHandler;
let loggerMock;

async function loadErrorModules() {
  vi.resetModules();

  loggerMock = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  vi.doMock("../../src/config/logger.js", () => ({
    logger: loggerMock,
  }));

  const appErrorModule = await import("../../src/core/errors/AppError.js");
  const errorHandlerModule =
    await import("../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../src/core/errors/notFoundHandler.js");

  AppError = appErrorModule.AppError;
  errorHandler = errorHandlerModule.errorHandler;
  notFoundHandler = notFoundHandlerModule.notFoundHandler;
}

function createErrorHandlingTestApp() {
  const app = express();

  app.use(express.json());

  /**
   * Documents a successful baseline route.
   * This makes sure the test app itself works before testing errors.
   */
  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      message: "Kiwi Events Test app is healthy",
    });
  });

  /**
   * Documents how expected application errors are returned to API clients.
   */
  app.get("/app-error", () => {
    throw new AppError({
      code: "FORBIDDEN",
      title: "Access denied",
      message: "This feature is not allowed.",
      statusCode: 403,
      details: {
        reason: "missing_permission",
      },
    });
  });

  /**
   * Documents how validation errors are returned.
   */
  app.post("/validation-error", (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      amount: z.number().min(1),
    });

    const data = schema.parse(req.body);

    res.json({
      success: true,
      data,
    });
  });

  /**
   * Documents that unknown/unexpected errors are hidden from the API response.
   */
  app.get("/unexpected-error", () => {
    throw new Error("Database password leaked here - should not be returned");
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

beforeEach(async () => {
  await loadErrorModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("kiwi-events HTTP error handling", () => {
  it("returns a successful health response for known routes", async () => {
    const app = createErrorHandlingTestApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Kiwi Events Test app is healthy",
    });
  });

  it("returns 404 JSON for unknown routes", async () => {
    const app = createErrorHandlingTestApp();

    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
    });

    expect(response.body.error.message).toContain("Route not found");
  });

  it("returns AppError status, message and details", async () => {
    const app = createErrorHandlingTestApp();

    const response = await request(app).get("/app-error");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        title: "Access denied",
        message: "This feature is not allowed.",
        details: {
          reason: "missing_permission",
        },
      },
    });

    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("returns Zod validation errors as 400 JSON", async () => {
    const app = createErrorHandlingTestApp();

    const response = await request(app).post("/validation-error").send({
      email: "not-an-email",
      amount: 0,
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toBe(
      "Please fix the highlighted fields.",
    );

    expect(response.body.error.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "email",
        }),
        expect.objectContaining({
          field: "amount",
        }),
      ]),
    );

    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("does not leak unexpected internal error messages to API clients", async () => {
    const app = createErrorHandlingTestApp();

    const response = await request(app).get("/unexpected-error");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        title: "Internal server error",
        message: "An unexpected server error occurred.",
      },
    });

    expect(JSON.stringify(response.body)).not.toContain("Database password");

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
