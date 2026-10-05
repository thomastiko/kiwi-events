import { describe, expect, it } from "vitest";

import {
  toMailLogDto,
  toMailTemplateDto,
} from "../../../src/modules/mail/mail.dto.js";

describe("mail DTO contract", () => {
  it("serializes a canonical MailTemplateDto without persistence fields", () => {
    const result = toMailTemplateDto({
      id: "template-1",

      key: "order.confirmed",
      module: "orders",
      category: "transactional",

      name: "Order confirmed",
      description: "Confirmation email",

      subject: "Your order",
      html: "<p>Hello</p>",
      text: "Hello",

      variables: ["firstName", "eventTitle"],

      fromName: "Kiwi Events",
      fromEmail: "mail@example.com",
      replyTo: "reply@example.com",

      status: "active",
      isSystem: true,

      createdByEventUserId: "user-1",
      updatedByEventUserId: "user-2",

      createdAt: new Date("2030-01-01T10:00:00.000Z"),
      updatedAt: "2030-01-02T10:00:00.000Z",

      _id: "must-not-leak",
      __v: 5,
      internalOnly: true,
    });

    expect(result).toEqual({
      id: "template-1",

      key: "order.confirmed",
      module: "orders",
      category: "transactional",

      name: "Order confirmed",
      description: "Confirmation email",

      subject: "Your order",
      html: "<p>Hello</p>",
      text: "Hello",

      variables: ["firstName", "eventTitle"],

      fromName: "Kiwi Events",
      fromEmail: "mail@example.com",
      replyTo: "reply@example.com",

      status: "active",
      isSystem: true,

      createdByEventUserId: "user-1",
      updatedByEventUserId: "user-2",

      createdAt: "2030-01-01T10:00:00.000Z",
      updatedAt: "2030-01-02T10:00:00.000Z",
    });

    expect(result._id).toBeUndefined();
    expect(result.__v).toBeUndefined();
    expect(result.internalOnly).toBeUndefined();
  });

  it("serializes a canonical MailLogDto without persistence fields", () => {
    const result = toMailLogDto({
      id: "log-1",

      templateKey: "order.confirmed",
      templateId: "template-1",
      module: "orders",

      to: {
        email: "CUSTOMER@EXAMPLE.COM",
        name: "Max Kunde",
      },

      cc: [
        {
          email: "COPY@EXAMPLE.COM",
          name: "Copy",
        },
      ],

      bcc: [],

      fromName: "Kiwi Events",
      fromEmail: "MAIL@EXAMPLE.COM",
      replyTo: "REPLY@EXAMPLE.COM",

      subjectSnapshot: "Your order",
      htmlSnapshot: "<p>Hello Max</p>",
      textSnapshot: "Hello Max",

      variablesSnapshot: {
        firstName: "Max",
      },

      status: "sent",

      provider: "SMTP",
      providerMessageId: "provider-message-1",

      errorMessage: "",
      attempts: 1,

      sentAt: new Date("2030-01-03T10:00:00.000Z"),

      source: {
        module: "orders",
        entityType: "Order",
        entityId: "order-1",
      },

      createdByEventUserId: "user-1",

      createdAt: new Date("2030-01-03T09:59:00.000Z"),
      updatedAt: new Date("2030-01-03T10:00:00.000Z"),

      _id: "must-not-leak",
      __v: 9,
      internalOnly: true,
    });

    expect(result).toEqual({
      id: "log-1",

      templateKey: "order.confirmed",
      templateId: "template-1",
      module: "orders",

      to: {
        email: "customer@example.com",
        name: "Max Kunde",
      },

      cc: [
        {
          email: "copy@example.com",
          name: "Copy",
        },
      ],

      bcc: [],

      fromName: "Kiwi Events",
      fromEmail: "mail@example.com",
      replyTo: "reply@example.com",

      subjectSnapshot: "Your order",
      htmlSnapshot: "<p>Hello Max</p>",
      textSnapshot: "Hello Max",

      variablesSnapshot: {
        firstName: "Max",
      },

      status: "sent",

      provider: "smtp",
      providerMessageId: "provider-message-1",

      errorMessage: "",
      attempts: 1,

      sentAt: "2030-01-03T10:00:00.000Z",

      source: {
        module: "orders",
        entityType: "Order",
        entityId: "order-1",
      },

      createdByEventUserId: "user-1",

      createdAt: "2030-01-03T09:59:00.000Z",
      updatedAt: "2030-01-03T10:00:00.000Z",
    });

    expect(result._id).toBeUndefined();
    expect(result.__v).toBeUndefined();
    expect(result.internalOnly).toBeUndefined();
  });

  it("does not fall back to MongoDB _id", () => {
    expect(() =>
      toMailTemplateDto({
        id: null,
        _id: "64f000000000000000000001",
      }),
    ).toThrow(/without id/i);
  });

  it("supports nullable mail references", () => {
    const result = toMailLogDto({
      id: "log-2",

      templateKey: "",
      templateId: null,
      module: "mail",

      to: {
        email: "test@example.com",
        name: "",
      },

      cc: [],
      bcc: [],

      fromName: "",
      fromEmail: "",
      replyTo: "",

      subjectSnapshot: "Missing template",
      htmlSnapshot: "",
      textSnapshot: "",

      variablesSnapshot: {},

      status: "failed",

      provider: "smtp",
      providerMessageId: "",
      errorMessage: "Missing template",
      attempts: 0,

      sentAt: null,

      source: {
        module: "mail",
        entityType: "",
        entityId: null,
      },

      createdByEventUserId: null,

      createdAt: new Date("2030-01-01T10:00:00.000Z"),
      updatedAt: new Date("2030-01-01T10:00:00.000Z"),
    });

    expect(result.templateId).toBeNull();
    expect(result.sentAt).toBeNull();
    expect(result.source.entityId).toBeNull();
    expect(result.createdByEventUserId).toBeNull();
  });
});
