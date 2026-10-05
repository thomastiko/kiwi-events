import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

const RESEND_API_URL = "https://api.resend.com/emails";

let cachedTransporter = null;
let cachedTransportKey = "";

function cleanString(value) {
  return String(value ?? "").trim();
}

function getActiveMailProvider() {
  return cleanString(env.mail?.provider || "disabled").toLowerCase();
}

function getSmtpTransportKey() {
  const smtp = env.mail.smtp || {};

  return JSON.stringify({
    provider: getActiveMailProvider(),
    host: smtp.host || "",
    port: Number(smtp.port) || 587,
    secure: Boolean(smtp.secure),
    user: smtp.user || "",
  });
}

export function clearCachedMailTransporter() {
  cachedTransporter = null;
  cachedTransportKey = "";
}

export function getDefaultMailSender() {
  return {
    fromName: env.mail.defaults.fromName || "kiwi-events",
    fromEmail: env.mail.defaults.fromEmail || "",
    replyTo: env.mail.defaults.replyTo || "",
  };
}

function assertSmtpConfig() {
  const provider = getActiveMailProvider();

  if (provider !== "smtp") {
    throw new Error(
      `SMTP mail provider is not active. Current provider is "${provider}".`,
    );
  }

  const { host, user, pass } = env.mail.smtp || {};

  if (!cleanString(host)) {
    throw new Error("MAIL_SMTP_HOST is missing");
  }

  if (!cleanString(user)) {
    throw new Error("MAIL_SMTP_USER is missing");
  }

  if (!cleanString(pass)) {
    throw new Error("MAIL_SMTP_PASS is missing");
  }
}

function assertResendConfig() {
  const provider = getActiveMailProvider();

  if (provider !== "resend") {
    throw new Error(
      `Resend mail provider is not active. Current provider is "${provider}".`,
    );
  }

  if (!cleanString(env.mail?.resend?.apiKey)) {
    throw new Error("MAIL_RESEND_API_KEY is missing");
  }
}

export function getMailTransporter() {
  assertSmtpConfig();

  const transportKey = getSmtpTransportKey();

  if (cachedTransporter && cachedTransportKey === transportKey) {
    return cachedTransporter;
  }

  const { host, port, secure, user, pass } = env.mail.smtp;

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: Boolean(secure),
    auth: {
      user,
      pass,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  cachedTransportKey = transportKey;

  return cachedTransporter;
}

function formatAddress({ email, name }) {
  if (!email) return "";

  const cleanEmail = cleanString(email);
  const cleanName = cleanString(name);

  if (!cleanName) return cleanEmail;

  return `"${cleanName.replaceAll('"', '\\"')}" <${cleanEmail}>`;
}

function normalizeSmtpRecipients(value) {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return cleanString(entry);
        return formatAddress(entry);
      })
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "string") return cleanString(value);

  return formatAddress(value);
}
function hasAttachmentContent(attachment) {
  return (
    attachment &&
    Object.prototype.hasOwnProperty.call(attachment, "content") &&
    attachment.content !== undefined &&
    attachment.content !== null
  );
}
function normalizeResendRecipients(value) {
  if (!value) return undefined;

  const list = Array.isArray(value) ? value : [value];
  const recipients = list
    .map((entry) => {
      if (typeof entry === "string") return cleanString(entry);
      return cleanString(entry?.email);
    })
    .filter(Boolean);

  return recipients.length ? recipients : undefined;
}

function normalizeSmtpAttachments(value) {
  if (!value) return undefined;

  const list = Array.isArray(value) ? value : [value];

  const attachments = list
    .filter(Boolean)
    .map((attachment) => {
      const filename = cleanString(attachment?.filename);

      if (!filename || !hasAttachmentContent(attachment)) {
        return null;
      }

      return {
        filename,
        content: attachment.content,
        contentType: attachment.contentType,
        cid: attachment.cid,
      };
    })
    .filter(Boolean);

  return attachments.length ? attachments : undefined;
}

function toBase64Content(value) {
  if (!value) return "";

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }

  return String(value);
}

function normalizeResendAttachments(value) {
  if (!value) return undefined;

  const list = Array.isArray(value) ? value : [value];

  const attachments = list
    .filter(Boolean)
    .map((attachment) => {
      const filename = cleanString(attachment?.filename);

      if (!filename || !hasAttachmentContent(attachment)) {
        return null;
      }

      return {
        filename,
        content: toBase64Content(attachment.content),
      };
    })
    .filter(Boolean);

  return attachments.length ? attachments : undefined;
}

