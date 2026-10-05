import {
  createMailTemplateInternalService,
  deleteMailTemplateInternalService,
  getMailLogInternalService,
  getMailTemplateInternalService,
  listMailLogsInternalService,
  listMailTemplatesInternalService,
  sendMailTemplateTestInternalService,
  updateMailTemplateInternalService,
} from "./mail.internal.service.js";

function getActor(req) {
  return {
    eventUserId: req.eventUser?.id || null,
  };
}

export async function listMailTemplates(req, res) {
  const query = req.validated.query;

  const result = await listMailTemplatesInternalService({
    q: query.q,
    module: query.module,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });

  return res.status(200).json({
    success: true,
    data: result.items,
    meta: {
      pagination: result.pagination,
    },
  });
}

export async function getMailTemplate(req, res) {
  const { id } = req.validated.params;

  const template = await getMailTemplateInternalService({
    id,
  });

  return res.status(200).json({
    success: true,
    data: template,
  });
}

export async function createMailTemplate(req, res) {
  const template = await createMailTemplateInternalService({
    actor: getActor(req),
    payload: req.validated.body,
  });

  return res.status(201).json({
    success: true,
    data: template,
  });
}

export async function updateMailTemplate(req, res) {
  const { id } = req.validated.params;

  const template = await updateMailTemplateInternalService({
    actor: getActor(req),
    id,
    payload: req.validated.body,
  });

  return res.status(200).json({
    success: true,
    data: template,
  });
}

export async function deleteMailTemplate(req, res) {
  const { id } = req.validated.params;

  const result = await deleteMailTemplateInternalService({
    id,
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
}

export async function sendMailTemplateTest(req, res) {
  const { id } = req.validated.params;

  const result = await sendMailTemplateTestInternalService({
    actor: getActor(req),
    id,
    payload: req.validated.body,
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
}

export async function listMailLogs(req, res) {
  const query = req.validated.query;

  const result = await listMailLogsInternalService({
    q: query.q,
    templateKey: query.templateKey,
    module: query.module,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });

  return res.status(200).json({
    success: true,
    data: result.items,
    meta: {
      pagination: result.pagination,
    },
  });
}

export async function getMailLog(req, res) {
  const { id } = req.validated.params;

  const log = await getMailLogInternalService({
    id,
  });

  return res.status(200).json({
    success: true,
    data: log,
  });
}
