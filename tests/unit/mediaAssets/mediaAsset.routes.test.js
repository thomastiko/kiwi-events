import { describe, expect, it } from "vitest";

import internalMediaAssetRoutes from "../../../src/modules/mediaAssets/internal/mediaAsset.internal.routes.js";

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

describe("internal media asset route contract", () => {
  it("exposes only listing and deletion for standalone media assets", () => {
    expect(listDeclaredRoutes(internalMediaAssetRoutes)).toEqual([
      {
        method: "GET",
        path: "/events",
      },
      {
        method: "DELETE",
        path: "/events/:id",
      },
    ]);
  });

  it("does not expose a standalone media upload endpoint", () => {
    const routes = listDeclaredRoutes(internalMediaAssetRoutes);

    expect(
      routes.some(
        ({ method, path }) => method === "POST" && path === "/events",
      ),
    ).toBe(false);
  });
});
