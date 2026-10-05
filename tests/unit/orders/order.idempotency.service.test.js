import { describe, expect, it } from "vitest";

import {
  buildCheckoutIdempotencyContext,
  buildCheckoutIdempotencyRequestHash,
  buildCheckoutIdempotencyScope,
  normalizeCheckoutIdempotencyKey,
} from "../../../src/modules/orders/order.idempotency.service.js";

describe("Order checkout idempotency service", () => {
  it("normalizes a valid idempotency key", () => {
    expect(normalizeCheckoutIdempotencyKey("  checkout_1234567890  ")).toBe(
      "checkout_1234567890",
    );
  });

  it("rejects a missing idempotency key", () => {
    expect(() => normalizeCheckoutIdempotencyKey("")).toThrow(
      expect.objectContaining({
        code: "ORDER_IDEMPOTENCY_KEY_REQUIRED",
        statusCode: 400,
      }),
    );
  });

  it("rejects malformed idempotency keys", () => {
    expect(() => normalizeCheckoutIdempotencyKey("too-short")).toThrow(
      expect.objectContaining({
        code: "ORDER_IDEMPOTENCY_KEY_INVALID",
        statusCode: 400,
      }),
    );

    expect(() =>
      normalizeCheckoutIdempotencyKey("checkout key with spaces"),
    ).toThrow(
      expect.objectContaining({
        code: "ORDER_IDEMPOTENCY_KEY_INVALID",
        statusCode: 400,
      }),
    );
  });

  it("builds a host-service scope", () => {
    expect(
      buildCheckoutIdempotencyScope({
        isHostService: true,
        externalProvider: "Dummy",
        hostServiceId: "dummy-host-service",
      }),
    ).toBe("host-service:dummy:dummy-host-service");
  });

  it("builds an external-user scope", () => {
    expect(
      buildCheckoutIdempotencyScope({
        isHostService: false,
        externalProvider: "Dummy",
        externalUserId: "host-user-123",
      }),
    ).toBe("external-user:dummy:host-user-123");
  });

  it("rejects identities without a stable scope", () => {
    expect(() =>
      buildCheckoutIdempotencyScope({
        isHostService: true,
        externalProvider: null,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "ORDER_IDEMPOTENCY_SCOPE_UNAVAILABLE",
        statusCode: 401,
      }),
    );
  });

  it("creates the same hash for equivalent object key order", () => {
    const firstHash = buildCheckoutIdempotencyRequestHash({
      eventId: "event-1",
      guest: {
        firstName: "Gast",
        lastName: "Tester",
        email: "gast@example.com",
      },
      items: [
        {
          ticketTypeId: "ticket-1",
          quantity: 2,
        },
      ],
    });

    const secondHash = buildCheckoutIdempotencyRequestHash({
      items: [
        {
          quantity: 2,
          ticketTypeId: "ticket-1",
        },
      ],
      guest: {
        email: "gast@example.com",
        lastName: "Tester",
        firstName: "Gast",
      },
      eventId: "event-1",
    });

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates a different hash when checkout data changes", () => {
    const firstHash = buildCheckoutIdempotencyRequestHash({
      eventId: "event-1",
      items: [
        {
          ticketTypeId: "ticket-1",
          quantity: 1,
        },
      ],
    });

    const secondHash = buildCheckoutIdempotencyRequestHash({
      eventId: "event-1",
      items: [
        {
          ticketTypeId: "ticket-1",
          quantity: 2,
        },
      ],
    });

    expect(firstHash).not.toBe(secondHash);
  });

  it("builds a complete checkout idempotency context", () => {
    const context = buildCheckoutIdempotencyContext({
      actor: {
        isHostService: true,
        externalProvider: "dummy",
        hostServiceId: "dummy-host-service",
      },
      key: "checkout_1234567890",
      payload: {
        eventId: "event-1",
        items: [
          {
            ticketTypeId: "ticket-1",
            quantity: 1,
          },
        ],
      },
    });

    expect(context).toEqual({
      scope: "host-service:dummy:dummy-host-service",
      key: "checkout_1234567890",
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
