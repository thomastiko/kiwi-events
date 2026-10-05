import { describe, expect, it } from "vitest";

import {
  toAdminManualOrderResultDto,
  toAdminOrderDetailDto,
  toAdminOrderDetailMetaDto,
  toAdminOrderDto,
  toAdminOrderListMetaDto,
  toPublicOrderDto,
} from "../../../src/modules/orders/order.dto.js";

const IDS = {
  order: "64f000000000000000000001",
  event: "64f000000000000000000002",
  ticketType: "64f000000000000000000003",

  createdByEventUser: "64f000000000000000000004",

  updatedByEventUser: "64f000000000000000000005",

  ticket: "64f000000000000000000006",

  checkedInByEventUser: "64f000000000000000000007",

  discountCode: "64f000000000000000000008",
  discountCodeGroup: "64f000000000000000000009",
};
function buildAdminOrderActions() {
  return {
    editBuyer: {
      allowed: true,
      reason: null,
    },

    cancel: {
      allowed: true,
      reason: null,
    },

    refund: {
      allowed: false,
      reason: "payment_not_paid",
    },

    mailResend: {
      orderConfirmed: {
        allowed: true,
        reason: null,
      },

      orderCancelled: {
        allowed: false,
        reason: "order_not_cancelled",
      },

      orderRefunded: {
        allowed: false,
        reason: "order_refund_not_completed",
      },

      eventCancelled: {
        allowed: false,
        reason: "event_not_cancelled",
      },
    },
  };
}
function buildOrder() {
  return {
    id: IDS.order,

    orderNumber: "ORD-20300601-ABC123",

    buyerType: "external_user",

    buyerExternalProvider: "host-system",

    buyerExternalUserId: "user-123",

    buyerEmailSnapshot: "BUYER@EXAMPLE.COM",

    buyerFirstNameSnapshot: "Ada",

    buyerLastNameSnapshot: "Lovelace",

    buyerDisplayNameSnapshot: "",

    buyerRawExternalSnapshot: {
      claim: "must-not-leak",
    },

    eventId: IDS.event,

    eventTitleSnapshot: "DTO Event",

    eventSlugSnapshot: "dto-event",

    eventCategorySnapshot: "event",

    eventLocationSnapshot: "Vienna",

    eventStartsAtSnapshot: "2030-06-10T10:00:00.000Z",

    items: [
      {
        ticketTypeId: IDS.ticketType,

        eventId: IDS.event,

        quantity: 2,
        unitPrice: 2500,
        lineTotal: 5000,
        currency: "EUR",

        ticketTypeNameSnapshot: "Standard",

        ticketTypeDescriptionSnapshot: "Standard ticket",

        ticketKindSnapshot: "normal",
        pricingModeSnapshot: "fixed",
      },
    ],

    currency: "eur",
    subtotal: 5000,

    discountCodeIdSnapshot: null,
    discountCodeSnapshot: null,
    discountCodeGroupIdSnapshot: null,
    discountCodeGroupNameSnapshot: null,
    discountPercent: null,
    discountAmount: 0,

    totalPrice: 5000,

    status: "pending",

    paymentStatus: "pending",

    paymentProvider: "mollie",

    paymentProviderPaymentId: "pay_internal",

    paymentCheckoutUrl: "https://payments.invalid/checkout",

    refundStatus: "none",

    refundReason: "must-not-leak",

    refundedAmount: 0,

    paymentProviderRefundId: "must-not-leak",

    refundedAt: null,
    refundFailedAt: null,

    fulfillmentStatus: "processing",

    fulfillmentStep: "tickets",

    fulfillmentLeaseToken: "must-not-leak",

    fulfillmentLastError: "must-not-leak",

    guestAccessTokenHash: "must-not-leak",

    guestAccessTokenExpiresAt: "2030-06-11T10:00:00.000Z",

    metadata: {
      internal: true,
    },

    source: "public",

    manualAssignmentReason: null,

    createdByEventUserId: IDS.createdByEventUser,

    updatedByEventUserId: IDS.updatedByEventUser,

    confirmedAt: null,
    cancelledAt: null,
    cancellationReason: null,

    expiresAt: "2030-06-10T09:30:00.000Z",

    createdAt: "2030-06-01T10:00:00.000Z",

    updatedAt: "2030-06-01T10:05:00.000Z",
  };
}
function buildManualOrder() {
  const order = buildOrder();

  return {
    ...order,

    buyerType: "manual",

    buyerExternalProvider: null,

    buyerExternalUserId: null,

    source: "manual",

    manualAssignmentReason: "Assigned by admin",

    items: [
      {
        ...order.items[0],

        quantity: 1,

        lineTotal: 2500,
      },
    ],

    subtotal: 2500,

    totalPrice: 2500,

    status: "confirmed",

    paymentStatus: "not_required",

    paymentProvider: "none",

    confirmedAt: "2030-06-01T10:06:00.000Z",

    fulfillmentStatus: "completed",

    expiresAt: null,
  };
}
function buildTicket({ orderId = IDS.order, eventId = IDS.event } = {}) {
  return {
    id: IDS.ticket,

    ticketCode: "TKT-ABCDEFGH",

    orderId,

    eventId,

    ticketTypeId: IDS.ticketType,

    buyerType: "external_user",

    buyerExternalProvider: "host-system",

    buyerExternalUserId: "user-123",

    buyerEmailSnapshot: "BUYER@EXAMPLE.COM",

    buyerFirstNameSnapshot: "Ada",

    buyerLastNameSnapshot: "Lovelace",

    buyerDisplayNameSnapshot: "",

    holderType: "buyer",

    holderEmailSnapshot: "BUYER@EXAMPLE.COM",

    holderFirstNameSnapshot: "Ada",

    holderLastNameSnapshot: "Lovelace",

    holderDisplayNameSnapshot: "",

    eventTitleSnapshot: "DTO Event",

    eventSlugSnapshot: "dto-event",

    eventCategorySnapshot: "event",

    eventStartsAtSnapshot: "2030-06-10T10:00:00.000Z",

    ticketTypeNameSnapshot: "Standard",

    ticketTypeDescriptionSnapshot: "Standard ticket",

    ticketKind: "normal",

    currency: "eur",

    unitPrice: 2500,

    status: "active",

    checkedInAt: null,

    checkedInByEventUserId: null,

    cancelledAt: null,

    cancellationReason: null,

    ticketPdfStorageKey: "private/tickets/ticket.pdf",
    ticketPdfStorageTarget: "private",

    ticketPdfGeneratedAt: "2030-06-01T10:10:00.000Z",

    depositRefundStatus: "not_required",

    depositRefundAmount: 0,

    depositRefundCurrency: "eur",

    depositRefundTriggeredAt: null,

    depositRefundProviderRefundId: null,

    depositRefundTriggeredByEventUserId: null,

    depositRefundFailureReason: null,

    createdByEventUserId: IDS.createdByEventUser,

    updatedByEventUserId: IDS.updatedByEventUser,

    checkInTokenHash: "must-not-leak",

    encryptedCheckInToken: "must-not-leak",

    ticketPdfStorageProvider: "local",

    metadata: {
      internal: true,
    },

    createdAt: "2030-06-01T10:00:00.000Z",

    updatedAt: "2030-06-01T10:05:00.000Z",
  };
}
describe("public order DTO contract", () => {
  it("serializes the canonical public order contract", () => {
    const result = toPublicOrderDto(buildOrder());

    expect(result).toEqual({
      id: IDS.order,

      orderNumber: "ORD-20300601-ABC123",

      buyer: {
        type: "external_user",

        email: "buyer@example.com",

        firstName: "Ada",

        lastName: "Lovelace",

        displayName: "Ada Lovelace",
      },

      event: {
        id: IDS.event,

        title: "DTO Event",

        slug: "dto-event",

        category: "event",

        location: "Vienna",

        startsAt: "2030-06-10T10:00:00.000Z",
      },

      items: [
        {
          ticketType: {
            id: IDS.ticketType,

            displayName: "Standard",

            description: "Standard ticket",

            kind: "normal",
            pricingMode: "fixed",
          },

          quantity: 2,
          unitPrice: 2500,
          lineTotal: 5000,
        },
      ],

      pricing: {
        currency: "EUR",

        subtotal: 5000,

        discount: null,

        total: 5000,
      },

      status: "pending",

      payment: {
        status: "pending",

        provider: "mollie",
      },

      refund: {
        status: "none",

        amount: 0,

        refundedAt: null,
      },

      confirmedAt: null,

      cancelledAt: null,

      cancellationReason: null,

      expiresAt: "2030-06-10T09:30:00.000Z",

      createdAt: "2030-06-01T10:00:00.000Z",

      updatedAt: "2030-06-01T10:05:00.000Z",
    });
  });

  it("serializes an immutable discount snapshot", () => {
    const order = buildOrder();

    order.discountCodeIdSnapshot = IDS.discountCode;
    order.discountCodeSnapshot = "PARTNER15";
    order.discountCodeGroupIdSnapshot = IDS.discountCodeGroup;
    order.discountCodeGroupNameSnapshot = "Partner";
    order.discountPercent = 15;
    order.discountAmount = 750;
    order.totalPrice = 4250;

    expect(toPublicOrderDto(order).pricing).toEqual({
      currency: "EUR",
      subtotal: 5000,
      discount: {
        codeId: IDS.discountCode,
        code: "PARTNER15",
        group: {
          id: IDS.discountCodeGroup,
          name: "Partner",
        },
        percent: 15,
        amount: 750,
      },
      total: 4250,
    });
  });

  it("rejects incomplete or mathematically inconsistent discount snapshots", () => {
    const snapshotWithoutAmount = buildOrder();

    snapshotWithoutAmount.discountCodeIdSnapshot = IDS.discountCode;
    snapshotWithoutAmount.discountCodeSnapshot = "PARTNER15";
    snapshotWithoutAmount.discountCodeGroupIdSnapshot = IDS.discountCodeGroup;
    snapshotWithoutAmount.discountCodeGroupNameSnapshot = "Partner";

    expect(() => toPublicOrderDto(snapshotWithoutAmount)).toThrow(
      "Cannot serialize an order with a discount snapshot but no discount amount.",
    );

    const inconsistentAmount = buildOrder();

    inconsistentAmount.discountCodeIdSnapshot = IDS.discountCode;
    inconsistentAmount.discountCodeSnapshot = "PARTNER15";
    inconsistentAmount.discountCodeGroupIdSnapshot = IDS.discountCodeGroup;
    inconsistentAmount.discountCodeGroupNameSnapshot = "Partner";
    inconsistentAmount.discountPercent = 15;
    inconsistentAmount.discountAmount = 749;
    inconsistentAmount.totalPrice = 4251;

    expect(() => toPublicOrderDto(inconsistentAmount)).toThrow(
      "Cannot serialize an order with an inconsistent discount amount.",
    );

    const invalidPercent = buildOrder();

    invalidPercent.discountCodeIdSnapshot = IDS.discountCode;
    invalidPercent.discountCodeSnapshot = "PARTNER15";
    invalidPercent.discountCodeGroupIdSnapshot = IDS.discountCodeGroup;
    invalidPercent.discountCodeGroupNameSnapshot = "Partner";
    invalidPercent.discountPercent = 101;
    invalidPercent.discountAmount = 1;
    invalidPercent.totalPrice = 4999;

    expect(() => toPublicOrderDto(invalidPercent)).toThrow(
      "Cannot serialize an order with an invalid discount percent.",
    );
  });

  it("does not expose persistence or operational internals", () => {
    const serialized = JSON.stringify(toPublicOrderDto(buildOrder()));

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "buyerRawExternalSnapshot",
      "paymentProviderPaymentId",
      "paymentCheckoutUrl",
      "refundReason",
      "paymentProviderRefundId",
      "refundFailedAt",
      "fulfillmentStatus",
      "fulfillmentStep",
      "fulfillmentLeaseToken",
      "fulfillmentLastError",
      "guestAccessTokenHash",
      "guestAccessTokenExpiresAt",
      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("does not use _id as a compatibility fallback", () => {
    const order = buildOrder();

    order._id = IDS.order;

    order.id = null;

    expect(() => toPublicOrderDto(order)).toThrow(
      "Cannot serialize an order without id.",
    );
  });

  it("rejects inconsistent persisted totals", () => {
    const invalidItem = buildOrder();

    invalidItem.items[0].lineTotal = 4999;

    expect(() => toPublicOrderDto(invalidItem)).toThrow(
      "Cannot serialize an order item with an inconsistent line total.",
    );

    const invalidSubtotal = buildOrder();

    invalidSubtotal.subtotal = 4999;

    expect(() => toPublicOrderDto(invalidSubtotal)).toThrow(
      "Cannot serialize an order with an inconsistent subtotal.",
    );

    const invalidTotal = buildOrder();

    invalidTotal.totalPrice = 4999;

    expect(() => toPublicOrderDto(invalidTotal)).toThrow(
      "Cannot serialize an order with an inconsistent total price.",
    );
  });

  it("rejects ambiguous dates and incomplete external identities", () => {
    const invalidDate = buildOrder();

    invalidDate.createdAt = "2030-06-01 10:00:00";

    expect(() => toPublicOrderDto(invalidDate)).toThrow(
      "Cannot serialize an API date without an explicit timezone.",
    );

    const invalidBuyer = buildOrder();

    invalidBuyer.buyerExternalUserId = null;

    expect(() => toPublicOrderDto(invalidBuyer)).toThrow(
      "Cannot serialize an external order buyer without provider and user id.",
    );
  });
});
describe("admin order DTO contract", () => {
  it("serializes the canonical admin order contract", () => {
    const order = buildOrder();

    const result = toAdminOrderDto(order);

    expect(result).toEqual({
      ...toPublicOrderDto(order),

      buyer: {
        ...toPublicOrderDto(order).buyer,

        externalIdentity: {
          provider: "host-system",

          userId: "user-123",
        },
      },

      source: "public",

      manualAssignmentReason: null,

      audit: {
        createdByEventUserId: IDS.createdByEventUser,

        updatedByEventUserId: IDS.updatedByEventUser,
      },
    });
  });

  it("uses null external identity for manual and guest buyers", () => {
    for (const buyerType of ["manual", "guest"]) {
      const order = buildOrder();

      order.buyerType = buyerType;

      order.buyerExternalProvider = null;

      order.buyerExternalUserId = null;

      order.source = buyerType === "manual" ? "manual" : "public";

      order.manualAssignmentReason =
        buyerType === "manual" ? "Assigned at the event desk" : null;

      const result = toAdminOrderDto(order);

      expect(result.buyer.externalIdentity).toBeNull();
    }
  });

  it("does not expose persistence, payment, guest-access or fulfillment internals", () => {
    const serialized = JSON.stringify(toAdminOrderDto(buildOrder()));

    for (const field of [
      "_id",
      "__v",

      "buyerRawExternalSnapshot",

      "paymentProviderPaymentId",
      "paymentCheckoutUrl",
      "paymentProviderRefundId",

      "idempotencyScope",
      "idempotencyKey",
      "idempotencyRequestHash",
      "idempotencyCompletedAt",

      "guestAccessTokenHash",
      "guestAccessTokenExpiresAt",
      "guestAccessLastUsedAt",
      "guestAccessDownloadCount",

      "fulfillmentStatus",
      "fulfillmentStep",
      "fulfillmentAttemptCount",
      "fulfillmentStartedAt",
      "fulfillmentCompletedAt",
      "fulfillmentFailedAt",
      "fulfillmentLastError",
      "fulfillmentLeaseToken",
      "fulfillmentLeaseExpiresAt",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("rejects invalid admin order sources", () => {
    const order = buildOrder();

    order.source = "legacy_manual";

    expect(() => toAdminOrderDto(order)).toThrow(
      "Cannot serialize an invalid order source.",
    );
  });
});
describe("admin order list metadata contract", () => {
  it("serializes canonical event, pagination and summary metadata", () => {
    const result = toAdminOrderListMetaDto({
      event: {
        id: IDS.event,

        title: "DTO Event",

        status: "published",

        _id: "must-not-leak",

        __v: 3,
      },

      pagination: {
        page: 2,

        limit: 20,

        total: 25,

        pages: 2,
      },

      summary: {
        total: 25,
      },
    });

    expect(result).toEqual({
      event: {
        id: IDS.event,

        title: "DTO Event",

        status: "published",
      },

      pagination: {
        page: 2,

        limit: 20,

        total: 25,

        pages: 2,
      },

      summary: {
        total: 25,
      },
    });

    expect(JSON.stringify(result)).not.toContain('"_id"');

    expect(JSON.stringify(result)).not.toContain('"__v"');
  });

  it("rejects inconsistent pagination", () => {
    expect(() =>
      toAdminOrderListMetaDto({
        event: {
          id: IDS.event,

          title: "DTO Event",

          status: "published",
        },

        pagination: {
          page: 1,

          limit: 20,

          total: 25,

          pages: 1,
        },

        summary: {
          total: 25,
        },
      }),
    ).toThrow(
      "Cannot serialize admin order list metadata with inconsistent pagination.",
    );
  });

  it("rejects different pagination and summary totals", () => {
    expect(() =>
      toAdminOrderListMetaDto({
        event: {
          id: IDS.event,

          title: "DTO Event",

          status: "published",
        },

        pagination: {
          page: 1,

          limit: 20,

          total: 10,

          pages: 1,
        },

        summary: {
          total: 9,
        },
      }),
    ).toThrow(
      "Cannot serialize admin order list metadata with different pagination and summary totals.",
    );
  });

  it("rejects invalid event statuses", () => {
    expect(() =>
      toAdminOrderListMetaDto({
        event: {
          id: IDS.event,

          title: "DTO Event",

          status: "legacy_live",
        },

        pagination: {
          page: 1,

          limit: 20,

          total: 0,

          pages: 1,
        },

        summary: {
          total: 0,
        },
      }),
    ).toThrow("Cannot serialize an invalid order event status.");
  });
});
describe("admin order detail DTO contract", () => {
  it("serializes the canonical admin order detail contract", () => {
    const result = toAdminOrderDetailDto({
      order: buildOrder(),

      tickets: [buildTicket()],
    });

    expect(result.id).toBe(IDS.order);

    expect(result.tickets).toHaveLength(1);

    expect(result.tickets[0]).toMatchObject({
      id: IDS.ticket,

      orderId: IDS.order,

      event: {
        id: IDS.event,
      },

      ticketType: {
        id: IDS.ticketType,

        kind: "normal",
      },

      pricing: {
        currency: "EUR",

        unitPrice: 2500,
      },

      document: {
        available: true,

        generatedAt: "2030-06-01T10:10:00.000Z",
      },
    });

    expect(toAdminOrderDetailMetaDto(result, buildAdminOrderActions())).toEqual(
      {
        summary: {
          ticketsCount: 1,

          totalPrice: 5000,

          currency: "EUR",
        },

        actions: buildAdminOrderActions(),
      },
    );
  });

  it("requires action capabilities for admin order detail metadata", () => {
    const result = toAdminOrderDetailDto({
      order: buildOrder(),
      tickets: [buildTicket()],
    });

    expect(() => toAdminOrderDetailMetaDto(result)).toThrow(
      "Cannot serialize admin order detail metadata without actions.",
    );
  });

  it("rejects invalid admin order action capabilities", () => {
    const result = toAdminOrderDetailDto({
      order: buildOrder(),
      tickets: [buildTicket()],
    });

    const actions = buildAdminOrderActions();

    actions.refund = {
      allowed: "yes",
      reason: null,
    };

    expect(() => toAdminOrderDetailMetaDto(result, actions)).toThrow(
      "Cannot serialize admin order action refund.",
    );
  });

  it("rejects tickets belonging to a different order", () => {
    expect(() =>
      toAdminOrderDetailDto({
        order: buildOrder(),

        tickets: [
          buildTicket({
            orderId: "64f000000000000000000099",
          }),
        ],
      }),
    ).toThrow(
      "Cannot serialize admin order detail with a ticket from a different order.",
    );
  });

  it("rejects tickets belonging to a different event", () => {
    expect(() =>
      toAdminOrderDetailDto({
        order: buildOrder(),

        tickets: [
          buildTicket({
            eventId: "64f000000000000000000098",
          }),
        ],
      }),
    ).toThrow(
      "Cannot serialize admin order detail with a ticket from a different event.",
    );
  });

  it("does not expose order or ticket persistence internals", () => {
    const serialized = JSON.stringify(
      toAdminOrderDetailDto({
        order: buildOrder(),

        tickets: [buildTicket()],
      }),
    );

    for (const field of [
      "_id",
      "__v",

      "checkInTokenHash",
      "encryptedCheckInToken",

      "ticketPdfStorageKey",
      "ticketPdfStorageTarget",
      "ticketPdfStorageProvider",

      "paymentProviderPaymentId",
      "paymentCheckoutUrl",

      "guestAccessTokenHash",
      "fulfillmentLeaseToken",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
});
describe("admin manual order result contract", () => {
  it("serializes the canonical manual order result", () => {
    const result = toAdminManualOrderResultDto({
      order: buildManualOrder(),

      tickets: [buildTicket()],

      documents: {
        skipped: true,

        reason: "ticket_pdf_disabled",

        generated: 0,

        alreadyExisted: 0,

        failed: 0,

        errors: [
          {
            message: "must-not-leak",
          },
        ],
      },
    });

    expect(result.data).toMatchObject({
      id: IDS.order,

      buyer: {
        type: "manual",

        email: "buyer@example.com",

        externalIdentity: null,
      },

      source: "manual",

      manualAssignmentReason: "Assigned by admin",

      status: "confirmed",

      payment: {
        status: "not_required",

        provider: "none",
      },
    });

    expect(result.meta).toEqual({
      summary: {
        ticketsCount: 1,

        totalPrice: 2500,

        currency: "EUR",
      },

      creation: {
        ticketsCreated: 1,

        documents: {
          skipped: true,

          reason: "ticket_pdf_disabled",

          generated: 0,

          alreadyExisted: 0,

          failed: 0,
        },

        fulfillment: {
          status: "completed",
          completed: true,
          retryScheduled: false,
          manualReviewRequired: false,
        },
      },
    });

    expect(JSON.stringify(result)).not.toContain('"errors"');
  });

  it("rejects a non-manual order", () => {
    expect(() =>
      toAdminManualOrderResultDto({
        order: buildOrder(),

        tickets: [buildTicket()],

        documents: {
          skipped: true,

          reason: "ticket_pdf_disabled",

          generated: 0,

          alreadyExisted: 0,

          failed: 0,
        },
      }),
    ).toThrow("Cannot serialize a non-manual order as manual order result.");
  });

  it("allows an incomplete manual fulfillment without tickets and exposes retry state", () => {
    const result = toAdminManualOrderResultDto({
      order: {
        ...buildManualOrder(),
        fulfillmentStatus: "failed",
      },
      tickets: [],
      documents: null,
    });

    expect(result.meta.creation).toMatchObject({
      ticketsCreated: 0,
      fulfillment: {
        status: "failed",
        completed: false,
        retryScheduled: true,
        manualReviewRequired: false,
      },
    });
  });

  it("rejects an inconsistent ticket count", () => {
    expect(() =>
      toAdminManualOrderResultDto({
        order: buildManualOrder(),

        tickets: [],

        documents: {
          skipped: true,

          reason: "ticket_pdf_disabled",

          generated: 0,

          alreadyExisted: 0,

          failed: 0,
        },
      }),
    ).toThrow(
      "Cannot serialize a completed manual order fulfillment with an inconsistent ticket count.",
    );
  });
});
