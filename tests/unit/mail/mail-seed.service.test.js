import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEmailTemplate: vi.fn(),
  findEmailTemplateByKey: vi.fn(),
  updateEmailTemplateById: vi.fn(),
}));

vi.mock("../../../src/modules/mail/repositories/mail.repository.js", () => ({
  createEmailTemplate: mocks.createEmailTemplate,
  findEmailTemplateByKey: mocks.findEmailTemplateByKey,
  updateEmailTemplateById: mocks.updateEmailTemplateById,
}));

const { DEFAULT_EVENT_EMAIL_TEMPLATES, seedDefaultEventEmailTemplates } =
  await import("../../../src/modules/mail/mail.seed.service.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mail system template seeding", () => {
  it("creates missing system templates", async () => {
    mocks.findEmailTemplateByKey.mockResolvedValue(null);

    const result = await seedDefaultEventEmailTemplates();

    expect(result).toEqual({
      success: true,
      created: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
      existing: 0,
      repaired: 0,
      total: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
    });
    expect(mocks.createEmailTemplate).toHaveBeenCalledTimes(
      DEFAULT_EVENT_EMAIL_TEMPLATES.length,
    );
    expect(mocks.updateEmailTemplateById).not.toHaveBeenCalled();
  });

  it("repairs only system identity and preserves editable content", async () => {
    mocks.findEmailTemplateByKey.mockImplementation(async (key) => {
      const definition = DEFAULT_EVENT_EMAIL_TEMPLATES.find(
        (template) => template.key === key,
      );

      return {
        id: `id-${key}`,
        key,
        module: `wrong-${definition.module}`,
        isSystem: false,
        subject: "Admin customized subject",
        html: "<p>Admin customized HTML</p>",
        status: "inactive",
      };
    });

    const result = await seedDefaultEventEmailTemplates();

    expect(result).toEqual({
      success: true,
      created: 0,
      existing: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
      repaired: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
      total: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
    });

    for (const definition of DEFAULT_EVENT_EMAIL_TEMPLATES) {
      expect(mocks.updateEmailTemplateById).toHaveBeenCalledWith(
        `id-${definition.key}`,
        {
          module: definition.module,
          isSystem: true,
        },
        { lean: true },
      );
    }

    for (const [, update] of mocks.updateEmailTemplateById.mock.calls) {
      expect(update).not.toHaveProperty("subject");
      expect(update).not.toHaveProperty("html");
      expect(update).not.toHaveProperty("status");
    }
  });

  it("does not write already-correct system templates", async () => {
    mocks.findEmailTemplateByKey.mockImplementation(async (key) => {
      const definition = DEFAULT_EVENT_EMAIL_TEMPLATES.find(
        (template) => template.key === key,
      );

      return {
        id: `id-${key}`,
        key,
        module: definition.module,
        isSystem: true,
      };
    });

    const result = await seedDefaultEventEmailTemplates();

    expect(result).toEqual({
      success: true,
      created: 0,
      existing: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
      repaired: 0,
      total: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
    });
    expect(mocks.createEmailTemplate).not.toHaveBeenCalled();
    expect(mocks.updateEmailTemplateById).not.toHaveBeenCalled();
  });
});
