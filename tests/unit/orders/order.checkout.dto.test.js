import { describe, expect, it } from "vitest";

import { toPublicCheckoutResultDto } from "../../../src/modules/orders/order.checkout.dto.js";

const IDS = {
  order: "64f200000000000000000001",

  event: "64f200000000000000000002",

  ticketType: "64f200000000000000000003",
};

function buildOrder({
  buyerType = "guest",
  total = 0,
  paymentStatus = "not_required",
  paymentProvider = "none",
} = {}) {
  const isExternal = buyerType === "external_user";

  return {
    id: IDS.order,

    orderNumber: "ORD-20300601-CHECKOUT",

    buyerType,

    buyerExternalProvider: isExternal ? "host-system" : null,

    buyerExternalUserId: isExternal ? "user-123" : null,

    buyerEmailSnapshot: isExternal
      ? "customer@example.com"
      : "guest@example.com",

    buyerFirstNameSnapshot: isExternal ? "External" : "Guest",

    buyerLastNameSnapshot: isExternal ? "Customer" : "Tester",

    buyerDisplayNameSnapshot: "",

    eventId: IDS.event,

    eventTitleSnapshot: "Checkout Event",

    eventSlugSnapshot: "checkout-event",

    eventCategorySnapshot: "event",

    eventLocationSnapshot: "Vienna",

    eventStartsAtSnapshot: "2030-06-10T10:00:00.000Z",

    items: [
      {
        ticketTypeId: IDS.ticketType,

        eventId: IDS.event,

        quantity: 1,

        unitPrice: total,

        lineTotal: total,

        currency: "EUR",

        ticketTypeNameSnapshot: "Checkout Ticket",

        ticketTypeDescriptionSnapshot: "Checkout test ticket",

        ticketKindSnapshot: "normal",
        pricingModeSnapshot: "fixed",
      },
    ],

    currency: "EUR",

    subtotal: total,

    discountCodeIdSnapshot: null,

    discountCodeSnapshot: null,

    discountCodeGroupIdSnapshot: null,

    discountCodeGroupNameSnapshot: null,

    discountPercent: null,

    discountAmount: 0,

    totalPrice: total,

    status: total > 0 ? "pending" : "confirmed",

    paymentStatus,

    paymentProvider,

    paymentProviderPaymentId: "must-not-leak",

    paymentCheckoutUrl: "https://payments.example.test/internal",

    refundStatus: "none",

    refundedAmount: 0,

    refundedAt: null,

    confirmedAt: total > 0 ? null : "2030-06-01T10:01:00.000Z",

    cancelledAt: null,

    cancellationReason: null,

    expiresAt: total > 0 ? "2030-06-01T10:15:00.000Z" : null,

    fulfillmentStatus: "completed",

    fulfillmentLeaseToken: "must-not-leak",

    guestAccessTokenHash: "must-not-leak",

    metadata: {
      internal: true,
    },

    createdAt: "2030-06-01T10:00:00.000Z",

    updatedAt: "2030-06-01T10:01:00.000Z",
  };
}

