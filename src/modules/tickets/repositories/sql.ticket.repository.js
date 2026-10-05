// src/modules/tickets/repositories/sql.ticket.repository.js

import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";
import { TICKET_STATUS } from "../ticket.constants.js";

function now() {
  return new Date();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
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

function stringifyJson(value, fallback = null) {
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

function stripTicketSecrets(ticket, options = {}) {
  if (!ticket || options.includeSecrets) {
    return ticket;
  }

  const { checkInTokenHash, encryptedCheckInToken, ...safeTicket } = ticket;

  return safeTicket;
}

function mapTicketRow(row, options = {}) {
  if (!row) return null;

  const ticket = {
    id: row.id,

    ticketCode: row.ticket_code,

    orderId: row.order_id,

    orderItemIndex: Number(row.order_item_index),
    orderItemUnitIndex: Number(row.order_item_unit_index),

    eventId: row.event_id,
    ticketTypeId: row.ticket_type_id,

    buyerType: row.buyer_type || "guest",
    buyerExternalProvider: row.buyer_external_provider || null,
    buyerExternalUserId: row.buyer_external_user_id || null,
    buyerEmailSnapshot: row.buyer_email_snapshot || "",
    buyerFirstNameSnapshot: row.buyer_first_name_snapshot || "",
    buyerLastNameSnapshot: row.buyer_last_name_snapshot || "",
    buyerDisplayNameSnapshot: row.buyer_display_name_snapshot || "",

    holderType: row.holder_type || "buyer",
    holderExternalProvider: row.holder_external_provider || null,
    holderExternalUserId: row.holder_external_user_id || null,
    holderEmailSnapshot: row.holder_email_snapshot || "",
    holderFirstNameSnapshot: row.holder_first_name_snapshot || "",
    holderLastNameSnapshot: row.holder_last_name_snapshot || "",
    holderDisplayNameSnapshot: row.holder_display_name_snapshot || "",

    eventTitleSnapshot: row.event_title_snapshot || "",
    eventSlugSnapshot: row.event_slug_snapshot || null,
    eventCategorySnapshot: row.event_category_snapshot || null,
    eventStartsAtSnapshot: row.event_starts_at_snapshot || null,

    ticketTypeNameSnapshot: row.ticket_type_name_snapshot || "",
    ticketTypeDescriptionSnapshot: row.ticket_type_description_snapshot || "",
    ticketKind: row.ticket_kind || "normal",

    unitPrice: Number(row.unit_price || 0),
    currency: row.currency || "EUR",

    status: row.status,

    checkedInAt: row.checked_in_at || null,
    checkedInByEventUserId: row.checked_in_by_event_user_id || null,

    cancelledAt: row.cancelled_at || null,
    cancellationReason: row.cancellation_reason || null,

    checkInTokenHash: row.check_in_token_hash || null,
    encryptedCheckInToken: row.encrypted_check_in_token || null,
    checkInPayloadVersion: Number(row.check_in_payload_version || 1),
    checkInTokenCreatedAt: row.check_in_token_created_at || null,
    checkInTokenRotatedAt: row.check_in_token_rotated_at || null,
    checkInTokenLastUsedAt: row.check_in_token_last_used_at || null,

    ticketPdfStorageKey: row.ticket_pdf_storage_key || null,

    ticketPdfStorageTarget: row.ticket_pdf_storage_target || null,

    ticketPdfGeneratedAt: row.ticket_pdf_generated_at || null,

    depositRefundStatus: row.deposit_refund_status || "not_required",
    depositRefundAmount: Number(row.deposit_refund_amount || 0),
    depositRefundCurrency: row.deposit_refund_currency || "EUR",
    depositRefundProviderRefundId:
      row.deposit_refund_provider_refund_id || null,
    depositRefundTriggeredAt: row.deposit_refund_triggered_at || null,
    depositRefundTriggeredByEventUserId:
      row.deposit_refund_triggered_by_event_user_id || null,
    depositRefundFailureReason: row.deposit_refund_failure_reason || null,

    metadata: parseJsonObject(row.metadata),

    createdByEventUserId: row.created_by_event_user_id || null,
    updatedByEventUserId: row.updated_by_event_user_id || null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return stripTicketSecrets(ticket, options);
}

function toTicketInsert(data) {
  const timestamp = now();

  return {
    id: data.id || randomUUID(),
    ticket_code: data.ticketCode,

    order_id: data.orderId,

    order_item_index: data.orderItemIndex,
    order_item_unit_index: data.orderItemUnitIndex,

    event_id: data.eventId,
    ticket_type_id: data.ticketTypeId,

    buyer_type: data.buyerType || "guest",
    buyer_external_provider: data.buyerExternalProvider || null,
    buyer_external_user_id: data.buyerExternalUserId || null,
    buyer_email_snapshot: cleanEmail(data.buyerEmailSnapshot),
    buyer_first_name_snapshot: data.buyerFirstNameSnapshot || "",
    buyer_last_name_snapshot: data.buyerLastNameSnapshot || "",
    buyer_display_name_snapshot: data.buyerDisplayNameSnapshot || "",

    holder_type: data.holderType || "buyer",
    holder_external_provider: data.holderExternalProvider || null,
    holder_external_user_id: data.holderExternalUserId || null,
    holder_email_snapshot: cleanEmail(data.holderEmailSnapshot),
    holder_first_name_snapshot: data.holderFirstNameSnapshot || "",
    holder_last_name_snapshot: data.holderLastNameSnapshot || "",
    holder_display_name_snapshot: data.holderDisplayNameSnapshot || "",

    event_title_snapshot: data.eventTitleSnapshot || "",
    event_slug_snapshot: data.eventSlugSnapshot || null,
    event_category_snapshot: data.eventCategorySnapshot || null,
    event_starts_at_snapshot: data.eventStartsAtSnapshot || null,

    ticket_type_name_snapshot: data.ticketTypeNameSnapshot || "",
    ticket_type_description_snapshot: data.ticketTypeDescriptionSnapshot || "",
    ticket_kind: data.ticketKind || "normal",

    unit_price: Number(data.unitPrice || 0),
    currency: data.currency || "EUR",

    status: data.status || TICKET_STATUS.ACTIVE,

    checked_in_at: data.checkedInAt || null,
    checked_in_by_event_user_id: data.checkedInByEventUserId || null,

    cancelled_at: data.cancelledAt || null,
    cancellation_reason: data.cancellationReason || null,

    check_in_token_hash: data.checkInTokenHash || null,
    encrypted_check_in_token: data.encryptedCheckInToken || null,
    check_in_payload_version: data.checkInPayloadVersion || 1,
    check_in_token_created_at: data.checkInTokenCreatedAt || null,
    check_in_token_rotated_at: data.checkInTokenRotatedAt || null,
    check_in_token_last_used_at: data.checkInTokenLastUsedAt || null,

    ticket_pdf_storage_key: data.ticketPdfStorageKey || null,

    ticket_pdf_storage_target: data.ticketPdfStorageTarget || null,

    ticket_pdf_generated_at: data.ticketPdfGeneratedAt || null,

    deposit_refund_status: data.depositRefundStatus || "not_required",
    deposit_refund_amount: Number(data.depositRefundAmount || 0),
    deposit_refund_currency: data.depositRefundCurrency || "EUR",
    deposit_refund_provider_refund_id:
      data.depositRefundProviderRefundId || null,
    deposit_refund_triggered_at: data.depositRefundTriggeredAt || null,
    deposit_refund_triggered_by_event_user_id:
      data.depositRefundTriggeredByEventUserId || null,
    deposit_refund_failure_reason: data.depositRefundFailureReason || null,

    metadata: stringifyJson(data.metadata, null),

    created_by_event_user_id: data.createdByEventUserId || null,
    updated_by_event_user_id: data.updatedByEventUserId || null,

    created_at: data.createdAt || timestamp,
    updated_at: data.updatedAt || timestamp,
  };
}

function toTicketUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if (hasOwn(data, "ticketCode")) update.ticket_code = data.ticketCode;

  if (hasOwn(data, "orderId")) update.order_id = data.orderId;
  if (hasOwn(data, "eventId")) update.event_id = data.eventId;
  if (hasOwn(data, "ticketTypeId")) update.ticket_type_id = data.ticketTypeId;

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

  if (hasOwn(data, "holderType"))
    update.holder_type = data.holderType || "buyer";
  if (hasOwn(data, "holderExternalProvider")) {
    update.holder_external_provider = data.holderExternalProvider || null;
  }
  if (hasOwn(data, "holderExternalUserId")) {
    update.holder_external_user_id = data.holderExternalUserId || null;
  }
  if (hasOwn(data, "holderEmailSnapshot")) {
    update.holder_email_snapshot = cleanEmail(data.holderEmailSnapshot);
  }
  if (hasOwn(data, "holderFirstNameSnapshot")) {
    update.holder_first_name_snapshot = data.holderFirstNameSnapshot || "";
  }
  if (hasOwn(data, "holderLastNameSnapshot")) {
    update.holder_last_name_snapshot = data.holderLastNameSnapshot || "";
  }
  if (hasOwn(data, "holderDisplayNameSnapshot")) {
    update.holder_display_name_snapshot = data.holderDisplayNameSnapshot || "";
  }

  if (hasOwn(data, "eventTitleSnapshot")) {
    update.event_title_snapshot = data.eventTitleSnapshot || "";
  }
  if (hasOwn(data, "eventSlugSnapshot")) {
    update.event_slug_snapshot = data.eventSlugSnapshot || null;
  }
  if (hasOwn(data, "eventCategorySnapshot")) {
    update.event_category_snapshot = data.eventCategorySnapshot || null;
  }
  if (hasOwn(data, "eventStartsAtSnapshot")) {
    update.event_starts_at_snapshot = data.eventStartsAtSnapshot || null;
  }

  if (hasOwn(data, "ticketTypeNameSnapshot")) {
    update.ticket_type_name_snapshot = data.ticketTypeNameSnapshot || "";
  }
  if (hasOwn(data, "ticketTypeDescriptionSnapshot")) {
    update.ticket_type_description_snapshot =
      data.ticketTypeDescriptionSnapshot || "";
  }
  if (hasOwn(data, "ticketKind"))
    update.ticket_kind = data.ticketKind || "normal";

  if (hasOwn(data, "unitPrice"))
    update.unit_price = Number(data.unitPrice || 0);
  if (hasOwn(data, "currency")) update.currency = data.currency || "EUR";

  if (hasOwn(data, "status")) update.status = data.status;

  if (hasOwn(data, "checkedInAt")) {
    update.checked_in_at = data.checkedInAt || null;
  }
  if (hasOwn(data, "checkedInByEventUserId")) {
    update.checked_in_by_event_user_id = data.checkedInByEventUserId || null;
  }

  if (hasOwn(data, "cancelledAt"))
    update.cancelled_at = data.cancelledAt || null;
  if (hasOwn(data, "cancellationReason")) {
    update.cancellation_reason = data.cancellationReason || null;
  }

  if (hasOwn(data, "checkInTokenHash")) {
    update.check_in_token_hash = data.checkInTokenHash || null;
  }
  if (hasOwn(data, "encryptedCheckInToken")) {
    update.encrypted_check_in_token = data.encryptedCheckInToken || null;
  }
  if (hasOwn(data, "checkInPayloadVersion")) {
    update.check_in_payload_version = data.checkInPayloadVersion || 1;
  }
  if (hasOwn(data, "checkInTokenCreatedAt")) {
    update.check_in_token_created_at = data.checkInTokenCreatedAt || null;
  }
  if (hasOwn(data, "checkInTokenRotatedAt")) {
    update.check_in_token_rotated_at = data.checkInTokenRotatedAt || null;
  }
  if (hasOwn(data, "checkInTokenLastUsedAt")) {
    update.check_in_token_last_used_at = data.checkInTokenLastUsedAt || null;
  }

  if (hasOwn(data, "ticketPdfStorageKey")) {
    update.ticket_pdf_storage_key = data.ticketPdfStorageKey || null;
  }
  if (hasOwn(data, "ticketPdfStorageTarget")) {
    update.ticket_pdf_storage_target = data.ticketPdfStorageTarget || null;
  }
  if (hasOwn(data, "ticketPdfGeneratedAt")) {
    update.ticket_pdf_generated_at = data.ticketPdfGeneratedAt || null;
  }

  if (hasOwn(data, "depositRefundStatus")) {
    update.deposit_refund_status = data.depositRefundStatus || "not_required";
  }
  if (hasOwn(data, "depositRefundAmount")) {
    update.deposit_refund_amount = Number(data.depositRefundAmount || 0);
  }
  if (hasOwn(data, "depositRefundCurrency")) {
    update.deposit_refund_currency = data.depositRefundCurrency || "EUR";
  }
  if (hasOwn(data, "depositRefundProviderRefundId")) {
    update.deposit_refund_provider_refund_id =
      data.depositRefundProviderRefundId || null;
  }
  if (hasOwn(data, "depositRefundTriggeredAt")) {
    update.deposit_refund_triggered_at = data.depositRefundTriggeredAt || null;
  }
  if (hasOwn(data, "depositRefundTriggeredByEventUserId")) {
    update.deposit_refund_triggered_by_event_user_id =
      data.depositRefundTriggeredByEventUserId || null;
  }
  if (hasOwn(data, "depositRefundFailureReason")) {
    update.deposit_refund_failure_reason =
      data.depositRefundFailureReason || null;
  }

  if (hasOwn(data, "metadata")) {
    update.metadata = stringifyJson(data.metadata, null);
  }

  if (hasOwn(data, "createdByEventUserId")) {
    update.created_by_event_user_id = data.createdByEventUserId || null;
  }
  if (hasOwn(data, "updatedByEventUserId")) {
    update.updated_by_event_user_id = data.updatedByEventUserId || null;
  }

  return update;
}

function applyTicketFilters(query, input = {}) {
  if (input.eventId) query.andWhere("event_id", input.eventId);
  if (input.orderId) query.andWhere("order_id", input.orderId);
  if (input.ticketTypeId) query.andWhere("ticket_type_id", input.ticketTypeId);
  if (input.status) query.andWhere("status", input.status);

  if (input.externalProvider && input.externalUserId) {
    query.andWhere(
      "buyer_external_provider",
      cleanString(input.externalProvider),
    );
    query.andWhere("buyer_external_user_id", cleanString(input.externalUserId));
  }

  return query;
}
function applyTicketSearch(query, search) {
  const cleanSearch = String(search || "")
    .trim()
    .toLowerCase();

  if (!cleanSearch) {
    return query;
  }

  const like = `%${cleanSearch}%`;

  query.andWhere((builder) => {
    builder
      .whereRaw("LOWER(ticket_code) LIKE ?", [like])
      .orWhereRaw("LOWER(buyer_email_snapshot) LIKE ?", [like])
      .orWhereRaw("LOWER(buyer_first_name_snapshot) LIKE ?", [like])
      .orWhereRaw("LOWER(buyer_last_name_snapshot) LIKE ?", [like])
      .orWhereRaw("LOWER(buyer_display_name_snapshot) LIKE ?", [like])
      .orWhereRaw("LOWER(buyer_external_user_id) LIKE ?", [like]);
  });

  return query;
}

function getTicketSortColumn(sortBy = "createdAt") {
  const columns = {
    createdAt: "created_at",
    checkedInAt: "checked_in_at",
    ticketCode: "ticket_code",
    buyerEmailSnapshot: "buyer_email_snapshot",
    status: "status",
  };

  return columns[sortBy] || columns.createdAt;
}

function mapTicketSummaryRows({ rows = [], total = 0 }) {
  return rows.reduce(
    (summary, row) => {
      const status = row?.status;
      const count = Number(row?.count || 0);

      if (status === TICKET_STATUS.ACTIVE) {
        summary.active = count;
      }

      if (status === TICKET_STATUS.CHECKED_IN) {
        summary.checkedIn = count;
      }

      if (status === TICKET_STATUS.CANCELLED) {
        summary.cancelled = count;
      }

      if (status === TICKET_STATUS.REFUNDED) {
        summary.refunded = count;
      }

      return summary;
    },
    {
      total,
      active: 0,
      checkedIn: 0,
      cancelled: 0,
      refunded: 0,
    },
  );
}

export async function ensureTicketForOrderSlot(data, options = {}) {
  const db = getDb(options);
  const insert = toTicketInsert(data);

  await db("tickets")
    .insert(insert)
    .onConflict(["order_id", "order_item_index", "order_item_unit_index"])
    .ignore();

  const row = await db("tickets")
    .where({
      order_id: data.orderId,
      order_item_index: data.orderItemIndex,
      order_item_unit_index: data.orderItemUnitIndex,
    })
    .first();

  if (!row) {
    throw new Error(
      `Ticket slot could not be ensured for order ${data.orderId}.`,
    );
  }

  return mapTicketRow(row, options);
}

export async function findTicketById(id, options = {}) {
  const db = getDb(options);
  const row = await db("tickets").where({ id }).first();
  return mapTicketRow(row, options);
}

export async function findTicketByCode(ticketCode, options = {}) {
  const db = getDb(options);

  const row = await db("tickets")
    .where({ ticket_code: cleanString(ticketCode) })
    .first();

  return mapTicketRow(row, options);
}

export async function findTicketByCheckInTokenHash(
  checkInTokenHash,
  options = {},
) {
  const db = getDb(options);

  const row = await db("tickets")
    .where({
      check_in_token_hash: cleanString(checkInTokenHash),
    })
    .first();

  return mapTicketRow(row, options);
}

export async function findTicketsByOrderId(orderId, options = {}) {
  const db = getDb(options);

  const rows = await db("tickets")
    .where({ order_id: orderId })
    .orderBy("created_at", "asc");

  return rows.map((row) => mapTicketRow(row, options));
}

export async function findTicketsByOrderIdAndBuyerIdentity(
  { orderId, buyerType, externalProvider, externalUserId },
  options = {},
) {
  const db = getDb(options);

  const rows = await db("tickets")
    .where({
      order_id: orderId,

      buyer_type: buyerType,

      buyer_external_provider: cleanString(externalProvider) || null,

      buyer_external_user_id: cleanString(externalUserId) || null,
    })
    .orderBy("created_at", "asc");

  return rows.map((row) => mapTicketRow(row, options));
}

export async function findTicketByIdAndExternalBuyer(
  { ticketId, externalProvider, externalUserId },
  options = {},
) {
  const db = getDb(options);

  const row = await db("tickets")
    .where({
      id: ticketId,
      buyer_external_provider: cleanString(externalProvider),
      buyer_external_user_id: cleanString(externalUserId),
    })
    .first();

  return mapTicketRow(row, options);
}

export async function listTicketsByExternalBuyer(
  {
    externalProvider,
    externalUserId,
    page = 1,
    limit = 20,
    status,
    eventId,
    orderId,
  },
  options = {},
) {
  const db = getDb(options);

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);

  const baseQuery = db("tickets").where({
    buyer_external_provider: cleanString(externalProvider),
    buyer_external_user_id: cleanString(externalUserId),
  });

  if (status) baseQuery.andWhere("status", status);
  if (eventId) baseQuery.andWhere("event_id", eventId);
  if (orderId) baseQuery.andWhere("order_id", orderId);

  const countRow = await baseQuery.clone().count("* as total").first();

  const rows = await baseQuery
    .clone()
    .orderBy("created_at", "desc")
    .offset((numericPage - 1) * numericLimit)
    .limit(numericLimit);

  return {
    items: rows.map((row) => mapTicketRow(row, options)),
    total: Number(countRow?.total || 0),
    page: numericPage,
    limit: numericLimit,
  };
}

export async function listTickets(input = {}, options = {}) {
  const db = getDb(options);

  const query = applyTicketFilters(db("tickets"), input).orderBy(
    "created_at",
    "desc",
  );

  const rows = await query;

  return rows.map((row) => mapTicketRow(row, options));
}
export async function listTicketsPaginated(input = {}, options = {}) {
  const db = getDb(options);

  const numericPage = Math.max(1, Number(input.page) || 1);
  const numericLimit = Math.min(100, Math.max(1, Number(input.limit) || 20));

  const sortColumn = getTicketSortColumn(input.sortBy);
  const sortDirection = input.sortOrder === "asc" ? "asc" : "desc";

  const baseQuery = applyTicketSearch(
    applyTicketFilters(db("tickets"), input),
    input.search,
  );

  const countRow = await baseQuery.clone().count("* as total").first();
  const total = Number(countRow?.total || 0);

  const summaryRows = await baseQuery
    .clone()
    .select("status")
    .count("* as count")
    .groupBy("status");

  const rows = await baseQuery
    .clone()
    .orderBy(sortColumn, sortDirection)
    .orderBy("id", sortDirection)
    .offset((numericPage - 1) * numericLimit)
    .limit(numericLimit);

  return {
    items: rows.map((row) => mapTicketRow(row, options)),
    total,
    page: numericPage,
    limit: numericLimit,
    summary: mapTicketSummaryRows({
      rows: summaryRows,
      total,
    }),
  };
}
export async function countTicketsByEventId(eventId, options = {}) {
  const db = getDb(options);

  const row = await db("tickets")
    .where({
      event_id: eventId,
    })
    .count("* as count")
    .first();

  return Number(row?.count || 0);
}
export async function updateTicketById(id, data, options = {}) {
  const db = getDb(options);

  await db("tickets").where({ id }).update(toTicketUpdate(data));

  const row = await db("tickets").where({ id }).first();

  return mapTicketRow(row, options);
}
export async function updateTicketBuyerSnapshotsByOrderId(
  orderId,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const updatedTickets = await db("tickets")
    .where({
      order_id: orderId,
    })
    .update({
      buyer_email_snapshot: cleanEmail(data.buyerEmailSnapshot),
      buyer_first_name_snapshot: data.buyerFirstNameSnapshot || "",
      buyer_last_name_snapshot: data.buyerLastNameSnapshot || "",
      buyer_display_name_snapshot: data.buyerDisplayNameSnapshot || "",
      ticket_pdf_storage_key: null,
      ticket_pdf_storage_target: null,
      ticket_pdf_generated_at: null,
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });

  const updatedBuyerHolders = await db("tickets")
    .where({
      order_id: orderId,
      holder_type: "buyer",
    })
    .update({
      holder_email_snapshot: cleanEmail(data.buyerEmailSnapshot),
      holder_first_name_snapshot: data.buyerFirstNameSnapshot || "",
      holder_last_name_snapshot: data.buyerLastNameSnapshot || "",
      holder_display_name_snapshot: data.buyerDisplayNameSnapshot || "",
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });

  return {
    updatedTickets: Number(updatedTickets || 0),
    updatedBuyerHolders: Number(updatedBuyerHolders || 0),
  };
}
export async function cancelTicketByIdIfActive(id, data = {}, options = {}) {
  const db = getDb(options);

  const updatedRows = await db("tickets")
    .where({ id })
    .whereNot("status", TICKET_STATUS.CANCELLED)
    .update({
      status: TICKET_STATUS.CANCELLED,
      cancelled_at: data.cancelledAt || new Date(),
      cancellation_reason: data.cancellationReason || null,
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });

  if (updatedRows === 0) {
    return null;
  }

  const row = await db("tickets").where({ id }).first();

  return mapTicketRow(row, options);
}
export async function cancelTicketsByOrderId(orderId, data = {}, options = {}) {
  const db = getDb(options);

  return db("tickets")
    .where({ order_id: orderId })
    .whereNot("status", TICKET_STATUS.CANCELLED)
    .update({
      status: data.status || TICKET_STATUS.CANCELLED,
      cancelled_at: data.cancelledAt || new Date(),
      cancellation_reason: data.cancellationReason || null,
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });
}

export async function markTicketCheckedIn(id, data = {}, options = {}) {
  return updateTicketById(
    id,
    {
      status: TICKET_STATUS.CHECKED_IN,
      checkedInAt: data.checkedInAt || new Date(),
      checkedInByEventUserId: data.checkedInByEventUserId || null,
      checkInTokenLastUsedAt: data.checkInTokenLastUsedAt || new Date(),
      updatedByEventUserId: data.updatedByEventUserId || null,
    },
    options,
  );
}

export async function markTicketCheckedOut(id, data = {}, options = {}) {
  return updateTicketById(
    id,
    {
      status: TICKET_STATUS.ACTIVE,
      checkedInAt: null,
      checkedInByEventUserId: null,
      updatedByEventUserId: data.updatedByEventUserId || null,
    },
    options,
  );
}
export async function invalidateTicketPdfDocumentsByEventId(
  eventId,
  data = {},
  options = {},
) {
  const db = getDb(options);

  const invalidatedTickets = await db("tickets")
    .where({
      event_id: eventId,
    })
    .andWhere(function filterExistingTicketDocuments() {
      this.whereNotNull("ticket_pdf_storage_key")
        .orWhereNotNull("ticket_pdf_storage_target")
        .orWhereNotNull("ticket_pdf_generated_at");
    })
    .update({
      ticket_pdf_storage_key: null,
      ticket_pdf_storage_target: null,
      ticket_pdf_generated_at: null,
      updated_by_event_user_id: data.updatedByEventUserId || null,
      updated_at: now(),
    });

  return {
    invalidatedTickets: Number(invalidatedTickets || 0),
  };
}
export async function setTicketPdfDocument(id, data = {}, options = {}) {
  return updateTicketById(
    id,
    {
      ticketPdfStorageKey: data.ticketPdfStorageKey || null,
      ticketPdfStorageTarget: data.ticketPdfStorageTarget || null,
      ticketPdfGeneratedAt: data.ticketPdfGeneratedAt || new Date(),
      updatedByEventUserId: data.updatedByEventUserId || null,
    },
    options,
  );
}

export async function updateTicketDepositRefund(id, data = {}, options = {}) {
  return updateTicketById(id, data, options);
}
export async function findDistinctOrderIdsForActiveTicketsByEventId(
  eventId,
  options = {},
) {
  const db = getDb(options);

  const rows = await db("tickets")
    .distinct("order_id")
    .where({
      event_id: eventId,
      status: TICKET_STATUS.ACTIVE,
    })
    .whereNotNull("order_id");

  return rows.map((row) => row.order_id).filter(Boolean);
}
export async function findDistinctOrderIdsForParticipantTicketsByEventId(
  eventId,
  options = {},
) {
  const db = getDb(options);

  const rows = await db("tickets")
    .distinct("order_id")
    .where("event_id", eventId)
    .whereIn("status", [TICKET_STATUS.ACTIVE, TICKET_STATUS.CHECKED_IN])
    .whereNotNull("order_id");

  return rows.map((row) => row.order_id).filter(Boolean);
}
