import { afterEach, describe, expect, it, vi } from "vitest";

let createMollieClientMock;
let paymentRefundCreateMock;

async function loadMolliePaymentProvider() {
  vi.resetModules();

  paymentRefundCreateMock = vi.fn();

  createMollieClientMock = vi.fn(() => ({
    paymentRefunds: {
      create: paymentRefundCreateMock,
    },
  }));

  vi.doMock("@mollie/api-client", () => ({
    createMollieClient: createMollieClientMock,
  }));

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      payments: {
        mollie: {
          apiKey: "test_mollie_api_key",
        },
      },
    },
  }));

  const module =
    await import("../../../src/modules/payments/providers/mollie.payment.provider.js");

  return module.molliePaymentProvider;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("mollie.payment.provider refunds", () => {
  it("passes the stable idempotency key to Mollie refund creation", async () => {
    const provider = await loadMolliePaymentProvider();

    paymentRefundCreateMock.mockResolvedValue({
      id: "re_mollie_123",
      status: "refunded",

      amount: {
        currency: "EUR",
        value: "25.00",
      },

      createdAt: "2026-08-04T07:00:00.000Z",
    });

    const result = await provider.createRefund({
      providerPaymentId: "tr_mollie_123",

      idempotencyKey: "deposit-refund:ticket-123",

      amount: "25.00",
      currency: "EUR",

      description: "Kaution Refund Ticket TKT-123",

      metadata: {
        orderId: "order-123",
        ticketId: "ticket-123",
      },
    });

    expect(createMollieClientMock).toHaveBeenCalledTimes(1);

    expect(createMollieClientMock).toHaveBeenCalledWith({
      apiKey: "test_mollie_api_key",
    });

    expect(paymentRefundCreateMock).toHaveBeenCalledTimes(1);

    expect(paymentRefundCreateMock).toHaveBeenCalledWith({
      paymentId: "tr_mollie_123",

      amount: {
        currency: "EUR",
        value: "25.00",
      },

      description: "Kaution Refund Ticket TKT-123",

      metadata: {
        orderId: "order-123",
        ticketId: "ticket-123",
      },

      idempotencyKey: "deposit-refund:ticket-123",
    });

    expect(result).toMatchObject({
      provider: "mollie",

      providerPaymentId: "tr_mollie_123",

      providerRefundId: "re_mollie_123",

      status: "refunded",
      rawStatus: "refunded",
    });
  });
});
