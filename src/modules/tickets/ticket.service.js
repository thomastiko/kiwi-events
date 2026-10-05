// src/modules/tickets/ticket.service.js

import QRCode from "qrcode";
import { randomReadableCode } from "../../core/utils/codeGenerator.js";
import { logger } from "../../config/logger.js";
import { features } from "../../config/features.js";
import { getBuffer } from "../storage/storage.service.js";
import { assertTicketQrEnabled } from "./ticketQr.config.js";
import {
  TICKET_DEPOSIT_REFUND_STATUS,
  TICKET_KIND,
  TICKET_STATUS,
} from "./ticket.constants.js";
import {
  buildCredentialForTicket,
  buildQrPayloadFromEncryptedToken,
  hashCheckInPayload,
} from "./ticketCredential.service.js";
import { ORDER_BUYER_TYPE, ORDER_STATUS } from "../orders/order.constants.js";

import {
  findOrderById,
  findOrderByIdWithGuestAccess,
  markGuestAccessUsed,
} from "../orders/repositories/order.repository.js";

import { hashGuestAccessToken } from "../orders/order.guestAccess.service.js";
import { findEventById } from "../events/repositories/event.repository.js";
import {
  findTicketTypeById,
  releaseTicketTypeStock,
} from "../ticketTypes/repositories/ticketType.repository.js";
import {
  cancelTicketByIdIfActive,
  cancelTicketsByOrderId,
  ensureTicketForOrderSlot,
  findTicketByCheckInTokenHash,
  findTicketByCode,
  findTicketById,
  findTicketByIdAndExternalBuyer,
  findTicketsByOrderId,
  listTicketsPaginated,
  listTicketsByExternalBuyer,
  markTicketCheckedIn,
  markTicketCheckedOut,
  updateTicketDepositRefund,
} from "./repositories/ticket.repository.js";
import { PAYMENT_REFUND_STATUSES } from "../payments/payment.constants.js";

import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../paymentRefunds/paymentRefund.constants.js";

import { executePaymentRefundService } from "../paymentRefunds/paymentRefund.service.js";

import { findPaymentRefundByIdempotencyKey } from "../paymentRefunds/repositories/paymentRefund.repository.js";
import {
  buildOfficialTicketAttachment,
  generateOfficialTicketDocument,
} from "./ticketDocument.service.js";
import { getEventAccess } from "../permissions/eventAuthorization.service.js";

import {
  toAdminTicketCheckInConfirmDto,
  toAdminTicketCheckInLookupDto,
  toAdminTicketDto,
  toAdminTicketListMetaDto,
  toInternalCheckInTicketDto,
  toPublicTicketDto,
} from "./ticket.dto.js";

import {
  cancelledTicketCheckInError,
  depositTicketCheckoutForbiddenError,
  expiredGuestTicketAccessTokenError,
  externalTicketIdentityRequiredError,
  guestTicketAccessUnavailableError,
  guestTicketOrderNotFoundError,
  invalidGuestTicketAccessTokenError,
  ticketEventNotFoundError,
  ticketNotFoundError,
  ticketNotGuestOrderError,
  ticketOrderNotFoundError,
  ticketPdfDisabledError,
  ticketPdfGenerationFailedError,
  ticketPdfReadFailedError,
  ticketQrUnavailableError,
  ticketsRequireConfirmedOrderError,
  ticketAccessForbiddenError,
  ticketInternalAccessRequiredError,
  ticketManageForbiddenError,
  ticketCheckInForbiddenError,
} from "./ticket.errors.js";

function cleanExternal(value) {
  return String(value || "").trim();
}

function generateTicketCode() {
  return `TKT-${randomReadableCode(8)}`;
}

function buildTicketCredentialFields() {
  if (!features.ticketQr) {
    return {
      checkInTokenHash: null,
      encryptedCheckInToken: null,
      checkInPayloadVersion: 1,
      checkInTokenCreatedAt: null,
      checkInTokenRotatedAt: null,
      checkInTokenLastUsedAt: null,
    };
  }

  const credential = buildCredentialForTicket();
  const now = new Date();

  return {
    checkInTokenHash: credential.tokenHash,
    encryptedCheckInToken: credential.encryptedToken,
    checkInPayloadVersion: credential.payloadVersion,
    checkInTokenCreatedAt: now,
    checkInTokenRotatedAt: null,
    checkInTokenLastUsedAt: null,
  };
}

function normalizeTicketCode(ticketCode) {
  return String(ticketCode || "")
    .trim()
    .toUpperCase();
}
function assertInternalActor(actor) {
  if (!actor?.eventUserId || !actor?.eventUser) {
    throw ticketInternalAccessRequiredError();
  }
}

async function getInternalTicketEventAccess({ actor, event }) {
  assertInternalActor(actor);

  return getEventAccess(actor, event);
}

