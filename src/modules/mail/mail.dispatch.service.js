import { createHash, randomUUID } from "node:crypto";

import {
  EMAIL_DELIVERY_CLAIM_TTL_MS,
  EMAIL_DELIVERY_MODE,
  EMAIL_LOG_STATUS,
  EMAIL_TEMPLATE_STATUS,
} from "./mail.constants.js";
import {
  findMissingTemplateVariables,
  renderEmailTemplate,
} from "./mail.render.service.js";
import { getDefaultMailSender, sendMail } from "./mail.transport.service.js";
import { env } from "../../config/env.js";
import {
  claimEmailDelivery,
  createEmailLog,
  findEmailTemplateByKey,
  updateClaimedEmailDelivery,
  updateEmailLogById,
} from "./repositories/mail.repository.js";

/**
 * Creates an HTTP-style error object.
 *
 * @param {number} status
 * @param {string} message
 * @param {object} [extra]
 * @returns {Error & { status?: number, extra?: object }}
 */
function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}

/**
 * Normalizes any value into a trimmed string.
 *
 * @param {unknown} value
 * @returns {string}
 */
function cleanString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Normalizes an email value.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

/**
 * Normalizes a single recipient input.
 *
 * @param {string|object|null|undefined} recipient
 * @returns {{ email: string, name: string }|null}
 */
function normalizeRecipient(recipient) {
  if (!recipient) return null;

  if (typeof recipient === "string") {
    return {
      email: normalizeEmail(recipient),
      name: "",
    };
  }

  return {
    email: normalizeEmail(recipient.email),
    name: cleanString(recipient.name),
  };
}

/**
 * Normalizes a recipient or recipient list into a clean array.
 *
 * @param {string|object|Array<string|object>|null|undefined} value
 * @returns {{ email: string, name: string }[]}
 */
function normalizeRecipients(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(normalizeRecipient).filter((entry) => entry?.email);
  }

  const single = normalizeRecipient(value);
  return single?.email ? [single] : [];
}

/**
 * Normalizes the source metadata for an email log.
 *
 * @param {object} source
 * @returns {{ module: string, entityType: string, entityId: unknown }}
 */
function normalizeSource(source = {}) {
  return {
    module: cleanString(source.module).toLowerCase(),
    entityType: cleanString(source.entityType),
    entityId: source.entityId || null,
  };
}
function buildEmailDeliveryKey({ templateKey, source }) {
  const key = cleanString(templateKey).toLowerCase();

  const module = cleanString(source?.module).toLowerCase();

  const entityType = cleanString(source?.entityType);

  const entityId = cleanString(source?.entityId);

  if (!key || !module || !entityType || !entityId) {
    throw httpError(
      400,
      "ONCE_PER_SOURCE mail delivery requires templateKey and a complete source.",
    );
  }

  return createHash("sha256")
    .update([key, module, entityType, entityId].join("\u001f"))
    .digest("hex");
}
function buildSeededEmailDeliveryKey({ messageKey, deliveryKeySeed }) {
  const key = cleanString(messageKey).toLowerCase();

  const seed = cleanString(deliveryKeySeed);

  if (!key || !seed) {
    throw httpError(
      400,
      "messageKey and deliveryKeySeed are required for seeded mail delivery.",
    );
  }

  return createHash("sha256").update([key, seed].join("\u001f")).digest("hex");
}
/**
 * Builds the actor fields stored on email logs.
 *
 * @param {object} context
 * @returns {{ createdByEventUserId: string|null }}
 */
