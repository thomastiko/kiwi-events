import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_DELIVERY_MODE,
  EMAIL_LOG_STATUS,
  EMAIL_TEMPLATE_STATUS,
} from "../../../src/modules/mail/mail.constants.js";

async function loadDispatchService({
  claimResult = {
    claimed: true,
    log: {
      id: "log-claim-1",
      status: EMAIL_LOG_STATUS.SENDING,
    },
  },
  sendResult = {
    messageId: "provider-1",
  },
  sendError = null,
  updateClaimedResult = {
    id: "log-claim-1",
    status: EMAIL_LOG_STATUS.SENT,
  },
  updateClaimedError = null,
  template = null,
} = {}) {
  vi.resetModules();

  const sendMailMock = sendError
    ? vi.fn().mockRejectedValue(sendError)
    : vi.fn().mockResolvedValue(sendResult);

  const createEmailLogMock = vi.fn().mockResolvedValue({
    id: "log-always-1",
    status: EMAIL_LOG_STATUS.SENDING,
  });

  const claimEmailDeliveryMock = vi.fn().mockResolvedValue(claimResult);

  const updateClaimedEmailDeliveryMock = updateClaimedError
    ? vi.fn().mockRejectedValue(updateClaimedError)
    : vi.fn().mockResolvedValue(updateClaimedResult);

  const updateEmailLogByIdMock = vi.fn().mockResolvedValue({
    id: "log-always-1",
    status: EMAIL_LOG_STATUS.SENT,
  });

  const findEmailTemplateByKeyMock = vi.fn().mockResolvedValue(
    template || {
      id: "template-1",
      key: "test.template",
      module: "tests",
      subject: "Hello {{firstName}}",
      html: "<p>Hello {{firstName}}</p>",
      text: "Hello {{firstName}}",
      variables: ["firstName"],
      fromName: "",
      fromEmail: "",
      replyTo: "",
      status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    },
  );

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      mail: {
        provider: "smtp",
      },
    },
  }));

  vi.doMock("../../../src/modules/mail/mail.transport.service.js", () => ({
    getDefaultMailSender: () => ({
      fromName: "Kiwi Test",
      fromEmail: "noreply@example.test",
      replyTo: "reply@example.test",
    }),
    sendMail: sendMailMock,
  }));

  vi.doMock(
    "../../../src/modules/mail/repositories/mail.repository.js",
    () => ({
      claimEmailDelivery: claimEmailDeliveryMock,
      createEmailLog: createEmailLogMock,
      findEmailTemplateByKey: findEmailTemplateByKeyMock,
      updateClaimedEmailDelivery: updateClaimedEmailDeliveryMock,
      updateEmailLogById: updateEmailLogByIdMock,
    }),
  );

  const module =
    await import("../../../src/modules/mail/mail.dispatch.service.js");

  return {
    ...module,
    sendMailMock,
    createEmailLogMock,
    claimEmailDeliveryMock,
    updateClaimedEmailDeliveryMock,
    updateEmailLogByIdMock,
    findEmailTemplateByKeyMock,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("mail dispatch service", () => {
  it("uses one prepared-mail core for ALWAYS deliveries", async () => {
    const service = await loadDispatchService();

    const result = await service.dispatchPreparedMail({
      messageKey: "event.custom",
      to: "Recipient@Example.test",
      subject: "Hello",
      html: "<p>Hello</p>",
      source: {
        module: "events",
        entityType: "Order",
        entityId: "order-1",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ALWAYS,
    });

    expect(service.claimEmailDeliveryMock).not.toHaveBeenCalled();
    expect(service.createEmailLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "event.custom",
        status: EMAIL_LOG_STATUS.SENDING,
        attempts: 1,
      }),
      { lean: true },
    );
    expect(service.sendMailMock).toHaveBeenCalledTimes(1);
    expect(service.updateEmailLogByIdMock).toHaveBeenCalledWith(
      "log-always-1",
      expect.objectContaining({
        status: EMAIL_LOG_STATUS.SENT,
        providerMessageId: "provider-1",
      }),
      { lean: true },
    );
    expect(result).toMatchObject({
      success: true,
      skipped: false,
      emailLogId: "log-always-1",
      providerMessageId: "provider-1",
      auditFinalized: true,
    });
  });

  it("skips an ONCE_PER_SOURCE delivery already marked SENT", async () => {
    const service = await loadDispatchService({
      claimResult: {
        claimed: false,
        log: {
          id: "existing-log",
          status: EMAIL_LOG_STATUS.SENT,
          providerMessageId: "existing-provider-id",
        },
      },
    });

    const result = await service.dispatchPreparedMail({
      messageKey: "order.confirmed",
      to: "recipient@example.test",
      subject: "Hello",
      text: "Hello",
      source: {
        module: "orders",
        entityType: "Order",
        entityId: "order-1",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    });

    expect(result).toEqual({
      success: true,
      skipped: true,
      reason: "mail_already_sent",
      emailLogId: "existing-log",
      providerMessageId: "existing-provider-id",
    });
    expect(service.sendMailMock).not.toHaveBeenCalled();
  });

  it("blocks automatic retry when the persisted delivery state is UNKNOWN", async () => {
    const service = await loadDispatchService({
      claimResult: {
        claimed: false,
        log: {
          id: "unknown-log",
          status: EMAIL_LOG_STATUS.UNKNOWN,
        },
      },
    });

    const result = await service.dispatchPreparedMail({
      messageKey: "order.confirmed",
      to: "recipient@example.test",
      subject: "Hello",
      text: "Hello",
      source: {
        module: "orders",
        entityType: "Order",
        entityId: "order-1",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    });

    expect(result).toEqual({
      success: false,
      skipped: false,
      retryable: false,
      manualReviewRequired: true,
      reason: "mail_delivery_state_unknown",
      emailLogId: "unknown-log",
    });
    expect(service.sendMailMock).not.toHaveBeenCalled();
  });

  it("marks a claimed delivery FAILED when the provider rejects it", async () => {
    const service = await loadDispatchService({
      sendError: new Error("provider down"),
    });

    await expect(
      service.dispatchPreparedMail({
        messageKey: "order.confirmed",
        to: "recipient@example.test",
        subject: "Hello",
        text: "Hello",
        source: {
          module: "orders",
          entityType: "Order",
          entityId: "order-1",
        },
        deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
      }),
    ).rejects.toMatchObject({
      status: 502,
      message: "Mail delivery failed",
    });

    expect(service.updateClaimedEmailDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailLogId: "log-claim-1",
        data: {
          status: EMAIL_LOG_STATUS.FAILED,
          errorMessage: "provider down",
        },
      }),
      { lean: true },
    );
  });

  it("returns success after provider acceptance even if SENT audit finalization fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const service = await loadDispatchService({
      updateClaimedError: new Error("database temporarily unavailable"),
    });

    const result = await service.dispatchPreparedMail({
      messageKey: "order.confirmed",
      to: "recipient@example.test",
      subject: "Hello",
      text: "Hello",
      source: {
        module: "orders",
        entityType: "Order",
        entityId: "order-1",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    });

    expect(service.sendMailMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      skipped: false,
      emailLogId: "log-claim-1",
      providerMessageId: "provider-1",
      auditFinalized: false,
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it("rejects missing template variables before provider delivery", async () => {
    const service = await loadDispatchService();

    const result = await service.dispatchTemplateMailSafe({
      templateKey: "test.template",
      to: "recipient@example.test",
      variables: {},
      source: {
        module: "tests",
        entityType: "Entity",
        entityId: "entity-1",
      },
    });

    expect(result).toMatchObject({
      success: false,
      status: 422,
      error: "Required email template variables are missing: firstName",
      extra: {
        emailLogId: "log-always-1",
        missingVariables: ["firstName"],
      },
    });
    expect(service.sendMailMock).not.toHaveBeenCalled();
  });
});
