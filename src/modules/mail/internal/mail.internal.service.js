import { dispatchTemplateMail } from "../mail.dispatch.service.js";
import { toMailLogDto, toMailTemplateDto } from "../mail.dto.js";
import {
  createEmailTemplate,
  deleteEmailTemplateById,
  findEmailLogById,
  findEmailTemplateById,
  findEmailTemplateByKey,
  listEmailLogs,
  listEmailTemplates,
  updateEmailTemplateById,
} from "../repositories/mail.repository.js";
import { MAIL_TEMPLATE_KEYS } from "../mail.constants.js";
import {
  mailLogNotFoundError,
  mailTemplateKeyAlreadyExistsError,
  mailTemplateNotFoundError,
  systemMailTemplateDeleteError,
  reservedSystemMailTemplateKeyError,
  systemMailTemplateIdentityUpdateError,
} from "../mail.errors.js";

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
const RESERVED_SYSTEM_TEMPLATE_KEYS = new Set(
  Object.values(MAIL_TEMPLATE_KEYS),
);

function isReservedSystemTemplateKey(value) {
  return RESERVED_SYSTEM_TEMPLATE_KEYS.has(normalizeKey(value));
}
/**
 * Builds the actor context passed to the mail dispatcher.
 *
 * @param {object} actor
 * @returns {{ eventUserId: string|null }}
 */
function actorContext(actor = {}) {
  return {
    eventUserId: actor.eventUserId || null,
  };
}

/**
 * Builds audit fields for updating mail templates.
 *
 * @param {object} actor
 * @returns {{ updatedByEventUserId: string|null }}
 */
function actorUpdateFields(actor = {}) {
  return {
    updatedByEventUserId: actor.eventUserId || null,
  };
}

/**
 * Builds audit fields for creating mail templates.
 *
 * @param {object} actor
 * @returns {{
 *   createdByEventUserId: string|null,
 *   updatedByEventUserId: string|null
 * }}
 */
function actorCreateFields(actor = {}) {
  return {
    createdByEventUserId: actor.eventUserId || null,
    updatedByEventUserId: actor.eventUserId || null,
  };
}

function calculatePagination({ result, page, limit }) {
  const normalizedPage = result.page || Math.max(1, Number(page) || 1);
  const normalizedLimit = result.limit || Math.max(1, Number(limit) || 50);
  const total = result.total || 0;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    total,
    pages: Math.ceil(total / normalizedLimit) || 1,
  };
}

function buildTemplateUpdatePayload({ actor, currentTemplate, payload }) {
  const update = {
    ...actorUpdateFields(actor),
  };

  if (payload.key !== undefined) {
    update.key = normalizeKey(payload.key);
  }

  if (payload.module !== undefined) {
    update.module = normalizeKey(payload.module);
  }

  if (payload.category !== undefined) {
    update.category = normalizeKey(payload.category);
  }

  if (payload.name !== undefined) {
    update.name = payload.name;
  }

  if (payload.description !== undefined) {
    update.description = payload.description;
  }

  if (payload.subject !== undefined) {
    update.subject = payload.subject;
  }

  if (payload.html !== undefined) {
    update.html = payload.html;
  }

  if (payload.text !== undefined) {
    update.text = payload.text;
  }

  if (payload.variables !== undefined) {
    update.variables = payload.variables;
  }

  if (payload.fromName !== undefined) {
    update.fromName = payload.fromName;
  }

  if (payload.fromEmail !== undefined) {
    update.fromEmail = payload.fromEmail;
  }

  if (payload.replyTo !== undefined) {
    update.replyTo = payload.replyTo;
  }

  if (payload.status !== undefined) {
    update.status = payload.status;
  }
  if (!update.key) {
    update.key = currentTemplate.key;
  }

  return update;
}

export async function listMailTemplatesInternalService({
  q,
  module,
  status,
  page = 1,
  limit = 50,
}) {
  const result = await listEmailTemplates({
    search: q,
    module: module ? normalizeKey(module) : undefined,
    status,
    page,
    limit,
    sortBy: "module",
    sortOrder: "asc",
  });

  return {
    items: (result.items || []).map(toMailTemplateDto),
    pagination: calculatePagination({ result, page, limit }),
  };
}

export async function getMailTemplateInternalService({ id }) {
  const template = await findEmailTemplateById(id, {
    lean: true,
  });

  if (!template) {
    throw mailTemplateNotFoundError({ templateId: id });
  }

  return toMailTemplateDto(template);
}

