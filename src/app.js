// src/app.js

import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { buildAllowedOrigins, normalizeOrigin } from "./config/cors.js";
import { env } from "./config/env.js";
import { errorHandler } from "./core/errors/errorHandler.js";
import { notFoundHandler } from "./core/errors/notFoundHandler.js";
import { requestLoggingMiddleware } from "./core/middleware/requestLogging.middleware.js";
import { securityHeadersMiddleware } from "./core/middleware/securityHeaders.middleware.js";
import { setupModeMiddleware } from "./core/middleware/setupMode.middleware.js";
import { maintenanceMiddleware } from "./modules/system/system.maintenance.js";
import routes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");
app.set("etag", false);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const allowedOrigins = buildAllowedOrigins();

app.use(securityHeadersMiddleware);
app.use(requestLoggingMiddleware);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${normalizedOrigin}`),
      );
    },
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: "5mb",
    verify(req, _res, buffer) {
      const requestPath = String(req.originalUrl || "").split("?")[0];

      if (/^\/api\/webhooks\/payments\/[^/]+\/?$/.test(requestPath)) {
        req.rawBody = Buffer.from(buffer);
      }
    },
  }),
);

app.use(express.urlencoded({ extended: true }));

app.use("/admin", express.static(path.join(projectRoot, "public", "admin")));

app.get("/admin", (_req, res) => {
  res.redirect("/admin/");
});

app.get("/admin/", (_req, res) => {
  res.sendFile(path.join(projectRoot, "public", "admin", "index.html"));
});

app.use("/api", (_req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.use("/api", maintenanceMiddleware, setupModeMiddleware, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
