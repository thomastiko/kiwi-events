import {
  getSetupConfigService,
  getSetupStatusService,
  initializeKiwiEventsService,
  saveSetupDatabaseService,
  testSetupDatabaseService,
} from "./setup.service.js";

import {
  toSetupConfigDto,
  toSetupDatabaseSaveDto,
  toSetupDatabaseTestDto,
  toSetupInitializationDto,
  toSetupStatusDto,
} from "./setup.dto.js";

function getRequestBody(req) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return {};
  }

  return req.body;
}

function getDatabasePayload(req) {
  const body = getRequestBody(req);

  return {
    provider: body.provider,
    uri: body.uri,
  };
}

function getInitializationPayload(req) {
  const body = getRequestBody(req);

  return {
    setupAdmin: {
      password: body.setupAdmin?.password,
    },

    auth: {
      externalJwtSecret: body.auth?.externalJwtSecret,
    },

    security: {
      ticketQrSecret: body.security?.ticketQrSecret,
    },
  };
}

function createSetupResponse(result, dataMapper = null) {
  const response = {
    success: result?.success === true,
  };

  if (typeof result?.message === "string" && result.message.trim()) {
    response.message = result.message;
  }

  if (response.success && typeof dataMapper === "function") {
    response.data = dataMapper(result?.data || {});
  }

  return response;
}

export async function getSetupStatusHandler(_req, res) {
  const status = getSetupStatusService();

  return res.json({
    success: true,
    data: toSetupStatusDto(status),
  });
}

export async function testSetupDatabaseHandler(req, res) {
  const result = await testSetupDatabaseService(getDatabasePayload(req));

  const response = createSetupResponse(result, toSetupDatabaseTestDto);

  return res.status(response.success ? 200 : 400).json(response);
}

export async function saveSetupDatabaseHandler(req, res) {
  const result = await saveSetupDatabaseService(getDatabasePayload(req));

  const response = createSetupResponse(result, toSetupDatabaseSaveDto);

  return res.status(response.success ? 200 : 400).json(response);
}

export async function initializeKiwiEventsHandler(req, res) {
  const result = await initializeKiwiEventsService(
    getInitializationPayload(req),
  );

  const response = createSetupResponse(result, toSetupInitializationDto);

  return res.status(response.success ? 200 : 400).json(response);
}

export async function getSetupConfigHandler(_req, res) {
  const config = getSetupConfigService();

  return res.json({
    success: true,
    data: toSetupConfigDto(config),
  });
}
