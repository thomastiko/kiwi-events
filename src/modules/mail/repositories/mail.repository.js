import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import { getDatabaseProvider } from "../../database/database.service.js";

import * as mongoMailRepository from "./mongo.mail.repository.js";
import * as sqlMailRepository from "./sql.mail.repository.js";

function getMailRepositoryContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoMailRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlMailRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function toPlainRecord(record) {
  if (!record) {
    return null;
  }

  if (typeof record.toObject === "function") {
    return record.toObject();
  }

  return record;
}

function normalizeRequiredId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot normalize mail record without ${fieldName}.`);
  }

  if (typeof value === "string") {
    const id = value.trim();

    if (!id) {
      throw new TypeError(`Cannot normalize mail record without ${fieldName}.`);
    }

    return id;
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id) {
    throw new TypeError(`Cannot normalize mail record without ${fieldName}.`);
  }

  return id;
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredId(value, "referenced id");
}

function resolveRecordId(record, provider) {
  return provider === DATABASE_PROVIDER.MONGODB
    ? normalizeRequiredId(record._id, "MongoDB _id")
    : normalizeRequiredId(record.id, "SQL id");
}

function toCanonicalEmailTemplateRecord(template, provider) {
  const record = toPlainRecord(template);

  if (!record) {
    return null;
  }

  const {
    _id,
    __v,
    id: ignoredId,
    createdByEventUserId,
    updatedByEventUserId,
    ...fields
  } = record;

  return {
    id: resolveRecordId(record, provider),

    ...fields,

    createdByEventUserId: normalizeOptionalId(createdByEventUserId),

    updatedByEventUserId: normalizeOptionalId(updatedByEventUserId),
  };
}

function toCanonicalEmailLogRecord(log, provider) {
  const record = toPlainRecord(log);

  if (!record) {
    return null;
  }

  const {
    _id,
    __v,
    id: ignoredId,
    templateId,
    source,
    createdByEventUserId,
    ...fields
  } = record;

  return {
    id: resolveRecordId(record, provider),

    ...fields,

    templateId: normalizeOptionalId(templateId),

    source: {
      module: source?.module || "",
      entityType: source?.entityType || "",
      entityId: normalizeOptionalId(source?.entityId),
    },

    createdByEventUserId: normalizeOptionalId(createdByEventUserId),
  };
}

export async function findEmailTemplateByKey(key, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const template = await repository.findEmailTemplateByKey(key, options);

  return toCanonicalEmailTemplateRecord(template, provider);
}

export async function createEmailTemplate(data, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const template = await repository.createEmailTemplate(data, options);

  return toCanonicalEmailTemplateRecord(template, provider);
}

export async function listEmailTemplates(input = {}, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const result = await repository.listEmailTemplates(input, options);

  return {
    ...result,
    items: (result.items || []).map((template) =>
      toCanonicalEmailTemplateRecord(template, provider),
    ),
  };
}

export async function findEmailTemplateById(id, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const template = await repository.findEmailTemplateById(id, options);

  return toCanonicalEmailTemplateRecord(template, provider);
}

export async function updateEmailTemplateById(id, data, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const template = await repository.updateEmailTemplateById(id, data, options);

  return toCanonicalEmailTemplateRecord(template, provider);
}

export async function deleteEmailTemplateById(id, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const template = await repository.deleteEmailTemplateById(id, options);

  return toCanonicalEmailTemplateRecord(template, provider);
}

export async function createEmailLog(data, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const log = await repository.createEmailLog(data, options);

  return toCanonicalEmailLogRecord(log, provider);
}

export async function updateEmailLogById(id, data, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const log = await repository.updateEmailLogById(id, data, options);

  return toCanonicalEmailLogRecord(log, provider);
}
export async function claimEmailDelivery(input, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const result = await repository.claimEmailDelivery(input, options);

  return {
    claimed: Boolean(result?.claimed),

    log: toCanonicalEmailLogRecord(result?.log, provider),
  };
}
export async function updateClaimedEmailDelivery(input, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const log = await repository.updateClaimedEmailDelivery(input, options);

  return toCanonicalEmailLogRecord(log, provider);
}
export async function listEmailLogs(input = {}, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const result = await repository.listEmailLogs(input, options);

  return {
    ...result,
    items: (result.items || []).map((log) =>
      toCanonicalEmailLogRecord(log, provider),
    ),
  };
}

export async function findEmailLogById(id, options = {}) {
  const { provider, repository } = getMailRepositoryContext();

  const log = await repository.findEmailLogById(id, options);

  return toCanonicalEmailLogRecord(log, provider);
}
