import { createHash } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let EmailTemplate;
let EmailLog;
let EMAIL_TEMPLATE_STATUS;
let EMAIL_LOG_STATUS;
let EMAIL_DELIVERY_MODE;
let MAIL_TEMPLATE_KEYS;
let dispatchTemplateMailSafe;
let dispatchTemplateMail;
let sendMailMock;

function buildDeliveryKey({ templateKey, source }) {
  return createHash("sha256")
    .update(
      [
        templateKey.toLowerCase(),
        source.module.toLowerCase(),
        source.entityType,
        String(source.entityId),
      ].join("\u001f"),
    )
    .digest("hex");
}

async function loadMailDispatchIntegrationModules({
  mailProvider = "smtp",
} = {}) {
  vi.resetModules();

  sendMailMock = vi.fn().mockResolvedValue({
    messageId: "mail_provider_message_123",
    response: "250 queued",
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      mail: {
        provider: mailProvider,
        defaults: {
          fromName: "Kiwi Events Test",
          fromEmail: "noreply@example.test",
          replyTo: "reply@example.test",
        },
        smtp: {
          host: "smtp.example.test",
          port: 587,
          secure: false,
          user: "smtp-user",
          pass: "smtp-pass",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    withDatabaseTransaction: async (callback) => callback({}),
  }));

  vi.doMock("../../../src/modules/mail/mail.transport.service.js", () => ({
    getDefaultMailSender: () => ({
      fromName: "Kiwi Events Test",
      fromEmail: "noreply@example.test",
      replyTo: "reply@example.test",
    }),
    sendMail: sendMailMock,
    clearCachedMailTransporter: vi.fn(),
    verifyMailTransport: vi.fn().mockResolvedValue(true),
  }));

  const emailTemplateModelModule =
    await import("../../../src/modules/mail/mailTemplate.model.js");
  const emailLogModelModule =
    await import("../../../src/modules/mail/mailLog.model.js");
  const mailConstantsModule =
    await import("../../../src/modules/mail/mail.constants.js");
  const mailDispatchServiceModule =
    await import("../../../src/modules/mail/mail.dispatch.service.js");

  EmailTemplate = emailTemplateModelModule.EmailTemplate;
  EmailLog = emailLogModelModule.EmailLog;

  EMAIL_TEMPLATE_STATUS = mailConstantsModule.EMAIL_TEMPLATE_STATUS;
  EMAIL_LOG_STATUS = mailConstantsModule.EMAIL_LOG_STATUS;
  EMAIL_DELIVERY_MODE = mailConstantsModule.EMAIL_DELIVERY_MODE;
  MAIL_TEMPLATE_KEYS = mailConstantsModule.MAIL_TEMPLATE_KEYS;

  dispatchTemplateMailSafe = mailDispatchServiceModule.dispatchTemplateMailSafe;
  dispatchTemplateMail = mailDispatchServiceModule.dispatchTemplateMail;
}

async function createTemplate(overrides = {}) {
  return EmailTemplate.create({
    key: "test.template",
    module: "tests",
    category: "integration",
    name: "Test Template",
    description: "Template used by mail dispatch integration tests.",
    subject: "Hello {{firstName}} - {{eventTitle}}",
    html: "<p>Hello {{firstName}}, welcome to {{eventTitle}}.</p>",
    text: "Hello {{firstName}}, welcome to {{eventTitle}}.",
    variables: ["firstName", "eventTitle"],
    fromName: "",
    fromEmail: "",
    replyTo: "",
    status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    isSystem: false,
    ...overrides,
  });
}

function source(entityId) {
  return {
    module: "orders",
    entityType: "Order",
    entityId,
  };
}

describe("Mail dispatch MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadMailDispatchIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    sendMailMock?.mockClear();
    sendMailMock?.mockResolvedValue({
      messageId: "mail_provider_message_123",
      response: "250 queued",
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends an active template mail and stores a sent email log", async () => {
    const template = await createTemplate({
      key: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
      module: "orders",
      subject: "Your ticket for {{eventTitle}}",
      html: "<p>Hello {{firstName}}, your ticket for {{eventTitle}} is ready.</p>",
      text: "Hello {{firstName}}, your ticket for {{eventTitle}} is ready.",
      variables: ["firstName", "eventTitle"],
    });

    const result = await dispatchTemplateMailSafe({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
      to: { email: "Kunde@Example.com", name: "Max Kunde" },
      variables: { firstName: "Max", eventTitle: "Demo Event" },
      source: source("6a0000000000000000000001"),
      context: { eventUserId: "6a0000000000000000000002" },
    });

    expect(result).toMatchObject({
      success: true,
      skipped: false,
      providerMessageId: "mail_provider_message_123",
      auditFinalized: true,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: "kunde@example.com", name: "Max Kunde" },
        subject: "Your ticket for Demo Event",
        html: "<p>Hello Max, your ticket for Demo Event is ready.</p>",
        text: "Hello Max, your ticket for Demo Event is ready.",
        headers: expect.objectContaining({
          "X-kiwi-events-Category": MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
        }),
      }),
    );

    const logs = await EmailLog.find().lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
      templateId: template._id,
      module: "orders",
      to: { email: "kunde@example.com", name: "Max Kunde" },
      subjectSnapshot: "Your ticket for Demo Event",
      status: EMAIL_LOG_STATUS.SENT,
      provider: "smtp",
      providerMessageId: "mail_provider_message_123",
      attempts: 1,
    });
    expect(String(logs[0].source.entityId)).toBe("6a0000000000000000000001");
    expect(String(logs[0].createdByEventUserId)).toBe(
      "6a0000000000000000000002",
    );
  });

  it("creates a failed email log when the template is missing", async () => {
    const result = await dispatchTemplateMailSafe({
      templateKey: "missing.template",
      to: { email: "kunde@example.com", name: "Max Kunde" },
      variables: { firstName: "Max" },
      source: {
        module: "tests",
        entityType: "TestEntity",
        entityId: "6a0000000000000000000003",
      },
    });

    expect(result).toMatchObject({
      success: false,
      status: 404,
      error: 'Email template with key "missing.template" was not found',
    });
    expect(sendMailMock).not.toHaveBeenCalled();

    const [log] = await EmailLog.find().lean();
    expect(log).toMatchObject({
      templateKey: "missing.template",
      subjectSnapshot: "[missing template: missing.template]",
      status: EMAIL_LOG_STATUS.FAILED,
      attempts: 0,
    });
  });

  it("skips inactive templates before provider delivery", async () => {
    await createTemplate({
      key: "inactive.template",
      status: EMAIL_TEMPLATE_STATUS.INACTIVE,
      subject: "Inactive {{firstName}}",
      html: "<p>Inactive {{firstName}}</p>",
      text: "Inactive {{firstName}}",
      variables: ["firstName"],
    });

    const result = await dispatchTemplateMailSafe({
      templateKey: "inactive.template",
      to: "kunde@example.com",
      variables: { firstName: "Max" },
      source: {
        module: "tests",
        entityType: "TestEntity",
        entityId: "6a0000000000000000000004",
      },
    });

    expect(result).toMatchObject({
      success: false,
      skipped: true,
      reason: "template_inactive",
      missingVariables: [],
    });
    expect(sendMailMock).not.toHaveBeenCalled();

    const [log] = await EmailLog.find().lean();
    expect(log).toMatchObject({
      status: EMAIL_LOG_STATUS.SKIPPED,
      errorMessage: "Template is inactive",
      attempts: 0,
    });
  });

  it("rejects missing variables before provider delivery", async () => {
    await createTemplate({ key: "missing.variables" });

    const result = await dispatchTemplateMailSafe({
      templateKey: "missing.variables",
      to: "kunde@example.com",
      variables: { firstName: "Max" },
      source: {
        module: "tests",
        entityType: "TestEntity",
        entityId: "6a0000000000000000000005",
      },
    });

    expect(result).toMatchObject({
      success: false,
      status: 422,
      extra: expect.objectContaining({ missingVariables: ["eventTitle"] }),
    });
    expect(sendMailMock).not.toHaveBeenCalled();

    const [log] = await EmailLog.find().lean();
    expect(log).toMatchObject({
      status: EMAIL_LOG_STATUS.FAILED,
      attempts: 0,
      subjectSnapshot: "Hello Max - {{eventTitle}}",
    });
  });

  it("deduplicates ONCE_PER_SOURCE delivery atomically", async () => {
    await createTemplate({ key: "atomic.once" });
    const mailSource = source("6a0000000000000000000010");
    const payload = {
      templateKey: "atomic.once",
      to: "kunde@example.com",
      variables: { firstName: "Max", eventTitle: "Demo Event" },
      source: mailSource,
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    };

    const first = await dispatchTemplateMailSafe(payload);
    const second = await dispatchTemplateMailSafe(payload);

    expect(first).toMatchObject({ success: true, skipped: false });
    expect(second).toMatchObject({
      success: true,
      skipped: true,
      reason: "mail_already_sent",
      emailLogId: first.emailLogId,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const logs = await EmailLog.find({ templateKey: "atomic.once" }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      status: EMAIL_LOG_STATUS.SENT,
      attempts: 1,
      deliveryKey: buildDeliveryKey({
        templateKey: "atomic.once",
        source: mailSource,
      }),
    });
  });

  it("reclaims FAILED ONCE_PER_SOURCE delivery and increments attempts", async () => {
    await createTemplate({ key: "atomic.retry" });
    const mailSource = source("6a0000000000000000000011");
    const payload = {
      templateKey: "atomic.retry",
      to: "kunde@example.com",
      variables: { firstName: "Max", eventTitle: "Demo Event" },
      source: mailSource,
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    };

    sendMailMock.mockRejectedValueOnce(new Error("SMTP provider down"));
    const first = await dispatchTemplateMailSafe(payload);
    const second = await dispatchTemplateMailSafe(payload);

    expect(first).toMatchObject({ success: false, status: 502 });
    expect(second).toMatchObject({ success: true, skipped: false });
    expect(sendMailMock).toHaveBeenCalledTimes(2);

    const logs = await EmailLog.find({ templateKey: "atomic.retry" }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      status: EMAIL_LOG_STATUS.SENT,
      attempts: 2,
    });
  });

  it("marks an expired SENDING claim UNKNOWN instead of resending", async () => {
    await createTemplate({ key: "atomic.unknown" });
    const mailSource = source("6a0000000000000000000012");
    const deliveryKey = buildDeliveryKey({
      templateKey: "atomic.unknown",
      source: mailSource,
    });

    await EmailLog.create({
      templateKey: "atomic.unknown",
      module: "orders",
      to: { email: "kunde@example.com", name: "" },
      subjectSnapshot: "Unknown delivery",
      status: EMAIL_LOG_STATUS.SENDING,
      provider: "smtp",
      attempts: 1,
      source: mailSource,
      deliveryKey,
      deliveryClaimToken: "expired-claim",
      deliveryClaimExpiresAt: new Date(Date.now() - 60_000),
    });

    const result = await dispatchTemplateMailSafe({
      templateKey: "atomic.unknown",
      to: "kunde@example.com",
      variables: { firstName: "Max", eventTitle: "Demo Event" },
      source: mailSource,
      deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    });

    expect(result).toMatchObject({
      success: false,
      skipped: false,
      retryable: false,
      manualReviewRequired: true,
      reason: "mail_delivery_state_unknown",
    });
    expect(sendMailMock).not.toHaveBeenCalled();

    const log = await EmailLog.findOne({ deliveryKey }).lean();
    expect(log).toMatchObject({
      status: EMAIL_LOG_STATUS.UNKNOWN,
      deliveryClaimToken: "",
      attempts: 1,
    });
    expect(log.deliveryClaimExpiresAt).toBeNull();
  });

  it("throws from dispatchTemplateMail when recipient email is missing", async () => {
    await createTemplate({ key: "recipient.required" });

    await expect(
      dispatchTemplateMail({
        templateKey: "recipient.required",
        to: { email: "", name: "No Email" },
        variables: {},
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Recipient email is required",
    });

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(await EmailLog.countDocuments()).toBe(0);
  });
});
