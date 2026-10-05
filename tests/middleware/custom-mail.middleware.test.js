import { describe, expect, it, vi } from "vitest";

import {
  CUSTOM_MAIL_MAX_TOTAL_BYTES,
  validateCustomMailAttachmentTotal,
} from "../../src/core/middleware/customMailAttachment.middleware.js";
import { parseCustomMailMultipartBody } from "../../src/core/middleware/parseCustomMailMultipart.middleware.js";

describe("custom mail multipart middleware", () => {
  it("parses orderIds JSON from multipart fields", () => {
    const req = {
      body: {
        orderIds: '["order-1","order-2"]',
      },
    };
    const next = vi.fn();

    parseCustomMailMultipartBody(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.orderIds).toEqual(["order-1", "order-2"]);
  });

  it("removes an omitted orderIds field", () => {
    const req = {
      body: {
        orderIds: "",
      },
    };
    const next = vi.fn();

    parseCustomMailMultipartBody(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).not.toHaveProperty("orderIds");
  });

  it("forwards a structured error for invalid JSON", () => {
    const req = {
      body: {
        orderIds: "[invalid",
      },
    };
    const next = vi.fn();

    parseCustomMailMultipartBody(req, {}, next);

    const error = next.mock.calls[0][0];

    expect(error).toMatchObject({
      statusCode: 400,
      code: "INVALID_MULTIPART_JSON_FIELD",
    });
  });

  it("accepts attachments at the combined limit", () => {
    const next = vi.fn();

    validateCustomMailAttachmentTotal(
      {
        files: [{ size: CUSTOM_MAIL_MAX_TOTAL_BYTES - 1 }, { size: 1 }],
      },
      {},
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects attachments above the combined limit", () => {
    const next = vi.fn();

    validateCustomMailAttachmentTotal(
      {
        files: [{ size: CUSTOM_MAIL_MAX_TOTAL_BYTES }, { size: 1 }],
      },
      {},
      next,
    );

    const error = next.mock.calls[0][0];

    expect(error).toMatchObject({
      statusCode: 413,
      code: "CUSTOM_MAIL_ATTACHMENTS_TOO_LARGE",
    });
  });
});
