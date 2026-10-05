import { afterEach, describe, expect, it, vi } from "vitest";

let stripeProviderMock;
let mollieProviderMock;
let customProviderMock;
let getPaymentProviderMock;

async function loadPaymentService({
  provider = "stripe",
  paymentsEnabled = true,
} = {}) {
  vi.resetModules();

  stripeProviderMock = {
    createPaymentSession: vi.fn().mockResolvedValue({
      provider: "stripe",
      providerPaymentId: "stripe-payment-1",
      checkoutUrl: "https://checkout.stripe.test/session-1",
      raw: {
        id: "stripe-payment-1",
      },
    }),
    getPaymentSession: vi.fn().mockResolvedValue({
      provider: "stripe",
      providerPaymentId: "stripe-payment-1",
      status: "paid",
      raw: {
        id: "stripe-payment-1",
      },
    }),
    createRefund: vi.fn().mockResolvedValue({
      provider: "stripe",
      providerRefundId: "stripe-refund-1",
      providerPaymentId: "stripe-payment-1",
      amount: "12.50",
      raw: {
        id: "stripe-refund-1",
      },
    }),
    parseWebhook: vi.fn().mockResolvedValue({
      provider: "stripe",
      providerPaymentId: "stripe-payment-1",
      eventType: "checkout.session.completed",
      rawEvent: {
        id: "evt_1",
      },
    }),
  };

  mollieProviderMock = {
    createPaymentSession: vi.fn().mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "mollie-payment-1",
      checkoutUrl: "https://checkout.mollie.test/payment-1",
      raw: {
        id: "mollie-payment-1",
      },
    }),
    getPaymentSession: vi.fn().mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "mollie-payment-1",
      status: "paid",
      raw: {
        id: "mollie-payment-1",
      },
    }),
    createRefund: vi.fn().mockResolvedValue({
      provider: "mollie",
      providerRefundId: "mollie-refund-1",
      providerPaymentId: "mollie-payment-1",
      amount: "12.50",
      raw: {
        id: "mollie-refund-1",
      },
    }),
    parseWebhook: vi.fn().mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "mollie-payment-1",
      eventType: "payment.paid",
      rawEvent: {
        id: "mollie-event-1",
      },
    }),
  };

  customProviderMock = {
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
    createRefund: vi.fn(),
  };

  getPaymentProviderMock = vi.fn(async (providerName) => {
    if (providerName === "stripe") {
      return stripeProviderMock;
    }

    if (providerName === "mollie") {
      return mollieProviderMock;
    }

    if (providerName === "custom") {
      return customProviderMock;
    }

    const error = new Error(`Unsupported payment provider: ${providerName}`);
    error.statusCode = 400;
    throw error;
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      payments: {
        provider,
      },
    },
  }));

  vi.doMock("../../../src/config/features.js", () => ({
    features: {
      payments: paymentsEnabled,
    },
  }));

  vi.doMock(
    "../../../src/modules/payments/providers/paymentProvider.registry.js",
    () => ({
      getPaymentProvider: getPaymentProviderMock,
    }),
  );

  return import("../../../src/modules/payments/payment.service.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("payment.service", () => {
  it("creates a Stripe payment session using the configured provider and normalizes amount", async () => {
    const { createPaymentSession } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await createPaymentSession({
      amount: 25,
      currency: "EUR",
      description: "Event ticket",
      orderId: "order-1",
      redirectUrl: "https://example.test/redirect",
      webhookUrl: "https://example.test/webhook",
      metadata: {
        eventId: "event-1",
      },
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("stripe");
    expect(stripeProviderMock.createPaymentSession).toHaveBeenCalledTimes(1);
    expect(stripeProviderMock.createPaymentSession).toHaveBeenCalledWith({
      amount: "25.00",
      currency: "EUR",
      description: "Event ticket",
      orderId: "order-1",
      redirectUrl: "https://example.test/redirect",
      webhookUrl: "https://example.test/webhook",
      metadata: {
        eventId: "event-1",
      },
    });
    expect(mollieProviderMock.createPaymentSession).not.toHaveBeenCalled();

    expect(result).toEqual({
      provider: "stripe",
      providerPaymentId: "stripe-payment-1",
      checkoutUrl: "https://checkout.stripe.test/session-1",
      raw: {
        id: "stripe-payment-1",
      },
    });
  });

  it("creates a Mollie payment session using an explicit provider override", async () => {
    const { createPaymentSession } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await createPaymentSession({
      provider: "mollie",
      amount: "12.5",
      currency: "EUR",
      description: "Event ticket",
      orderId: "order-1",
      redirectUrl: "https://example.test/redirect",
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("mollie");
    expect(mollieProviderMock.createPaymentSession).toHaveBeenCalledTimes(1);
    expect(mollieProviderMock.createPaymentSession).toHaveBeenCalledWith({
      amount: "12.50",
      currency: "EUR",
      description: "Event ticket",
      orderId: "order-1",
      redirectUrl: "https://example.test/redirect",
      webhookUrl: undefined,
      metadata: {},
    });
    expect(stripeProviderMock.createPaymentSession).not.toHaveBeenCalled();

    expect(result.provider).toBe("mollie");
    expect(result.providerPaymentId).toBe("mollie-payment-1");
  });

  it("rejects invalid payment session amounts before provider call", async () => {
    const { createPaymentSession } = await loadPaymentService({
      provider: "stripe",
    });

    await expect(
      createPaymentSession({
        amount: -1,
        description: "Invalid amount",
        orderId: "order-1",
        redirectUrl: "https://example.test/redirect",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid payment amount.",
    });

    await expect(
      createPaymentSession({
        amount: "not-a-number",
        description: "Invalid amount",
        orderId: "order-1",
        redirectUrl: "https://example.test/redirect",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid payment amount.",
    });

    expect(stripeProviderMock.createPaymentSession).not.toHaveBeenCalled();
  });

  it("gets a Stripe payment session from the configured provider", async () => {
    const { getPaymentSession } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await getPaymentSession({
      providerPaymentId: "stripe-payment-1",
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("stripe");
    expect(stripeProviderMock.getPaymentSession).toHaveBeenCalledTimes(1);
    expect(stripeProviderMock.getPaymentSession).toHaveBeenCalledWith({
      providerPaymentId: "stripe-payment-1",
    });
    expect(mollieProviderMock.getPaymentSession).not.toHaveBeenCalled();

    expect(result).toEqual({
      provider: "stripe",
      providerPaymentId: "stripe-payment-1",
      status: "paid",
      raw: {
        id: "stripe-payment-1",
      },
    });
  });

  it("gets a Mollie payment session using an explicit provider override", async () => {
    const { getPaymentSession } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await getPaymentSession({
      provider: "mollie",
      providerPaymentId: "mollie-payment-1",
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("mollie");
    expect(mollieProviderMock.getPaymentSession).toHaveBeenCalledTimes(1);
    expect(mollieProviderMock.getPaymentSession).toHaveBeenCalledWith({
      providerPaymentId: "mollie-payment-1",
    });
    expect(stripeProviderMock.getPaymentSession).not.toHaveBeenCalled();

    expect(result.provider).toBe("mollie");
    expect(result.status).toBe("paid");
  });

  it("creates a Stripe refund with providerPaymentId and normalized major-unit amount", async () => {
    const { createPaymentRefund } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await createPaymentRefund({
      providerPaymentId: "stripe-payment-1",
      idempotencyKey: "deposit-refund:ticket-123",
      amount: 12.5,
      currency: "EUR",
      description: "Customer refund",
      metadata: {
        orderId: "order-1",
      },
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("stripe");
    expect(stripeProviderMock.createRefund).toHaveBeenCalledTimes(1);
    expect(stripeProviderMock.createRefund).toHaveBeenCalledWith({
      providerPaymentId: "stripe-payment-1",
      idempotencyKey: "deposit-refund:ticket-123",
      amount: "12.50",
      currency: "EUR",
      description: "Customer refund",
      metadata: {
        orderId: "order-1",
      },
    });
    expect(mollieProviderMock.createRefund).not.toHaveBeenCalled();

    expect(result).toEqual({
      provider: "stripe",
      providerRefundId: "stripe-refund-1",
      providerPaymentId: "stripe-payment-1",
      amount: "12.50",
      raw: {
        id: "stripe-refund-1",
      },
    });
  });

  it("creates a Mollie refund with the stable idempotency key", async () => {
    const { createPaymentRefund } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await createPaymentRefund({
      provider: "mollie",

      providerPaymentId: "mollie-payment-1",

      idempotencyKey: "deposit-refund:ticket-123",

      amount: "12.5",
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("mollie");

    expect(mollieProviderMock.createRefund).toHaveBeenCalledTimes(1);

    expect(mollieProviderMock.createRefund).toHaveBeenCalledWith({
      providerPaymentId: "mollie-payment-1",

      idempotencyKey: "deposit-refund:ticket-123",

      amount: "12.50",
      currency: "EUR",
      description: undefined,
      metadata: {},
    });

    expect(stripeProviderMock.createRefund).not.toHaveBeenCalled();

    expect(result.provider).toBe("mollie");

    expect(result.providerRefundId).toBe("mollie-refund-1");
  });

  it("requires providerPaymentId for refunds before provider call", async () => {
    const { createPaymentRefund } = await loadPaymentService({
      provider: "stripe",
    });

    await expect(
      createPaymentRefund({
        paymentProviderPaymentId: "wrong-field",
        amount: 12.5,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Provider payment id is required.",
    });

    await expect(
      createPaymentRefund({
        providerPaymentId: "",
        amount: 12.5,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Provider payment id is required.",
    });

    expect(getPaymentProviderMock).not.toHaveBeenCalled();
    expect(stripeProviderMock.createRefund).not.toHaveBeenCalled();
    expect(mollieProviderMock.createRefund).not.toHaveBeenCalled();
  });

  it("requires a positive refund amount before provider call", async () => {
    const { createPaymentRefund } = await loadPaymentService({
      provider: "stripe",
    });

    await expect(
      createPaymentRefund({
        providerPaymentId: "stripe-payment-1",
        amount: 0,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid refund amount.",
    });

    await expect(
      createPaymentRefund({
        providerPaymentId: "stripe-payment-1",
        amount: -1,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid refund amount.",
    });

    expect(getPaymentProviderMock).not.toHaveBeenCalled();
    expect(stripeProviderMock.createRefund).not.toHaveBeenCalled();
  });

  it("parses provider webhooks through the configured provider", async () => {
    const { parsePaymentWebhook } = await loadPaymentService({
      provider: "stripe",
    });

    const result = await parsePaymentWebhook({
      provider: "stripe",
      body: {
        id: "evt_1",
      },
      headers: {
        "stripe-signature": "signature",
      },
      rawBody: Buffer.from("{}"),
    });

    expect(getPaymentProviderMock).toHaveBeenCalledWith("stripe");
    expect(stripeProviderMock.parseWebhook).toHaveBeenCalledTimes(1);
    expect(stripeProviderMock.parseWebhook).toHaveBeenCalledWith({
      body: {
        id: "evt_1",
      },
      headers: {
        "stripe-signature": "signature",
      },
      rawBody: Buffer.from("{}"),
    });

    expect(result).toEqual({
      provider: "stripe",
      providerPaymentId: "stripe-payment-1",
      eventType: "checkout.session.completed",
      rawEvent: {
        id: "evt_1",
      },
    });
  });

  it("throws a clean AppError when configured provider is disabled", async () => {
    const { createPaymentSession, createPaymentRefund, getPaymentSession } =
      await loadPaymentService({
        provider: "disabled",
      });

    await expect(
      createPaymentSession({
        amount: 25,
        description: "Event ticket",
        orderId: "order-1",
        redirectUrl: "https://example.test/redirect",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Payment provider is not configured.",
    });

    await expect(
      createPaymentRefund({
        providerPaymentId: "payment-1",
        amount: 12.5,
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Payment provider is not configured.",
    });

    await expect(
      getPaymentSession({
        providerPaymentId: "payment-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Payment provider is not configured.",
    });
  });

  it("throws a clean AppError for unsupported payment providers", async () => {
    const { createPaymentSession, createPaymentRefund, getPaymentSession } =
      await loadPaymentService({
        provider: "paypal",
      });

    await expect(
      createPaymentSession({
        amount: 25,
        description: "Event ticket",
        orderId: "order-1",
        redirectUrl: "https://example.test/redirect",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Unsupported payment provider: paypal",
    });

    await expect(
      createPaymentRefund({
        providerPaymentId: "payment-1",
        amount: 12.5,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Unsupported payment provider: paypal",
    });

    await expect(
      getPaymentSession({
        providerPaymentId: "payment-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Unsupported payment provider: paypal",
    });
  });

  it("bubbles provider failures without calling another provider", async () => {
    const { createPaymentSession } = await loadPaymentService({
      provider: "stripe",
    });

    stripeProviderMock.createPaymentSession.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );

    await expect(
      createPaymentSession({
        amount: 25,
        currency: "EUR",
        description: "Event ticket",
        orderId: "order-1",
        redirectUrl: "https://example.test/redirect",
      }),
    ).rejects.toThrow("Stripe unavailable");

    expect(stripeProviderMock.createPaymentSession).toHaveBeenCalledTimes(1);
    expect(mollieProviderMock.createPaymentSession).not.toHaveBeenCalled();
  });
});
