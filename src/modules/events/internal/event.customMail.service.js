import path from "node:path";

import { features } from "../../../config/features.js";

import {
  EMAIL_DELIVERY_MODE,
  EMAIL_MESSAGE_KEYS,
} from "../../mail/mail.constants.js";

import { dispatchPreparedMailSafe } from "../../mail/mail.dispatch.service.js";

import { executeMailBatch } from "../../mail/mail.batch.service.js";

import { renderEmailTemplate } from "../../mail/mail.render.service.js";

import { getOrderBuyerRecipient } from "../../orders/order.buyerSnapshot.js";

import { canManageEvent } from "../../permissions/eventAuthorization.service.js";

import { findEventById } from "../repositories/event.repository.js";

import { findParticipantOrdersForEvent } from "../event.orderAudience.service.js";

import { buildEventMailVariables } from "../event.mailVariables.js";

import { EVENT_CUSTOM_MAIL_AUDIENCE } from "../event.constants.js";

import { findOrdersByIdsAndEventId } from "../../orders/repositories/order.repository.js";

import {
  customEventMailEmptyBodyError,
  customEventMailInvalidAudienceError,
  customEventMailUnavailableError,
  customEventMailUnsupportedVariablesError,
  eventAccessRequiredError,
  eventManageForbiddenError,
  eventNotFoundError,
} from "../event.errors.js";

import {
  customEventMailHtmlToText,
  findUnsupportedCustomEventMailVariables,
  sanitizeCustomEventMailHtml,
} from "../event.customMail.content.js";

function sanitizeAttachmentFilename(value) {
  const filename = path
    .basename(String(value || ""))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return filename || "attachment";
}

function buildMailAttachments(files = []) {
  return files.map((file) => ({
    filename: sanitizeAttachmentFilename(file.originalname),

    content: file.buffer,

    contentType: file.mimetype,
  }));
}
function getAttachmentTotalBytes(files = []) {
  return files.reduce((total, file) => total + Number(file?.size || 0), 0);
}

