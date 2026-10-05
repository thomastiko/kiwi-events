import { describe, expect, it } from "vitest";

import eventRoutes from "../../../src/modules/events/internal/event.internal.routes.js";

function listDeclaredRoutes(router) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => {
      const methods = Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase());

      return methods.map((method) => ({
        method,
        path: layer.route.path,
      }));
    });
}

describe("ticket template route contract", () => {
  it("exposes the event-scoped template and image endpoints", () => {
    const routes = listDeclaredRoutes(eventRoutes);

    expect(routes).toEqual(
      expect.arrayContaining([
        {
          method: "GET",
          path: "/:id/ticket-template",
        },
        {
          method: "PUT",
          path: "/:id/ticket-template",
        },
        {
          method: "DELETE",
          path: "/:id/ticket-template",
        },
        {
          method: "POST",
          path: "/:id/ticket-template/images",
        },
        {
          method: "DELETE",
          path: "/:id/ticket-template/images/:assetId",
        },
      ]),
    );
  });

  it("declares ticket-template routes before the generic event detail route", () => {
    const routes = listDeclaredRoutes(eventRoutes);

    const genericDetailIndex = routes.findIndex(
      ({ method, path }) => method === "GET" && path === "/:id",
    );

    const templateRouteIndexes = routes
      .map((route, index) => ({
        route,
        index,
      }))
      .filter(({ route }) => route.path.includes("/ticket-template"))
      .map(({ index }) => index);

    expect(genericDetailIndex).toBeGreaterThan(-1);
    expect(templateRouteIndexes).toHaveLength(5);

    for (const index of templateRouteIndexes) {
      expect(index).toBeLessThan(genericDetailIndex);
    }
  });
});