async function assertCanAccessTicketsForEvent({ actor, event }) {
  const access = await getInternalTicketEventAccess({
    actor,
    event,
  });

  if (!access.checkIn) {
    throw ticketAccessForbiddenError();
  }

  return access;
}

async function assertCanManageTicketsForEvent({ actor, event }) {
  const access = await getInternalTicketEventAccess({
    actor,
    event,
  });

  if (!access.manage) {
    throw ticketManageForbiddenError();
  }

  return access;
}

async function assertCanCheckInForEvent({ actor, event }) {
  const access = await getInternalTicketEventAccess({
    actor,
    event,
  });

  if (!access.checkIn) {
    throw ticketCheckInForbiddenError();
  }

  return access;
}

function assertExternalActor(actor) {
  if (!actor?.externalProvider || !actor?.externalUserId) {
    throw externalTicketIdentityRequiredError();
  }
}

function getTicketKindFromOrderItem(item, ticketType) {
  return (
    item.ticketKindSnapshot || ticketType?.ticketKind || TICKET_KIND.NORMAL
  );
}

function getInitialDepositRefundStatus(ticketKind) {
  return ticketKind === TICKET_KIND.DEPOSIT
    ? TICKET_DEPOSIT_REFUND_STATUS.ELIGIBLE
    : TICKET_DEPOSIT_REFUND_STATUS.NOT_REQUIRED;
}

function buildBuyerName(ticket) {
  const explicit = ticket.buyerDisplayNameSnapshot || "";
  if (explicit) return explicit;

  return [ticket.buyerFirstNameSnapshot, ticket.buyerLastNameSnapshot]
    .filter(Boolean)
    .join(" ");
}

function buildTicketFromOrderItem({
  order,
  item,
  ticketType,
  orderItemIndex,
  orderItemUnitIndex,
  options,
}) {
  const ticketKind = getTicketKindFromOrderItem(item, ticketType);
  const credentialFields = buildTicketCredentialFields();

  return {
    ticketCode: generateTicketCode(),

    orderId: order.id,
    orderItemIndex,
    orderItemUnitIndex,
    eventId: order.eventId,
    ticketTypeId: item.ticketTypeId,

    buyerType: order.buyerType || "guest",
    buyerExternalProvider: order.buyerExternalProvider || null,
    buyerExternalUserId: order.buyerExternalUserId || null,
    buyerEmailSnapshot: order.buyerEmailSnapshot || "",
    buyerFirstNameSnapshot: order.buyerFirstNameSnapshot || "",
    buyerLastNameSnapshot: order.buyerLastNameSnapshot || "",
    buyerDisplayNameSnapshot: order.buyerDisplayNameSnapshot || "",

    holderType: "buyer",
    holderExternalProvider: order.buyerExternalProvider || null,
    holderExternalUserId: order.buyerExternalUserId || null,
    holderEmailSnapshot: order.buyerEmailSnapshot || "",
    holderFirstNameSnapshot: order.buyerFirstNameSnapshot || "",
    holderLastNameSnapshot: order.buyerLastNameSnapshot || "",
    holderDisplayNameSnapshot: order.buyerDisplayNameSnapshot || "",

    eventTitleSnapshot: order.eventTitleSnapshot || "",
    eventSlugSnapshot: order.eventSlugSnapshot || null,
    eventCategorySnapshot: order.eventCategorySnapshot || null,
    eventStartsAtSnapshot: order.eventStartsAtSnapshot || null,

    ticketTypeNameSnapshot: item.ticketTypeNameSnapshot || "",
    ticketTypeDescriptionSnapshot: item.ticketTypeDescriptionSnapshot || "",
    ticketKind,

    unitPrice: Number(item.unitPrice || 0),
    currency: item.currency || order.currency || "EUR",

    status: TICKET_STATUS.ACTIVE,

    checkedInAt: null,
    checkedInByEventUserId: null,

    cancelledAt: null,
    cancellationReason: null,

    ...credentialFields,

    ticketPdfStorageKey: null,
    ticketPdfStorageTarget: null,
    ticketPdfGeneratedAt: null,

    depositRefundStatus: getInitialDepositRefundStatus(ticketKind),
    depositRefundAmount:
      ticketKind === TICKET_KIND.DEPOSIT ? Number(item.unitPrice || 0) : 0,
    depositRefundCurrency: item.currency || order.currency || "EUR",
    depositRefundProviderRefundId: null,
    depositRefundTriggeredAt: null,
    depositRefundTriggeredByEventUserId: null,
    depositRefundFailureReason: null,

    metadata: null,

    createdByEventUserId:
      options.createdByEventUserId || order.createdByEventUserId || null,
    updatedByEventUserId:
      options.updatedByEventUserId || order.updatedByEventUserId || null,
  };
}

