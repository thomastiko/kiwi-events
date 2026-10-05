import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEmailTemplate: vi.fn(),
  deleteEmailTemplateById: vi.fn(),
  findEmailLogById: vi.fn(),
  findEmailTemplateById: vi.fn(),
  findEmailTemplateByKey: vi.fn(),
  listEmailLogs: vi.fn(),
  listEmailTemplates: vi.fn(),
  updateEmailTemplateById: vi.fn(),
  dispatchTemplateMail: vi.fn(),
}));

vi.mock("../../../src/modules/mail/repositories/mail.repository.js", () => ({
  createEmailTemplate: mocks.createEmailTemplate,
  deleteEmailTemplateById: mocks.deleteEmailTemplateById,
  findEmailLogById: mocks.findEmailLogById,
  findEmailTemplateById: mocks.findEmailTemplateById,
  findEmailTemplateByKey: mocks.findEmailTemplateByKey,
  listEmailLogs: mocks.listEmailLogs,
  listEmailTemplates: mocks.listEmailTemplates,
  updateEmailTemplateById: mocks.updateEmailTemplateById,
}));

vi.mock("../../../src/modules/mail/mail.dispatch.service.js", () => ({
  dispatchTemplateMail: mocks.dispatchTemplateMail,
}));

const {
  createMailTemplateInternalService,
  deleteMailTemplateInternalService,
  updateMailTemplateInternalService,
} = await import("../../../src/modules/mail/internal/mail.internal.service.js");
const { MAIL_TEMPLATE_KEYS } =
  await import("../../../src/modules/mail/mail.constants.js");

const actor = { eventUserId: "event-user-1" };

function systemTemplate(overrides = {}) {
  return {
    id: "template-system-1",
    key: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
    module: "orders",
    category: "confirmation",
    name: "Order confirmed",
    description: "System template",
    subject: "Subject",
    html: "<p>Body</p>",
    text: "Body",
    variables: [],
    fromName: "",
    fromEmail: "",
    replyTo: "",
    status: "active",
    isSystem: true,
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mail internal system template protection", () => {
  it("rejects creating a custom template with a reserved system key", async () => {
    await expect(
      createMailTemplateInternalService({
        actor,
        payload: {
          key: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
          module: "custom",
          category: "custom",
          name: "Reserved",
          description: "",
          subject: "Subject",
          html: "<p>Body</p>",
          text: "Body",
          variables: [],
          fromName: "",
          fromEmail: "",
          replyTo: "",
          status: "active",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SYSTEM_MAIL_TEMPLATE_KEY_RESERVED",
    });

    expect(mocks.findEmailTemplateByKey).not.toHaveBeenCalled();
    expect(mocks.createEmailTemplate).not.toHaveBeenCalled();
  });

  it("forces created custom templates to isSystem false", async () => {
    mocks.findEmailTemplateByKey.mockResolvedValue(null);
    mocks.createEmailTemplate.mockImplementation(async (data) => ({
      id: "template-custom-1",
      ...data,
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      updatedAt: new Date("2030-01-01T00:00:00.000Z"),
    }));

    await createMailTemplateInternalService({
      actor,
      payload: {
        key: "Custom.Notification",
        module: "Custom",
        category: "Custom",
        name: "Custom",
        description: "",
        subject: "Subject",
        html: "<p>Body</p>",
        text: "Body",
        variables: [],
        fromName: "",
        fromEmail: "",
        replyTo: "",
        status: "active",
        isSystem: true,
      },
    });

    expect(mocks.createEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "custom.notification",
        module: "custom",
        category: "custom",
        isSystem: false,
      }),
      { lean: true },
    );
  });

  it("rejects changing a system template key or module", async () => {
    mocks.findEmailTemplateById.mockResolvedValue(systemTemplate());

    await expect(
      updateMailTemplateInternalService({
        actor,
        id: "template-system-1",
        payload: { key: "changed.key" },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SYSTEM_MAIL_TEMPLATE_IDENTITY_PROTECTED",
    });

    await expect(
      updateMailTemplateInternalService({
        actor,
        id: "template-system-1",
        payload: { module: "changed" },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SYSTEM_MAIL_TEMPLATE_IDENTITY_PROTECTED",
    });

    expect(mocks.updateEmailTemplateById).not.toHaveBeenCalled();
  });

  it("allows editing system template content and status", async () => {
    const current = systemTemplate();
    mocks.findEmailTemplateById.mockResolvedValue(current);
    mocks.updateEmailTemplateById.mockImplementation(async (_id, data) => ({
      ...current,
      ...data,
      updatedAt: new Date("2030-01-02T00:00:00.000Z"),
    }));

    const result = await updateMailTemplateInternalService({
      actor,
      id: current.id,
      payload: {
        subject: "Updated subject",
        html: "<p>Updated</p>",
        status: "inactive",
      },
    });

    expect(mocks.updateEmailTemplateById).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        key: current.key,
        subject: "Updated subject",
        html: "<p>Updated</p>",
        status: "inactive",
        updatedByEventUserId: actor.eventUserId,
      }),
      { lean: true },
    );
    expect(result).toMatchObject({
      id: current.id,
      key: current.key,
      module: current.module,
      subject: "Updated subject",
      status: "inactive",
      isSystem: true,
    });
  });

  it("rejects deleting a system template", async () => {
    mocks.findEmailTemplateById.mockResolvedValue(systemTemplate());

    await expect(
      deleteMailTemplateInternalService({ id: "template-system-1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SYSTEM_MAIL_TEMPLATE_CANNOT_BE_DELETED",
    });

    expect(mocks.deleteEmailTemplateById).not.toHaveBeenCalled();
  });
});