function sanitizeResendTagValue(value) {
  const sanitized = cleanString(value)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 256);

  return sanitized || "general";
}

function buildResendTags(headers = {}) {
  const category =
    headers["X-kiwi-events-Category"] || headers["x-kiwi-events-category"];

  if (!category) return undefined;

  return [
    {
      name: "category",
      value: sanitizeResendTagValue(category),
    },
  ];
}

function buildValidatedMailMessage({
  to,
  cc = [],
  bcc = [],
  fromName,
  fromEmail,
  replyTo,
  subject,
  html,
  text,
  headers = {},
  attachments = [],
}) {
  const defaults = getDefaultMailSender();

  const finalFromEmail = cleanString(fromEmail || defaults.fromEmail);
  const finalFromName = cleanString(fromName || defaults.fromName);
  const finalReplyTo = cleanString(replyTo || defaults.replyTo);
  const finalSubject = cleanString(subject);

  if (!finalFromEmail) {
    throw new Error("MAIL_DEFAULT_FROM_EMAIL is missing in config or template");
  }

  if (!finalSubject) {
    throw new Error("Mail subject is required");
  }

  if (!html && !text) {
    throw new Error("Mail html or text body is required");
  }

  return {
    to,
    cc,
    bcc,
    fromName: finalFromName,
    fromEmail: finalFromEmail,
    replyTo: finalReplyTo,
    subject: finalSubject,
    html,
    text,
    headers,
    attachments,
  };
}

async function sendSmtpMail(message) {
  const transporter = getMailTransporter();

  const result = await transporter.sendMail({
    from: formatAddress({
      email: message.fromEmail,
      name: message.fromName,
    }),
    to: normalizeSmtpRecipients(message.to),
    cc: normalizeSmtpRecipients(message.cc),
    bcc: normalizeSmtpRecipients(message.bcc),
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
    attachments: normalizeSmtpAttachments(message.attachments),
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return {
    messageId: result.messageId || "",
    response: result.response || "",
  };
}

async function readResendResponse(response) {
  const rawText = await response.text();

  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch {
    return {
      message: rawText,
    };
  }
}

function getResendErrorMessage(response, body) {
  return (
    body?.message ||
    body?.error?.message ||
    body?.error ||
    response.statusText ||
    "Resend API request failed"
  );
}

async function sendResendMail(message) {
  assertResendConfig();

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available for Resend mail transport");
  }

  const timeoutMs = Number(env.mail?.resend?.timeoutMs) || 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    from: formatAddress({
      email: message.fromEmail,
      name: message.fromName,
    }),
    to: normalizeResendRecipients(message.to),
    cc: normalizeResendRecipients(message.cc),
    bcc: normalizeResendRecipients(message.bcc),
    reply_to: message.replyTo || undefined,
    subject: message.subject,
    html: message.html || undefined,
    text: message.text || undefined,
    headers: Object.keys(message.headers || {}).length
      ? message.headers
      : undefined,
    attachments: normalizeResendAttachments(message.attachments),
    tags: buildResendTags(message.headers),
  };

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.mail.resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await readResendResponse(response);

    if (!response.ok) {
      throw new Error(
        `Resend API request failed (${response.status}): ${getResendErrorMessage(
          response,
          body,
        )}`,
      );
    }

    return {
      messageId: body?.id || "",
      response: body?.id ? `resend:${body.id}` : "resend:sent",
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Resend API request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendMail(payload) {
  const provider = getActiveMailProvider();

  if (provider === "disabled") {
    throw new Error("Mail provider is disabled");
  }

  const message = buildValidatedMailMessage(payload || {});

  if (provider === "smtp") {
    return sendSmtpMail(message);
  }

  if (provider === "resend") {
    return sendResendMail(message);
  }

  throw new Error(`Unsupported mail provider "${provider}"`);
}

export async function verifyMailTransport() {
  const provider = getActiveMailProvider();

  if (provider === "smtp") {
    const transporter = getMailTransporter();
    return transporter.verify();
  }

  if (provider === "resend") {
    assertResendConfig();
    return true;
  }

  throw new Error(`Unsupported mail provider "${provider}"`);
}