async function getTicketWithEvent(ticketId) {
  const ticket = await findTicketById(ticketId, {
    lean: true,
  });

  if (!ticket) {
    throw ticketNotFoundError(ticketId);
  }

  const event = await findEventById(ticket.eventId, {
    lean: true,
  });

  if (!event) {
    throw ticketEventNotFoundError(ticket.eventId);
  }

  return {
    ticket,
    event,
  };
}
function buildDepositRefundIdempotencyKey(ticketId) {
  return `deposit-refund:${String(ticketId)}`;
}

function getDepositRefundAmount(ticket = {}) {
  const amount = Number(ticket.depositRefundAmount ?? ticket.unitPrice ?? 0);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

function mapPaymentRefundToTicketDepositStatus(paymentRefund) {
  switch (paymentRefund?.status) {
    case PAYMENT_REFUND_STATUS.PROCESSING:
      return TICKET_DEPOSIT_REFUND_STATUS.PROCESSING;

    case PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED:
      return TICKET_DEPOSIT_REFUND_STATUS.PROVIDER_SUCCEEDED;

    case PAYMENT_REFUND_STATUS.COMPLETED:
      return TICKET_DEPOSIT_REFUND_STATUS.REFUNDED;

    case PAYMENT_REFUND_STATUS.MANUAL_REVIEW:
      return TICKET_DEPOSIT_REFUND_STATUS.MANUAL_REVIEW;

    case PAYMENT_REFUND_STATUS.FAILED:
      return TICKET_DEPOSIT_REFUND_STATUS.FAILED;

    default:
      return TICKET_DEPOSIT_REFUND_STATUS.ELIGIBLE;
  }
}

function buildProviderRefundFromLedger(paymentRefund) {
  if (!paymentRefund?.providerRefundId) {
    return null;
  }

  return {
    provider: paymentRefund.provider,
    providerPaymentId: paymentRefund.providerPaymentId,

    providerRefundId: paymentRefund.providerRefundId,

    status: PAYMENT_REFUND_STATUSES.REFUNDED,

    resumed: true,
  };
}

async function projectDepositRefundFailure({
  ticket,
  actor,
  paymentRefund,
  error,
}) {
  if (!paymentRefund) {
    return ticket;
  }

  const projectionStatus = mapPaymentRefundToTicketDepositStatus(paymentRefund);

  const hasCompleted =
    projectionStatus === TICKET_DEPOSIT_REFUND_STATUS.REFUNDED;

  return updateTicketDepositRefund(
    ticket.id,
    {
      depositRefundStatus: projectionStatus,

      depositRefundAmount: Number(
        paymentRefund.amount ??
          ticket.depositRefundAmount ??
          ticket.unitPrice ??
          0,
      ),

      depositRefundCurrency:
        paymentRefund.currency ||
        ticket.depositRefundCurrency ||
        ticket.currency ||
        "EUR",

      depositRefundProviderRefundId:
        paymentRefund.providerRefundId ||
        ticket.depositRefundProviderRefundId ||
        null,

      depositRefundTriggeredAt:
        ticket.depositRefundTriggeredAt ||
        paymentRefund.createdAt ||
        new Date(),

      depositRefundTriggeredByEventUserId:
        paymentRefund.triggeredByEventUserId || actor?.eventUserId || null,

      depositRefundFailureReason: hasCompleted
        ? null
        : String(
            error?.message ||
              error ||
              paymentRefund.lastError ||
              "Deposit refund failed",
          ).slice(0, 500),

      updatedByEventUserId: actor?.eventUserId || null,
    },
    {
      lean: true,
    },
  );
}
async function triggerDepositRefundIfNeeded({ ticket, actor }) {
  if (ticket.ticketKind !== TICKET_KIND.DEPOSIT) {
    return null;
  }

  const ticketId = String(ticket.id);

  const orderId = String(ticket.orderId);

  const idempotencyKey = buildDepositRefundIdempotencyKey(ticketId);

  const order = await findOrderById(orderId, {
    lean: true,
  });

  if (!order?.paymentProviderPaymentId) {
    const updated = await updateTicketDepositRefund(
      ticketId,
      {
        depositRefundStatus: TICKET_DEPOSIT_REFUND_STATUS.FAILED,

        depositRefundFailureReason: "Missing payment provider payment id",

        depositRefundTriggeredAt: ticket.depositRefundTriggeredAt || new Date(),

        depositRefundTriggeredByEventUserId: actor?.eventUserId || null,

        updatedByEventUserId: actor?.eventUserId || null,
      },
      {
        lean: true,
      },
    );

    return {
      failed: true,
      ticket: updated,
      reason: "missing_payment_provider_payment_id",
    };
  }

  const amount = getDepositRefundAmount(ticket);

  if (amount <= 0) {
    const updated = await updateTicketDepositRefund(
      ticketId,
      {
        depositRefundStatus: TICKET_DEPOSIT_REFUND_STATUS.FAILED,

        depositRefundFailureReason:
          "Deposit refund amount must be greater than zero",

        depositRefundTriggeredAt: ticket.depositRefundTriggeredAt || new Date(),

        depositRefundTriggeredByEventUserId: actor?.eventUserId || null,

        updatedByEventUserId: actor?.eventUserId || null,
      },
      {
        lean: true,
      },
    );

    return {
      failed: true,
      ticket: updated,
      reason: "invalid_deposit_refund_amount",
    };
  }

  try {
    const result = await executePaymentRefundService({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,

      sourceId: ticketId,
      orderId,
      ticketId,

      provider: order.paymentProvider,

      providerPaymentId: order.paymentProviderPaymentId,

      amount,

      currency:
        ticket.depositRefundCurrency ||
        ticket.currency ||
        order.currency ||
        "EUR",

      idempotencyKey,

      description: `Kaution Refund Ticket ${ticket.ticketCode}`,

      metadata: {
        source: "event_deposit_check_in",

        orderId,
        ticketId,

        eventId: String(ticket.eventId),
      },

      actor,

      finalizeLocalState: async ({ paymentRefund, providerRefund }) => {
        const updated = await updateTicketDepositRefund(
          ticketId,
          {
            depositRefundStatus: TICKET_DEPOSIT_REFUND_STATUS.REFUNDED,

            depositRefundAmount: paymentRefund.amount,

            depositRefundCurrency: paymentRefund.currency,

            depositRefundProviderRefundId:
              paymentRefund.providerRefundId ||
              providerRefund?.providerRefundId ||
              null,

            depositRefundTriggeredAt:
              ticket.depositRefundTriggeredAt ||
              paymentRefund.createdAt ||
              new Date(),

            depositRefundTriggeredByEventUserId:
              paymentRefund.triggeredByEventUserId ||
              actor?.eventUserId ||
              null,

            depositRefundFailureReason: null,

            updatedByEventUserId: actor?.eventUserId || null,
          },
          {
            lean: true,
          },
        );

        if (!updated) {
          throw new Error(
            `Ticket ${ticketId} could not be finalized after provider refund success.`,
          );
        }

        return updated;
      },
    });

    const currentTicket =
      result.localResult ||
      (await findTicketById(ticketId, {
        lean: true,
      })) ||
      ticket;

    if (result.success) {
      return {
        success: true,

        skipped: Boolean(result.ignored),

        reason: result.reason || null,

        ticket: currentTicket,

        refund:
          result.providerRefund ||
          buildProviderRefundFromLedger(result.paymentRefund),

        paymentRefund: result.paymentRefund,
      };
    }

    return {
      failed: result.reason === "refund_requires_manual_review",

      skipped: true,

      reason: result.reason,

      status: result.paymentRefund?.status || null,

      ticket: currentTicket,

      paymentRefund: result.paymentRefund,
    };
  } catch (error) {
    /*
     * Die Saga hat ihren Zustand bereits
     * persistent gespeichert.
     *
     * Hier aktualisieren wir nur die
     * Ticket-Projektion für API und UI.
     */
    const paymentRefund = await findPaymentRefundByIdempotencyKey(
      idempotencyKey,
      {
        lean: true,
      },
    );

    const updatedTicket = await projectDepositRefundFailure({
      ticket,
      actor,
      paymentRefund,
      error,
    });

    return {
      failed: true,

      ticket: updatedTicket || ticket,

      reason: String(error?.message || error || "Deposit refund failed"),

      status: paymentRefund?.status || null,

      paymentRefund,
    };
  }
}

function unwrapStorageBuffer(file) {
  if (Buffer.isBuffer(file)) {
    return {
      buffer: file,
      contentType: "application/pdf",
      contentLength: file.length,
    };
  }

  if (Buffer.isBuffer(file?.buffer)) {
    return {
      buffer: file.buffer,
      contentType: file.contentType || "application/pdf",
      contentLength: file.contentLength || file.buffer.length,
    };
  }

  if (Buffer.isBuffer(file?.content)) {
    return {
      buffer: file.content,
      contentType: file.contentType || "application/pdf",
      contentLength: file.contentLength || file.content.length,
    };
  }

  throw ticketPdfReadFailedError();
}
async function assertGuestCanAccessTicket({ ticket, accessToken }) {
  const order = await findOrderByIdWithGuestAccess(ticket.orderId, {
    lean: true,
  });

  if (!order) {
    throw guestTicketOrderNotFoundError(ticket.orderId);
  }

  if (order.buyerType !== ORDER_BUYER_TYPE.GUEST) {
    throw ticketNotGuestOrderError(order.id);
  }

  if (!order.guestAccessTokenHash) {
    throw guestTicketAccessUnavailableError(order.id);
  }

  const tokenHash = hashGuestAccessToken(accessToken);

  if (tokenHash !== order.guestAccessTokenHash) {
    throw invalidGuestTicketAccessTokenError(order.id);
  }

  if (
    order.guestAccessTokenExpiresAt &&
    new Date(order.guestAccessTokenExpiresAt) < new Date()
  ) {
    throw expiredGuestTicketAccessTokenError(order.id);
  }

  await markGuestAccessUsed(order.id);

  return order;
}
export async function buildTicketDocumentAttachmentsForOrderService({ order }) {
  if (!features.ticketPdf) {
    return [];
  }

  const tickets = await findTicketsByOrderId(order.id, {
    lean: true,
    includeSecrets: true,
  });

  const attachments = [];

  for (const ticket of tickets) {
    try {
      const attachment = await buildOfficialTicketAttachment({
        ticket,
      });

      if (attachment) {
        attachments.push(attachment);
      }
    } catch {
      // Mail sending should not fail because one ticket PDF failed.
    }
  }

  return attachments;
}
export async function generateTicketDocumentsForOrderService({ order }) {
  const orderId = order.id;

  logger.info("Ticket PDF generation for order started", {
    orderId: String(orderId),
    ticketPdfEnabled: Boolean(features.ticketPdf),
  });

  if (!features.ticketPdf) {
    logger.warn("Ticket PDF generation skipped because feature is disabled", {
      orderId: String(orderId),
    });

    return {
      skipped: true,
      reason: "ticket_pdf_disabled",
      generated: 0,
      alreadyExisted: 0,
      failed: 0,
      errors: [],
    };
  }

  const tickets = await findTicketsByOrderId(orderId, {
    lean: true,
    includeSecrets: true,
  });

  logger.info("Ticket PDF generation found tickets", {
    orderId: String(orderId),
    ticketCount: tickets.length,
    ticketIds: tickets.map((ticket) => String(ticket.id)),
  });

  let generated = 0;
  let alreadyExisted = 0;
  let failed = 0;
  const errors = [];

  for (const ticket of tickets) {
    if (ticket.ticketPdfStorageKey) {
      alreadyExisted += 1;

      logger.info("Ticket PDF already exists", {
        ticketId: String(ticket.id),
        ticketCode: ticket.ticketCode,
        storageKey: ticket.ticketPdfStorageKey,
      });

      continue;
    }

    try {
      logger.info("Generating Ticket PDF", {
        orderId: String(orderId),
        ticketId: String(ticket.id),
        ticketCode: ticket.ticketCode,
      });

      const documentResult = await generateOfficialTicketDocument({
        ticket,
      });

      logger.info("Ticket PDF generated", {
        ticketId: String(ticket.id),
        ticketCode: ticket.ticketCode,
        storageKey: documentResult?.ticket?.ticketPdfStorageKey || null,
      });

      generated += 1;
    } catch (error) {
      failed += 1;

      logger.error("Ticket PDF generation failed", {
        orderId: String(orderId),
        ticketId: String(ticket.id),
        ticketCode: ticket.ticketCode,
        error: error.message,
        stack: error.stack,
      });

      errors.push({
        ticketId: String(ticket.id),
        ticketCode: ticket.ticketCode,
        message: error.message,
      });
    }
  }

  logger.info("Ticket PDF generation for order finished", {
    orderId: String(orderId),
    generated,
    alreadyExisted,
    failed,
    errors,
  });

  return {
    skipped: false,
    generated,
    alreadyExisted,
    failed,
    errors,
  };
}
function buildOrderTicketSlotKey(orderItemIndex, orderItemUnitIndex) {
  return `${orderItemIndex}:${orderItemUnitIndex}`;
}

function getTicketSlotKey(ticket) {
  if (
    !Number.isSafeInteger(ticket.orderItemIndex) ||
    ticket.orderItemIndex < 0 ||
    !Number.isSafeInteger(ticket.orderItemUnitIndex) ||
    ticket.orderItemUnitIndex < 0
  ) {
    throw new Error(
      `Ticket ${ticket.id || "unknown"} has an invalid order item slot.`,
    );
  }

  return buildOrderTicketSlotKey(
    ticket.orderItemIndex,
    ticket.orderItemUnitIndex,
  );
}
export async function generateTicketsForOrderService(orderId, options = {}) {
  const order = await findOrderById(orderId, {
    ...options,
    lean: true,
  });

  if (!order) {
    throw ticketOrderNotFoundError(orderId);
  }

  if (order.status !== ORDER_STATUS.CONFIRMED) {
    throw ticketsRequireConfirmedOrderError(orderId);
  }

  const existingTickets = await findTicketsByOrderId(orderId, {
    ...options,
    lean: true,
  });

  const existingSlotKeys = new Set(
    existingTickets.map((ticket) => getTicketSlotKey(ticket)),
  );

  const expectedSlotKeys = new Set();

  for (const [orderItemIndex, item] of (order.items || []).entries()) {
    const quantity = Number(item.quantity);

    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new Error(`Order ${orderId} contains an invalid ticket quantity.`);
    }

    const ticketType = await findTicketTypeById(item.ticketTypeId, {
      ...options,
      lean: true,
    });

    for (
      let orderItemUnitIndex = 0;
      orderItemUnitIndex < quantity;
      orderItemUnitIndex += 1
    ) {
      const slotKey = buildOrderTicketSlotKey(
        orderItemIndex,
        orderItemUnitIndex,
      );

      expectedSlotKeys.add(slotKey);

      if (existingSlotKeys.has(slotKey)) {
        continue;
      }

      const ticketData = buildTicketFromOrderItem({
        order,
        item,
        ticketType,
        orderItemIndex,
        orderItemUnitIndex,
        options,
      });

      await ensureTicketForOrderSlot(ticketData, options);
    }
  }

  const tickets = await findTicketsByOrderId(orderId, {
    ...options,
    lean: true,
  });

  const actualSlotKeys = new Set(
    tickets.map((ticket) => getTicketSlotKey(ticket)),
  );

  const hasAllExpectedSlots = [...expectedSlotKeys].every((slotKey) =>
    actualSlotKeys.has(slotKey),
  );

  const hasOnlyExpectedSlots = [...actualSlotKeys].every((slotKey) =>
    expectedSlotKeys.has(slotKey),
  );

  if (
    tickets.length !== expectedSlotKeys.size ||
    actualSlotKeys.size !== expectedSlotKeys.size ||
    !hasAllExpectedSlots ||
    !hasOnlyExpectedSlots
  ) {
    throw new Error(
      `Ticket generation incomplete for order ${orderId}: expected ${expectedSlotKeys.size} ticket(s), found ${tickets.length}.`,
    );
  }

  return tickets;
}

