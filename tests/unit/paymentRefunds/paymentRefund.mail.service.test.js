import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_DELIVERY_MODE,
  MAIL_TEMPLATE_KEYS,
} from "../../../src/modules/mail/mail.constants.js";
import { ORDER_REFUND_STATUS } from "../../../src/modules/orders/order.constants.js";
import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../../../src/modules/paymentRefunds/paymentRefund.constants.js";

async function loadPaymentRefundMailService({
  mailEnabled = true,
  refundMailEnabled = true,
  order = {
    id: "order-1",
    orderNumber: "ORD-1001",
    buyerEmailSnapshot: "customer@example.test",
    buyerFirstNameSnapshot: "Max",
    buyerLastNameSnapshot: "Mustermann",
    buyerDisplayNameSnapshot: "Max Mustermann",
    eventTitleSnapshot: "Kiwi Test Event",
    refundStatus: ORDER_REFUND_STATUS.COMPLETED,
    refundedAmount: 9999,
  },
  dispatchResult = {
    success: true,
    skipped: false,
    emailLogId: "mail-log-1",
  },
} = {}) {
  vi.resetModules();

  const dispatchTemplateMailSafeMock = vi
    .fn()
    .mockResolvedValue(dispatchResult);
  const findOrderByIdMock = vi.fn().mockResolvedValue(order);
  const loggerErrorMock = vi.fn();

  vi.doMock("../../../src/config/features.js", () => ({
    features: {
      mail: mailEnabled,
      mailOrderRefunded: refundMailEnabled,
    },
  }));

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      branding: {
        appName: "Kiwi Events Test",
      },
    },
  }));

  vi.doMock("../../../src/config/logger.js", () => ({
    logger: {
      error: loggerErrorMock,
    },
  }));

  vi.doMock("../../../src/modules/mail/mail.dispatch.service.js", () => ({
    dispatchTemplateMailSafe: dispatchTemplateMailSafeMock,
  }));

  vi.doMock(
    "../../../src/modules/orders/repositories/order.repository.js",
    () => ({
      findOrderById: findOrderByIdMock,
    }),
  );

  const module =
    await import("../../../src/modules/paymentRefunds/paymentRefund.mail.service.js");

  return {
    ...module,
    dispatchTemplateMailSafeMock,
    findOrderByIdMock,
    loggerErrorMock,
  };
}

