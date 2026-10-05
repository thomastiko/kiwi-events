import { toApiId } from "../../../core/dto/contractValue.dto.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(
      `Cannot serialize an event refund without ${fieldName}.`,
    );
  }

  return id;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(
      `Cannot serialize an event refund without ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized || null;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const normalized = Number(value);

  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(
      `Cannot serialize an invalid event refund ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeBuyer(buyer = {}) {
  return {
    type: normalizeRequiredString(buyer.type || "guest", "buyer type"),

    externalProvider: normalizeNullableString(buyer.externalProvider),

    externalUserId: normalizeNullableString(buyer.externalUserId),

    email: String(buyer.email ?? "").trim(),

    firstName: String(buyer.firstName ?? "").trim(),

    lastName: String(buyer.lastName ?? "").trim(),

    displayName: String(buyer.displayName ?? "").trim(),
  };
}

function normalizeBlockingDepositRefund(paymentRefund) {
  return {
    paymentRefundId: requireApiId(
      paymentRefund.paymentRefundId,
      "blocking paymentRefundId",
    ),

    sourceId: normalizeRequiredString(
      paymentRefund.sourceId,
      "blocking payment refund sourceId",
    ),

    status: normalizeRequiredString(
      paymentRefund.status,
      "blocking payment refund status",
    ),

    amount: normalizeNonNegativeInteger(
      paymentRefund.amount,
      "blocking payment refund amount",
    ),

    providerRefundId: normalizeNullableString(paymentRefund.providerRefundId),
  };
}

function normalizeBlockingDepositRefunds(values) {
  if (values === null || values === undefined) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new TypeError("Cannot serialize invalid blocking deposit refunds.");
  }

  return values.map(normalizeBlockingDepositRefund);
}

function normalizeRefundPreviewOrder(order) {
  return {
    orderId: requireApiId(order.orderId, "orderId"),

    orderNumber: normalizeRequiredString(order.orderNumber, "orderNumber"),

    buyer: normalizeBuyer(order.buyer),

    status: normalizeRequiredString(order.status, "order status"),

    paymentStatus: normalizeRequiredString(
      order.paymentStatus,
      "order paymentStatus",
    ),

    refundStatus: normalizeRequiredString(
      order.refundStatus,
      "order refundStatus",
    ),

    totalPrice: normalizeNonNegativeInteger(
      order.totalPrice,
      "order totalPrice",
    ),

    currency: normalizeRequiredString(
      order.currency,
      "order currency",
    ).toUpperCase(),

    ticketCount: normalizeNonNegativeInteger(
      order.ticketCount,
      "order ticketCount",
    ),

    alreadyRefundedDepositAmount: normalizeNonNegativeInteger(
      order.alreadyRefundedDepositAmount,
      "alreadyRefundedDepositAmount",
    ),

    blockingDepositRefunds: normalizeBlockingDepositRefunds(
      order.blockingDepositRefunds,
    ),

    refundable: Boolean(order.refundable),

    localFinalizationOnly: Boolean(order.localFinalizationOnly),

    refundBlocked: Boolean(order.refundBlocked),

    refundBlockedReason: normalizeNullableString(order.refundBlockedReason),

    refundAmount: normalizeNonNegativeInteger(
      order.refundAmount,
      "refundAmount",
    ),
  };
}

export function toEventRefundPreviewDto(preview) {
  if (!preview) {
    throw new TypeError("Cannot serialize a missing event refund preview.");
  }

  if (!Array.isArray(preview.orders)) {
    throw new TypeError(
      "Cannot serialize invalid event refund preview orders.",
    );
  }

  return {
    event: {
      id: requireApiId(preview.event?.id, "event id"),

      title: normalizeRequiredString(preview.event?.title, "event title"),

      status: normalizeRequiredString(preview.event?.status, "event status"),
    },

    summary: {
      orderCount: normalizeNonNegativeInteger(
        preview.summary?.orderCount,
        "summary orderCount",
      ),

      refundableOrderCount: normalizeNonNegativeInteger(
        preview.summary?.refundableOrderCount,
        "summary refundableOrderCount",
      ),

      blockedOrderCount: normalizeNonNegativeInteger(
        preview.summary?.blockedOrderCount,
        "summary blockedOrderCount",
      ),

      refundAmountTotal: normalizeNonNegativeInteger(
        preview.summary?.refundAmountTotal,
        "summary refundAmountTotal",
      ),
    },

    orders: preview.orders.map(normalizeRefundPreviewOrder),
  };
}