export async function cancelTicketsForOrderService({
  orderId,
  actor,
  session,
}) {
  const order = await findOrderById(orderId, {
    lean: true,
  });

  if (!order) {
    throw ticketOrderNotFoundError(orderId);
  }

  const result = await cancelTicketsByOrderId(
    orderId,
    {
      status: TICKET_STATUS.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: "Order cancelled",
      updatedByEventUserId: actor?.eventUserId || null,
    },
    {
      session,
    },
  );

  for (const item of order.items || []) {
    await releaseTicketTypeStock({
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      updatedByEventUserId: actor?.eventUserId || null,
    });
  }

  return result;
}
async function loadOwnTicketRecord({
  actor,
  ticketId,
  includeSecrets = false,
}) {
  assertExternalActor(actor);

  const ticket = await findTicketByIdAndExternalBuyer(
    {
      ticketId,

      externalProvider: actor.externalProvider,

      externalUserId: actor.externalUserId,
    },
    {
      lean: true,
      includeSecrets,
    },
  );

  if (!ticket) {
    throw ticketNotFoundError(ticketId);
  }

  return ticket;
}
export async function listOwnTicketsService({
  actor,
  page = 1,
  limit = 20,
  status,
  eventId,
  orderId,
}) {
  assertExternalActor(actor);

  const result = await listTicketsByExternalBuyer(
    {
      externalProvider: actor.externalProvider,
      externalUserId: actor.externalUserId,
      page,
      limit,
      status,
      eventId,
      orderId,
    },
    {
      lean: true,
    },
  );

  return {
    items: (result.items || []).map((ticket) => toPublicTicketDto(ticket)),

    pagination: {
      page: result.page || page,

      limit: result.limit || limit,

      total: result.total || 0,

      pages: Math.ceil((result.total || 0) / (result.limit || limit)) || 1,
    },
  };
}