export async function createMailTemplateInternalService({ actor, payload }) {
  const key = normalizeKey(payload.key);
  if (isReservedSystemTemplateKey(key)) {
    throw reservedSystemMailTemplateKeyError(key);
  }
  const existingTemplate = await findEmailTemplateByKey(key, {
    lean: true,
  });

  if (existingTemplate) {
    throw mailTemplateKeyAlreadyExistsError(key);
  }

  const template = await createEmailTemplate(
    {
      ...payload,

      key,

      module: normalizeKey(payload.module),

      category: normalizeKey(payload.category),

      isSystem: false,

      ...actorCreateFields(actor),
    },
    {
      lean: true,
    },
  );

  return toMailTemplateDto(template);
}

export async function updateMailTemplateInternalService({
  actor,
  id,
  payload,
}) {
  const template = await findEmailTemplateById(id, {
    lean: true,
  });

  if (!template) {
    throw mailTemplateNotFoundError({ templateId: id });
  }
  if (template.isSystem) {
    const nextKey =
      payload.key !== undefined ? normalizeKey(payload.key) : template.key;

    const nextModule =
      payload.module !== undefined
        ? normalizeKey(payload.module)
        : template.module;

    if (nextKey !== template.key || nextModule !== template.module) {
      throw systemMailTemplateIdentityUpdateError({
        templateId: template.id,
        templateKey: template.key,
        module: template.module,
      });
    }
  }
  if (payload.key !== undefined) {
    const nextKey = normalizeKey(payload.key);

    if (nextKey !== template.key) {
      if (isReservedSystemTemplateKey(nextKey)) {
        throw reservedSystemMailTemplateKeyError(nextKey);
      }

      const existingTemplate = await findEmailTemplateByKey(nextKey, {
        lean: true,
      });

      if (existingTemplate && existingTemplate.id !== id) {
        throw mailTemplateKeyAlreadyExistsError(nextKey);
      }
    }
  }

  const updatePayload = buildTemplateUpdatePayload({
    actor,
    currentTemplate: template,
    payload,
  });

  const updatedTemplate = await updateEmailTemplateById(id, updatePayload, {
    lean: true,
  });

  if (!updatedTemplate) {
    throw mailTemplateNotFoundError({ templateId: id });
  }

  return toMailTemplateDto(updatedTemplate);
}

export async function deleteMailTemplateInternalService({ id }) {
  const template = await findEmailTemplateById(id, {
    lean: true,
  });

  if (!template) {
    throw mailTemplateNotFoundError({ templateId: id });
  }

  if (template.isSystem) {
    throw systemMailTemplateDeleteError({
      templateId: id,
      templateKey: template.key,
    });
  }

  const deletedTemplate = await deleteEmailTemplateById(id, {
    lean: true,
  });

  if (!deletedTemplate) {
    throw mailTemplateNotFoundError({ templateId: id });
  }

  return { deleted: true };
}

export async function sendMailTemplateTestInternalService({
  actor,
  id,
  payload,
}) {
  const template = await findEmailTemplateById(id, {
    lean: true,
  });

  if (!template) {
    throw mailTemplateNotFoundError({ templateId: id });
  }

  return dispatchTemplateMail({
    templateKey: template.key,
    to: payload.to,

    variables: payload.variables || {},
    allowMissingVariables: true,
    source: {
      module: "mail",
      entityType: "EmailTemplate",
      entityId: template.id,
    },
    context: actorContext(actor),
    headers: {
      "X-kiwi-events-Test-Mail": "true",
      "X-kiwi-events-Test-Template-Key": template.key,
    },
  });
}

export async function listMailLogsInternalService({
  q,
  templateKey,
  module,
  status,
  page = 1,
  limit = 50,
}) {
  const result = await listEmailLogs({
    search: q,
    templateKey: templateKey ? normalizeKey(templateKey) : undefined,
    module: module ? normalizeKey(module) : undefined,
    status,
    page,
    limit,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  return {
    items: (result.items || []).map(toMailLogDto),
    pagination: calculatePagination({ result, page, limit }),
  };
}

export async function getMailLogInternalService({ id }) {
  const log = await findEmailLogById(id, {
    lean: true,
  });

  if (!log) {
    throw mailLogNotFoundError({ mailLogId: id });
  }

  return toMailLogDto(log);
}
