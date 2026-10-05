import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_DELIVERY_MODE,
  MAIL_TEMPLATE_KEYS,
} from "../../../src/modules/mail/mail.constants.js";
import { ORDER_STATUS } from "../../../src/modules/orders/order.constants.js";

async function loadOrderMailService({
  mail = true,
  mailOrderConfirmation = true,
  mailOrderCancellation = true,
  ticketPdf = false,
  tickets = [
    {
      id: "ticket-1",
      ticketCode: "TKT-ABC12345",
      ticketTypeNameSnapshot: "Standard",
      ticketPdfStorageKey: null,
    },
  ],
  dispatchResult = {
    success: true,
    skipped: false,
    emailLogId: "mail-log-1",
  },
  attachment = null,
} = {}) {
  vi.resetModules();

  const dispatchTemplateMailSafeMock = vi
    .fn()
    .mockResolvedValue(dispatchResult);
  const findTicketsByOrderIdMock = vi.fn().mockResolvedValue(tickets);
  const buildExistingOfficialTicketAttachmentMock = vi
    .fn()
    .mockResolvedValue(attachment);
  const loggerErrorMock = vi.fn();
  const loggerWarnMock = vi.fn();

  vi.doMock("../../../src/config/features.js", () => ({
    features: {
      mail,
      mailOrderConfirmation,
      mailOrderCancellation,
      ticketPdf,
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
      warn: loggerWarnMock,
    },
  }));

  vi.doMock("../../../src/modules/mail/mail.dispatch.service.js", () => ({
    dispatchTemplateMailSafe: dispatchTemplateMailSafeMock,
  }));

  vi.doMock(
    "../../../src/modules/tickets/repositories/ticket.repository.js",
    () => ({
      findTicketsByOrderId: findTicketsByOrderIdMock,
    }),
  );

  vi.doMock("../../../src/modules/tickets/ticketDocument.service.js", () => ({
    buildExistingOfficialTicketAttachment:
      buildExistingOfficialTicketAttachmentMock,
  }));

  const module =
    await import("../../../src/modules/orders/order.mail.service.js");

  return {
    ...module,
    dispatchTemplateMailSafeMock,
    findTicketsByOrderIdMock,
    buildExistingOfficialTicketAttachmentMock,
    loggerErrorMock,
    loggerWarnMock,
  };
}

function buildConfirmedOrder(overrides = {}) {
  return {
    id: "order-1",
    orderNumber: "ORD-1001",
    status: ORDER_STATUS.CONFIRMED,

    buyerEmailSnapshot: "current@example.test",
    buyerFirstNameSnapshot: "Current",
    buyerLastNameSnapshot: "Buyer",
    buyerDisplayNameSnapshot: "Current Buyer",

    eventTitleSnapshot: "Current Event",
    eventLocationSnapshot: "Audimax – Room 1",
    eventStartsAtSnapshot: "2030-06-01T10:00:00.000Z",
    eventTimezoneSnapshot: "Europe/Vienna",

    ...overrides,
  };
}