function actorIdsFromContext(context = {}) {
  return {
    createdByEventUserId: context.eventUserId || null,
  };
}
export async function dispatchPreparedMail({
  messageKey,
  templateId = null,
  module = "mail",

  to,
  cc = [],
  bcc = [],

  fromName = "",
  fromEmail = "",
  replyTo = "",

  subject,
  html = "",
  text = "",

  variablesSnapshot = {},

  source = {},
  context = {},

  headers = {},
  attachments = [],

  deliveryMode = EMAIL_DELIVERY_MODE.ALWAYS,

  deliveryKeySeed = null,
}) {
  const key = cleanString(messageKey).toLowerCase();

  if (!key) {
    throw httpError(400, "messageKey is required");
  }

  const toRecipient = normalizeRecipient(to);
  const ccRecipients = normalizeRecipients(cc);
  const bccRecipients = normalizeRecipients(bcc);

  if (!toRecipient?.email) {
    throw httpError(400, "Recipient email is required");
  }

  const finalSubject = cleanString(subject);

  if (!finalSubject) {
    throw httpError(400, "Mail subject is required");
  }

  if (!html && !text) {
    throw httpError(400, "Mail html or text body is required");
  }

  const normalizedSource = normalizeSource(source);

  const actorIds = actorIdsFromContext(context);

  const defaults = getDefaultMailSender();

  const finalFromName = cleanString(fromName) || defaults.fromName;

  const finalFromEmail = normalizeEmail(fromEmail) || defaults.fromEmail;

  const finalReplyTo = normalizeEmail(replyTo) || defaults.replyTo;

  const sendingLogData = {
    templateKey: key,

    templateId,

    module: cleanString(module).toLowerCase() || normalizedSource.module,

    to: toRecipient,
    cc: ccRecipients,
    bcc: bccRecipients,

    fromName: finalFromName,
    fromEmail: finalFromEmail,
    replyTo: finalReplyTo,

    subjectSnapshot: finalSubject,
    htmlSnapshot: html || "",
    textSnapshot: text || "",

    variablesSnapshot: variablesSnapshot || {},

    provider: env.mail.provider || "smtp",

    source: normalizedSource,

    ...actorIds,
  };

  let log;
  let claimToken = null;

  if (deliveryMode === EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE) {
    const deliveryKey = deliveryKeySeed
      ? buildSeededEmailDeliveryKey({
          messageKey: key,
          deliveryKeySeed,
        })
      : buildEmailDeliveryKey({
          templateKey: key,
          source: normalizedSource,
        });

    claimToken = randomUUID();

    const claimExpiresAt = new Date(Date.now() + EMAIL_DELIVERY_CLAIM_TTL_MS);

    const claim = await claimEmailDelivery(
      {
        deliveryKey,
        claimToken,
        claimExpiresAt,

        data: sendingLogData,
      },
      {
        lean: true,
      },
    );

    if (!claim.claimed) {
      if (claim.log?.status === EMAIL_LOG_STATUS.SENT) {
        return {
          success: true,
          skipped: true,

          reason: "mail_already_sent",

          emailLogId: claim.log?.id || null,

          providerMessageId: claim.log?.providerMessageId || "",
        };
      }
      if (claim.log?.status === EMAIL_LOG_STATUS.UNKNOWN) {
        return {
          success: false,
          skipped: false,

          retryable: false,
          manualReviewRequired: true,

          reason: "mail_delivery_state_unknown",

          emailLogId: claim.log?.id || null,
        };
      }

      return {
        success: false,
        skipped: true,
        retryable: true,

        reason: "mail_delivery_in_progress",

        emailLogId: claim.log?.id || null,
      };
    }

    log = claim.log;
  } else if (deliveryMode === EMAIL_DELIVERY_MODE.ALWAYS) {
    log = await createEmailLog(
      {
        ...sendingLogData,

        status: EMAIL_LOG_STATUS.SENDING,

        attempts: 1,
      },
      {
        lean: true,
      },
    );
  } else {
    throw httpError(400, `Unsupported email delivery mode "${deliveryMode}"`);
  }

  let result;

  try {
    result = await sendMail({
      to: toRecipient,

      cc: ccRecipients,
      bcc: bccRecipients,

      fromName: finalFromName,
      fromEmail: finalFromEmail,
      replyTo: finalReplyTo,

      subject: finalSubject,

      html,
      text,

      headers: {
        ...headers,

        "X-kiwi-events-Category": key,
      },

      attachments,
    });
  } catch (error) {
    const failedData = {
      status: EMAIL_LOG_STATUS.FAILED,

      errorMessage: error?.message || "Mail delivery failed",
    };

    try {
      if (claimToken) {
        await updateClaimedEmailDelivery(
          {
            emailLogId: log.id,
            claimToken,
            data: failedData,
          },
          {
            lean: true,
          },
        );
      } else {
        await updateEmailLogById(log.id, failedData, {
          lean: true,
        });
      }
    } catch (logError) {
      console.error("[mail] failed to persist provider delivery failure", {
        emailLogId: log.id,
        messageKey: key,
        error: logError?.message || String(logError),
      });
    }

    throw httpError(502, "Mail delivery failed", {
      emailLogId: log.id,

      error: error?.message,
    });
  }

  const sentData = {
    status: EMAIL_LOG_STATUS.SENT,

    providerMessageId: result.messageId || "",

    errorMessage: "",

    sentAt: new Date(),
  };

  let updatedLog = null;

  try {
    updatedLog = claimToken
      ? await updateClaimedEmailDelivery(
          {
            emailLogId: log.id,
            claimToken,
            data: sentData,
          },
          {
            lean: true,
          },
        )
      : await updateEmailLogById(log.id, sentData, {
          lean: true,
        });
  } catch (error) {
    console.error(
      "[mail] provider accepted mail but SENT audit finalization failed",
      {
        emailLogId: log.id,
        messageKey: key,

        providerMessageId: result.messageId || "",

        error: error?.message || String(error),
      },
    );
  }

  if (claimToken && !updatedLog) {
    console.error(
      "[mail] provider accepted mail but delivery claim could not be finalized",
      {
        emailLogId: log.id,
        messageKey: key,

        providerMessageId: result.messageId || "",
      },
    );
  }

  return {
    success: true,
    skipped: false,

    emailLogId: updatedLog?.id || log.id,

    providerMessageId: result.messageId || "",

    auditFinalized: Boolean(updatedLog),
  };
}
export async function dispatchPreparedMailSafe(payload) {
  try {
    return await dispatchPreparedMail(payload);
  } catch (error) {
    console.error(
      "[mail] dispatchPreparedMailSafe failed:",
      error?.message || error,
    );

    return {
      success: false,
      skipped: false,

      reason: "mail_delivery_error",

      error: error?.message || "Mail delivery failed",

      status: error?.status || 500,

      extra: error?.extra || null,
    };
  }
}
export async function dispatchTemplateMail({
  templateKey,
  to,
  cc = [],
  bcc = [],
  variables = {},
  source = {},
  context = {},
  headers = {},
  attachments = [],
  allowMissingVariables = false,
  deliveryMode = EMAIL_DELIVERY_MODE.ALWAYS,
}) {
  const key = cleanString(templateKey).toLowerCase();

  if (!key) {
    throw httpError(400, "templateKey is required");
  }

  const toRecipient = normalizeRecipient(to);
  const ccRecipients = normalizeRecipients(cc);
  const bccRecipients = normalizeRecipients(bcc);

  if (!toRecipient?.email) {
    throw httpError(400, "Recipient email is required");
  }

  const normalizedSource = normalizeSource(source);

  const actorIds = actorIdsFromContext(context);

  const template = await findEmailTemplateByKey(key, {
    lean: true,
  });

  if (!template) {
    const message = `Email template with key "${key}" was not found`;

    const log = await createEmailLog(
      {
        templateKey: key,
        templateId: null,

        module: normalizedSource.module || "mail",

        to: toRecipient,
        cc: ccRecipients,
        bcc: bccRecipients,

        fromName: "",
        fromEmail: "",
        replyTo: "",

        subjectSnapshot: `[missing template: ${key}]`,

        htmlSnapshot: "",
        textSnapshot: "",

        variablesSnapshot: variables || {},

        status: EMAIL_LOG_STATUS.FAILED,

        provider: env.mail.provider || "smtp",

        errorMessage: message,

        attempts: 0,

        source: normalizedSource,

        ...actorIds,
      },
      {
        lean: true,
      },
    );

    throw httpError(404, message, {
      emailLogId: log.id,
    });
  }

  const defaults = getDefaultMailSender();

  const fromName = template.fromName || defaults.fromName;

  const fromEmail = template.fromEmail || defaults.fromEmail;

  const replyTo = template.replyTo || defaults.replyTo;

  const rendered = renderEmailTemplate(template, variables);

  const missingVariables = findMissingTemplateVariables(
    template,
    variables || {},
  );

  if (template.status !== EMAIL_TEMPLATE_STATUS.ACTIVE) {
    const log = await createEmailLog(
      {
        templateKey: template.key,
        templateId: template.id,

        module: template.module || normalizedSource.module,

        to: toRecipient,
        cc: ccRecipients,
        bcc: bccRecipients,

        fromName,
        fromEmail,
        replyTo,

        subjectSnapshot: rendered.subject || template.subject,

        htmlSnapshot: rendered.html || "",

        textSnapshot: rendered.text || "",

        variablesSnapshot: variables || {},

        status: EMAIL_LOG_STATUS.SKIPPED,

        provider: env.mail.provider || "smtp",

        errorMessage: "Template is inactive",

        attempts: 0,

        source: normalizedSource,

        ...actorIds,
      },
      {
        lean: true,
      },
    );

    return {
      success: false,
      skipped: true,

      reason: "template_inactive",

      emailLogId: log.id,

      missingVariables,
    };
  }

  if (missingVariables.length > 0 && !allowMissingVariables) {
    const message = `Required email template variables are missing: ${missingVariables.join(
      ", ",
    )}`;

    const log = await createEmailLog(
      {
        templateKey: template.key,
        templateId: template.id,

        module: template.module || normalizedSource.module,

        to: toRecipient,
        cc: ccRecipients,
        bcc: bccRecipients,

        fromName,
        fromEmail,
        replyTo,

        subjectSnapshot: rendered.subject || template.subject,

        htmlSnapshot: rendered.html || "",

        textSnapshot: rendered.text || "",

        variablesSnapshot: variables || {},

        status: EMAIL_LOG_STATUS.FAILED,

        provider: env.mail.provider || "smtp",

        errorMessage: message,

        attempts: 0,

        source: normalizedSource,

        ...actorIds,
      },
      {
        lean: true,
      },
    );

    throw httpError(422, message, {
      emailLogId: log.id,
      missingVariables,
    });
  }

  return dispatchPreparedMail({
    messageKey: template.key,

    templateId: template.id,

    module: template.module || normalizedSource.module,

    to: toRecipient,

    cc: ccRecipients,

    bcc: bccRecipients,

    fromName,
    fromEmail,
    replyTo,

    subject: rendered.subject,

    html: rendered.html,

    text: rendered.text,

    variablesSnapshot: variables || {},

    source: normalizedSource,

    context,

    headers,
    attachments,

    deliveryMode,
  });
}

/**
 * Dispatches an email and converts failures into a safe result object.
 */
export async function dispatchTemplateMailSafe(payload) {
  try {
    return await dispatchTemplateMail(payload);
  } catch (error) {
    console.error(
      "[mail] dispatchTemplateMailSafe failed:",
      error?.message || error,
    );

    return {
      success: false,
      error: error?.message || "Mail delivery failed",
      status: error?.status || 500,
      extra: error?.extra || null,
    };
  }
}
