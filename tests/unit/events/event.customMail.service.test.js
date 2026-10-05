import { afterEach, describe, expect, it, vi } from "vitest";

import { EVENT_CUSTOM_MAIL_AUDIENCE } from "../../../src/modules/events/event.constants.js";
import {
  EMAIL_DELIVERY_MODE,
  EMAIL_MESSAGE_KEYS,
} from "../../../src/modules/mail/mail.constants.js";

function buildOrder(id, email, overrides = {}) {
  return {
    id,
    orderNumber: `ORD-${id}`,
    status: "confirmed",
    buyerEmailSnapshot: email,
    buyerFirstNameSnapshot: "Max",
    buyerLastNameSnapshot: "Mustermann",
    buyerDisplayNameSnapshot: "Max Mustermann",
    ...overrides,
  };
}

async function loadCustomMailService({
  mail = true,
  mailEventCustom = true,
  event = {
    id: "event-1",
    title: "Custom Mail Event",
  },
  participantOrders = [
    buildOrder("order-1", "same@example.test"),
    buildOrder("order-2", "SAME@example.test"),
    buildOrder("order-3", "other@example.test"),
  ],
  selectedOrders = null,
  canManage = true,
  dispatchResult = {
    success: true,
    skipped: false,
    emailLogId: "mail-log-1",
  },
} = {}) {
  vi.resetModules();

  const findEventByIdMock = vi.fn().mockResolvedValue(event);
  const canManageEventMock = vi.fn().mockResolvedValue(canManage);
  const findParticipantOrdersForEventMock = vi
    .fn()
    .mockImplementation(async (_eventId, options = {}) => {
      if (options.orders) {
        return options.orders.filter((order) =>
          participantOrders.some((participant) => participant.id === order.id),
        );
      }

      return participantOrders;
    });
  const findOrdersByIdsAndEventIdMock = vi
    .fn()
    .mockResolvedValue(selectedOrders || participantOrders);
  const dispatchPreparedMailSafeMock = vi
    .fn()
    .mockResolvedValue(dispatchResult);
  const buildEventMailVariablesMock = vi
    .fn()
    .mockImplementation(({ order }) => ({
      firstName: order.buyerFirstNameSnapshot || "",
      lastName: order.buyerLastNameSnapshot || "",
      displayName: order.buyerDisplayNameSnapshot || "",
      fullName: order.buyerDisplayNameSnapshot || "",
      buyerEmail: order.buyerEmailSnapshot || "",
      orderNumber: order.orderNumber || "",
      eventTitle: "Custom Mail Event",
      eventDate: "01.06.2030, 12:00",
      eventLocation: "Audimax",
      eventTeamName: "Kiwi Events Test",
    }));

  vi.doMock("../../../src/config/features.js", () => ({
    features: {
      mail,
      mailEventCustom,
    },
  }));

  vi.doMock(
    "../../../src/modules/events/repositories/event.repository.js",
    () => ({
      findEventById: findEventByIdMock,
    }),
  );

  vi.doMock(
    "../../../src/modules/permissions/eventAuthorization.service.js",
    () => ({
      canManageEvent: canManageEventMock,
    }),
  );

  vi.doMock(
    "../../../src/modules/events/event.orderAudience.service.js",
    () => ({
      findParticipantOrdersForEvent: findParticipantOrdersForEventMock,
    }),
  );

  vi.doMock(
    "../../../src/modules/orders/repositories/order.repository.js",
    () => ({
      findOrdersByIdsAndEventId: findOrdersByIdsAndEventIdMock,
    }),
  );

  vi.doMock("../../../src/modules/events/event.mailVariables.js", () => ({
    buildEventMailVariables: buildEventMailVariablesMock,
  }));

  vi.doMock("../../../src/modules/mail/mail.dispatch.service.js", () => ({
    dispatchPreparedMailSafe: dispatchPreparedMailSafeMock,
  }));

  const module =
    await import("../../../src/modules/events/internal/event.customMail.service.js");

  return {
    ...module,
    findEventByIdMock,
    canManageEventMock,
    findParticipantOrdersForEventMock,
    findOrdersByIdsAndEventIdMock,
    dispatchPreparedMailSafeMock,
    buildEventMailVariablesMock,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("custom event mail service", () => {
  it("sends ALL once per normalized recipient and keeps all participant order ids in the audit snapshot", async () => {
    const service = await loadCustomMailService();

    const result = await service.sendCustomEventMailService({
      eventId: "event-1",
      payload: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        audience: EVENT_CUSTOM_MAIL_AUDIENCE.ALL,
        subject: "Hallo {{firstName}}",
        html: "<p>{{eventTitle}}</p>",
        text: "",
      },
      files: [
        {
          originalname: "../info.pdf",
          mimetype: "application/pdf",
          size: 1024,
          buffer: Buffer.from("pdf"),
        },
      ],
      actor: {
        eventUserId: "event-user-1",
        eventUser: { id: "event-user-1" },
      },
    });

    expect(result).toMatchObject({
      eventId: "event-1",
      audience: EVENT_CUSTOM_MAIL_AUDIENCE.ALL,
      audienceOrderCount: 3,
      recipientCount: 2,
      attachmentCount: 1,
      attachmentNames: ["info.pdf"],
      mailConcurrency: 5,
      totalCount: 2,
      sentCount: 2,
      skippedCount: 0,
      failedCount: 0,
    });

    expect(service.dispatchPreparedMailSafeMock).toHaveBeenCalledTimes(2);

    const sameRecipientCall = service.dispatchPreparedMailSafeMock.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.to.email === "same@example.test");

    expect(sameRecipientCall).toMatchObject({
      messageKey: EMAIL_MESSAGE_KEYS.EVENT_CUSTOM,
      module: "events",
      to: {
        email: "same@example.test",
        name: "Max Mustermann",
      },
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
      deliveryKeySeed:
        "event-1:550e8400-e29b-41d4-a716-446655440000:same@example.test",
      variablesSnapshot: expect.objectContaining({
        participantOrderIds: ["order-1", "order-2"],
        customMailRequestId: "550e8400-e29b-41d4-a716-446655440000",
        attachmentNames: ["info.pdf"],
      }),
      attachments: [
        expect.objectContaining({
          filename: "info.pdf",
          contentType: "application/pdf",
        }),
      ],
    });

    expect(sameRecipientCall.variablesSnapshot).not.toHaveProperty(
      "orderNumber",
    );
  });

  it("loads only selected orders before validating SELECTED participants", async () => {
    const selectedOrders = [
      buildOrder("order-2", "selected@example.test"),
      buildOrder("order-3", "other@example.test"),
    ];

    const service = await loadCustomMailService({
      participantOrders: selectedOrders,
      selectedOrders,
    });

    await service.sendCustomEventMailService({
      eventId: "event-1",
      payload: {
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        audience: EVENT_CUSTOM_MAIL_AUDIENCE.SELECTED,
        orderIds: ["order-2", "order-3"],
        subject: "Info",
        html: "<p>Hallo</p>",
        text: "Hallo",
      },
      actor: {
        eventUserId: "event-user-1",
        eventUser: { id: "event-user-1" },
      },
    });

    expect(service.findOrdersByIdsAndEventIdMock).toHaveBeenCalledWith(
      {
        eventId: "event-1",
        orderIds: ["order-2", "order-3"],
      },
      { lean: true },
    );

    expect(service.findParticipantOrdersForEventMock).toHaveBeenCalledWith(
      "event-1",
      {
        orders: selectedOrders,
      },
    );
  });

  it("rejects selected order ids that are not valid participants", async () => {
    const selectedOrders = [
      buildOrder("order-1", "one@example.test"),
      buildOrder("order-2", "two@example.test"),
    ];

    const service = await loadCustomMailService({
      participantOrders: [selectedOrders[0]],
      selectedOrders,
    });

    await expect(
      service.sendCustomEventMailService({
        eventId: "event-1",
        payload: {
          requestId: "550e8400-e29b-41d4-a716-446655440002",
          audience: EVENT_CUSTOM_MAIL_AUDIENCE.SELECTED,
          orderIds: ["order-1", "order-2"],
          subject: "Info",
          html: "<p>Hallo</p>",
          text: "Hallo",
        },
        actor: {
          eventUserId: "event-user-1",
          eventUser: { id: "event-user-1" },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "CUSTOM_EVENT_MAIL_INVALID_AUDIENCE",
      details: {
        orderIds: ["order-2"],
      },
    });

    expect(service.dispatchPreparedMailSafeMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported custom variables before resolving recipients", async () => {
    const service = await loadCustomMailService();

    await expect(
      service.sendCustomEventMailService({
        eventId: "event-1",
        payload: {
          requestId: "550e8400-e29b-41d4-a716-446655440003",
          audience: EVENT_CUSTOM_MAIL_AUDIENCE.ALL,
          subject: "Order {{orderNumber}}",
          html: "<p>{{eventTitle}}</p>",
          text: "",
        },
        actor: {
          eventUserId: "event-user-1",
          eventUser: { id: "event-user-1" },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "CUSTOM_EVENT_MAIL_VARIABLE_INVALID",
      details: {
        variables: ["orderNumber"],
      },
    });

    expect(service.findParticipantOrdersForEventMock).not.toHaveBeenCalled();
  });

  it("reduces mail concurrency for large attachment sets", async () => {
    const service = await loadCustomMailService({
      participantOrders: [buildOrder("order-1", "one@example.test")],
    });

    const result = await service.sendCustomEventMailService({
      eventId: "event-1",
      payload: {
        requestId: "550e8400-e29b-41d4-a716-446655440004",
        audience: EVENT_CUSTOM_MAIL_AUDIENCE.ALL,
        subject: "Info",
        html: "<p>Hallo</p>",
        text: "Hallo",
      },
      files: [
        {
          originalname: "large.pdf",
          mimetype: "application/pdf",
          size: 11 * 1024 * 1024,
          buffer: Buffer.from("small-test-buffer"),
        },
      ],
      actor: {
        eventUserId: "event-user-1",
        eventUser: { id: "event-user-1" },
      },
    });

    expect(result.mailConcurrency).toBe(1);
  });

  it("fails before loading an event when custom mail is disabled", async () => {
    const service = await loadCustomMailService({
      mailEventCustom: false,
    });

    await expect(
      service.sendCustomEventMailService({
        eventId: "event-1",
        payload: {},
        actor: {},
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "CUSTOM_EVENT_MAIL_DISABLED",
    });

    expect(service.findEventByIdMock).not.toHaveBeenCalled();
  });
});