function normalizeProviderRefund(providerRefund) {
  if (!providerRefund) {
    return null;
  }

  return {
    provider: normalizeNullableString(providerRefund.provider),

    providerPaymentId: normalizeNullableString(
      providerRefund.providerPaymentId,
    ),

    providerRefundId: normalizeNullableString(providerRefund.providerRefundId),

    status: normalizeNullableString(providerRefund.status),

    resumed: Boolean(providerRefund.resumed),
  };
}

function normalizePaymentRefund(paymentRefund) {
  if (!paymentRefund) {
    return null;
  }

  return {
    id: requireApiId(paymentRefund.id, "paymentRefund id"),

    sourceType: normalizeRequiredString(
      paymentRefund.sourceType,
      "paymentRefund sourceType",
    ),

    status: normalizeRequiredString(
      paymentRefund.status,
      "paymentRefund status",
    ),

    provider: normalizeRequiredString(
      paymentRefund.provider,
      "paymentRefund provider",
    ),

    providerRefundId: normalizeNullableString(paymentRefund.providerRefundId),

    amount: normalizeNonNegativeInteger(
      paymentRefund.amount,
      "paymentRefund amount",
    ),

    currency: normalizeRequiredString(
      paymentRefund.currency,
      "paymentRefund currency",
    ).toUpperCase(),
  };
}

function normalizeRefundExecutionItem(item) {
  const result = item.refund || {};
  const order = result.order || null;

  return {
    orderId: requireApiId(item.orderId, "orderId"),

    orderNumber: normalizeRequiredString(item.orderNumber, "orderNumber"),

    buyer: normalizeBuyer(item.buyer),

    skipped: Boolean(result.skipped),

    failed: Boolean(result.failed),

    reason: normalizeNullableString(result.reason),

    orderStatus: normalizeNullableString(order?.status),

    paymentStatus: normalizeNullableString(order?.paymentStatus),

    refundStatus: normalizeNullableString(order?.refundStatus),

    refundedAmount: normalizeNonNegativeInteger(
      order?.refundedAmount ?? 0,
      "refundedAmount",
    ),

    providerRefund: normalizeProviderRefund(result.refund),

    paymentRefund: normalizePaymentRefund(result.paymentRefund),

    alreadyRefundedDepositAmount: normalizeNonNegativeInteger(
      result.alreadyRefundedDepositAmount ?? 0,
      "alreadyRefundedDepositAmount",
    ),

    remainingRefundAmount: normalizeNonNegativeInteger(
      result.remainingRefundAmount ?? 0,
      "remainingRefundAmount",
    ),

    blockingDepositRefunds: normalizeBlockingDepositRefunds(
      result.blockingDepositRefunds,
    ),
  };
}

export function toEventCancellationExecutionDto(result) {
  if (!result) {
    throw new TypeError(
      "Cannot serialize a missing event cancellation execution.",
    );
  }

  if (!Array.isArray(result.refunds)) {
    throw new TypeError(
      "Cannot serialize invalid event cancellation execution results.",
    );
  }

  return {
    eventId: requireApiId(result.eventId, "eventId"),

    refundMode: String(result.refundMode || ""),

    totalOrders: normalizeNonNegativeInteger(result.totalOrders, "totalOrders"),

    cancelledOrders: normalizeNonNegativeInteger(
      result.cancelledOrders,
      "cancelledOrders",
    ),

    failedCancellations: normalizeNonNegativeInteger(
      result.failedCancellations,
      "failedCancellations",
    ),

    refundRequestedOrders: normalizeNonNegativeInteger(
      result.refundRequestedOrders,
      "refundRequestedOrders",
    ),

    refunds: result.refunds.map(normalizeRefundExecutionItem),
  };
}

export function toEventMailResultDto(mail) {
  if (!mail) {
    return {
      skipped: true,
      reason: null,
      sent: 0,
      failed: 0,
    };
  }

  return {
    skipped: Boolean(mail.skipped),

    reason: normalizeNullableString(mail.reason),

    sent: normalizeNonNegativeInteger(mail.sentCount ?? 0, "mail sent"),

    failed: normalizeNonNegativeInteger(mail.failedCount ?? 0, "mail failed"),
  };
}