function buildCompletedRefund(overrides = {}) {
  return {
    id: "refund-1",
    sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
    sourceId: "order-1",
    orderId: "order-1",
    amount: 2500,
    currency: "EUR",
    status: PAYMENT_REFUND_STATUS.COMPLETED,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("payment refund mail service", () => {
  it("skips non-order and incomplete refunds before loading the order", async () => {
    const service = await loadPaymentRefundMailService();

    await expect(
      service.sendPaymentRefundCompletedMailSafe({
        paymentRefund: buildCompletedRefund({
          sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
          sourceId: "ticket-1",
        }),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "refund_source_not_order",
    });

    await expect(
      service.sendPaymentRefundCompletedMailSafe({
        paymentRefund: buildCompletedRefund({
          status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
        }),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "refund_not_completed",
    });

    expect(service.findOrderByIdMock).not.toHaveBeenCalled();
    expect(service.dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("requires the order refund state to be completed", async () => {
    const service = await loadPaymentRefundMailService({
      order: {
        id: "order-1",
        orderNumber: "ORD-1001",
        buyerEmailSnapshot: "customer@example.test",
        buyerDisplayNameSnapshot: "Max Mustermann",
        eventTitleSnapshot: "Kiwi Test Event",
        refundStatus: ORDER_REFUND_STATUS.PENDING,
      },
    });

    await expect(
      service.sendPaymentRefundCompletedMailSafe({
        paymentRefund: buildCompletedRefund(),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "order_refund_not_completed",
    });

    expect(service.dispatchTemplateMailSafeMock).not.toHaveBeenCalled();
  });

  it("uses the current PaymentRefund amount instead of the cumulative order amount", async () => {
    const service = await loadPaymentRefundMailService({
      order: {
        id: "order-1",
        orderNumber: "ORD-1001",
        buyerEmailSnapshot: "customer@example.test",
        buyerFirstNameSnapshot: "Max",
        buyerLastNameSnapshot: "Mustermann",
        buyerDisplayNameSnapshot: "Max Mustermann",
        eventTitleSnapshot: "Kiwi Test Event",
        refundStatus: ORDER_REFUND_STATUS.COMPLETED,
        refundedAmount: 9900,
      },
    });

    const result = await service.sendPaymentRefundCompletedMailSafe({
      paymentRefund: buildCompletedRefund({
        amount: 4000,
        currency: "eur",
      }),
      context: {
        eventUserId: "event-user-1",
      },
    });

    expect(service.findOrderByIdMock).toHaveBeenCalledWith("order-1", {
      lean: true,
    });

    expect(service.dispatchTemplateMailSafeMock).toHaveBeenCalledWith({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_REFUNDED,
      to: {
        email: "customer@example.test",
        name: "Max Mustermann",
      },
      variables: {
        firstName: "Max",
        eventTitle: "Kiwi Test Event",
        orderNumber: "ORD-1001",
        refundAmount: "40.00 EUR",
        eventTeamName: "Kiwi Events Test",
      },
      source: {
        module: "payment_refunds",
        entityType: "PaymentRefund",
        entityId: "refund-1",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
      context: {
        eventUserId: "event-user-1",
      },
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      email: "customer@example.test",
    });
  });

  it("forwards ALWAYS for an intentional refund-mail resend", async () => {
    const service = await loadPaymentRefundMailService();

    await service.sendPaymentRefundCompletedMailSafe({
      paymentRefund: buildCompletedRefund(),
      deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
    });

    expect(service.dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      }),
    );
  });

  it("propagates an atomic already-sent result from the dispatcher", async () => {
    const service = await loadPaymentRefundMailService({
      dispatchResult: {
        success: true,
        skipped: true,
        reason: "mail_already_sent",
        emailLogId: "existing-log",
      },
    });

    const result = await service.sendPaymentRefundCompletedMailSafe({
      paymentRefund: buildCompletedRefund(),
    });

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      reason: "mail_already_sent",
      email: "customer@example.test",
    });
  });

  it("returns canonical feature and recipient skips", async () => {
    const disabled = await loadPaymentRefundMailService({
      refundMailEnabled: false,
    });

    await expect(
      disabled.sendPaymentRefundCompletedMailSafe({
        paymentRefund: buildCompletedRefund(),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "refund_mail_disabled",
    });

    vi.restoreAllMocks();
    vi.resetModules();

    const missingRecipient = await loadPaymentRefundMailService({
      order: {
        id: "order-1",
        orderNumber: "ORD-1001",
        buyerEmailSnapshot: "",
        buyerDisplayNameSnapshot: "No Email",
        eventTitleSnapshot: "Kiwi Test Event",
        refundStatus: ORDER_REFUND_STATUS.COMPLETED,
      },
    });

    await expect(
      missingRecipient.sendPaymentRefundCompletedMailSafe({
        paymentRefund: buildCompletedRefund(),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "missing_buyer_email_snapshot",
    });
  });

  it("returns a real failure when the dispatcher fails", async () => {
    const service = await loadPaymentRefundMailService({
      dispatchResult: {
        success: false,
        skipped: false,
        reason: "mail_delivery_error",
        error: "Provider unavailable",
      },
    });

    const result = await service.sendPaymentRefundCompletedMailSafe({
      paymentRefund: buildCompletedRefund(),
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      reason: "mail_delivery_error",
      error: "Provider unavailable",
      email: "customer@example.test",
    });
  });
});
