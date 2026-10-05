import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(`Cannot serialize mail data without ${fieldName}.`);
  }

  return id;
}

function optionalApiId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return toApiId(value);
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(`Cannot serialize mail data without ${fieldName}.`);
  }

  return date;
}

function optionalApiDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return toApiDate(value);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => cleanString(entry)).filter(Boolean);
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function toMailRecipientDto(recipient) {
  if (!recipient) {
    return null;
  }

  return {
    email: cleanString(recipient.email).toLowerCase(),
    name: cleanString(recipient.name),
  };
}

function toMailRecipientListDto(recipients) {
  if (!Array.isArray(recipients)) {
    return [];
  }

  return recipients
    .map(toMailRecipientDto)
    .filter((recipient) => recipient?.email);
}

function toMailSourceDto(source) {
  return {
    module: cleanString(source?.module).toLowerCase(),
    entityType: cleanString(source?.entityType),
    entityId: optionalApiId(source?.entityId),
  };
}

export function toMailTemplateDto(template) {
  if (!template) {
    throw new TypeError("Cannot serialize a missing mail template.");
  }

  return {
    id: requireApiId(template.id, "id"),

    key: cleanString(template.key).toLowerCase(),
    module: cleanString(template.module).toLowerCase(),
    category: cleanString(template.category).toLowerCase(),

    name: cleanString(template.name),
    description: cleanString(template.description),

    subject: cleanString(template.subject),
    html: String(template.html ?? ""),
    text: String(template.text ?? ""),

    variables: normalizeStringArray(template.variables),

    fromName: cleanString(template.fromName),
    fromEmail: cleanString(template.fromEmail).toLowerCase(),
    replyTo: cleanString(template.replyTo).toLowerCase(),

    status: cleanString(template.status),
    isSystem: Boolean(template.isSystem),

    createdByEventUserId: optionalApiId(template.createdByEventUserId),

    updatedByEventUserId: optionalApiId(template.updatedByEventUserId),

    createdAt: requireApiDate(template.createdAt, "createdAt"),

    updatedAt: requireApiDate(template.updatedAt, "updatedAt"),
  };
}

export function toMailLogDto(log) {
  if (!log) {
    throw new TypeError("Cannot serialize a missing mail log.");
  }

  const to = toMailRecipientDto(log.to);

  if (!to?.email) {
    throw new TypeError("Cannot serialize a mail log without recipient email.");
  }

  return {
    id: requireApiId(log.id, "id"),

    templateKey: cleanString(log.templateKey).toLowerCase(),
    templateId: optionalApiId(log.templateId),

    module: cleanString(log.module).toLowerCase(),

    to,
    cc: toMailRecipientListDto(log.cc),
    bcc: toMailRecipientListDto(log.bcc),

    fromName: cleanString(log.fromName),
    fromEmail: cleanString(log.fromEmail).toLowerCase(),
    replyTo: cleanString(log.replyTo).toLowerCase(),

    subjectSnapshot: String(log.subjectSnapshot ?? ""),
    htmlSnapshot: String(log.htmlSnapshot ?? ""),
    textSnapshot: String(log.textSnapshot ?? ""),

    variablesSnapshot: normalizeObject(log.variablesSnapshot),

    status: cleanString(log.status),

    provider: cleanString(log.provider).toLowerCase(),
    providerMessageId: cleanString(log.providerMessageId),

    errorMessage: String(log.errorMessage ?? ""),

    attempts: Number(log.attempts ?? 0),

    sentAt: optionalApiDate(log.sentAt),

    source: toMailSourceDto(log.source),

    createdByEventUserId: optionalApiId(log.createdByEventUserId),

    createdAt: requireApiDate(log.createdAt, "createdAt"),

    updatedAt: requireApiDate(log.updatedAt, "updatedAt"),
  };
}
