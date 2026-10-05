import { features } from "../../../config/features.js";

import { EVENT_STATUSES } from "../../events/event.constants.js";

import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../../paymentRefunds/paymentRefund.constants.js";

import { TICKET_STATUS } from "../../tickets/ticket.constants.js";

import {
  ORDER_BUYER_TYPE,
  ORDER_MAIL_RESEND_TYPE,
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "../order.constants.js";

import { calculateRemainingOrderRefund } from "../order.refundCalculation.js";

const EDITABLE_GUEST_BUYER_ORDER_STATUSES = new Set([
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.CANCELLED,
]);

const ORDER_REFUND_IN_PROGRESS_STATUSES = new Set([
  ORDER_REFUND_STATUS.PENDING,
  ORDER_REFUND_STATUS.PROCESSING,
  ORDER_REFUND_STATUS.PROVIDER_SUCCEEDED,
]);

function allowed() {
  return {
    allowed: true,
    reason: null,
  };
}

function blocked(reason) {
  return {
    allowed: false,
    reason,
  };
}

function hasCheckedInTicket(tickets = []) {
  return tickets.some((ticket) => ticket.status === TICKET_STATUS.CHECKED_IN);
}

function getDepositRefunds(paymentRefunds = []) {
  return paymentRefunds.filter(
    (paymentRefund) =>
      paymentRefund.sourceType === PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
  );
}

export function findCompletedOrderPaymentRefund(paymentRefunds = []) {
  return (
    paymentRefunds.find(
      (paymentRefund) =>
        paymentRefund.sourceType === PAYMENT_REFUND_SOURCE_TYPE.ORDER &&
        paymentRefund.status === PAYMENT_REFUND_STATUS.COMPLETED,
    ) || null
  );
}

export function getOrderBuyerEditAction({ order, tickets = [] }) {
  if (order.buyerType !== ORDER_BUYER_TYPE.GUEST) {
    return blocked("buyer_not_guest");
  }

  if (!EDITABLE_GUEST_BUYER_ORDER_STATUSES.has(order.status)) {
    return blocked("order_status_not_editable");
  }

  if (hasCheckedInTicket(tickets)) {
    return blocked("ticket_already_checked_in");
  }

  return allowed();
}

export function getOrderCancelAction({ order, tickets = [] }) {
  if (order.status === ORDER_STATUS.EXPIRED) {
    return blocked("order_expired");
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return blocked("order_already_cancelled");
  }

  if (hasCheckedInTicket(tickets)) {
    return blocked("ticket_already_checked_in");
  }

  return allowed();
}

export function getOrderRefundAction({
  order,
  tickets = [],
  paymentRefunds = [],
}) {
  if (order.status === ORDER_STATUS.EXPIRED) {
    return blocked("order_expired");
  }

  if (hasCheckedInTicket(tickets)) {
    return blocked("ticket_already_checked_in");
  }

  if (order.refundStatus === ORDER_REFUND_STATUS.COMPLETED) {
    return blocked("order_refund_completed");
  }

  if (ORDER_REFUND_IN_PROGRESS_STATUSES.has(order.refundStatus)) {
    return blocked("order_refund_in_progress");
  }

  if (order.refundStatus === ORDER_REFUND_STATUS.MANUAL_REVIEW) {
    return blocked("order_refund_manual_review");
  }

  if (
    order.status !== ORDER_STATUS.CONFIRMED &&
    order.status !== ORDER_STATUS.CANCELLED
  ) {
    return blocked("order_not_refundable");
  }

  if (order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID) {
    return blocked("payment_not_paid");
  }

  if (Number(order.totalPrice || 0) <= 0) {
    return blocked("order_has_no_refundable_amount");
  }

  if (order.paymentProvider === ORDER_PAYMENT_PROVIDER.NONE) {
    return blocked("payment_handled_externally");
  }

  if (!order.paymentProviderPaymentId) {
    return blocked("missing_payment_provider_payment_id");
  }

  const calculation = calculateRemainingOrderRefund({
    order,
    depositRefunds: getDepositRefunds(paymentRefunds),
  });

  if (calculation.hasDepositAmountConflict) {
    return blocked("deposit_refund_amount_conflict");
  }

  if (calculation.blockingDepositRefunds.length > 0) {
    return blocked("deposit_refund_incomplete");
  }

  if (calculation.remainingRefundAmount <= 0) {
    return blocked("nothing_left_to_refund");
  }

  return allowed();
}

function getMailFeatureAction(type) {
  if (!features.mail) {
    return blocked("mail_feature_disabled");
  }

  switch (type) {
    case ORDER_MAIL_RESEND_TYPE.CONFIRMED:
      return features.mailOrderConfirmation
        ? allowed()
        : blocked("mail_order_confirmation_disabled");

    case ORDER_MAIL_RESEND_TYPE.CANCELLED:
      return features.mailOrderCancellation
        ? allowed()
        : blocked("mail_order_cancellation_disabled");

    case ORDER_MAIL_RESEND_TYPE.REFUNDED:
      return features.mailOrderRefunded
        ? allowed()
        : blocked("mail_order_refunded_disabled");

    case ORDER_MAIL_RESEND_TYPE.EVENT_CANCELLED:
      return features.mailEventCancellation
        ? allowed()
        : blocked("mail_event_cancellation_disabled");

    default:
      return blocked("unsupported_mail_type");
  }
}

export function getOrderMailResendAction({
  type,
  order,
  event,
  paymentRefunds = [],
}) {
  switch (type) {
    case ORDER_MAIL_RESEND_TYPE.CONFIRMED:
      if (order.status !== ORDER_STATUS.CONFIRMED) {
        return blocked("order_not_confirmed");
      }

      break;

    case ORDER_MAIL_RESEND_TYPE.CANCELLED:
      if (order.status !== ORDER_STATUS.CANCELLED) {
        return blocked("order_not_cancelled");
      }

      if (event.status === EVENT_STATUSES.CANCELLED) {
        return blocked("event_cancelled");
      }

      break;

    case ORDER_MAIL_RESEND_TYPE.REFUNDED:
      if (order.refundStatus !== ORDER_REFUND_STATUS.COMPLETED) {
        return blocked("order_refund_not_completed");
      }

      if (!findCompletedOrderPaymentRefund(paymentRefunds)) {
        return blocked("completed_order_refund_not_found");
      }

      break;

    case ORDER_MAIL_RESEND_TYPE.EVENT_CANCELLED:
      if (event.status !== EVENT_STATUSES.CANCELLED) {
        return blocked("event_not_cancelled");
      }

      if (order.status !== ORDER_STATUS.CANCELLED) {
        return blocked("order_not_cancelled");
      }

      break;

    default:
      return blocked("unsupported_mail_type");
  }

  return getMailFeatureAction(type);
}

export function buildInternalOrderActions({
  order,
  event,
  tickets = [],
  paymentRefunds = [],
}) {
  return {
    editBuyer: getOrderBuyerEditAction({
      order,
      tickets,
    }),

    cancel: getOrderCancelAction({
      order,
      tickets,
    }),

    refund: getOrderRefundAction({
      order,
      tickets,
      paymentRefunds,
    }),

    mailResend: {
      orderConfirmed: getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CONFIRMED,
        order,
        event,
        paymentRefunds,
      }),

      orderCancelled: getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.CANCELLED,
        order,
        event,
        paymentRefunds,
      }),

      orderRefunded: getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.REFUNDED,
        order,
        event,
        paymentRefunds,
      }),

      eventCancelled: getOrderMailResendAction({
        type: ORDER_MAIL_RESEND_TYPE.EVENT_CANCELLED,
        order,
        event,
        paymentRefunds,
      }),
    },
  };
}
