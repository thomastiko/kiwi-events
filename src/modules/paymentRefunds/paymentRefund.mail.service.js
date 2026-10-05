import { features } from "../../config/features.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

import { dispatchTemplateMailSafe } from "../mail/mail.dispatch.service.js";
import {
  EMAIL_DELIVERY_MODE,
  MAIL_TEMPLATE_KEYS,
} from "../mail/mail.constants.js";

import { findOrderById } from "../orders/repositories/order.repository.js";
import {
  getOrderBuyerRecipient,
  getOrderBuyerSnapshot,
} from "../orders/order.buyerSnapshot.js";
import { ORDER_REFUND_STATUS } from "../orders/order.constants.js";

import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "./paymentRefund.constants.js";

function getEventTitle(order) {
  return order?.eventTitleSnapshot || "Event";
}

function getOrderNumber(order) {
  return order?.orderNumber || order?.id || "-";
}

function formatPaymentRefundAmount(paymentRefund) {
  const amount = Number(paymentRefund?.amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return "-";
  }

  const currency = String(paymentRefund?.currency || "EUR")
    .trim()
    .toUpperCase();

  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function buildOrderRefundMailSource(paymentRefund) {
  return {
    module: "payment_refunds",
    entityType: "PaymentRefund",
    entityId: paymentRefund.id,
  };
}

export async function sendPaymentRefundCompletedMailSafe({
  paymentRefund,
  context = {},
  deliveryMode = EMAIL_DELIVERY_MODE.ONCE_PER_SOURCE,
}) {
  if (paymentRefund?.sourceType !== PAYMENT_REFUND_SOURCE_TYPE.ORDER) {
    return {
      success: false,
      skipped: true,
      reason: "refund_source_not_order",
    };
  }

  if (paymentRefund?.status !== PAYMENT_REFUND_STATUS.COMPLETED) {
    return {
      success: false,
      skipped: true,
      reason: "refund_not_completed",
    };
  }

  if (!features.mail) {
    return {
      success: false,
      skipped: true,
      reason: "mail_feature_disabled",
    };
  }

  if (!features.mailOrderRefunded) {
    return {
      success: false,
      skipped: true,
      reason: "refund_mail_disabled",
    };
  }

  const paymentRefundId = String(paymentRefund?.id || "").trim();
  const orderId = String(paymentRefund?.orderId || "").trim();

  if (!paymentRefundId) {
    return {
      success: false,
      skipped: true,
      reason: "missing_payment_refund_id",
    };
  }

  if (!orderId) {
    return {
      success: false,
      skipped: true,
      reason: "missing_order_id",
    };
  }

  const source = buildOrderRefundMailSource(paymentRefund);

  try {
    const order = await findOrderById(orderId, {
      lean: true,
    });

    if (!order) {
      return {
        success: false,
        skipped: true,
        reason: "order_not_found",
      };
    }

    if (order.refundStatus !== ORDER_REFUND_STATUS.COMPLETED) {
      return {
        success: false,
        skipped: true,
        reason: "order_refund_not_completed",
      };
    }

    const buyer = getOrderBuyerSnapshot(order);
    const recipient = getOrderBuyerRecipient(order);

    if (!recipient.email) {
      return {
        success: false,
        skipped: true,
        reason: "missing_buyer_email_snapshot",
      };
    }

    const result = await dispatchTemplateMailSafe({
      templateKey: MAIL_TEMPLATE_KEYS.ORDER_REFUNDED,
      to: recipient,
      variables: {
        firstName: buyer.firstName || buyer.displayName || "there",
        eventTitle: getEventTitle(order),
        orderNumber: getOrderNumber(order),
        refundAmount: formatPaymentRefundAmount(paymentRefund),
        eventTeamName: env.branding?.appName || "Kiwi Events",
      },
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
    logger.error("Failed to prepare completed order refund mail", {
      paymentRefundId,
      orderId,
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
