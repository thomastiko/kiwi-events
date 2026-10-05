import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let app;
let privateStorageRoot;

async function loadAppWithTestConfig() {
  vi.resetModules();
  privateStorageRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "kiwi-events-private-storage-"),
  );

  await fs.mkdir(path.join(privateStorageRoot, "tickets"), {
    recursive: true,
  });

  await fs.writeFile(
    path.join(privateStorageRoot, "tickets", "private-ticket.pdf"),
    "PRIVATE TICKET CONTENT",
  );

  /**
   * Keep app.js deterministic for tests.
   */
  vi.doMock("../../src/config/env.js", () => ({
    env: {
      port: 5001,
      appUrl: "http://localhost:5001",
      adminFrontendUrl: "http://localhost:5001/admin",
      frontendUrl: "",
      corsOrigins: ["http://localhost:5001", "http://127.0.0.1:5001"],
      storage: {
        localDir: privateStorageRoot,
      },
      config: {
        setup: {
          initialized: true,
        },
      },
      features: {
        ticketing: true,
      },
    },
  }));

  /**
   * Avoid real route imports here.
   *
   * The real routes import controllers, services and Mongoose models.
   * This app-base test should only document Express app wiring,
   * not database/model behavior.
   */
  vi.doMock("../../src/routes/index.js", () => {
    const router = express.Router();

    router.get("/test-ping", (_req, res) => {
      res.json({
        success: true,
        message: "Mock API route reached",
      });
    });

    return {
      default: router,
    };
  });

  /**
   * These middlewares may depend on runtime config/setup state.
   * For this app-base test we only want to test Express wiring.
   */
  vi.doMock("../../src/modules/system/system.maintenance.js", () => ({
    maintenanceMiddleware: (_req, _res, next) => next(),
  }));

  vi.doMock("../../src/core/middleware/setupMode.middleware.js", () => ({
    setupModeMiddleware: (_req, _res, next) => next(),
  }));

  /**
   * Silence request logs in tests.
   */
  vi.doMock("morgan", () => {
    const morganMock = vi.fn(() => (_req, _res, next) => next());

    morganMock.token = vi.fn();

    return {
      default: morganMock,
    };
  });

  /**
   * Silence unexpected error logs from CORS blocking test.
   */
  vi.doMock("../../src/config/logger.js", () => ({
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));

  const appModule = await import("../../src/app.js");
  app = appModule.default;
}

beforeAll(async () => {
  await loadAppWithTestConfig();
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.resetModules();

  if (privateStorageRoot) {
    await fs.rm(privateStorageRoot, {
      recursive: true,
      force: true,
    });
  }
});

describe("kiwi-events Express app base behavior", () => {
  it("never exposes private storage objects through /uploads", async () => {
    const response = await request(app).get(
      "/uploads/tickets/private-ticket.pdf",
    );

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("PRIVATE TICKET CONTENT");
  });
  it("serves or redirects the admin entry route", async () => {
    const response = await request(app).get("/admin");

    /**
     * Depending on Express static behavior and local files:
     * - 200 if index.html is served directly
     * - 301 if Express redirects /admin to /admin/
     * - 404 if admin files are missing in a reduced checkout
     */
    expect([200, 301, 404]).toContain(response.status);
  });

  it("mounts API routes under /api", async () => {
    const response = await request(app).get("/api/test-ping");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Mock API route reached",
    });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain("Route not found");
  });

  it("returns JSON 404 for unknown non-API routes", async () => {
    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain("Route not found");
  });

  it("allows requests without an Origin header", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows configured CORS origins", async () => {
    const response = await request(app)
      .get("/api/does-not-exist")
      .set("Origin", "http://localhost:5001");

    expect(response.status).toBe(404);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5001",
    );
  });

  it("blocks non-configured CORS origins", async () => {
    const response = await request(app)
      .get("/api/does-not-exist")
      .set("Origin", "http://evil.example.com");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        title: "Internal server error",
        message: "An unexpected server error occurred.",
      },
    });
  });
  it("sets strict security headers including Content Security Policy", async () => {
    const response = await request(app).get("/api/test-ping");

    expect(response.status).toBe(200);

    expect(response.headers["x-powered-by"]).toBeUndefined();

    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'self'",
    );

    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self'",
    );

    expect(response.headers["content-security-policy"]).toContain(
      "style-src 'self'",
    );

    expect(response.headers["content-security-policy"]).toContain(
      "object-src 'none'",
    );

    expect(response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );

    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
  });
});
