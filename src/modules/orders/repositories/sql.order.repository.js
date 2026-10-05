// src/modules/orders/repositories/sql.order.repository.js

import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";
import {
  ORDER_BUYER_TYPE,
  ORDER_FULFILLMENT_STATUS,
  ORDER_FULFILLMENT_STEP,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "../order.constants.js";

function now() {
  return new Date();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function parseJsonObject(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function stringifyJson(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return cleanString(value).toLowerCase();
}

function getDb(options = {}) {
  return options.trx || options.knex || getDatabaseConnection();
}

function stripOrderSecrets(order, options = {}) {
  if (!order || options.includeSecrets) {
    return order;
  }

  const {
    guestAccessTokenHash,
    idempotencyScope,
    idempotencyKey,
    idempotencyRequestHash,
    idempotencyCompletedAt,
    fulfillmentLeaseToken,
    fulfillmentLastError,
    refundFailureReason,
    ...safeOrder
  } = order;

  return safeOrder;
}

function mapOrderRow(row, options = {}) {
  if (!row) return null;

  const order = {
    id: row.id,

    orderNumber: row.order_number,
    idempotencyScope: row.idempotency_scope || null,
    idempotencyKey: row.idempotency_key || null,
    idempotencyRequestHash: row.idempotency_request_hash || null,
    idempotencyCompletedAt: row.idempotency_completed_at || null,

    hostServiceProvider: row.host_service_provider || null,
    hostServiceId: row.host_service_id || null,

    buyerType: row.buyer_type || "guest",
    buyerExternalProvider: row.buyer_external_provider || null,
    buyerExternalUserId: row.buyer_external_user_id || null,
    buyerEmailSnapshot: row.buyer_email_snapshot || "",
    buyerFirstNameSnapshot: row.buyer_first_name_snapshot || "",
    buyerLastNameSnapshot: row.buyer_last_name_snapshot || "",
    buyerDisplayNameSnapshot: row.buyer_display_name_snapshot || "",
    buyerRawExternalSnapshot: parseJsonObject(row.buyer_raw_external_snapshot),

    eventId: row.event_id,
    eventTitleSnapshot: row.event_title_snapshot || "",
    eventSlugSnapshot: row.event_slug_snapshot || null,
    eventCategorySnapshot: row.event_category_snapshot || null,
    eventLocationSnapshot: row.event_location_snapshot || "",
    eventStartsAtSnapshot: row.event_starts_at_snapshot || null,
    eventTimezoneSnapshot: row.event_timezone_snapshot || "Europe/Vienna",
    items: parseJsonArray(row.items),

    currency: row.currency || "EUR",
    subtotal: Number(row.subtotal || 0),

    discountCodeIdSnapshot: row.discount_code_id_snapshot || null,

    discountCodeSnapshot: row.discount_code_snapshot || null,

    discountCodeGroupIdSnapshot: row.discount_code_group_id_snapshot || null,

    discountCodeGroupNameSnapshot:
      row.discount_code_group_name_snapshot || null,

    discountPercent:
      row.discount_percent === null || row.discount_percent === undefined
        ? null
        : Number(row.discount_percent),

    discountAmount: Number(row.discount_amount || 0),

    totalPrice: Number(row.total_price || 0),

    status: row.status,
    paymentStatus: row.payment_status,
    paymentProvider: row.payment_provider,
    paymentProviderPaymentId: row.payment_provider_payment_id || null,
    paymentCheckoutUrl: row.payment_checkout_url || null,

    refundStatus: row.refund_status || ORDER_REFUND_STATUS.NONE,

    refundReason: row.refund_reason || null,

    refundedAmount: Number(row.refunded_amount || 0),

    paymentProviderRefundId: row.payment_provider_refund_id || null,

    refundedAt: row.refunded_at || null,

    refundFailedAt: row.refund_failed_at || null,

    refundFailureReason: row.refund_failure_reason || null,

    fulfillmentStatus:
      row.fulfillment_status || ORDER_FULFILLMENT_STATUS.NOT_STARTED,

    fulfillmentStep: row.fulfillment_step || null,

    fulfillmentAttemptCount: Number(row.fulfillment_attempt_count || 0),

    fulfillmentStartedAt: row.fulfillment_started_at || null,

    fulfillmentCompletedAt: row.fulfillment_completed_at || null,

    fulfillmentFailedAt: row.fulfillment_failed_at || null,

    fulfillmentLastError: row.fulfillment_last_error || null,

    fulfillmentLeaseToken: row.fulfillment_lease_token || null,

    fulfillmentLeaseExpiresAt: row.fulfillment_lease_expires_at || null,
    fulfillmentNextRetryAt: row.fulfillment_next_retry_at || null,

    fulfillmentManualReviewAt: row.fulfillment_manual_review_at || null,
    source: row.source,
    manualAssignmentReason: row.manual_assignment_reason || null,

    confirmedAt: row.confirmed_at || null,
    cancelledAt: row.cancelled_at || null,
    cancellationReason: row.cancellation_reason || null,
    expiresAt: row.expires_at || null,

    guestAccessTokenHash: row.guest_access_token_hash || null,
    guestAccessTokenExpiresAt: row.guest_access_token_expires_at || null,
    guestAccessLastUsedAt: row.guest_access_last_used_at || null,
    guestAccessDownloadCount: Number(row.guest_access_download_count || 0),

    createdByEventUserId: row.created_by_event_user_id || null,
    updatedByEventUserId: row.updated_by_event_user_id || null,

    metadata: parseJsonObject(row.metadata),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return stripOrderSecrets(order, options);
}

function toOrderInsert(data) {
  const timestamp = now();

  return {
    id: data.id || randomUUID(),
    order_number: data.orderNumber,
    idempotency_scope: data.idempotencyScope || null,
    idempotency_key: data.idempotencyKey || null,
    idempotency_request_hash: data.idempotencyRequestHash || null,
    idempotency_completed_at: data.idempotencyCompletedAt || null,

    host_service_provider: cleanString(data.hostServiceProvider) || null,
    host_service_id: cleanString(data.hostServiceId) || null,

    buyer_type: data.buyerType || "guest",
    buyer_external_provider: data.buyerExternalProvider || null,
    buyer_external_user_id: data.buyerExternalUserId || null,
    buyer_email_snapshot: cleanEmail(data.buyerEmailSnapshot),
    buyer_first_name_snapshot: data.buyerFirstNameSnapshot || "",
    buyer_last_name_snapshot: data.buyerLastNameSnapshot || "",
    buyer_display_name_snapshot: data.buyerDisplayNameSnapshot || "",
    buyer_raw_external_snapshot: stringifyJson(
      data.buyerRawExternalSnapshot,
      null,
    ),

    event_id: data.eventId,
    event_title_snapshot: data.eventTitleSnapshot || "",
    event_slug_snapshot: data.eventSlugSnapshot || null,
    event_category_snapshot: data.eventCategorySnapshot || null,
    event_location_snapshot: data.eventLocationSnapshot || "",
    event_starts_at_snapshot: data.eventStartsAtSnapshot || null,
    event_timezone_snapshot: data.eventTimezoneSnapshot || "Europe/Vienna",
    items: stringifyJson(data.items, []),

    currency: data.currency || "EUR",
    subtotal: Number(data.subtotal || 0),

    discount_code_id_snapshot: data.discountCodeIdSnapshot || null,

    discount_code_snapshot: data.discountCodeSnapshot || null,

    discount_code_group_id_snapshot: data.discountCodeGroupIdSnapshot || null,

    discount_code_group_name_snapshot:
      data.discountCodeGroupNameSnapshot || null,

    discount_percent: data.discountPercent ?? null,

    discount_amount: Number(data.discountAmount || 0),

    total_price: Number(data.totalPrice || 0),

    status: data.status || ORDER_STATUS.PENDING,
    payment_status: data.paymentStatus || ORDER_PAYMENT_STATUS.PENDING,
    payment_provider: data.paymentProvider || "none",
    payment_provider_payment_id: data.paymentProviderPaymentId || null,

    payment_checkout_url: data.paymentCheckoutUrl || null,

    refund_status: data.refundStatus || ORDER_REFUND_STATUS.NONE,

    refund_reason: data.refundReason || null,

    refunded_amount: Number(data.refundedAmount || 0),

    payment_provider_refund_id: data.paymentProviderRefundId || null,

    refunded_at: data.refundedAt || null,

    refund_failed_at: data.refundFailedAt || null,

    refund_failure_reason: data.refundFailureReason || null,

    fulfillment_status:
      data.fulfillmentStatus || ORDER_FULFILLMENT_STATUS.NOT_STARTED,

    fulfillment_step: data.fulfillmentStep || null,

    fulfillment_attempt_count: Number(data.fulfillmentAttemptCount || 0),

    fulfillment_started_at: data.fulfillmentStartedAt || null,

    fulfillment_completed_at: data.fulfillmentCompletedAt || null,

    fulfillment_failed_at: data.fulfillmentFailedAt || null,

    fulfillment_last_error: data.fulfillmentLastError || null,

    fulfillment_lease_token: data.fulfillmentLeaseToken || null,

    fulfillment_lease_expires_at: data.fulfillmentLeaseExpiresAt || null,
    fulfillment_next_retry_at: data.fulfillmentNextRetryAt || null,

    fulfillment_manual_review_at: data.fulfillmentManualReviewAt || null,
    source: data.source || "public",
    manual_assignment_reason: data.manualAssignmentReason || null,

    confirmed_at: data.confirmedAt || null,
    cancelled_at: data.cancelledAt || null,
    cancellation_reason: data.cancellationReason || null,
    expires_at: data.expiresAt || null,

    guest_access_token_hash: data.guestAccessTokenHash || null,
    guest_access_token_expires_at: data.guestAccessTokenExpiresAt || null,
    guest_access_last_used_at: data.guestAccessLastUsedAt || null,
    guest_access_download_count: Number(data.guestAccessDownloadCount || 0),

    created_by_event_user_id: data.createdByEventUserId || null,
    updated_by_event_user_id: data.updatedByEventUserId || null,

    metadata: stringifyJson(data.metadata, null),

    created_at: data.createdAt || timestamp,
    updated_at: data.updatedAt || timestamp,
  };
}

function toOrderUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if (hasOwn(data, "orderNumber")) update.order_number = data.orderNumber;
  if (hasOwn(data, "idempotencyScope")) {
    update.idempotency_scope = data.idempotencyScope || null;
  }

  if (hasOwn(data, "idempotencyKey")) {
    update.idempotency_key = data.idempotencyKey || null;
  }

  if (hasOwn(data, "idempotencyRequestHash")) {
    update.idempotency_request_hash = data.idempotencyRequestHash || null;
  }
  if (hasOwn(data, "idempotencyCompletedAt")) {
    update.idempotency_completed_at = data.idempotencyCompletedAt || null;
  }
  if (hasOwn(data, "fulfillmentStatus")) {
    update.fulfillment_status = data.fulfillmentStatus;
  }

  if (hasOwn(data, "fulfillmentStep")) {
    update.fulfillment_step = data.fulfillmentStep || null;
  }

  if (hasOwn(data, "fulfillmentAttemptCount")) {
    update.fulfillment_attempt_count = Number(
      data.fulfillmentAttemptCount || 0,
    );
  }

  if (hasOwn(data, "fulfillmentStartedAt")) {
    update.fulfillment_started_at = data.fulfillmentStartedAt || null;
  }

  if (hasOwn(data, "fulfillmentCompletedAt")) {
    update.fulfillment_completed_at = data.fulfillmentCompletedAt || null;
  }

  if (hasOwn(data, "fulfillmentFailedAt")) {
    update.fulfillment_failed_at = data.fulfillmentFailedAt || null;
  }

  if (hasOwn(data, "fulfillmentLastError")) {
    update.fulfillment_last_error = data.fulfillmentLastError || null;
  }

  if (hasOwn(data, "fulfillmentLeaseToken")) {
    update.fulfillment_lease_token = data.fulfillmentLeaseToken || null;
  }

  if (hasOwn(data, "fulfillmentLeaseExpiresAt")) {
    update.fulfillment_lease_expires_at =
      data.fulfillmentLeaseExpiresAt || null;
  }
  if (hasOwn(data, "fulfillmentNextRetryAt")) {
    update.fulfillment_next_retry_at = data.fulfillmentNextRetryAt || null;
  }

  if (hasOwn(data, "fulfillmentManualReviewAt")) {
    update.fulfillment_manual_review_at =
      data.fulfillmentManualReviewAt || null;
  }
  if (hasOwn(data, "buyerType")) update.buyer_type = data.buyerType || "guest";
  if (hasOwn(data, "buyerExternalProvider")) {
    update.buyer_external_provider = data.buyerExternalProvider || null;
  }
  if (hasOwn(data, "buyerExternalUserId")) {
    update.buyer_external_user_id = data.buyerExternalUserId || null;
  }
  if (hasOwn(data, "buyerEmailSnapshot")) {
    update.buyer_email_snapshot = cleanEmail(data.buyerEmailSnapshot);
  }
  if (hasOwn(data, "buyerFirstNameSnapshot")) {
    update.buyer_first_name_snapshot = data.buyerFirstNameSnapshot || "";
  }
  if (hasOwn(data, "buyerLastNameSnapshot")) {
    update.buyer_last_name_snapshot = data.buyerLastNameSnapshot || "";
  }
  if (hasOwn(data, "buyerDisplayNameSnapshot")) {
    update.buyer_display_name_snapshot = data.buyerDisplayNameSnapshot || "";
  }
  if (hasOwn(data, "buyerRawExternalSnapshot")) {
    update.buyer_raw_external_snapshot = stringifyJson(
      data.buyerRawExternalSnapshot,
      null,
    );
  }

  if (hasOwn(data, "eventId")) update.event_id = data.eventId;
  if (hasOwn(data, "eventTitleSnapshot")) {
    update.event_title_snapshot = data.eventTitleSnapshot || "";
  }
  if (hasOwn(data, "eventSlugSnapshot")) {
    update.event_slug_snapshot = data.eventSlugSnapshot || null;
  }
  if (hasOwn(data, "eventCategorySnapshot")) {
    update.event_category_snapshot = data.eventCategorySnapshot || null;
  }
  if (hasOwn(data, "eventLocationSnapshot")) {
    update.event_location_snapshot = data.eventLocationSnapshot || "";
  }
  if (hasOwn(data, "eventStartsAtSnapshot")) {
    update.event_starts_at_snapshot = data.eventStartsAtSnapshot || null;
  }
  if (hasOwn(data, "eventTimezoneSnapshot")) {
    update.event_timezone_snapshot =
      data.eventTimezoneSnapshot || "Europe/Vienna";
  }
  if (hasOwn(data, "items")) update.items = stringifyJson(data.items, []);

  if (hasOwn(data, "currency")) update.currency = data.currency || "EUR";
  if (hasOwn(data, "subtotal")) update.subtotal = Number(data.subtotal || 0);
  if (hasOwn(data, "totalPrice")) {
    update.total_price = Number(data.totalPrice || 0);
  }

  if (hasOwn(data, "status")) update.status = data.status;
  if (hasOwn(data, "paymentStatus")) update.payment_status = data.paymentStatus;
  if (hasOwn(data, "paymentProvider")) {
    update.payment_provider = data.paymentProvider || "none";
  }
  if (hasOwn(data, "paymentProviderPaymentId")) {
    update.payment_provider_payment_id = data.paymentProviderPaymentId || null;
  }
  if (hasOwn(data, "paymentCheckoutUrl")) {
    update.payment_checkout_url = data.paymentCheckoutUrl || null;
  }

  if (hasOwn(data, "refundStatus")) {
    update.refund_status = data.refundStatus || ORDER_REFUND_STATUS.NONE;
  }

  if (hasOwn(data, "refundReason")) {
    update.refund_reason = data.refundReason || null;
  }

  if (hasOwn(data, "refundedAmount")) {
    update.refunded_amount = Number(data.refundedAmount || 0);
  }

  if (hasOwn(data, "paymentProviderRefundId")) {
    update.payment_provider_refund_id = data.paymentProviderRefundId || null;
  }

  if (hasOwn(data, "refundedAt")) {
    update.refunded_at = data.refundedAt || null;
  }

  if (hasOwn(data, "refundFailedAt")) {
    update.refund_failed_at = data.refundFailedAt || null;
  }

  if (hasOwn(data, "refundFailureReason")) {
    update.refund_failure_reason = data.refundFailureReason || null;
  }

  if (hasOwn(data, "source")) update.source = data.source || "public";
  if (hasOwn(data, "manualAssignmentReason")) {
    update.manual_assignment_reason = data.manualAssignmentReason || null;
  }

  if (hasOwn(data, "confirmedAt"))
    update.confirmed_at = data.confirmedAt || null;
  if (hasOwn(data, "cancelledAt"))
    update.cancelled_at = data.cancelledAt || null;
  if (hasOwn(data, "cancellationReason")) {
    update.cancellation_reason = data.cancellationReason || null;
  }
  if (hasOwn(data, "expiresAt")) update.expires_at = data.expiresAt || null;

  if (hasOwn(data, "guestAccessTokenHash")) {
    update.guest_access_token_hash = data.guestAccessTokenHash || null;
  }
  if (hasOwn(data, "guestAccessTokenExpiresAt")) {
    update.guest_access_token_expires_at =
      data.guestAccessTokenExpiresAt || null;
  }
  if (hasOwn(data, "guestAccessLastUsedAt")) {
    update.guest_access_last_used_at = data.guestAccessLastUsedAt || null;
  }
  if (hasOwn(data, "guestAccessDownloadCount")) {
    update.guest_access_download_count = Number(
      data.guestAccessDownloadCount || 0,
    );
  }
  if (hasOwn(data, "createdByEventUserId")) {
    update.created_by_event_user_id = data.createdByEventUserId || null;
  }
  if (hasOwn(data, "updatedByEventUserId")) {
    update.updated_by_event_user_id = data.updatedByEventUserId || null;
  }

  if (hasOwn(data, "metadata")) {
    update.metadata = stringifyJson(data.metadata, null);
  }

  return update;
}

function applyOrderSort(query, sortBy = "createdAt", sortOrder = "desc") {
  const allowed = {
    createdAt: "created_at",
    updatedAt: "updated_at",
    confirmedAt: "confirmed_at",
    totalPrice: "total_price",
    status: "status",
    paymentStatus: "payment_status",
  };

  const column = allowed[sortBy] || "created_at";
  const direction = sortOrder === "asc" ? "asc" : "desc";

  return query.orderBy(column, direction);
}

function applySearch(query, search) {
  const cleanSearch = cleanString(search);

  if (!cleanSearch) return query;

  query.andWhere((builder) => {
    builder
      .where("order_number", "like", `%${cleanSearch}%`)
      .orWhere("buyer_email_snapshot", "like", `%${cleanSearch}%`)
      .orWhere("buyer_first_name_snapshot", "like", `%${cleanSearch}%`)
      .orWhere("buyer_last_name_snapshot", "like", `%${cleanSearch}%`)
      .orWhere("buyer_display_name_snapshot", "like", `%${cleanSearch}%`)
      .orWhere("buyer_external_user_id", "like", `%${cleanSearch}%`);
  });

  return query;
}

export async function aggregateOrderStatsByEventIds(eventIds) {
  if (!eventIds?.length) return [];

  const db = getDatabaseConnection();

  const rows = await db("orders")
    .select("event_id")
    .count("* as orders_count")
    .sum({
      revenue: db.raw(
        "CASE WHEN payment_status = ? THEN total_price ELSE 0 END",
        [ORDER_PAYMENT_STATUS.PAID],
      ),
    })
    .sum({
      paid_orders_count: db.raw(
        "CASE WHEN payment_status = ? THEN 1 ELSE 0 END",
        [ORDER_PAYMENT_STATUS.PAID],
      ),
    })
    .whereIn("event_id", eventIds)
    .groupBy("event_id");

  return rows.map((row) => ({
    eventId: String(row.event_id),
    ordersCount: Number(row.orders_count || 0),
    paidOrdersCount: Number(row.paid_orders_count || 0),
    revenue: Number(row.revenue || 0),
  }));
}

export async function createOrder(data, options = {}) {
  const db = getDb(options);
  const insert = toOrderInsert(data);

  await db("orders").insert(insert);

  const row = await db("orders")
    .where({
      id: insert.id,
    })
    .first();

  return mapOrderRow(row, options);
}

export async function findOrderById(id, options = {}) {
  const db = getDb(options);
  const row = await db("orders").where({ id }).first();
  return mapOrderRow(row, options);
}
export async function findGuestOrderForRecovery(
  { orderNumber, email, hostServiceProvider, hostServiceId },
  options = {},
) {
  const db = getDb(options);

  const row = await db("orders")
    .where({
      order_number: cleanString(orderNumber),
      buyer_type: ORDER_BUYER_TYPE.GUEST,
      buyer_email_snapshot: cleanEmail(email),
      host_service_provider: cleanString(hostServiceProvider),
      host_service_id: cleanString(hostServiceId),
    })
    .first();

  return mapOrderRow(row, options);
}
export async function findOrderByIdempotency({ scope, key }, options = {}) {
  const db = getDb(options);

  const row = await db("orders")
    .where({
      idempotency_scope: scope,
      idempotency_key: key,
    })
    .first();

  if (!row) {
    return null;
  }

  const internalOrder = mapOrderRow(row, {
    ...options,
    includeSecrets: true,
  });

  return {
    order: stripOrderSecrets(internalOrder),
    requestHash: internalOrder.idempotencyRequestHash,
    completedAt: internalOrder.idempotencyCompletedAt,
  };
}
export async function findOrdersByEventId(eventId, options = {}) {
  const db = getDb(options);

  const rows = await db("orders")
    .where({ event_id: eventId })
    .orderBy("created_at", "desc");

  return rows.map((row) => mapOrderRow(row, options));
}

export async function findOrderByIdAndExternalBuyer(
  { orderId, externalProvider, externalUserId },
  options = {},
) {
  const db = getDb(options);

  const row = await db("orders")
    .where({
      id: orderId,
      buyer_external_provider: cleanString(externalProvider),
      buyer_external_user_id: cleanString(externalUserId),
    })
    .first();

  return mapOrderRow(row, options);
}

export async function listOrdersByExternalBuyer(
  {
    externalProvider,
    externalUserId,
    page = 1,
    limit = 20,
    status,
    paymentStatus,
  },
  options = {},
) {
  const db = getDb(options);

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);

  const baseQuery = db("orders").where({
    buyer_external_provider: cleanString(externalProvider),
    buyer_external_user_id: cleanString(externalUserId),
  });

  if (status) baseQuery.andWhere("status", status);
  if (paymentStatus) baseQuery.andWhere("payment_status", paymentStatus);

  const countQuery = baseQuery.clone().count("* as total").first();

  const rows = await baseQuery
    .clone()
    .orderBy("created_at", "desc")
    .offset((numericPage - 1) * numericLimit)
    .limit(numericLimit);

  const countRow = await countQuery;

  return {
    items: rows.map((row) => mapOrderRow(row, options)),
    total: Number(countRow?.total || 0),
    page: numericPage,
    limit: numericLimit,
  };
}

export async function listOrdersByEventInternal(
  {
    eventId,
    page = 1,
    limit = 20,
    status,
    paymentStatus,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  },
  options = {},
) {
  const db = getDb(options);

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);

  const baseQuery = db("orders").where({ event_id: eventId });

  if (status) baseQuery.andWhere("status", status);
  if (paymentStatus) baseQuery.andWhere("payment_status", paymentStatus);

  applySearch(baseQuery, search);

  const countRow = await baseQuery.clone().count("* as total").first();

  const rows = await applyOrderSort(baseQuery.clone(), sortBy, sortOrder)
    .offset((numericPage - 1) * numericLimit)
    .limit(numericLimit);

  return {
    items: rows.map((row) => mapOrderRow(row, options)),
    total: Number(countRow?.total || 0),
    page: numericPage,
    limit: numericLimit,
  };
}

export async function updateOrderById(id, data, options = {}) {
  const db = getDb(options);

  await db("orders").where({ id }).update(toOrderUpdate(data));

  const row = await db("orders").where({ id }).first();
  return mapOrderRow(row, options);
}
export async function updateOrderRefundStateIfNotCompleted(
  id,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({ id })
    .where((query) => {
      query
        .whereNull("refund_status")
        .orWhereNot("refund_status", ORDER_REFUND_STATUS.COMPLETED);
    })
    .update(toOrderUpdate(data));

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}

export async function cancelOrderById(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      status: ORDER_STATUS.CANCELLED,
      cancelledAt: data.cancelledAt || new Date(),
    },
    options,
  );
}
export async function cancelPendingOrderIfUnpaid(id, data = {}, options = {}) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id,

      status: ORDER_STATUS.PENDING,

      payment_status: ORDER_PAYMENT_STATUS.PENDING,

      refund_status: ORDER_REFUND_STATUS.NONE,
    })
    .update(
      toOrderUpdate({
        ...data,

        status: ORDER_STATUS.CANCELLED,

        paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

        cancelledAt: data.cancelledAt || new Date(),

        cancellationReason: data.cancellationReason || "Cancelled by buyer",
      }),
    );

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}

