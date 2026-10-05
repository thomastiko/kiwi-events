import { afterEach, describe, expect, it, vi } from "vitest";

let StripeConstructorMock;
let checkoutSessionCreateMock;
let checkoutSessionRetrieveMock;
let refundCreateMock;
let constructEventMock;

async function loadStripePaymentProvider({
  webhookSecret = "whsec_test_123",
  nodeEnv = "test",
} = {}) {
  vi.resetModules();

  checkoutSessionCreateMock = vi.fn();
  checkoutSessionRetrieveMock = vi.fn();
  refundCreateMock = vi.fn();
  constructEventMock = vi.fn();

  StripeConstructorMock = vi.fn(function Stripe() {
    return {
      checkout: {
        sessions: {
          create: checkoutSessionCreateMock,
          retrieve: checkoutSessionRetrieveMock,
        },
      },

      refunds: {
        create: refundCreateMock,
      },

      webhooks: {
        constructEvent: constructEventMock,
      },
    };
  });

  vi.doMock("stripe", () => ({
    default: StripeConstructorMock,
  }));

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      nodeEnv,

      frontendUrl: "https://events.example.test",
      adminFrontendUrl: "https://admin.example.test",

      payments: {
        stripe: {
          secretKey: "sk_test_123",
          webhookSecret,
          successUrl:
            "https://events.example.test/payment-return?session_id={CHECKOUT_SESSION_ID}",
          cancelUrl: "https://events.example.test/payment-cancelled",
        },
      },
    },
  }));

  const module =
    await import("../../../src/modules/payments/providers/stripe.payment.provider.js");

  return module.stripePaymentProvider;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});
