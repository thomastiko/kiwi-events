// src/modules/orders/order.mail.service.js

import { features } from "../../config/features.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { dispatchTemplateMailSafe } from "../mail/mail.dispatch.service.js";
import {
  EMAIL_DELIVERY_MODE,
  MAIL_TEMPLATE_KEYS,
} from "../mail/mail.constants.js";
import { findTicketsByOrderId } from "../tickets/repositories/ticket.repository.js";
import { buildExistingOfficialTicketAttachment } from "../tickets/ticketDocument.service.js";
import { ORDER_STATUS } from "./order.constants.js";
import { formatEventDateTime } from "../events/event.schedule.js";

import {
  getOrderBuyerRecipient,
  getOrderBuyerSnapshot,
} from "./order.buyerSnapshot.js";

function getEventDate(order) {
  return formatEventDateTime(order?.eventStartsAtSnapshot, {
    timeZone: order?.eventTimezoneSnapshot,
    fallback: "-",
  });
}

function getEventLocation(order) {
  return String(order?.eventLocationSnapshot || "").trim() || "-";
}

function getEventTitle(order) {
  return order?.eventTitleSnapshot || order?.event?.title || "Event";
}

function getOrderNumber(order) {
  return order?.orderNumber || order?.orderCode || order?.id || "-";
}
function buildOrderMailSource(order) {
  return {
    module: "orders",
    entityType: "Order",
    entityId: order.id,
  };
}
function buildTicketSummary(tickets = []) {
  if (!tickets.length) {
    return "-";
  }

  return tickets
    .map((ticket, index) => {
      const number = index + 1;
      const label =
        ticket.ticketTypeDisplayNameSnapshot ||
        ticket.ticketTypeNameSnapshot ||
        ticket.ticketTypeName ||
        "Ticket";

      const code = ticket.ticketCode ? ` (${ticket.ticketCode})` : "";

      return `${number}. ${label}${code}`;
    })
    .join("\n");
}

function buildOrderConfirmedTemplateVariables({ order, tickets }) {
  const buyer = getOrderBuyerSnapshot(order);

  return {
    firstName: buyer.firstName || buyer.displayName || "Hallo",
    lastName: buyer.lastName,
    displayName: buyer.displayName,

    eventTitle: getEventTitle(order),
    eventDate: getEventDate(order),
    eventLocation: getEventLocation(order),

    orderNumber: getOrderNumber(order),
    ticketSummary: buildTicketSummary(tickets),

    eventTeamName: env.branding?.appName || "Kiwi Events",
  };
}
function buildOrderCancelledTemplateVariables(order) {
  const buyer = getOrderBuyerSnapshot(order);

  return {
    firstName: buyer.firstName || buyer.displayName || "Hallo",
    eventTitle: getEventTitle(order),
    orderNumber: getOrderNumber(order),
    cancellationReason:
      String(order?.cancellationReason || "").trim() || "No reason provided.",
    eventTeamName: env.branding?.appName || "Kiwi Events",
  };
}
async function buildOrderConfirmationAttachments({ tickets = [] }) {
  if (!features.ticketPdf) {
    return [];
  }

  const attachments = [];

  for (const ticket of tickets) {
    if (!ticket?.ticketPdfStorageKey) {
      logger.warn(
        "Ticket PDF attachment skipped because storage key is missing",
        {
          ticketId: ticket?.id || null,
          ticketCode: ticket?.ticketCode || null,
        },
      );

      continue;
    }

    const attachment = await buildExistingOfficialTicketAttachment({
      ticket,
    }).catch((error) => {
      logger.warn("Ticket PDF attachment could not be loaded", {
        ticketId: ticket?.id || null,
        ticketCode: ticket?.ticketCode || null,
        storageKey: ticket?.ticketPdfStorageKey || null,
        error: error.message,
      });

      return null;
    });

    if (attachment) {
      attachments.push(attachment);
    }
  }

  return attachments;
}

export async function sendOrderConfirmedMailSafe({
  order,
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

  if (!features.mailOrderConfirmation) {
    return {
      success: false,
      skipped: true,
      reason: "mail_order_confirmation_disabled",
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

  const source = buildOrderMailSource(order);

  try {
    const tickets = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    const attachments = await buildOrderConfirmationAttachments({
      order,
      tickets,
    });

    const result = await dispatchTemplateMailSafe({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
      to: recipient,
      variables: buildOrderConfirmedTemplateVariables({
        order,
        tickets,
      }),
      attachments,
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
    logger.error("Failed to prepare order confirmation mail", {
      orderId: order.id,
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
export async function sendOrderCancelledMailSafe({
  order,
  context = {},
  deliveryMode = EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
}) {
  if (order?.status !== ORDER_STATUS.CANCELLED) {
    return {
      success: false,
      skipped: true,
      reason: "order_not_cancelled",
    };
  }

  if (!features.mail) {
    return {
      success: false,
      skipped: true,
      reason: "mail_feature_disabled",
    };
  }

  if (!features.mailOrderCancellation) {
    return {
      success: false,
      skipped: true,
      reason: "mail_order_cancellation_disabled",
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

  const source = buildOrderMailSource(order);

  try {
    const result = await dispatchTemplateMailSafe({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_CANCELLED,
      to: recipient,
      variables: buildOrderCancelledTemplateVariables(order),
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
    logger.error("Failed to prepare order cancellation mail", {
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
