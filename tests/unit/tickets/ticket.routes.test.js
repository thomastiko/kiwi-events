import { describe, expect, it } from "vitest";

import adminTicketRoutes from "../../../src/modules/tickets/internal/ticket.internal.routes.js";
import publicTicketRoutes from "../../../src/modules/tickets/public/ticket.public.routes.js";

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

describe("ticket route contracts", () => {
  it("exposes only guest and own-ticket routes through the public router", () => {
    expect(listDeclaredRoutes(publicTicketRoutes)).toEqual([
      {
        method: "GET",
        path: "/guest/:id/qr",
      },
      {
        method: "GET",
        path: "/guest/:id/document",
      },
      {
        method: "GET",
        path: "/",
      },
      {
        method: "GET",
        path: "/:id/qr",
      },
      {
        method: "GET",
        path: "/:id/document",
      },
      {
        method: "GET",
        path: "/:id",
      },
    ]);
  });

  it("exposes only staff and check-in routes through the admin router", () => {
    expect(listDeclaredRoutes(adminTicketRoutes)).toEqual([
      {
        method: "POST",
        path: "/check-in/lookup",
      },
      {
        method: "POST",
        path: "/check-in/confirm",
      },
      {
        method: "POST",
        path: "/check-in/qr/lookup",
      },
      {
        method: "POST",
        path: "/check-in/qr/confirm",
      },
      {
        method: "GET",
        path: "/event/:eventId",
      },
      {
        method: "GET",
        path: "/:id",
      },
      {
        method: "PATCH",
        path: "/:id/cancel",
      },
      {
        method: "PATCH",
        path: "/:id/check-in",
      },
    ]);
  });

  it("contains no legacy internal ticket paths", () => {
    const allRoutes = [
      ...listDeclaredRoutes(publicTicketRoutes),
      ...listDeclaredRoutes(adminTicketRoutes),
    ];

    expect(allRoutes.some(({ path }) => path.includes("/internal"))).toBe(
      false,
    );
  });
});
