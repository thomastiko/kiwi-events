import { describe, expect, it } from "vitest";

import {
  toEventCancellationExecutionDto,
  toEventMailResultDto,
  toEventRefundPreviewDto,
} from "../../../src/modules/events/internal/event.refund.dto.js";

const IDS = {
  event: "64f000000000000000000001",
  order: "64f000000000000000000002",
  paymentRefund: "64f000000000000000000003",
};

function buildPreview() {
  return {
    event: {
      id: IDS.event,
      title: "Refund Event",
      status: "published",
    },

    summary: {
      orderCount: 1,
      refundableOrderCount: 1,
      blockedOrderCount: 0,
      refundAmountTotal: 5000,
    },

    orders: [
      {
        orderId: IDS.order,
        orderNumber: "ORD-001",

        buyer: {
          type: "external_user",
          externalProvider: "dummy",
          externalUserId: "customer-1",
          email: "customer@example.com",
          firstName: "Max",
          lastName: "Kunde",
          displayName: "Max Kunde",
        },

        status: "confirmed",
        paymentStatus: "paid",
        refundStatus: "none",
        totalPrice: 5000,
        currency: "eur",
        ticketCount: 2,
        alreadyRefundedDepositAmount: 0,
        blockingDepositRefunds: [],
        refundable: true,
        localFinalizationOnly: false,
        refundBlocked: false,
        refundBlockedReason: null,
        refundAmount: 5000,
      },
    ],
  };
}

describe("event refund DTO contract", () => {
  it("serializes the canonical refund preview contract", () => {
    const result = toEventRefundPreviewDto(buildPreview());

    expect(result).toMatchObject({
      event: {
        id: IDS.event,
        title: "Refund Event",
        status: "published",
      },

      summary: {
        orderCount: 1,
        refundableOrderCount: 1,
        blockedOrderCount: 0,
        refundAmountTotal: 5000,
      },

      orders: [
        {
          orderId: IDS.order,
          refundAmount: 5000,
          currency: "EUR",
          refundable: true,
        },
      ],
    });

    expect(JSON.stringify(result)).not.toContain('"_id"');
  });

  it("removes raw order and payment refund documents from execution results", () => {
    const result = toEventCancellationExecutionDto({
      eventId: IDS.event,

      refundMode: "all",

      totalOrders: 1,

      cancelledOrders: 1,

      failedCancellations: 0,

      refundRequestedOrders: 1,

      refunds: [
        {
          orderId: IDS.order,

          orderNumber: "ORD-001",

          buyer: {
            type: "external_user",
            email: "customer@example.com",
            displayName: "Max Kunde",
          },

          refund: {
            skipped: false,
            failed: false,
            reason: null,

            order: {
              _id: "must-not-leak",

              status: "cancelled",
              paymentStatus: "refunded",
              refundStatus: "completed",
              refundedAmount: 5000,

              internalField: "must-not-leak",
            },

            refund: {
              provider: "mollie",
              providerPaymentId: "pay_123",
              providerRefundId: "refund_123",
              status: "refunded",
              resumed: false,
            },

            paymentRefund: {
              id: IDS.paymentRefund,
              _id: "must-not-leak",

              sourceType: "order",
              status: "completed",
              provider: "mollie",
              providerRefundId: "refund_123",
              amount: 5000,
              currency: "eur",

              metadata: {
                mustNotLeak: true,
              },

              leaseToken: "must-not-leak",
            },

            localResult: {
              mustNotLeak: true,
            },

            alreadyRefundedDepositAmount: 0,

            remainingRefundAmount: 5000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      eventId: IDS.event,

      refundMode: "all",

      totalOrders: 1,

      cancelledOrders: 1,

      failedCancellations: 0,

      refundRequestedOrders: 1,

      refunds: [
        {
          orderId: IDS.order,
          skipped: false,
          failed: false,
          orderStatus: "cancelled",
          paymentStatus: "refunded",
          refundStatus: "completed",
          refundedAmount: 5000,

          providerRefund: {
            provider: "mollie",
            providerRefundId: "refund_123",
          },

          paymentRefund: {
            id: IDS.paymentRefund,
            sourceType: "order",
            status: "completed",
            amount: 5000,
            currency: "EUR",
          },
        },
      ],
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('"_id"');

    expect(result.refunds[0]).not.toHaveProperty("order");

    expect(serialized).not.toContain('"localResult"');

    expect(serialized).not.toContain('"metadata"');

    expect(serialized).not.toContain('"leaseToken"');
  });

  it("normalizes current batch mail result counts", () => {
    expect(
      toEventMailResultDto({
        skipped: false,
        reason: null,
        sentCount: 3,
        failedCount: 1,
      }),
    ).toEqual({
      skipped: false,
      reason: null,
      sent: 3,
      failed: 1,
    });
  });

  it("returns a safe empty mail result when no mail execution exists", () => {
    expect(toEventMailResultDto(null)).toEqual({
      skipped: true,
      reason: null,
      sent: 0,
      failed: 0,
    });
  });
});