function getCustomMailConcurrency(files = []) {
  const totalBytes = getAttachmentTotalBytes(files);

  if (totalBytes > 10 * 1024 * 1024) {
    return 1;
  }

  if (totalBytes > 2 * 1024 * 1024) {
    return 2;
  }

  return 5;
}
function normalizeRecipientEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildCustomMailRecipientGroups(orders = []) {
  const groupsByEmail = new Map();

  const missingRecipientGroups = [];

  for (const order of orders) {
    const recipient = getOrderBuyerRecipient(order);

    const email = normalizeRecipientEmail(recipient?.email);
    if (!email) {
      missingRecipientGroups.push({
        recipient: null,

        representativeOrder: order,

        orderIds: [order.id],
      });

      continue;
    }

    const existing = groupsByEmail.get(email);

    if (existing) {
      existing.orderIds.push(order.id);

      continue;
    }

    groupsByEmail.set(email, {
      recipient: {
        ...recipient,
        email,
      },
      representativeOrder: order,

      orderIds: [order.id],
    });
  }

  return [...groupsByEmail.values(), ...missingRecipientGroups];
}
async function assertCanManageCustomMail(actor, event) {
  if (!actor?.eventUser || !actor?.eventUserId) {
    throw eventAccessRequiredError();
  }

  if (!(await canManageEvent(actor, event))) {
    throw eventManageForbiddenError();
  }
}
async function resolveCustomMailAudience({ eventId, audience, orderIds = [] }) {
  if (audience === EVENT_CUSTOM_MAIL_AUDIENCE.ALL) {
    return findParticipantOrdersForEvent(eventId);
  }

  const selectedOrders = await findOrdersByIdsAndEventId(
    {
      eventId,
      orderIds,
    },
    {
      lean: true,
    },
  );

  const participantOrders = await findParticipantOrdersForEvent(eventId, {
    orders: selectedOrders,
  });

  const participantsById = new Map(
    participantOrders.map((order) => [String(order.id), order]),
  );

  const invalidOrderIds = orderIds.filter(
    (orderId) => !participantsById.has(String(orderId)),
  );

  if (invalidOrderIds.length) {
    throw customEventMailInvalidAudienceError(invalidOrderIds);
  }

  return orderIds.map((orderId) => participantsById.get(String(orderId)));
}
export async function sendCustomEventMailService({
  eventId,
  payload,
  files = [],
  actor,
}) {
  if (!features.mail || !features.mailEventCustom) {
    throw customEventMailUnavailableError();
  }

  const event = await findEventById(eventId, {
    lean: true,
  });

  if (!event) {
    throw eventNotFoundError(eventId);
  }

  await assertCanManageCustomMail(actor, event);

  const htmlTemplate = sanitizeCustomEventMailHtml(payload.html);

  if (!htmlTemplate) {
    throw customEventMailEmptyBodyError();
  }

  const textTemplate =
    String(payload.text || "").trim() ||
    customEventMailHtmlToText(htmlTemplate);

  const unsupportedVariables = findUnsupportedCustomEventMailVariables({
    subject: payload.subject,

    html: htmlTemplate,

    text: textTemplate,
  });

  if (unsupportedVariables.length) {
    throw customEventMailUnsupportedVariablesError(unsupportedVariables);
  }

  const orders = await resolveCustomMailAudience({
    eventId: event.id,

    audience: payload.audience,

    orderIds: payload.orderIds || [],
  });

  const recipientGroups = buildCustomMailRecipientGroups(orders);

  const attachments = buildMailAttachments(files);

  const attachmentNames = attachments.map((attachment) => attachment.filename);
  const concurrency = getCustomMailConcurrency(files);
  const template = {
    subject: payload.subject,

    html: htmlTemplate,

    text: textTemplate,
  };

  const batch = await executeMailBatch({
    items: recipientGroups,
    concurrency,
    getMetadata: (group) => ({
      email: group.recipient?.email || null,

      orderIds: group.orderIds,
    }),

    worker: async (group) => {
      const recipient = group.recipient;

      if (!recipient?.email) {
        return {
          success: false,
          skipped: true,

          reason: "missing_buyer_email_snapshot",
        };
      }

      const baseVariables = buildEventMailVariables({
        event,

        order: group.representativeOrder,
      });

      const { orderNumber: _orderNumber, ...variables } = baseVariables;

      const rendered = renderEmailTemplate(template, variables);

      const result = await dispatchPreparedMailSafe({
        messageKey: EMAIL_MESSAGE_KEYS.EVENT_CUSTOM,

        module: "events",

        to: recipient,

        subject: rendered.subject,

        html: rendered.html,

        text: rendered.text,

        variablesSnapshot: {
          ...variables,

          customMailRequestId: payload.requestId,

          eventId: event.id,

          audience: payload.audience,

          participantOrderIds: group.orderIds,

          attachmentNames,
        },

        source: {
          module: "events",

          entityType: "Order",

          entityId: group.representativeOrder.id,
        },

        context: {
          eventUserId: actor.eventUserId,
        },

        headers: {
          "X-kiwi-events-Custom-Mail": "true",

          "X-kiwi-events-Event-Id": String(event.id),
        },

        attachments,

        deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,

        deliveryKeySeed: [event.id, payload.requestId, recipient.email].join(
          ":",
        ),
      });

      return {
        ...result,

        email: recipient.email,
      };
    },
  });

  return {
    requestId: payload.requestId,

    eventId: event.id,

    audience: payload.audience,

    audienceOrderCount: orders.length,

    recipientCount: recipientGroups.filter((group) =>
      Boolean(group.recipient?.email),
    ).length,

    attachmentCount: attachments.length,

    attachmentNames,

    mailConcurrency: concurrency,

    ...batch,
  };
}
