// src/modules/mail/repositories/sql.mail.repository.js

import { randomUUID } from "node:crypto";

import { getDatabaseConnection } from "../../database/database.service.js";
import { EMAIL_LOG_STATUS } from "../mail.constants.js";

function now() {
  return new Date();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getDb(options = {}) {
  return options.trx || options.knex || getDatabaseConnection();
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanLower(value) {
  return cleanString(value).toLowerCase();
}

function cleanEmail(value) {
  return cleanLower(value);
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
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function stringifyJson(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function normalizeRecipient(value = {}) {
  return {
    email: cleanEmail(value.email),
    name: cleanString(value.name),
  };
}

function normalizeRecipients(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeRecipient(entry))
    .filter((entry) => entry.email);
}

function normalizeSource(value = {}) {
  return {
    module: cleanLower(value.module),
    entityType: cleanString(value.entityType),
    entityId: value.entityId || null,
  };
}

function mapTemplateRow(row) {
  if (!row) return null;

  return {
    id: row.id,

    key: row.template_key,
    module: row.module,
    category: row.category || "",

    name: row.name,
    description: row.description || "",

    subject: row.subject || "",
    html: row.html || "",
    text: row.text || "",

    variables: parseJsonArray(row.variables),

    fromName: row.from_name || "",
    fromEmail: row.from_email || "",
    replyTo: row.reply_to || "",

    status: row.status,
    isSystem: Boolean(row.is_system),

    createdByEventUserId: row.created_by_event_user_id || null,
    updatedByEventUserId: row.updated_by_event_user_id || null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLogRow(row) {
  if (!row) return null;

  return {
    id: row.id,

    templateKey: row.template_key || "",
    templateId: row.template_id || null,
    module: row.module || "",

    to: {
      email: row.to_email || "",
      name: row.to_name || "",
    },

    cc: parseJsonArray(row.cc),
    bcc: parseJsonArray(row.bcc),

    fromName: row.from_name || "",
    fromEmail: row.from_email || "",
    replyTo: row.reply_to || "",

    subjectSnapshot: row.subject_snapshot || "",
    htmlSnapshot: row.html_snapshot || "",
    textSnapshot: row.text_snapshot || "",
    variablesSnapshot: parseJsonObject(row.variables_snapshot),
    deliveryKey: row.delivery_key || null,
    deliveryClaimToken: row.delivery_claim_token || "",
    deliveryClaimExpiresAt: row.delivery_claim_expires_at || null,
    status: row.status,
    provider: row.provider || "smtp",
    providerMessageId: row.provider_message_id || "",
    errorMessage: row.error_message || "",
    attempts: Number(row.attempts || 0),

    sentAt: row.sent_at || null,

    source: {
      module: row.source_module || "",
      entityType: row.source_entity_type || "",
      entityId: row.source_entity_id || null,
    },

    createdByEventUserId: row.created_by_event_user_id || null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTemplateInsert(data) {
  const timestamp = now();

  return {
    id: data.id || randomUUID(),

    template_key: cleanLower(data.key),
    module: cleanLower(data.module),
    category: cleanLower(data.category),

    name: cleanString(data.name),
    description: cleanString(data.description),

    subject: cleanString(data.subject),
    html: data.html || "",
    text: data.text || "",

    variables: stringifyJson(data.variables, []),

    from_name: cleanString(data.fromName),
    from_email: cleanEmail(data.fromEmail),
    reply_to: cleanEmail(data.replyTo),

    status: data.status || "active",
    is_system: Boolean(data.isSystem),

    created_by_event_user_id: data.createdByEventUserId || null,
    updated_by_event_user_id: data.updatedByEventUserId || null,

    created_at: data.createdAt || timestamp,
    updated_at: data.updatedAt || timestamp,
  };
}

function toTemplateUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if (hasOwn(data, "key")) update.template_key = cleanLower(data.key);
  if (hasOwn(data, "module")) update.module = cleanLower(data.module);
  if (hasOwn(data, "category")) update.category = cleanLower(data.category);

  if (hasOwn(data, "name")) update.name = cleanString(data.name);
  if (hasOwn(data, "description")) {
    update.description = cleanString(data.description);
  }

  if (hasOwn(data, "subject")) update.subject = cleanString(data.subject);
  if (hasOwn(data, "html")) update.html = data.html || "";
  if (hasOwn(data, "text")) update.text = data.text || "";

  if (hasOwn(data, "variables")) {
    update.variables = stringifyJson(data.variables, []);
  }

  if (hasOwn(data, "fromName")) update.from_name = cleanString(data.fromName);
  if (hasOwn(data, "fromEmail")) update.from_email = cleanEmail(data.fromEmail);
  if (hasOwn(data, "replyTo")) update.reply_to = cleanEmail(data.replyTo);

  if (hasOwn(data, "status")) update.status = data.status;
  if (hasOwn(data, "isSystem")) update.is_system = Boolean(data.isSystem);

  if (hasOwn(data, "createdByEventUserId")) {
    update.created_by_event_user_id = data.createdByEventUserId || null;
  }
  if (hasOwn(data, "updatedByEventUserId")) {
    update.updated_by_event_user_id = data.updatedByEventUserId || null;
  }

  return update;
}

function toLogInsert(data) {
  const timestamp = now();
  const to = normalizeRecipient(data.to);
  const source = normalizeSource(data.source);

  return {
    id: data.id || randomUUID(),

    template_key: cleanLower(data.templateKey),
    template_id: data.templateId || null,
    module: cleanLower(data.module),

    to_email: to.email,
    to_name: to.name,

    cc: stringifyJson(normalizeRecipients(data.cc), []),
    bcc: stringifyJson(normalizeRecipients(data.bcc), []),

    from_name: cleanString(data.fromName),
    from_email: cleanEmail(data.fromEmail),
    reply_to: cleanEmail(data.replyTo),

    subject_snapshot: data.subjectSnapshot || "",
    html_snapshot: data.htmlSnapshot || "",
    text_snapshot: data.textSnapshot || "",
    variables_snapshot: stringifyJson(data.variablesSnapshot, {}),
    delivery_key: data.deliveryKey || null,
    delivery_claim_token: cleanString(data.deliveryClaimToken),
    delivery_claim_expires_at: data.deliveryClaimExpiresAt || null,
    status: data.status || EMAIL_LOG_STATUS.QUEUED,
    provider: cleanLower(data.provider) || "smtp",
    provider_message_id: cleanString(data.providerMessageId),
    error_message: data.errorMessage || "",
    attempts: Number(data.attempts || 0),

    sent_at: data.sentAt || null,

    source_module: source.module,
    source_entity_type: source.entityType,
    source_entity_id: source.entityId,

    created_by_event_user_id: data.createdByEventUserId || null,

    created_at: data.createdAt || timestamp,
    updated_at: data.updatedAt || timestamp,
  };
}

function toLogUpdate(data) {
  const update = {
    updated_at: now(),
  };

  if (hasOwn(data, "templateKey")) {
    update.template_key = cleanLower(data.templateKey);
  }
  if (hasOwn(data, "templateId")) update.template_id = data.templateId || null;
  if (hasOwn(data, "module")) update.module = cleanLower(data.module);

  if (hasOwn(data, "to")) {
    const to = normalizeRecipient(data.to);
    update.to_email = to.email;
    update.to_name = to.name;
  }

  if (hasOwn(data, "cc")) {
    update.cc = stringifyJson(normalizeRecipients(data.cc), []);
  }

  if (hasOwn(data, "bcc")) {
    update.bcc = stringifyJson(normalizeRecipients(data.bcc), []);
  }

  if (hasOwn(data, "fromName")) update.from_name = cleanString(data.fromName);
  if (hasOwn(data, "fromEmail")) update.from_email = cleanEmail(data.fromEmail);
  if (hasOwn(data, "replyTo")) update.reply_to = cleanEmail(data.replyTo);

  if (hasOwn(data, "subjectSnapshot")) {
    update.subject_snapshot = data.subjectSnapshot || "";
  }
  if (hasOwn(data, "htmlSnapshot")) {
    update.html_snapshot = data.htmlSnapshot || "";
  }
  if (hasOwn(data, "textSnapshot")) {
    update.text_snapshot = data.textSnapshot || "";
  }
  if (hasOwn(data, "variablesSnapshot")) {
    update.variables_snapshot = stringifyJson(data.variablesSnapshot, {});
  }
  if (hasOwn(data, "deliveryKey")) {
    update.delivery_key = data.deliveryKey || null;
  }

  if (hasOwn(data, "deliveryClaimToken")) {
    update.delivery_claim_token = cleanString(data.deliveryClaimToken);
  }

  if (hasOwn(data, "deliveryClaimExpiresAt")) {
    update.delivery_claim_expires_at = data.deliveryClaimExpiresAt || null;
  }
  if (hasOwn(data, "status")) update.status = data.status;
  if (hasOwn(data, "provider")) update.provider = cleanLower(data.provider);
  if (hasOwn(data, "providerMessageId")) {
    update.provider_message_id = cleanString(data.providerMessageId);
  }
  if (hasOwn(data, "errorMessage")) {
    update.error_message = data.errorMessage || "";
  }
  if (hasOwn(data, "attempts")) update.attempts = Number(data.attempts || 0);

  if (hasOwn(data, "sentAt")) update.sent_at = data.sentAt || null;

  if (hasOwn(data, "source")) {
    const source = normalizeSource(data.source);
    update.source_module = source.module;
    update.source_entity_type = source.entityType;
    update.source_entity_id = source.entityId;
  }

  if (hasOwn(data, "createdByEventUserId")) {
    update.created_by_event_user_id = data.createdByEventUserId || null;
  }

  return update;
}

export async function findEmailTemplateByKey(key, options = {}) {
  const db = getDb(options);

  const row = await db("email_templates")
    .where("template_key", cleanLower(key))
    .first();

  return mapTemplateRow(row);
}

export async function createEmailTemplate(data, options = {}) {
  const db = getDb(options);
  const insert = toTemplateInsert(data);

  await db("email_templates").insert(insert);

  return findEmailTemplateById(insert.id, options);
}

export async function listEmailTemplates(
  {
    page = 1,
    limit = 20,
    status,
    module,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = {},
  options = {},
) {
  const db = getDb(options);

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);
  const offset = (numericPage - 1) * numericLimit;

  const sortFieldMap = {
    createdAt: "created_at",
    updatedAt: "updated_at",
    key: "template_key",
    module: "module",
    status: "status",
  };

  const resolvedSortField = sortFieldMap[sortBy] || "created_at";
  const resolvedSortOrder = sortOrder === "asc" ? "asc" : "desc";

  const baseQuery = db("email_templates");

  if (status) baseQuery.where("status", status);
  if (module) baseQuery.where("module", cleanLower(module));

  if (search?.trim()) {
    const pattern = `%${search.trim()}%`;

    baseQuery.where((builder) => {
      builder
        .where("template_key", "like", pattern)
        .orWhere("name", "like", pattern)
        .orWhere("module", "like", pattern)
        .orWhere("category", "like", pattern)
        .orWhere("subject", "like", pattern)
        .orWhere("description", "like", pattern);
    });
  }

  const countQuery = baseQuery
    .clone()
    .clearSelect()
    .clearOrder()
    .count({ count: "*" });

  const [items, countRows] = await Promise.all([
    baseQuery
      .clone()
      .orderBy(resolvedSortField, resolvedSortOrder)
      .orderBy("id", resolvedSortOrder)
      .limit(numericLimit)
      .offset(offset),
    countQuery,
  ]);

  const total = Number(countRows?.[0]?.count || 0);

  return {
    items: items.map(mapTemplateRow),
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function findEmailTemplateById(id, options = {}) {
  const db = getDb(options);

  const row = await db("email_templates").where("id", id).first();

  return mapTemplateRow(row);
}

export async function updateEmailTemplateById(id, data, options = {}) {
  const db = getDb(options);
  const update = toTemplateUpdate(data);

  await db("email_templates").where("id", id).update(update);

  return findEmailTemplateById(id, options);
}

export async function deleteEmailTemplateById(id, options = {}) {
  const db = getDb(options);

  const existing = await findEmailTemplateById(id, options);

  if (!existing) {
    return null;
  }

  await db("email_templates").where("id", id).delete();

  return existing;
}

export async function createEmailLog(data, options = {}) {
  const db = getDb(options);
  const insert = toLogInsert(data);

  await db("email_logs").insert(insert);

  return findEmailLogById(insert.id, options);
}

export async function updateEmailLogById(id, data, options = {}) {
  const db = getDb(options);
  const update = toLogUpdate(data);

  await db("email_logs").where("id", id).update(update);

  return findEmailLogById(id, options);
}
async function findEmailLogByDeliveryKey(deliveryKey, options = {}) {
  const db = getDb(options);

  const row = await db("email_logs").where("delivery_key", deliveryKey).first();

  return mapLogRow(row);
}

export async function claimEmailDelivery(
  { deliveryKey, claimToken, claimExpiresAt, data },
  options = {},
) {
  const db = getDb(options);
  const timestamp = now();

  const reclaimUpdate = {
    ...toLogUpdate(data),

    delivery_key: deliveryKey,
    delivery_claim_token: claimToken,
    delivery_claim_expires_at: claimExpiresAt,

    status: EMAIL_LOG_STATUS.SENDING,
    error_message: "",

    attempts: db.raw("attempts + 1"),
    updated_at: timestamp,
  };

  const reclaimed = await db("email_logs")
    .where("delivery_key", deliveryKey)
    .andWhere("status", EMAIL_LOG_STATUS.FAILED)
    .update(reclaimUpdate);

  if (reclaimed > 0) {
    return {
      claimed: true,
      log: await findEmailLogByDeliveryKey(deliveryKey, options),
    };
  }
  const markedUnknown = await db("email_logs")
    .where("delivery_key", deliveryKey)
    .andWhere("status", EMAIL_LOG_STATUS.SENDING)
    .andWhere("delivery_claim_expires_at", "<=", timestamp)
    .update({
      status: EMAIL_LOG_STATUS.UNKNOWN,

      error_message:
        "Delivery outcome is unknown because the previous delivery claim expired.",

      delivery_claim_token: "",
      delivery_claim_expires_at: null,

      updated_at: timestamp,
    });

  if (markedUnknown > 0) {
    return {
      claimed: false,

      log: await findEmailLogByDeliveryKey(deliveryKey, options),
    };
  }
  const insert = toLogInsert({
    ...data,

    deliveryKey,
    deliveryClaimToken: claimToken,
    deliveryClaimExpiresAt: claimExpiresAt,

    status: EMAIL_LOG_STATUS.SENDING,
    errorMessage: "",
    attempts: 1,
  });

  await db("email_logs").insert(insert).onConflict("delivery_key").ignore();

  const existing = await findEmailLogByDeliveryKey(deliveryKey, options);

  return {
    claimed: existing?.deliveryClaimToken === claimToken,

    log: existing,
  };
}
export async function updateClaimedEmailDelivery(
  { emailLogId, claimToken, data = {} },
  options = {},
) {
  const db = getDb(options);

  const update = {
    ...toLogUpdate(data),

    delivery_claim_token: "",
    delivery_claim_expires_at: null,
  };

  const affected = await db("email_logs")
    .where("id", emailLogId)
    .andWhere("delivery_claim_token", claimToken)
    .update(update);

  if (affected === 0) {
    return null;
  }

  return findEmailLogById(emailLogId, options);
}
export async function listEmailLogs(
  {
    page = 1,
    limit = 20,
    status,
    templateKey,
    module,
    provider,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = {},
  options = {},
) {
  const db = getDb(options);

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);
  const offset = (numericPage - 1) * numericLimit;

  const sortFieldMap = {
    createdAt: "created_at",
    sentAt: "sent_at",
    templateKey: "template_key",
    module: "module",
    status: "status",
  };

  const resolvedSortField = sortFieldMap[sortBy] || "created_at";
  const resolvedSortOrder = sortOrder === "asc" ? "asc" : "desc";

  const baseQuery = db("email_logs");

  if (status) baseQuery.where("status", status);
  if (templateKey) baseQuery.where("template_key", cleanLower(templateKey));
  if (module) baseQuery.where("module", cleanLower(module));
  if (provider) baseQuery.where("provider", cleanLower(provider));

  if (search?.trim()) {
    const pattern = `%${search.trim()}%`;

    baseQuery.where((builder) => {
      builder
        .where("template_key", "like", pattern)
        .orWhere("module", "like", pattern)
        .orWhere("subject_snapshot", "like", pattern)
        .orWhere("to_email", "like", pattern)
        .orWhere("to_name", "like", pattern)
        .orWhere("error_message", "like", pattern);
    });
  }

  const countQuery = baseQuery
    .clone()
    .clearSelect()
    .clearOrder()
    .count({ count: "*" });

  const [items, countRows] = await Promise.all([
    baseQuery
      .clone()
      .orderBy(resolvedSortField, resolvedSortOrder)
      .orderBy("id", resolvedSortOrder)
      .limit(numericLimit)
      .offset(offset),
    countQuery,
  ]);

  const total = Number(countRows?.[0]?.count || 0);

  return {
    items: items.map(mapLogRow),
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function findEmailLogById(id, options = {}) {
  const db = getDb(options);

  const row = await db("email_logs").where("id", id).first();

  return mapLogRow(row);
}