export async function cancelConfirmedFreeCustomerOrder(
  id,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id,

      status: ORDER_STATUS.CONFIRMED,

      payment_status: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      refund_status: ORDER_REFUND_STATUS.NONE,
    })
    .update(
      toOrderUpdate({
        ...data,

        status: ORDER_STATUS.CANCELLED,

        cancelledAt: data.cancelledAt || new Date(),

        cancellationReason: data.cancellationReason || "Cancelled by buyer",
      }),
    );

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}
export async function cancelOrderByIdIfNotCancelled(
  id,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({ id })
    .whereNot("status", ORDER_STATUS.CANCELLED)
    .update(
      toOrderUpdate({
        ...data,
        status: ORDER_STATUS.CANCELLED,
        cancelledAt: data.cancelledAt || new Date(),
      }),
    );

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}
export async function markOrderPaymentPending(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    },
    options,
  );
}

export async function markPendingOrderPaymentPaid(id, data = {}, options = {}) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id,
      status: ORDER_STATUS.PENDING,
      payment_status: ORDER_PAYMENT_STATUS.PENDING,
    })
    .update({
      payment_status: ORDER_PAYMENT_STATUS.PAID,
      status: data.status || ORDER_STATUS.CONFIRMED,
      payment_provider_payment_id: data.paymentProviderPaymentId || null,
      confirmed_at: data.confirmedAt || new Date(),
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}
export async function markOrderPaymentFailed(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      status: data.status || ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      cancelledAt: data.cancelledAt || new Date(),
      cancellationReason: data.cancellationReason || "Payment failed",
    },
    options,
  );
}
export async function markPendingOrderPaymentFailed(
  id,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id,
      status: ORDER_STATUS.PENDING,
      payment_status: ORDER_PAYMENT_STATUS.PENDING,
    })
    .update({
      status: data.status || ORDER_STATUS.CANCELLED,
      payment_status: ORDER_PAYMENT_STATUS.FAILED,
      payment_provider_payment_id: data.paymentProviderPaymentId || null,
      cancelled_at: data.cancelledAt || new Date(),
      cancellation_reason: data.cancellationReason || "Payment failed",
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}
export async function markOrderPaymentRefunded(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
    },
    options,
  );
}
export async function markOrderRefundCompletedIfNotCompleted(
  id,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({ id })
    .whereIn("payment_status", [
      ORDER_PAYMENT_STATUS.PAID,
      ORDER_PAYMENT_STATUS.REFUNDED,
    ])
    .whereNot("refund_status", ORDER_REFUND_STATUS.COMPLETED)
    .update(
      toOrderUpdate({
        ...data,

        paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

        refundStatus: ORDER_REFUND_STATUS.COMPLETED,

        refundedAt: data.refundedAt || new Date(),

        refundFailedAt: null,
        refundFailureReason: null,
      }),
    );

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}
export async function markTerminatedOrderLatePaymentRefunded(
  id,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({ id })
    .whereIn("status", [ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED])
    .whereIn("payment_status", [
      ORDER_PAYMENT_STATUS.FAILED,
      ORDER_PAYMENT_STATUS.EXPIRED,
      ORDER_PAYMENT_STATUS.REFUNDED,
    ])
    .whereNot("refund_status", ORDER_REFUND_STATUS.COMPLETED)
    .update(
      toOrderUpdate({
        ...data,

        paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

        refundStatus: ORDER_REFUND_STATUS.COMPLETED,

        refundedAt: data.refundedAt || new Date(),

        refundFailedAt: null,
        refundFailureReason: null,
      }),
    );

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id }).first();

  return mapOrderRow(row, options);
}
export async function markExpiredOrders(options = {}) {
  const db = getDb(options);

  return db("orders")
    .where("status", ORDER_STATUS.PENDING)
    .where("expires_at", "<=", new Date())
    .update({
      status: ORDER_STATUS.EXPIRED,
      payment_status: ORDER_PAYMENT_STATUS.EXPIRED,
      updated_by_event_user_id: options.updatedByEventUserId || null,
      updated_at: now(),
    });
}
export async function findPendingExpiredOrders(
  { now: expiresBefore = new Date(), limit = 100 } = {},
  options = {},
) {
  const db = getDb(options);
  const numericLimit = Math.max(1, Number(limit) || 100);

  const rows = await db("orders")
    .where("status", ORDER_STATUS.PENDING)
    .where("payment_status", ORDER_PAYMENT_STATUS.PENDING)
    .where("expires_at", "<=", expiresBefore)
    .orderBy("expires_at", "asc")
    .orderBy("created_at", "asc")
    .limit(numericLimit);

  return rows.map((row) => mapOrderRow(row, options));
}
export async function findFulfillmentRecoveryCandidates(
  { now: recoverableAt = new Date(), limit = 100 } = {},
  options = {},
) {
  const db = getDb(options);

  const numericLimit = Math.max(1, Math.min(500, Number(limit) || 100));

  const rows = await db("orders")
    .where("status", ORDER_STATUS.CONFIRMED)
    .whereIn("payment_status", [
      ORDER_PAYMENT_STATUS.PAID,
      ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    ])
    .andWhere(function recoverableFulfillment() {
      this.where("fulfillment_status", ORDER_FULFILLMENT_STATUS.NOT_STARTED)
        .orWhere(function retryableFailure() {
          this.where(
            "fulfillment_status",
            ORDER_FULFILLMENT_STATUS.FAILED,
          ).andWhere("fulfillment_next_retry_at", "<=", recoverableAt);
        })
        .orWhere(function staleProcessing() {
          this.where(
            "fulfillment_status",
            ORDER_FULFILLMENT_STATUS.PROCESSING,
          ).andWhere("fulfillment_lease_expires_at", "<=", recoverableAt);
        });
    })
    .orderBy("updated_at", "asc")
    .orderBy("created_at", "asc")
    .limit(numericLimit);

  return rows.map((row) => mapOrderRow(row, options));
}
export async function expireOrder(
  { orderId, reason = "Order expired", actor = {} },
  options = {},
) {
  const db = getDb(options);

  await db("orders")
    .where({
      id: orderId,
      status: ORDER_STATUS.PENDING,
      payment_status: ORDER_PAYMENT_STATUS.PENDING,
    })
    .where("expires_at", "<=", new Date())
    .update({
      status: ORDER_STATUS.EXPIRED,
      payment_status: ORDER_PAYMENT_STATUS.EXPIRED,
      cancellation_reason: reason,
      updated_by_event_user_id: actor.eventUserId || null,
      updated_at: now(),
    });

  const row = await db("orders").where({ id: orderId }).first();

  return mapOrderRow(row, options);
}
export async function findOrdersByIdsAndEventId(
  { orderIds = [], eventId },
  options = {},
) {
  const db = getDb(options);
  const ids = orderIds.filter(Boolean);

  if (ids.length === 0) {
    return [];
  }

  const rows = await db("orders")
    .whereIn("id", ids)
    .andWhere("event_id", eventId);

  return rows.map((row) => mapOrderRow(row, options));
}
export async function rotateGuestAccessTokenForOrder(
  { orderId, hostServiceProvider, hostServiceId, tokenHash, expiresAt },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id: orderId,
      buyer_type: ORDER_BUYER_TYPE.GUEST,
      host_service_provider: cleanString(hostServiceProvider),
      host_service_id: cleanString(hostServiceId),
    })
    .update({
      guest_access_token_hash: tokenHash,
      guest_access_token_expires_at: expiresAt,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders")
    .where({
      id: orderId,
    })
    .first();

  return mapOrderRow(row, options);
}

export async function findOrderByIdWithGuestAccess(orderId, options = {}) {
  return findOrderById(orderId, {
    ...options,
    includeSecrets: true,
  });
}

export async function markGuestAccessUsed(orderId, options = {}) {
  const db = getDb(options);

  await db("orders")
    .where({
      id: orderId,
    })
    .increment("guest_access_download_count", 1)
    .update({
      guest_access_last_used_at: new Date(),
      updated_at: now(),
    });

  const row = await db("orders")
    .where({
      id: orderId,
    })
    .first();

  return mapOrderRow(row, options);
}
export async function claimOrderFulfillment(
  { orderId, leaseToken, now: claimedAt = new Date(), leaseExpiresAt },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id: orderId,
      status: ORDER_STATUS.CONFIRMED,
    })
    .whereIn("payment_status", [
      ORDER_PAYMENT_STATUS.PAID,
      ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    ])
    .andWhere(function eligibleFulfillment() {
      this.where("fulfillment_status", ORDER_FULFILLMENT_STATUS.NOT_STARTED)
        .orWhere(function retryableFailure() {
          this.where(
            "fulfillment_status",
            ORDER_FULFILLMENT_STATUS.FAILED,
          ).andWhere("fulfillment_next_retry_at", "<=", claimedAt);
        })
        .orWhere(function staleLease() {
          this.where(
            "fulfillment_status",
            ORDER_FULFILLMENT_STATUS.PROCESSING,
          ).andWhere("fulfillment_lease_expires_at", "<=", claimedAt);
        });
    })
    .update({
      fulfillment_status: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillment_step: ORDER_FULFILLMENT_STEP.TICKETS,
      fulfillment_started_at: claimedAt,
      fulfillment_completed_at: null,
      fulfillment_failed_at: null,
      fulfillment_last_error: null,
      fulfillment_lease_token: leaseToken,
      fulfillment_lease_expires_at: leaseExpiresAt,
      fulfillment_next_retry_at: null,
      fulfillment_manual_review_at: null,
      fulfillment_attempt_count: db.raw("fulfillment_attempt_count + 1"),
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id: orderId }).first();

  return mapOrderRow(row, {
    ...options,
    includeSecrets: true,
  });
}

