// src/modules/events/event.mail.service.js

import { features } from "../../config/features.js";
import { logger } from "../../config/logger.js";
import { dispatchTemplateMailSafe } from "../mail/mail.dispatch.service.js";
import { executeMailBatch } from "../mail/mail.batch.service.js";
import {
  EMAIL_DELIVERY_MODE,
  MAIL_TEMPLATE_KEYS,
} from "../mail/mail.constants.js";

import { getOrderBuyerRecipient } from "../orders/order.buyerSnapshot.js";
import { buildEventMailVariables } from "./event.mailVariables.js";

function buildEventCancelledMailSource(order) {
  return {
    module: "events",
    entityType: "Order",
    entityId: order.id,
  };
}

function buildEventCancelTemplateVariables({
  event,
  order,
  cancellationReason,
}) {
  return {
    ...buildEventMailVariables({
      event,
      order,
    }),

    cancellationReason:
      cancellationReason ||
      event?.cancellationReason ||
      "Das Event wurde vom Veranstalter abgesagt.",
  };
}
export async function sendEventCancelledMailForOrderSafe({
  event,
  order,
  cancellationReason = null,
  context = {},
  deliveryMode = EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
}) {
  if (!features.mail) {
    return {
      success: false,
      skipped: true,
      reason: "mail_feature_disabled",
    };
  }

  if (!features.mailEventCancellation) {
    return {
      success: false,
      skipped: true,
      reason: "mail_event_cancellation_disabled",
    };
  }

  const recipient = getOrderBuyerRecipient(order);

  if (!recipient.email) {
    return {
      success: false,
      skipped: true,
      reason: "missing_buyer_email_snapshot",
    };
  }

  const source = buildEventCancelledMailSource(order);

  try {
    const result = await dispatchTemplateMailSafe({
      templateKey: MAIL_TEMPLATE_KEYS.EVENT_CANCELLED,
      to: recipient,
      variables: buildEventCancelTemplateVariables({
        event,
        order,
        cancellationReason,
      }),
      source,
      deliveryMode,
      context: {
        eventUserId: context.eventUserId || null,
      },
    });
    if (result?.skipped) {
      return {
        success: Boolean(result.success),

        skipped: true,

        reason: result.reason || "mail_skipped",

        email: recipient.email,

        mail: result,
      };
    }
    if (!result?.success) {
      return {
        success: false,
        skipped: false,

        reason: result?.reason || "mail_error",

        error: result?.error || "Mail delivery failed",

        email: recipient.email,

        mail: result,
      };
    }

    return {
      success: true,
      skipped: false,

      email: recipient.email,

      mail: result,
    };
  } catch (error) {
    logger.error("Failed to prepare event cancellation mail", {
      eventId: event?.id || null,
      orderId: order?.id || null,
      error: error.message,
    });

    return {
      success: false,
      skipped: false,

      reason: "mail_prepare_error",

      error: error?.message || "Mail preparation failed",
    };
  }
}
export async function sendEventCancelledMailsSafe({
  event,
  orders = [],
  cancellationReason = null,
  context = {},
}) {
  try {
    const batch = await executeMailBatch({
      items: orders,

      getMetadata: (order) => ({
        orderId: order?.id || null,

        orderNumber: order?.orderNumber || null,
      }),

      worker: (order) =>
        sendEventCancelledMailForOrderSafe({
          event,
          order,
          cancellationReason,
          context,
        }),
    });

    if (batch.failedCount > 0) {
      logger.warn("Some event cancellation mails failed", {
        eventId: event?.id || null,

        total: batch.totalCount,

        failed: batch.failedCount,
      });
    }

    return {
      success: batch.failedCount === 0,

      skipped: false,

      totalCount: batch.totalCount,

      sentCount: batch.sentCount,
      skippedCount: batch.skippedCount,
      failedCount: batch.failedCount,

      sentItems: batch.sent,
      skippedItems: batch.skipped,
      failedItems: batch.failed,
    };
  } catch (error) {
    logger.error("Failed to execute event cancellation mail batch", {
      eventId: event?.id || null,

      error: error?.message || String(error),
    });

    return {
      success: false,
      skipped: false,

      reason: "mail_batch_error",

      error: error?.message || "Mail batch failed",

      totalCount: orders.length,

      sentCount: 0,
      skippedCount: 0,
      failedCount: orders.length,

      sentItems: [],
      skippedItems: [],

      failedItems: orders.map((order) => ({
        orderId: order?.id || null,

        orderNumber: order?.orderNumber || null,

        success: false,
        skipped: false,

        reason: "mail_batch_error",
      })),
    };
  }
}

export async function sendEventReminderMailForOrderSafe({
  event,
  order,
  session,
  context = {},
}) {
  if (!features.mail) {
    return {
      success: false,
      skipped: true,
      reason: "mail_feature_disabled",
    };
  }

  if (!features.mailEventReminder) {
    return {
      success: false,
      skipped: true,
      reason: "mail_event_reminder_disabled",
    };
  }

  const recipient = getOrderBuyerRecipient(order);

  if (!recipient.email) {
    return {
      success: false,
      skipped: true,
      reason: "missing_buyer_email_snapshot",
      orderId: order.id,
    };
  }

  const result = await dispatchTemplateMailSafe({
    templateKey: MAIL_TEMPLATE_KEYS.EVENT_REMINDER_TOMORROW,
    to: recipient,
    variables: buildEventMailVariables({
      event,
      order,
      session,
    }),
    source: {
      module: "events",
      entityType: "Order",
      entityId: order.id,
    },
    deliveryMode: EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
    context: {
      eventUserId: context.eventUserId || null,
    },
  });

  return {
    ...result,
    skipped: result?.skipped || false,
    orderId: order.id,
    email: recipient.email,
  };
}