describe("public checkout result DTO contract", () => {
  it("serializes a free guest checkout using nested data and meta contracts", () => {
    const result = toPublicCheckoutResultDto({
      order: buildOrder(),

      checkout: null,

      guestAccess: {
        orderId: IDS.order,

        token: "guest-access-token",

        expiresAt: new Date("2030-06-02T10:00:00.000Z"),
      },

      documents: {
        skipped: true,

        reason: "ticket_pdf_disabled",

        generated: 0,

        alreadyExisted: 0,

        failed: 0,

        errors: [
          {
            ticketId: "must-not-leak",

            message: "must-not-leak",
          },
        ],
      },

      mail: {
        skipped: true,

        reason: "mail_feature_disabled",

        email: "must-not-leak@example.com",

        mail: {
          providerMessageId: "must-not-leak",
        },
      },

      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: "Order confirmed.",
    });

    expect(result).toMatchObject({
      data: {
        order: {
          id: IDS.order,

          buyer: {
            type: "guest",

            email: "guest@example.com",

            displayName: "Guest Tester",
          },

          pricing: {
            currency: "EUR",

            subtotal: 0,

            discount: null,

            total: 0,
          },

          payment: {
            status: "not_required",

            provider: "none",
          },
        },

        checkout: null,

        guestAccess: {
          orderId: IDS.order,

          accessToken: "guest-access-token",

          expiresAt: "2030-06-02T10:00:00.000Z",
        },
      },

      meta: {
        idempotencyReplayed: false,

        paymentInitializationFailed: false,

        message: "Order confirmed.",

        fulfillment: {
          documents: {
            skipped: true,

            reason: "ticket_pdf_disabled",

            generated: 0,

            alreadyExisted: 0,

            failed: 0,
          },

          mail: {
            skipped: true,

            reason: "mail_feature_disabled",
          },
        },
      },
    });

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",
      "guestAccessTokenHash",
      "fulfillmentLeaseToken",
      "metadata",
      "errors",
      "ticketId",
      "providerMessageId",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("serializes a paid checkout without exposing the provider payment id", () => {
    const result = toPublicCheckoutResultDto({
      order: buildOrder({
        buyerType: "external_user",

        total: 2500,

        paymentStatus: "pending",

        paymentProvider: "mollie",
      }),

      checkout: {
        providerPaymentId: "pay_internal_123",

        checkoutUrl: "https://payments.example.test/pay/123",

        status: "open",
      },

      guestAccess: null,

      documents: null,

      mail: null,

      idempotencyReplayed: false,

      paymentInitializationFailed: false,

      message: null,
    });

    expect(result.data.checkout).toEqual({
      provider: "mollie",

      url: "https://payments.example.test/pay/123",

      status: "open",
    });

    expect(result.data.order.payment).toEqual({
      status: "pending",

      provider: "mollie",
    });

    expect(JSON.stringify(result)).not.toContain("providerPaymentId");
  });

  it("does not use order _id as a compatibility fallback", () => {
    const order = buildOrder();

    order._id = IDS.order;

    order.id = null;

    expect(() =>
      toPublicCheckoutResultDto({
        order,

        checkout: null,

        guestAccess: null,

        documents: null,

        mail: null,

        idempotencyReplayed: false,

        paymentInitializationFailed: false,

        message: null,
      }),
    ).toThrow("Cannot serialize an order without id.");
  });

  it("rejects guest access for a different or non-guest order", () => {
    expect(() =>
      toPublicCheckoutResultDto({
        order: buildOrder(),

        checkout: null,

        guestAccess: {
          orderId: "different-order",

          token: "token",

          expiresAt: "2030-06-02T10:00:00.000Z",
        },

        documents: null,

        mail: null,

        idempotencyReplayed: false,

        paymentInitializationFailed: false,

        message: null,
      }),
    ).toThrow("Cannot serialize guest access for a different order.");

    expect(() =>
      toPublicCheckoutResultDto({
        order: buildOrder({
          buyerType: "external_user",
        }),

        checkout: null,

        guestAccess: {
          orderId: IDS.order,

          token: "token",

          expiresAt: "2030-06-02T10:00:00.000Z",
        },

        documents: null,

        mail: null,

        idempotencyReplayed: false,

        paymentInitializationFailed: false,

        message: null,
      }),
    ).toThrow("Cannot serialize guest access for a non-guest order.");
  });

  it("rejects unsafe replay and payment failure combinations", () => {
    expect(() =>
      toPublicCheckoutResultDto({
        order: buildOrder(),

        checkout: null,

        guestAccess: {
          orderId: IDS.order,

          token: "must-not-replay",

          expiresAt: "2030-06-02T10:00:00.000Z",
        },

        documents: null,

        mail: null,

        idempotencyReplayed: true,

        paymentInitializationFailed: false,

        message: null,
      }),
    ).toThrow(
      "Cannot serialize a guest access token during idempotency replay.",
    );

    expect(() =>
      toPublicCheckoutResultDto({
        order: buildOrder({
          buyerType: "external_user",

          total: 2500,

          paymentStatus: "failed",

          paymentProvider: "mollie",
        }),

        checkout: {
          checkoutUrl: "https://payments.example.test/pay/123",

          status: "open",
        },

        guestAccess: null,

        documents: null,

        mail: null,

        idempotencyReplayed: false,

        paymentInitializationFailed: true,

        message: "Payment initialization failed.",
      }),
    ).toThrow(
      "Cannot serialize a failed payment initialization with an active checkout.",
    );
  });
});