export async function getOwnTicketByIdService({ actor, ticketId }) {
  const ticket = await loadOwnTicketRecord({
    actor,
    ticketId,
  });

  return toPublicTicketDto(ticket);
}

export async function getOwnTicketQrService({ actor, ticketId }) {
  assertTicketQrEnabled();

  const ticket = await loadOwnTicketRecord({
    actor,
    ticketId,
    includeSecrets: true,
  });

  if (!ticket.encryptedCheckInToken) {
    throw ticketQrUnavailableError(ticketId);
  }

  const payload = buildQrPayloadFromEncryptedToken(
    ticket.encryptedCheckInToken,
  );

  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return {
    ticketId: ticket.id,
    ticketCode: ticket.ticketCode,
    payload,
    qrDataUrl,
  };
}

export async function getOwnTicketDocumentService({ actor, ticketId }) {
  if (!features.ticketPdf) {
    throw ticketPdfDisabledError();
  }

  const ticket = await loadOwnTicketRecord({
    actor,
    ticketId,
    includeSecrets: true,
  });

  if (ticket.ticketPdfStorageKey) {
    const storedFile = await getBuffer({
      key: ticket.ticketPdfStorageKey,

      storageTarget: ticket.ticketPdfStorageTarget,
    });
    const file = unwrapStorageBuffer(storedFile);

    return {
      buffer: file.buffer,
      filename: `ticket-${ticket.ticketCode}.pdf`,
      contentType: "application/pdf",
      contentLength: file.contentLength,
    };
  }

  const attachment = await buildOfficialTicketAttachment({
    ticket,
    order: null,
    context: {},
  });

  if (!attachment?.content) {
    throw ticketPdfGenerationFailedError(ticketId);
  }

  return {
    buffer: attachment.content,
    filename: attachment.filename,
    contentType: attachment.contentType || "application/pdf",
    contentLength: attachment.content.length,
  };
}

