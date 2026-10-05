import { describe, expect, it } from "vitest";

import paymentWebhookRoutes from "../../../src/modules/payments/webhooks/paymentWebhook.routes.js";
import { paymentWebhookSchema } from "../../../src/modules/payments/webhooks/paymentWebhook.validation.js";

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

describe("payment webhook route contract", () => {
  it("exposes exactly one provider webhook route", () => {
    expect(listDeclaredRoutes(paymentWebhookRoutes)).toEqual([
      {
        method: "POST",
        path: "/:provider",
      },
    ]);
  });

  it.each(["mollie", "stripe"])(
    "accepts the supported %s provider",
    (provider) => {
      const result = paymentWebhookSchema.safeParse({
        body: {
          id: "payment-event",
        },
        params: {
          provider,
        },
        query: {},
      });

      expect(result.success).toBe(true);
    },
  );

  it("rejects disabled and unknown providers", () => {
    for (const provider of ["disabled", "paypal", "unknown"]) {
      const result = paymentWebhookSchema.safeParse({
        body: {},
        params: {
          provider,
        },
        query: {},
      });

      expect(result.success).toBe(false);
    }
  });
});
