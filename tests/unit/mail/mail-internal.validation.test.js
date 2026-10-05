import { describe, expect, it } from "vitest";

import {
  createMailTemplateSchema,
  listMailLogsSchema,
  updateMailTemplateSchema,
} from "../../../src/modules/mail/internal/mail.internal.validation.js";

const empty = {};

describe("mail internal validation", () => {
  it("accepts UNKNOWN as a mail log filter status", () => {
    const result = listMailLogsSchema.safeParse({
      body: empty,
      params: empty,
      query: {
        status: "unknown",
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.query.status).toBe("unknown");
  });

  it("does not expose isSystem as a create or update input", () => {
    const createResult = createMailTemplateSchema.safeParse({
      params: empty,
      query: empty,
      body: {
        key: "custom.template",
        module: "custom",
        name: "Custom template",
        subject: "Subject",
        html: "<p>Body</p>",
        isSystem: true,
      },
    });

    expect(createResult.success).toBe(true);
    expect(createResult.data.body).not.toHaveProperty("isSystem");

    const updateResult = updateMailTemplateSchema.safeParse({
      params: { id: "64f000000000000000000001" },
      query: empty,
      body: {
        subject: "Updated",
        isSystem: false,
      },
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data.body).not.toHaveProperty("isSystem");
  });
});