export async function getInternalTicketByIdService({ actor, ticketId }) {
  const { ticket, event } = await getTicketWithEvent(ticketId);

  const access = await assertCanAccessTicketsForEvent({
    actor,
    event,
  });

  if (access.manage) {
    return toAdminTicketDto(ticket);
  }

  return toInternalCheckInTicketDto(ticket);
}

export async function cancelInternalTicketService({ actor, ticketId, reason }) {
  const { ticket, event } = await getTicketWithEvent(ticketId);

  await assertCanManageTicketsForEvent({
    actor,
    event,
  });

  if (ticket.status === TICKET_STATUS.CANCELLED) {
    return {
      ticket: toAdminTicketDto(ticket),
      statusChanged: false,
    };
  }

  const updatedTicket = await cancelTicketByIdIfActive(
    ticket.id,
    {
      cancelledAt: new Date(),

      cancellationReason: reason || "Cancelled internally",

      updatedByEventUserId: actor.eventUserId || null,
    },
    {
      lean: true,
    },
  );

  if (!updatedTicket) {
    const freshTicket = await findTicketById(ticket.id, {
      lean: true,
    });

    if (!freshTicket) {
      throw ticketNotFoundError(ticket.id);
    }

    return {
      ticket: toAdminTicketDto(freshTicket),
      statusChanged: false,
    };
  }

  await releaseTicketTypeStock({
    ticketTypeId: ticket.ticketTypeId,
    quantity: 1,

    updatedByEventUserId: actor.eventUserId || null,
  });

  return {
    ticket: toAdminTicketDto(updatedTicket),
    statusChanged: true,
  };
}