function buildCancelledOrder(overrides = {}) {
  return buildConfirmedOrder({
    status: ORDER_STATUS.CANCELLED,
    cancellationReason: "Cancelled by organizer",
    ...overrides,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("order mail service", () => {
  it("dispatches an automatic confirmation through ONCE_PER_SOURCE", async () => {
    const {
      sendOrderConfirmedMailSafe,
      dispatchTemplateMailSafeMock,
      findTicketsByOrderIdMock,
    } = await loadOrderMailService();

    const result = await sendOrderConfirmedMailSafe({
      order: buildConfirmedOrder(),
      context: {
        eventUserId: "event-user-1",
      },
    });

    expect(findTicketsByOrderIdMock).toHaveBeenCalledWith("order-1", {
      lean: true,
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
        to: {
          email: "current@example.test",
          name: "Current Buyer",
        },
        variables: expect.objectContaining({
          firstName: "Current",
          lastName: "Buyer",
          displayName: "Current Buyer",
          eventTitle: "Current Event",
          eventLocation: "Audimax – Room 1",
          orderNumber: "ORD-1001",
          ticketSummary: "1. Standard (TKT-ABC12345)",
          eventTeamName: "Kiwi Events Test",
        }),
        source: {
          module: "orders",
          entityType: "Order",
          entityId: "order-1",
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
        context: {
          eventUserId: "event-user-1",
        },
      }),
    );

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      email: "current@example.test",
    });
  });

  it("uses ALWAYS for an explicit confirmation resend", async () => {
    const { sendOrderConfirmedMailSafe, dispatchTemplateMailSafeMock } =
      await loadOrderMailService();

    await sendOrderConfirmedMailSafe({
      order: buildConfirmedOrder({
        buyerEmailSnapshot: "corrected@example.test",
        buyerDisplayNameSnapshot: "Corrected Buyer",
      }),
      deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      context: {
        eventUserId: "event-user-2",
      },
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          email: "corrected@example.test",
          name: "Corrected Buyer",
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
        context: {
          eventUserId: "event-user-2",
        },
      }),
    );
  });

  it("propagates an atomic already-sent skip from the dispatcher", async () => {
    const { sendOrderConfirmedMailSafe, dispatchTemplateMailSafeMock } =
      await loadOrderMailService({
        dispatchResult: {
          success: true,
          skipped: true,
          reason: "mail_already_sent",
          emailLogId: "mail-log-existing",
        },
      });

    const result = await sendOrderConfirmedMailSafe({
      order: buildConfirmedOrder(),
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      skipped: true,
      reason: "mail_already_sent",
      email: "current@example.test",
    });
  });

  it("returns a real failure when the dispatcher fails", async () => {
    const { sendOrderConfirmedMailSafe } = await loadOrderMailService({
      dispatchResult: {
        success: false,
        skipped: false,
        reason: "mail_delivery_error",
        error: "SMTP unavailable",
      },
    });

    const result = await sendOrderConfirmedMailSafe({
      order: buildConfirmedOrder(),
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      reason: "mail_delivery_error",
      error: "SMTP unavailable",
      email: "current@example.test",
    });
  });

  it("attaches existing ticket PDFs when ticketPdf is enabled", async () => {
    const attachment = {
      filename: "ticket.pdf",
      content: Buffer.from("pdf"),
      contentType: "application/pdf",
    };

    const {
      sendOrderConfirmedMailSafe,
      dispatchTemplateMailSafeMock,
      buildExistingOfficialTicketAttachmentMock,
    } = await loadOrderMailService({
      ticketPdf: true,
      tickets: [
        {
          id: "ticket-1",
          ticketCode: "TKT-ABC12345",
          ticketTypeNameSnapshot: "Standard",
          ticketPdfStorageKey: "tickets/ticket-1.pdf",
        },
      ],
      attachment,
    });

    await sendOrderConfirmedMailSafe({
      order: buildConfirmedOrder(),
    });

    expect(buildExistingOfficialTicketAttachmentMock).toHaveBeenCalledTimes(1);
    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [attachment],
      }),
    );
  });

  it("skips confirmation mail when mail or recipient data is unavailable", async () => {
    const disabled = await loadOrderMailService({
      mail: false,
    });

    await expect(
      disabled.sendOrderConfirmedMailSafe({
        order: buildConfirmedOrder(),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "mail_feature_disabled",
    });

    vi.restoreAllMocks();
    vi.resetModules();

    const missingRecipient = await loadOrderMailService();

    await expect(
      missingRecipient.sendOrderConfirmedMailSafe({
        order: buildConfirmedOrder({
          buyerEmailSnapshot: "",
        }),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "missing_buyer_email_snapshot",
    });
  });

  it("dispatches cancellation mail with the selected delivery mode", async () => {
    const { sendOrderCancelledMailSafe, dispatchTemplateMailSafeMock } =
      await loadOrderMailService();

    const result = await sendOrderCancelledMailSafe({
      order: buildCancelledOrder({
        buyerEmailSnapshot: "cancelled@example.test",
        buyerFirstNameSnapshot: "Cancelled",
        buyerDisplayNameSnapshot: "Cancelled Buyer",
      }),
      deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
    });

    expect(dispatchTemplateMailSafeMock).toHaveBeenCalledWith({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_CANCELLED,
      to: {
        email: "cancelled@example.test",
        name: "Cancelled Buyer",
      },
      variables: {
        firstName: "Cancelled",
        eventTitle: "Current Event",
        orderNumber: "ORD-1001",
        cancellationReason: "Cancelled by organizer",
        eventTeamName: "Kiwi Events Test",
      },
      source: {
        module: "orders",
        entityType: "Order",
        entityId: "order-1",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
      context: {
        eventUserId: null,
      },
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      email: "cancelled@example.test",
    });
  });

  it("returns canonical skip results for invalid cancellation scenarios", async () => {
    const nonCancelled = await loadOrderMailService();

    await expect(
      nonCancelled.sendOrderCancelledMailSafe({
        order: buildConfirmedOrder(),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "order_not_cancelled",
    });

    vi.restoreAllMocks();
    vi.resetModules();

    const featureDisabled = await loadOrderMailService({
      mailOrderCancellation: false,
    });

    await expect(
      featureDisabled.sendOrderCancelledMailSafe({
        order: buildCancelledOrder(),
      }),
    ).resolves.toEqual({
      success: false,
      skipped: true,
      reason: "mail_order_cancellation_disabled",
    });
  });
});