export async function advanceOrderFulfillment(
  { orderId, leaseToken, step, leaseExpiresAt },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id: orderId,
      fulfillment_status: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillment_lease_token: leaseToken,
    })
    .update({
      fulfillment_step: step,
      fulfillment_lease_expires_at: leaseExpiresAt,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id: orderId }).first();

  return mapOrderRow(row, {
    ...options,
    includeSecrets: true,
  });
}

export async function completeOrderFulfillment(
  { orderId, leaseToken, completedAt = new Date() },
  options = {},
) {
  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id: orderId,
      fulfillment_status: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillment_lease_token: leaseToken,
    })
    .update({
      fulfillment_status: ORDER_FULFILLMENT_STATUS.COMPLETED,
      fulfillment_step: ORDER_FULFILLMENT_STEP.COMPLETED,
      fulfillment_completed_at: completedAt,
      fulfillment_failed_at: null,
      fulfillment_last_error: null,
      fulfillment_lease_token: null,
      fulfillment_lease_expires_at: null,
      fulfillment_next_retry_at: null,
      fulfillment_manual_review_at: null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders").where({ id: orderId }).first();

  return mapOrderRow(row, options);
}

export async function recordOrderFulfillmentFailure(
  {
    orderId,
    leaseToken,
    step,
    error,
    status,
    failedAt = new Date(),
    nextRetryAt = null,
    manualReviewAt = null,
  },
  options = {},
) {
  if (
    status !== ORDER_FULFILLMENT_STATUS.FAILED &&
    status !== ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW
  ) {
    throw new TypeError(
      "Fulfillment failure status must be failed or manual_review.",
    );
  }

  const db = getDb(options);

  const updatedRows = await db("orders")
    .where({
      id: orderId,
      fulfillment_status: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillment_lease_token: leaseToken,
    })
    .update({
      fulfillment_status: status,
      fulfillment_step: step,

      fulfillment_failed_at: failedAt,
      fulfillment_last_error: String(error || "").slice(0, 4000),

      fulfillment_lease_token: null,
      fulfillment_lease_expires_at: null,

      fulfillment_next_retry_at: nextRetryAt,
      fulfillment_manual_review_at: manualReviewAt,

      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("orders")
    .where({
      id: orderId,
    })
    .first();

  return mapOrderRow(row, options);
}
