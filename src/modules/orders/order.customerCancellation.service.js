import { loadKiwiEventsConfig } from "../../config/kiwi-events/kiwi-events.config.store.js";

import {
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "./order.constants.js";

import { EVENT_STATUSES } from "../events/event.constants.js";
import { TICKET_STATUS } from "../tickets/ticket.constants.js";

import { findEventById } from "../events/repositories/event.repository.js";

import { findTicketTypeById } from "../ticketTypes/repositories/ticketType.repository.js";

import { findTicketsByOrderId } from "../tickets/repositories/ticket.repository.js";

export const CUSTOMER_ORDER_CANCELLATION_ACTION = Object.freeze({
  CANCEL_PENDING: "cancel_pending",

  CANCEL_CONFIRMED: "cancel_confirmed",

  REFUND_CONFIRMED: "refund_confirmed",
});

export const CUSTOMER_ORDER_CANCELLATION_REASON = Object.freeze({
  DISABLED: "self_service_disabled",

  ORDER_STATUS_NOT_ELIGIBLE: "order_status_not_eligible",

  PAYMENT_STATUS_NOT_ELIGIBLE: "payment_status_not_eligible",

  EVENT_NOT_FOUND: "event_not_found",

  EVENT_CANCELLED: "event_cancelled",

  TICKET_ALREADY_CHECKED_IN: "ticket_already_checked_in",

  REFUND_ALREADY_EXISTS: "refund_already_exists",

  TICKET_TYPE_NOT_FOUND: "ticket_type_not_found",

  RELEVANT_SESSION_NOT_FOUND: "relevant_session_not_found",

  DEADLINE_PASSED: "cancellation_deadline_passed",
  DEPOSIT_REFUND_INCOMPLETE: "deposit_refund_incomplete",

  DEPOSIT_REFUND_AMOUNT_CONFLICT: "deposit_refund_amount_conflict",

  MISSING_PROVIDER_PAYMENT_ID: "missing_provider_payment_id",

  REFUND_INCOMPLETE: "refund_incomplete",
});

function denied(reason, extra = {}) {
  return {
    allowed: false,
    action: null,
    reason,

    deadlineAt: null,
    earliestRelevantSessionStartAt: null,

    ...extra,
  };
}

function allowed(action, extra = {}) {
  return {
    allowed: true,
    action,
    reason: null,

    deadlineAt: null,
    earliestRelevantSessionStartAt: null,

    ...extra,
  };
}

function normalizeId(value) {
  if (value && typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const raw = value?.id ?? value?._id ?? value;

  if (raw && typeof raw.toHexString === "function") {
    return raw.toHexString();
  }

  const id = String(raw ?? "").trim();

  return id || null;
}

function getPolicyConfig() {
  const config = loadKiwiEventsConfig();

  const policy = config.orders?.customerSelfServiceCancellation || {};

  return {
    enabled: policy.enabled === true,

    refundDeadlineDaysBeforeSession:
      policy.refundDeadlineDaysBeforeSession ?? null,
  };
}

function getCancellationAction(order) {
  if (order.status === ORDER_STATUS.PENDING) {
    if (order.paymentStatus !== ORDER_PAYMENT_STATUS.PENDING) {
      return null;
    }

    return CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_PENDING;
  }

  if (order.status !== ORDER_STATUS.CONFIRMED) {
    return null;
  }

  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
    return CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED;
  }

  if (order.paymentStatus === ORDER_PAYMENT_STATUS.NOT_REQUIRED) {
    return CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_CONFIRMED;
  }

  return null;
}

async function findEarliestRelevantSessionStart({ order, event }) {
  const eventSessions = Array.isArray(event.sessions) ? event.sessions : [];

  const sessionsById = new Map();

  for (const session of eventSessions) {
    const sessionId = normalizeId(session);

    if (sessionId) {
      sessionsById.set(sessionId, session);
    }
  }

  const relevantSessions = new Map();

  const ticketTypesById = new Map();

  for (const item of order.items || []) {
    const ticketTypeId = normalizeId(item.ticketTypeId);

    if (!ticketTypeId) {
      return {
        success: false,

        reason: CUSTOMER_ORDER_CANCELLATION_REASON.TICKET_TYPE_NOT_FOUND,
      };
    }

    let ticketType = ticketTypesById.get(ticketTypeId);

    if (!ticketType) {
      ticketType = await findTicketTypeById(ticketTypeId, {
        lean: true,
      });

      if (!ticketType) {
        return {
          success: false,

          reason: CUSTOMER_ORDER_CANCELLATION_REASON.TICKET_TYPE_NOT_FOUND,
        };
      }

      ticketTypesById.set(ticketTypeId, ticketType);
    }

    const sessionIds = Array.isArray(ticketType.sessionIds)
      ? ticketType.sessionIds
      : [];

    /*
     * Empty sessionIds means the ticket type applies
     * to the whole event / all event sessions.
     */
    if (sessionIds.length === 0) {
      for (const [sessionId, session] of sessionsById) {
        relevantSessions.set(sessionId, session);
      }

      continue;
    }

    for (const rawSessionId of sessionIds) {
      const sessionId = normalizeId(rawSessionId);

      const session = sessionsById.get(sessionId);

      if (!session) {
        return {
          success: false,

          reason: CUSTOMER_ORDER_CANCELLATION_REASON.RELEVANT_SESSION_NOT_FOUND,
        };
      }

      relevantSessions.set(sessionId, session);
    }
  }

  if (relevantSessions.size === 0) {
    return {
      success: false,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.RELEVANT_SESSION_NOT_FOUND,
    };
  }

  let earliestStartAt = null;

  for (const session of relevantSessions.values()) {
    const startAt = new Date(session.startAt);

    if (Number.isNaN(startAt.getTime())) {
      return {
        success: false,

        reason: CUSTOMER_ORDER_CANCELLATION_REASON.RELEVANT_SESSION_NOT_FOUND,
      };
    }

    if (!earliestStartAt || startAt < earliestStartAt) {
      earliestStartAt = startAt;
    }
  }

  return {
    success: true,
    startAt: earliestStartAt,
  };
}

export async function getCustomerOrderCancellationEligibilityService({
  order,
  now = new Date(),
}) {
  if (!order?.id) {
    throw new TypeError("Customer cancellation eligibility requires an order.");
  }

  const evaluatedAt = new Date(now);

  if (Number.isNaN(evaluatedAt.getTime())) {
    throw new TypeError(
      "Customer cancellation eligibility requires a valid now date.",
    );
  }

  const policy = getPolicyConfig();

  if (!policy.enabled) {
    return denied(CUSTOMER_ORDER_CANCELLATION_REASON.DISABLED);
  }

  const action = getCancellationAction(order);

  if (!action) {
    const supportedStatus =
      order.status === ORDER_STATUS.PENDING ||
      order.status === ORDER_STATUS.CONFIRMED;

    return denied(
      supportedStatus
        ? CUSTOMER_ORDER_CANCELLATION_REASON.PAYMENT_STATUS_NOT_ELIGIBLE
        : CUSTOMER_ORDER_CANCELLATION_REASON.ORDER_STATUS_NOT_ELIGIBLE,
    );
  }

  const event = await findEventById(order.eventId, {
    lean: true,
  });

  if (!event) {
    return denied(CUSTOMER_ORDER_CANCELLATION_REASON.EVENT_NOT_FOUND);
  }

  /*
   * Event-cancellation owns its own refund flow.
   * Customer self-service must never compete with it.
   */
  if (event.status === EVENT_STATUSES.CANCELLED) {
    return denied(CUSTOMER_ORDER_CANCELLATION_REASON.EVENT_CANCELLED);
  }

  const tickets = await findTicketsByOrderId(order.id, {
    lean: true,
  });

  if (tickets.some((ticket) => ticket.status === TICKET_STATUS.CHECKED_IN)) {
    return denied(CUSTOMER_ORDER_CANCELLATION_REASON.TICKET_ALREADY_CHECKED_IN);
  }

  /*
   * Only one refund lifecycle may own the order.
   * Anything other than NONE is deliberately
   * blocked from a new self-service cancellation.
   */
  if (order.refundStatus !== ORDER_REFUND_STATUS.NONE) {
    return denied(CUSTOMER_ORDER_CANCELLATION_REASON.REFUND_ALREADY_EXISTS);
  }

  /*
   * Pending checkout cancellation is not a refund.
   * The day-based refund deadline therefore does
   * not apply to an unpaid pending checkout.
   */
  if (action === CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_PENDING) {
    return allowed(action);
  }

  const deadlineDays = policy.refundDeadlineDaysBeforeSession;

  if (deadlineDays === null) {
    return allowed(action);
  }

  const relevantSession = await findEarliestRelevantSessionStart({
    order,
    event,
  });

  if (!relevantSession.success) {
    return denied(relevantSession.reason);
  }

  const earliestRelevantSessionStartAt = relevantSession.startAt;

  const deadlineAt = new Date(
    earliestRelevantSessionStartAt.getTime() -
      deadlineDays * 24 * 60 * 60 * 1000,
  );

  if (evaluatedAt.getTime() >= deadlineAt.getTime()) {
    return denied(CUSTOMER_ORDER_CANCELLATION_REASON.DEADLINE_PASSED, {
      deadlineAt,
      earliestRelevantSessionStartAt,
    });
  }

  return allowed(action, {
    deadlineAt,
    earliestRelevantSessionStartAt,
  });
}