export async function setInternalTicketCheckInService({
  actor,
  ticketId,
  checkedIn,
}) {
  if (typeof checkedIn !== "boolean") {
    throw new TypeError("checkedIn must be an explicit boolean.");
  }

  const { ticket, event } = await getTicketWithEvent(ticketId);

  await assertCanCheckInForEvent({
    actor,
    event,
  });

  if (ticket.status === TICKET_STATUS.CANCELLED) {
    throw cancelledTicketCheckInError(ticket.id);
  }

  const currentlyCheckedIn = ticket.status === TICKET_STATUS.CHECKED_IN;

  /*
   * Gewünschter Zustand ist bereits erreicht.
   *
   * Bei Deposit-Tickets bleibt ein erneuter
   * checkedIn=true-Aufruf ein sicherer Refund-Saga-Retry.
   */
  if (checkedIn === currentlyCheckedIn) {
    if (checkedIn && ticket.ticketKind === TICKET_KIND.DEPOSIT) {
      const refund = await triggerDepositRefundIfNeeded({
        ticket,
        actor,
      });

      return {
        ticket: toInternalCheckInTicketDto(refund?.ticket || ticket),

        statusChanged: false,
      };
    }

    return {
      ticket: toInternalCheckInTicketDto(ticket),
      statusChanged: false,
    };
  }

  if (!checkedIn) {
    if (ticket.ticketKind === TICKET_KIND.DEPOSIT) {
      throw depositTicketCheckoutForbiddenError(ticket.id);
    }

    const updatedTicket = await markTicketCheckedOut(
      ticket.id,
      {
        updatedByEventUserId: actor.eventUserId || null,
      },
      {
        lean: true,
      },
    );

    if (!updatedTicket) {
      throw ticketNotFoundError(ticket.id);
    }

    return {
      ticket: toInternalCheckInTicketDto(updatedTicket),
      statusChanged: true,
    };
  }

  const updatedTicket = await markTicketCheckedIn(
    ticket.id,
    {
      checkedInAt: new Date(),

      checkedInByEventUserId: actor.eventUserId || null,

      checkInTokenLastUsedAt: new Date(),

      updatedByEventUserId: actor.eventUserId || null,
    },
    {
      lean: true,
    },
  );

  if (!updatedTicket) {
    throw ticketNotFoundError(ticket.id);
  }

  const refund = await triggerDepositRefundIfNeeded({
    ticket: updatedTicket,
    actor,
  });

  return {
    ticket: toInternalCheckInTicketDto(refund?.ticket || updatedTicket),

    statusChanged: true,
  };
}

