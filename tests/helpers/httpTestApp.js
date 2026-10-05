import express from "express";

/**
 * Creates a small Express app for focused route/middleware tests.
 *
 * Use this helper when you want to test one router or middleware in isolation,
 * without importing the full kiwi-events app.js and without starting a real server.
 */
export function createHttpTestApp({
  mountPath = "/api",
  router,
  middlewares = [],
  errorHandler,
  notFoundHandler,
} = {}) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  for (const middleware of middlewares) {
    app.use(middleware);
  }

  if (router) {
    app.use(mountPath, router);
  }

  if (notFoundHandler) {
    app.use(notFoundHandler);
  }

  if (errorHandler) {
    app.use(errorHandler);
  }

  return app;
}