describe("stripe.payment.provider Checkout Session creation", () => {
  it("creates a Stripe Checkout Session with canonical order metadata", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionCreateMock.mockResolvedValue({
      id: "cs_test_checkout_123",
      url: "https://checkout.stripe.test/c/pay/cs_test_checkout_123",
      status: "open",
      payment_status: "unpaid",
      payment_intent: "pi_test_checkout_123",
    });

    const result = await provider.createPaymentSession({
      amount: "12.34",
      currency: "EUR",
      description: "Kiwi Events Ticket",
      orderId: "order-42",
      redirectUrl: "https://events.example.test/payment-return?order=order-42",
      metadata: {
        orderId: "forged-order-id",
        orderNumber: "KE-2026-0042",
        eventId: "event-123",
      },
    });

    expect(StripeConstructorMock).toHaveBeenCalledTimes(1);
    expect(StripeConstructorMock).toHaveBeenCalledWith("sk_test_123");

    expect(checkoutSessionCreateMock).toHaveBeenCalledTimes(1);
    expect(checkoutSessionCreateMock).toHaveBeenCalledWith({
      mode: "payment",

      success_url: "https://events.example.test/payment-return?order=order-42",

      cancel_url: "https://events.example.test/payment-cancelled",

      line_items: [
        {
          quantity: 1,

          price_data: {
            currency: "eur",
            unit_amount: 1234,

            product_data: {
              name: "Kiwi Events Ticket",
            },
          },
        },
      ],

      metadata: {
        orderNumber: "KE-2026-0042",
        eventId: "event-123",
        orderId: "order-42",
      },

      payment_intent_data: {
        metadata: {
          orderNumber: "KE-2026-0042",
          eventId: "event-123",
          orderId: "order-42",
        },
      },
    });

    expect(result).toEqual({
      provider: "stripe",
      providerPaymentId: "cs_test_checkout_123",
      providerIntentId: "pi_test_checkout_123",
      checkoutUrl: "https://checkout.stripe.test/c/pay/cs_test_checkout_123",
      status: "open",
      rawStatus: "open",

      rawPayment: {
        id: "cs_test_checkout_123",
        url: "https://checkout.stripe.test/c/pay/cs_test_checkout_123",
        status: "open",
        payment_status: "unpaid",
        payment_intent: "pi_test_checkout_123",
      },
    });
  });
});
describe("stripe.payment.provider Checkout Session retrieval", () => {
  it("retrieves and normalizes a paid Checkout Session", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_paid",
      url: null,
      status: "complete",
      payment_status: "paid",
      created: 1_700_000_000,

      payment_intent: {
        id: "pi_test_paid",

        latest_charge: {
          id: "ch_test_paid",
          created: 1_700_000_123,
        },
      },
    });

    const result = await provider.getPaymentSession({
      providerPaymentId: "cs_test_paid",
    });

    expect(checkoutSessionRetrieveMock).toHaveBeenCalledTimes(1);
    expect(checkoutSessionRetrieveMock).toHaveBeenCalledWith("cs_test_paid", {
      expand: ["payment_intent.latest_charge"],
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_paid",
      providerIntentId: "pi_test_paid",
      checkoutUrl: null,
      status: "paid",
      rawStatus: "complete",
      paidAt: new Date(1_700_000_123 * 1000).toISOString(),
    });
  });

  it("maps an incomplete open Checkout Session to open", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_open",
      url: "https://checkout.stripe.test/c/pay/cs_test_open",
      status: "open",
      payment_status: "unpaid",
      payment_intent: null,
    });

    const result = await provider.getPaymentSession({
      providerPaymentId: "cs_test_open",
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_open",
      providerIntentId: null,
      status: "open",
      rawStatus: "open",
      paidAt: null,
    });
  });

  it("maps a completed but unpaid Checkout Session to pending", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_pending",
      url: null,
      status: "complete",
      payment_status: "unpaid",

      payment_intent: {
        id: "pi_test_pending",
        latest_charge: null,
      },
    });

    const result = await provider.getPaymentSession({
      providerPaymentId: "cs_test_pending",
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_pending",
      providerIntentId: "pi_test_pending",
      status: "pending",
      rawStatus: "complete",
      paidAt: null,
    });
  });

  it("maps an expired Checkout Session to expired", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_expired",
      url: null,
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
    });

    const result = await provider.getPaymentSession({
      providerPaymentId: "cs_test_expired",
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_expired",
      providerIntentId: null,
      status: "expired",
      rawStatus: "expired",
      paidAt: null,
    });
  });

  it("treats a no-payment-required Checkout Session as paid", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_no_payment",
      url: null,
      status: "complete",
      payment_status: "no_payment_required",
      created: 1_700_000_500,
      payment_intent: null,
    });

    const result = await provider.getPaymentSession({
      providerPaymentId: "cs_test_no_payment",
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_no_payment",
      providerIntentId: null,
      status: "paid",
      rawStatus: "complete",
      paidAt: null,
    });
  });
});
describe("stripe.payment.provider refunds", () => {
  it("creates an idempotent partial refund against the Checkout Session PaymentIntent", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_refund_123",

      payment_intent: {
        id: "pi_test_refund_123",
      },
    });

    refundCreateMock.mockResolvedValue({
      id: "re_test_refund_123",
      status: "succeeded",
      amount: 1234,
      created: 1_700_000_321,
    });

    const result = await provider.createRefund({
      providerPaymentId: "cs_test_refund_123",
      amount: "12.34",
      currency: "eur",
      description: "Deposit refund",
      idempotencyKey: "deposit-refund:ticket-123",

      metadata: {
        orderId: "order-123",
        ticketId: "ticket-123",
        attempt: 2,

        /*
         * These caller values must not override canonical refund metadata.
         */
        description: "forged description",
        currency: "usd",

        /*
         * Stripe metadata must not receive nullish values.
         */
        optionalValue: null,
      },
    });

    expect(checkoutSessionRetrieveMock).toHaveBeenCalledTimes(1);
    expect(checkoutSessionRetrieveMock).toHaveBeenCalledWith(
      "cs_test_refund_123",
      {
        expand: ["payment_intent"],
      },
    );

    expect(refundCreateMock).toHaveBeenCalledTimes(1);
    expect(refundCreateMock).toHaveBeenCalledWith(
      {
        payment_intent: "pi_test_refund_123",
        amount: 1234,

        metadata: {
          orderId: "order-123",
          ticketId: "ticket-123",
          attempt: "2",
          description: "Deposit refund",
          currency: "EUR",
        },
      },
      {
        idempotencyKey: "deposit-refund:ticket-123",
      },
    );

    expect(result).toEqual({
      provider: "stripe",
      providerPaymentId: "cs_test_refund_123",
      providerRefundId: "re_test_refund_123",
      status: "refunded",
      rawStatus: "succeeded",
      amount: 1234,
      createdAt: new Date(1_700_000_321 * 1000).toISOString(),

      rawRefund: {
        id: "re_test_refund_123",
        status: "succeeded",
        amount: 1234,
        created: 1_700_000_321,
      },
    });
  });

  it("supports a PaymentIntent returned as an id string", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_string_intent",
      payment_intent: "pi_test_string_intent",
    });

    refundCreateMock.mockResolvedValue({
      id: "re_test_string_intent",
      status: "pending",
      amount: 2500,
      created: null,
    });

    const result = await provider.createRefund({
      providerPaymentId: "cs_test_string_intent",
      amount: "25.00",
      currency: "EUR",
      description: "Order refund",
      idempotencyKey: "order-refund:order-456",
    });

    expect(refundCreateMock).toHaveBeenCalledWith(
      {
        payment_intent: "pi_test_string_intent",
        amount: 2500,

        metadata: {
          description: "Order refund",
          currency: "EUR",
        },
      },
      {
        idempotencyKey: "order-refund:order-456",
      },
    );

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_string_intent",
      providerRefundId: "re_test_string_intent",
      status: "pending",
      rawStatus: "pending",
      amount: 2500,
      createdAt: null,
    });
  });

  it.each([
    ["succeeded", "refunded"],
    ["pending", "pending"],
    ["failed", "failed"],
    ["canceled", "canceled"],
  ])(
    "maps Stripe refund status %s to %s",
    async (stripeStatus, expectedStatus) => {
      const provider = await loadStripePaymentProvider();

      checkoutSessionRetrieveMock.mockResolvedValue({
        id: `cs_test_${stripeStatus}`,
        payment_intent: `pi_test_${stripeStatus}`,
      });

      refundCreateMock.mockResolvedValue({
        id: `re_test_${stripeStatus}`,
        status: stripeStatus,
        amount: 100,
        created: 1_700_000_000,
      });

      const result = await provider.createRefund({
        providerPaymentId: `cs_test_${stripeStatus}`,
        amount: "1.00",
        idempotencyKey: `refund-status:${stripeStatus}`,
      });

      expect(result.status).toBe(expectedStatus);
      expect(result.rawStatus).toBe(stripeStatus);
    },
  );

  it("rejects a refund when the Checkout Session has no PaymentIntent", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_without_intent",
      payment_intent: null,
    });

    await expect(
      provider.createRefund({
        providerPaymentId: "cs_test_without_intent",
        amount: "12.34",
        idempotencyKey: "refund-without-intent",
      }),
    ).rejects.toMatchObject({
      code: "STRIPE_PAYMENT_INTENT_MISSING",
    });

    expect(refundCreateMock).not.toHaveBeenCalled();
  });

  it("propagates Stripe refund API errors without reporting a successful refund", async () => {
    const provider = await loadStripePaymentProvider();

    checkoutSessionRetrieveMock.mockResolvedValue({
      id: "cs_test_refund_error",
      payment_intent: "pi_test_refund_error",
    });

    const stripeError = Object.assign(
      new Error("Refund amount exceeds the remaining refundable amount."),
      {
        type: "StripeInvalidRequestError",
        code: "amount_too_large",
      },
    );

    refundCreateMock.mockRejectedValue(stripeError);

    await expect(
      provider.createRefund({
        providerPaymentId: "cs_test_refund_error",
        amount: "99.00",
        idempotencyKey: "refund-error:test",
      }),
    ).rejects.toBe(stripeError);
  });
});
describe("stripe.payment.provider webhook handling", () => {
  it("verifies and normalizes a paid Checkout Session event", async () => {
    const provider = await loadStripePaymentProvider();

    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_checkout_completed",
      }),
    );

    const verifiedEvent = {
      id: "evt_checkout_completed",
      type: "checkout.session.completed",

      data: {
        object: {
          id: "cs_test_123",
          payment_status: "paid",
          status: "complete",

          metadata: {
            orderId: "order-123",
          },
        },
      },
    };

    constructEventMock.mockReturnValue(verifiedEvent);

    const result = provider.parseWebhook({
      body: {
        forged: true,
      },

      headers: {
        "stripe-signature": "test-signature",
      },

      rawBody,
    });

    expect(constructEventMock).toHaveBeenCalledTimes(1);
    expect(constructEventMock).toHaveBeenCalledWith(
      rawBody,
      "test-signature",
      "whsec_test_123",
    );

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_123",
      eventType: "checkout.session.completed",
      orderId: "order-123",
      status: "paid",
      ignored: false,
    });

    expect(result.rawEvent).toBe(verifiedEvent);
  });

  it("requires the Stripe webhook secret in every environment", async () => {
    const provider = await loadStripePaymentProvider({
      webhookSecret: null,
      nodeEnv: "test",
    });

    let thrownError = null;

    try {
      provider.parseWebhook({
        body: {
          id: "evt_unsigned",
        },

        headers: {},
        rawBody: Buffer.from("{}"),
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      code: "STRIPE_WEBHOOK_SECRET_MISSING",
    });

    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("ignores Stripe events whose object is not a Checkout Session", async () => {
    const provider = await loadStripePaymentProvider();

    const verifiedEvent = {
      id: "evt_payment_intent",
      type: "payment_intent.succeeded",

      data: {
        object: {
          id: "pi_test_123",

          metadata: {
            orderId: "order-123",
          },
        },
      },
    };

    constructEventMock.mockReturnValue(verifiedEvent);

    const result = provider.parseWebhook({
      body: {},
      headers: {
        "stripe-signature": "test-signature",
      },
      rawBody: Buffer.from("{}"),
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: null,
      eventType: "payment_intent.succeeded",
      ignored: true,
      ignoreReason: "unsupported_event_type",
    });
  });

  it("maps an asynchronous Checkout payment failure to failed", async () => {
    const provider = await loadStripePaymentProvider();

    const verifiedEvent = {
      id: "evt_async_failed",
      type: "checkout.session.async_payment_failed",

      data: {
        object: {
          id: "cs_test_failed",
          payment_status: "unpaid",
          status: "complete",

          metadata: {
            orderId: "order-failed",
          },
        },
      },
    };

    constructEventMock.mockReturnValue(verifiedEvent);

    const result = provider.parseWebhook({
      body: {},
      headers: {
        "stripe-signature": "test-signature",
      },
      rawBody: Buffer.from("{}"),
    });

    expect(result).toMatchObject({
      provider: "stripe",
      providerPaymentId: "cs_test_failed",
      eventType: "checkout.session.async_payment_failed",
      orderId: "order-failed",
      status: "failed",
      ignored: false,
    });
  });
});