export async function listEventTicketsInternalService({
  actor,
  eventId,
  page = 1,
  limit = 20,
  status,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  const event = await findEventById(eventId, {
    lean: true,
  });

  if (!event) {
    throw ticketEventNotFoundError(eventId);
  }

  const access = await assertCanAccessTicketsForEvent({
    actor,
    event,
  });

  const result = await listTicketsPaginated(
    {
      eventId,
      page,
      limit,
      status,
      search,
      sortBy,
      sortOrder,
    },
    {
      lean: true,
    },
  );

  const pagination = {
    page: result.page,

    limit: result.limit,

    total: result.total,

    pages: Math.ceil(result.total / result.limit) || 1,
  };

  return {
    items: result.items.map((ticket) =>
      access.manage
        ? toAdminTicketDto(ticket)
        : toInternalCheckInTicketDto(ticket),
    ),

    meta: toAdminTicketListMetaDto({
      event: {
        id: eventId,

        title: event.title,

        status: event.status,
      },

      pagination,

      summary: result.summary,
    }),
  };
}

async function lookupTicketByCodeInternal({ actor, ticketCode }) {
  assertInternalActor(actor);

  const ticket = await findTicketByCode(normalizeTicketCode(ticketCode), {
    lean: true,
  });

  if (!ticket) {
    throw ticketNotFoundError();
  }

  const event = await findEventById(ticket.eventId, {
    lean: true,
  });

  await assertCanCheckInForEvent({
    actor,
    event,
  });

  return {
    ticket,
    event,
  };
}

export async function lookupTicketForCheckInService({ actor, ticketCode }) {
  const { ticket } = await lookupTicketByCodeInternal({
    actor,
    ticketCode,
  });

  return toAdminTicketCheckInLookupDto(ticket);
}

export async function confirmTicketCheckInService({ actor, ticketCode }) {
  const { ticket } = await lookupTicketByCodeInternal({
    actor,
    ticketCode,
  });

  const result = await setInternalTicketCheckInService({
    actor,

    ticketId: ticket.id,

    checkedIn: true,
  });

  return toAdminTicketCheckInConfirmDto({
    ticketDto: result.ticket,

    statusChanged: result.statusChanged,
  });
}

export async function lookupTicketForCheckInPayloadService({ actor, payload }) {
  assertInternalActor(actor);

  const tokenHash = hashCheckInPayload(payload);
  const ticket = await findTicketByCheckInTokenHash(tokenHash, {
    lean: true,
  });

  if (!ticket) {
    throw ticketNotFoundError();
  }

  return lookupTicketForCheckInService({
    actor,
    ticketCode: ticket.ticketCode,
  });
}

export async function confirmTicketCheckInPayloadService({ actor, payload }) {
  assertInternalActor(actor);

  const tokenHash = hashCheckInPayload(payload);
  const ticket = await findTicketByCheckInTokenHash(tokenHash, {
    lean: true,
  });

  if (!ticket) {
    throw ticketNotFoundError();
  }

  return confirmTicketCheckInService({
    actor,
    ticketCode: ticket.ticketCode,
  });
}
export async function getGuestTicketQrService({ ticketId, accessToken }) {
  assertTicketQrEnabled();

  const ticket = await findTicketById(ticketId, {
    lean: true,
    includeSecrets: true,
  });

  if (!ticket) {
    throw ticketNotFoundError(ticketId);
  }

  await assertGuestCanAccessTicket({
    ticket,
    accessToken,
  });

  if (!ticket.encryptedCheckInToken) {
    throw ticketQrUnavailableError(ticketId);
  }

  const payload = buildQrPayloadFromEncryptedToken(
    ticket.encryptedCheckInToken,
  );

  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return {
    ticketId: ticket.id,

    ticketCode: ticket.ticketCode,

    payload,
    qrDataUrl,
  };
}

export async function getGuestTicketDocumentService({ ticketId, accessToken }) {
  if (!features.ticketPdf) {
    throw ticketPdfDisabledError();
  }

  const ticket = await findTicketById(ticketId, {
    lean: true,
    includeSecrets: true,
  });

  if (!ticket) {
    throw ticketNotFoundError(ticketId);
  }

  await assertGuestCanAccessTicket({
    ticket,
    accessToken,
  });

  if (ticket.ticketPdfStorageKey) {
    const storedFile = await getBuffer({
      key: ticket.ticketPdfStorageKey,

      storageTarget: ticket.ticketPdfStorageTarget,
    });
    const file = unwrapStorageBuffer(storedFile);

    return {
      buffer: file.buffer,
      filename: `ticket-${ticket.ticketCode}.pdf`,
      contentType: "application/pdf",
      contentLength: file.contentLength,
    };
  }

  const attachment = await buildOfficialTicketAttachment({
    ticket,
    order: null,
    context: {},
  });

  if (!attachment?.content) {
    throw ticketPdfGenerationFailedError(ticketId);
  }

  return {
    buffer: attachment.content,
    filename: attachment.filename,
    contentType: attachment.contentType || "application/pdf",
    contentLength: attachment.content.length,
  };
}
