import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENT_STATUSES } from "../../../src/modules/events/event.constants.js";
import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../../../src/modules/paymentRefunds/paymentRefund.constants.js";
import { TICKET_STATUS } from "../../../src/modules/tickets/ticket.constants.js";
import {
  ORDER_BUYER_TYPE,
  ORDER_MAIL_RESEND_TYPE,
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "../../../src/modules/orders/order.constants.js";

async function loadActions({
  mail = true,
  mailOrderConfirmation = true,
  mailOrderCancellation = true,
  mailOrderRefunded = true,
  mailEventCancellation = true,
} = {}) {
  vi.resetModules();

  vi.doMock("../../../src/config/features.js", () => ({
    features: {
      mail,
      mailOrderConfirmation,
      mailOrderCancellation,
      mailOrderRefunded,
      mailEventCancellation,
    },
  }));

  return import("../../../src/modules/orders/internal/order.internal.actions.js");
}

function buildOrder(overrides = {}) {
  return {
    id: "order-1",
    buyerType: ORDER_BUYER_TYPE.GUEST,
    status: ORDER_STATUS.CONFIRMED,
    paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,
    paymentProviderPaymentId: "pay_order_1",
    totalPrice: 5000,
    refundStatus: ORDER_REFUND_STATUS.NONE,
    ...overrides,
  };
}

function buildEvent(overrides = {}) {
  return {
    id: "event-1",
    status: EVENT_STATUSES.PUBLISHED,
    ...overrides,
  };
}

function buildTicket(overrides = {}) {
  return {
    id: "ticket-1",
    status: TICKET_STATUS.ACTIVE,
    ...overrides,
  };
}

function buildPaymentRefund(overrides = {}) {
  return {
    id: "refund-1",
    sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
    sourceId: "order-1",
    orderId: "order-1",
    amount: 5000,
    status: PAYMENT_REFUND_STATUS.COMPLETED,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("internal order action capabilities", () => {
  it("allows editing a confirmed guest buyer before check-in", async () => {
    const { getOrderBuyerEditAction } = await loadActions();

    expect(
      getOrderBuyerEditAction({
        order: buildOrder(),
        tickets: [buildTicket()],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("allows editing a cancelled guest buyer but blocks external users and checked-in orders", async () => {
    const { getOrderBuyerEditAction } = await loadActions();

    expect(
      getOrderBuyerEditAction({
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        tickets: [buildTicket()],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderBuyerEditAction({
        order: buildOrder({
          buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
        }),
        tickets: [buildTicket()],
      }),
    ).toEqual({
      allowed: false,
      reason: "buyer_not_guest",
    });

    expect(
      getOrderBuyerEditAction({
        order: buildOrder(),
        tickets: [
          buildTicket({
            status: TICKET_STATUS.CHECKED_IN,
          }),
        ],
      }),
    ).toEqual({
      allowed: false,
      reason: "ticket_already_checked_in",
    });
  });

  it("blocks buyer editing for pending and expired orders", async () => {
    const { getOrderBuyerEditAction } = await loadActions();

    for (const status of [ORDER_STATUS.PENDING, ORDER_STATUS.EXPIRED]) {
      expect(
        getOrderBuyerEditAction({
          order: buildOrder({ status }),
          tickets: [buildTicket()],
        }),
      ).toEqual({
        allowed: false,
        reason: "order_status_not_editable",
      });
    }
  });

  it("exposes cancellation eligibility without replacing the cancellation saga", async () => {
    const { getOrderCancelAction } = await loadActions();

    expect(
      getOrderCancelAction({
        order: buildOrder(),
        tickets: [buildTicket()],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderCancelAction({
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        tickets: [buildTicket()],
      }),
    ).toEqual({
      allowed: false,
      reason: "order_already_cancelled",
    });

    expect(
      getOrderCancelAction({
        order: buildOrder({
          status: ORDER_STATUS.EXPIRED,
        }),
        tickets: [buildTicket()],
      }),
    ).toEqual({
      allowed: false,
      reason: "order_expired",
    });

    expect(
      getOrderCancelAction({
        order: buildOrder(),
        tickets: [
          buildTicket({
            status: TICKET_STATUS.CHECKED_IN,
          }),
        ],
      }),
    ).toEqual({
      allowed: false,
      reason: "ticket_already_checked_in",
    });
  });

  it("allows a normal paid order refund and a later refund of an already cancelled order", async () => {
    const { getOrderRefundAction } = await loadActions();

    for (const status of [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED]) {
      expect(
        getOrderRefundAction({
          order: buildOrder({ status }),
          tickets: [buildTicket()],
          paymentRefunds: [],
        }),
      ).toEqual({
        allowed: true,
        reason: null,
      });
    }
  });

  it("blocks refund while an order refund is completed or in progress", async () => {
    const { getOrderRefundAction } = await loadActions();

    expect(
      getOrderRefundAction({
        order: buildOrder({
          refundStatus: ORDER_REFUND_STATUS.COMPLETED,
        }),
        tickets: [buildTicket()],
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "order_refund_completed",
    });

    for (const refundStatus of [
      ORDER_REFUND_STATUS.PENDING,
      ORDER_REFUND_STATUS.PROCESSING,
      ORDER_REFUND_STATUS.PROVIDER_SUCCEEDED,
    ]) {
      expect(
        getOrderRefundAction({
          order: buildOrder({ refundStatus }),
          tickets: [buildTicket()],
          paymentRefunds: [],
        }),
      ).toEqual({
        allowed: false,
        reason: "order_refund_in_progress",
      });
    }
  });

  it("blocks refund when a deposit refund is unresolved", async () => {
    const { getOrderRefundAction } = await loadActions();

    const result = getOrderRefundAction({
      order: buildOrder(),
      tickets: [buildTicket()],
      paymentRefunds: [
        buildPaymentRefund({
          sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
          sourceId: "ticket-1",
          amount: 1000,
          status: PAYMENT_REFUND_STATUS.PROCESSING,
        }),
      ],
    });

    expect(result).toEqual({
      allowed: false,
      reason: "deposit_refund_incomplete",
    });
  });

  it("subtracts financially successful deposit refunds from the refundable amount", async () => {
    const { getOrderRefundAction } = await loadActions();

    expect(
      getOrderRefundAction({
        order: buildOrder({
          totalPrice: 5000,
        }),
        tickets: [buildTicket()],
        paymentRefunds: [
          buildPaymentRefund({
            sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
            sourceId: "ticket-1",
            amount: 1000,
            status: PAYMENT_REFUND_STATUS.COMPLETED,
          }),
        ],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderRefundAction({
        order: buildOrder({
          totalPrice: 1000,
        }),
        tickets: [buildTicket()],
        paymentRefunds: [
          buildPaymentRefund({
            sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
            sourceId: "ticket-1",
            amount: 1000,
            status: PAYMENT_REFUND_STATUS.COMPLETED,
          }),
        ],
      }),
    ).toEqual({
      allowed: false,
      reason: "nothing_left_to_refund",
    });
  });

  it("finds only a completed order refund for refund-mail resend", async () => {
    const { findCompletedOrderPaymentRefund } = await loadActions();

    const depositRefund = buildPaymentRefund({
      id: "deposit-refund",
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
      sourceId: "ticket-1",
    });

    const pendingOrderRefund = buildPaymentRefund({
      id: "pending-order-refund",
      status: PAYMENT_REFUND_STATUS.PROCESSING,
    });

    const completedOrderRefund = buildPaymentRefund({
      id: "completed-order-refund",
    });

    expect(
      findCompletedOrderPaymentRefund([
        depositRefund,
        pendingOrderRefund,
        completedOrderRefund,
      ]),
    ).toEqual(completedOrderRefund);
  });

  it("allows confirmation resend only for a confirmed order with the mail feature enabled", async () => {
    const { getOrderMailResendAction } = await loadActions();

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CONFIRMED,
        order: buildOrder(),
        event: buildEvent(),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CONFIRMED,
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        event: buildEvent(),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "order_not_confirmed",
    });
  });

  it("allows order cancellation resend only when the order is cancelled but the event is not", async () => {
    const { getOrderMailResendAction } = await loadActions();

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CANCELLED,
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        event: buildEvent(),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CANCELLED,
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        event: buildEvent({
          status: EVENT_STATUSES.CANCELLED,
        }),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "event_cancelled",
    });
  });

  it("allows refund resend only after a completed order refund", async () => {
    const { getOrderMailResendAction } = await loadActions();

    const order = buildOrder({
      status: ORDER_STATUS.CANCELLED,
      refundStatus: ORDER_REFUND_STATUS.COMPLETED,
    });

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.REFUNDED,
        order,
        event: buildEvent(),
        paymentRefunds: [buildPaymentRefund()],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.REFUNDED,
        order,
        event: buildEvent(),
        paymentRefunds: [
          buildPaymentRefund({
            sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
            sourceId: "ticket-1",
          }),
        ],
      }),
    ).toEqual({
      allowed: false,
      reason: "completed_order_refund_not_found",
    });
  });

  it("allows event cancellation resend only for a cancelled event and cancelled order", async () => {
    const { getOrderMailResendAction } = await loadActions();

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.EVENT_CANCELLED,
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        event: buildEvent({
          status: EVENT_STATUSES.CANCELLED,
        }),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: true,
      reason: null,
    });

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.EVENT_CANCELLED,
        order: buildOrder({
          status: ORDER_STATUS.CANCELLED,
        }),
        event: buildEvent(),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "event_not_cancelled",
    });
  });

  it("surfaces mail feature gates after the state gate passes", async () => {
    const { getOrderMailResendAction } = await loadActions({
      mail: false,
    });

    expect(
      getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CONFIRMED,
        order: buildOrder(),
        event: buildEvent(),
        paymentRefunds: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "mail_feature_disabled",
    });
  });
});
