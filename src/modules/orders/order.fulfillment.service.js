import { randomUUID } from "node:crypto";

import {
  ORDER_FULFILLMENT_STATUS,
  ORDER_FULFILLMENT_STEP,
} from "./order.constants.js";

import {
  advanceOrderFulfillment,
  claimOrderFulfillment,
  completeOrderFulfillment,
  findFulfillmentRecoveryCandidates,
  findOrderById,
  recordOrderFulfillmentFailure,
} from "./repositories/order.repository.js";

import {
  generateTicketDocumentsForOrderService,
  generateTicketsForOrderService,
} from "../tickets/ticket.service.js";

import { findTicketsByOrderId } from "../tickets/repositories/ticket.repository.js";

import { sendOrderConfirmedMailSafe } from "./order.mail.service.js";

const FULFILLMENT_LEASE_MS = 5 * 60 * 1000;

const FULFILLMENT_RETRY_DELAYS_MS = Object.freeze([
  1 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
]);

function buildFulfillmentFailureState({ attemptCount, failedAt }) {
  const normalizedAttemptCount = Number(attemptCount);

  if (
    !Number.isSafeInteger(normalizedAttemptCount) ||
    normalizedAttemptCount < 1
  ) {
    throw new Error("Fulfillment attempt count must be a positive integer.");
  }

  const retryDelayMs = FULFILLMENT_RETRY_DELAYS_MS[normalizedAttemptCount - 1];

  if (retryDelayMs === undefined) {
    return {
      status: ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW,

      nextRetryAt: null,

      manualReviewAt: failedAt,
    };
  }

  return {
    status: ORDER_FULFILLMENT_STATUS.FAILED,

    nextRetryAt: new Date(failedAt.getTime() + retryDelayMs),

    manualReviewAt: null,
  };
}
function buildLeaseExpiry() {
  return new Date(Date.now() + FULFILLMENT_LEASE_MS);
}

function buildDocumentFailure(result) {
  if (!result || Number(result.failed || 0) <= 0) {
    return null;
  }

  return new Error(
    `Ticket document generation failed for ${result.failed} ticket(s).`,
  );
}

function buildMailFailure(result) {
  if (!result) {
    return new Error("Order confirmation mail returned no result.");
  }

  if (result.skipped) {
    return null;
  }

  if (result.success === false) {
    return new Error(
      result.error || result.reason || "Order confirmation mail failed.",
    );
  }

  return null;
}

export async function fulfillConfirmedOrderService({ orderId, context = {} }) {
  const leaseToken = randomUUID();

  const claimedOrder = await claimOrderFulfillment({
    orderId,
    leaseToken,
    now: new Date(),
    leaseExpiresAt: buildLeaseExpiry(),
  });

  if (!claimedOrder) {
    const order = await findOrderById(orderId, {
      lean: true,
    });

    const tickets = await findTicketsByOrderId(orderId, {
      lean: true,
    });

    let reason = "fulfillment_not_claimed";

    if (order?.fulfillmentStatus === ORDER_FULFILLMENT_STATUS.COMPLETED) {
      reason = "fulfillment_already_completed";
    }

    if (order?.fulfillmentStatus === ORDER_FULFILLMENT_STATUS.PROCESSING) {
      reason = "fulfillment_in_progress";
    }

    return {
      success: true,
      ignored: true,
      reason,
      order,
      tickets,
      documents: null,
      mail: null,
    };
  }

  let currentStep = ORDER_FULFILLMENT_STEP.TICKETS;

  try {
    const tickets = await generateTicketsForOrderService(orderId, {
      createdByEventUserId: null,
      updatedByEventUserId: null,
    });

    currentStep = ORDER_FULFILLMENT_STEP.DOCUMENTS;

    await advanceOrderFulfillment({
      orderId,
      leaseToken,
      step: currentStep,
      leaseExpiresAt: buildLeaseExpiry(),
    });

    const documents = await generateTicketDocumentsForOrderService({
      order: claimedOrder,
    });
    const documentFailure = buildDocumentFailure(documents);

    if (documentFailure) {
      throw documentFailure;
    }

    currentStep = ORDER_FULFILLMENT_STEP.MAIL;

    await advanceOrderFulfillment({
      orderId,
      leaseToken,
      step: currentStep,
      leaseExpiresAt: buildLeaseExpiry(),
    });

    const mail = await sendOrderConfirmedMailSafe({
      order: claimedOrder,
      context,
    });

    const mailFailure = buildMailFailure(mail);

    if (mailFailure) {
      throw mailFailure;
    }

    const completedOrder = await completeOrderFulfillment({
      orderId,
      leaseToken,
      completedAt: new Date(),
    });

    if (!completedOrder) {
      throw new Error("Order fulfillment lease was lost before completion.");
    }

    return {
      success: true,
      ignored: false,
      order: completedOrder,
      tickets,
      documents,
      mail,
    };
  } catch (error) {
    const failedAt = new Date();

    const failureState = buildFulfillmentFailureState({
      attemptCount: claimedOrder.fulfillmentAttemptCount,
      failedAt,
    });

    await recordOrderFulfillmentFailure({
      orderId,
      leaseToken,
      step: currentStep,

      error: error?.message || "Order fulfillment failed.",

      failedAt,

      status: failureState.status,

      nextRetryAt: failureState.nextRetryAt,

      manualReviewAt: failureState.manualReviewAt,
    });

    throw error;
  }
}
export async function recoverOrderFulfillmentsService({
  now = new Date(),
  limit = 25,
  context = {},
} = {}) {
  const candidates = await findFulfillmentRecoveryCandidates(
    {
      now,
      limit,
    },
    {
      lean: true,
    },
  );

  const result = {
    candidates: candidates.length,
    completed: 0,
    failed: 0,
    ignored: 0,

    completedOrderIds: [],
    failedOrderIds: [],
  };

  for (const candidate of candidates) {
    const orderId = String(candidate.id);

    try {
      const fulfillment = await fulfillConfirmedOrderService({
        orderId,
        context,
      });

      /*
       * Another worker/webhook may have claimed or completed
       * the order after the recovery candidate query.
       *
       * That is expected and not an error.
       */
      if (fulfillment?.ignored === true) {
        result.ignored += 1;
        continue;
      }

      result.completed += 1;
      result.completedOrderIds.push(orderId);
    } catch {
      /*
       * fulfillConfirmedOrderService() already persists the
       * retry/manual-review state through
       * recordOrderFulfillmentFailure().
       *
       * One broken order must never stop recovery of the
       * remaining candidates.
       */
      result.failed += 1;
      result.failedOrderIds.push(orderId);
    }
  }

  return result;
}
