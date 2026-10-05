import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMailTransportService({
  provider = "resend",
  fetchResponse = {
    ok: true,
    status: 200,
    statusText: "OK",
    text: vi.fn().mockResolvedValue(JSON.stringify({ id: "resend_email_123" })),
  },
} = {}) {
  vi.resetModules();

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fetchResponse));

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      mail: {
        provider,
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
        resend: {
          apiKey: "re_test_123",
          timeoutMs: 5000,
        },
      },
    },
  }));

  return import("../../../src/modules/mail/mail.transport.service.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("mail.transport.service Resend", () => {
  it("sends a normalized mail payload through the Resend API", async () => {
    const { sendMail } = await loadMailTransportService();

    const result = await sendMail({
      to: {
        email: "kunde@example.test",
        name: "Max Kunde",
      },
      cc: [{ email: "team@example.test", name: "Team" }],
      bcc: ["audit@example.test"],
      subject: "Your ticket",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: {
        "X-kiwi-events-Category": "order.confirmed",
      },
      attachments: [
        {
          filename: "ticket.pdf",
          content: Buffer.from("PDF content"),
          contentType: "application/pdf",
        },
      ],
    });

    expect(result).toEqual({
      messageId: "resend_email_123",
      response: "resend:resend_email_123",
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(url).toBe("https://api.resend.com/emails");
    expect(options).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer re_test_123",
        "Content-Type": "application/json",
      },
    });

    expect(body).toMatchObject({
      from: '"Kiwi Events Test" <noreply@example.test>',
      to: ["kunde@example.test"],
      cc: ["team@example.test"],
      bcc: ["audit@example.test"],
      reply_to: "reply@example.test",
      subject: "Your ticket",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: {
        "X-kiwi-events-Category": "order.confirmed",
      },
      tags: [
        {
          name: "category",
          value: "order-confirmed",
        },
      ],
    });

    expect(body.attachments).toEqual([
      {
        filename: "ticket.pdf",
        content: Buffer.from("PDF content").toString("base64"),
      },
    ]);
  });

  it("throws a useful error when Resend rejects the request", async () => {
    const { sendMail } = await loadMailTransportService({
      fetchResponse: {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            message: "The from address is not verified.",
          }),
        ),
      },
    });

    await expect(
      sendMail({
        to: "kunde@example.test",
        subject: "Your ticket",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow(
      "Resend API request failed (403): The from address is not verified.",
    );
  });

  it("requires a Resend API key when Resend is active", async () => {
    vi.resetModules();

    vi.doMock("../../../src/config/env.js", () => ({
      env: {
        mail: {
          provider: "resend",
          defaults: {
            fromName: "Kiwi Events Test",
            fromEmail: "noreply@example.test",
            replyTo: "",
          },
          resend: {
            apiKey: "",
            timeoutMs: 5000,
          },
        },
      },
    }));

    const { sendMail } =
      await import("../../../src/modules/mail/mail.transport.service.js");

    await expect(
      sendMail({
        to: "kunde@example.test",
        subject: "Your ticket",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("MAIL_RESEND_API_KEY is missing");
  });
});
