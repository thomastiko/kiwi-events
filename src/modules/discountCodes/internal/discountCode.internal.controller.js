import { sendSuccess } from "../../../core/http/response.js";

import {
  createDiscountCodeGroupService,
  createDiscountCodesService,
  deleteDiscountCodeGroupService,
  deleteDiscountCodeService,
  listDiscountCodeGroupsService,
  listDiscountCodesService,
  updateDiscountCodeGroupService,
  updateDiscountCodeService,
} from "./discountCode.internal.service.js";

function buildActor(req) {
  return {
    eventUserId: req.eventUser?.id || null,

    eventUser: req.eventUser || null,
  };
}

export async function listDiscountCodeGroups(req, res) {
  const { eventId } = req.validated.query;

  const groups = await listDiscountCodeGroupsService(eventId, buildActor(req));

  return sendSuccess(res, {
    data: groups,
  });
}

export async function createDiscountCodeGroup(req, res) {
  const group = await createDiscountCodeGroupService(
    req.validated.body,
    buildActor(req),
  );

  return sendSuccess(res, {
    status: 201,
    data: group,
  });
}

export async function updateDiscountCodeGroup(req, res) {
  const { groupId } = req.validated.params;

  const group = await updateDiscountCodeGroupService(
    groupId,
    req.validated.body,
    buildActor(req),
  );

  return sendSuccess(res, {
    data: group,
  });
}

export async function deleteDiscountCodeGroup(req, res) {
  const { groupId } = req.validated.params;

  const result = await deleteDiscountCodeGroupService(groupId, buildActor(req));

  return sendSuccess(res, {
    data: result,
  });
}

export async function listDiscountCodes(req, res) {
  const { groupId } = req.validated.params;

  const codes = await listDiscountCodesService(groupId, buildActor(req));

  return sendSuccess(res, {
    data: codes,
  });
}

export async function createDiscountCodes(req, res) {
  const { groupId } = req.validated.params;

  const codes = await createDiscountCodesService(
    groupId,
    req.validated.body,
    buildActor(req),
  );

  return sendSuccess(res, {
    status: 201,
    data: codes,
  });
}

export async function updateDiscountCode(req, res) {
  const { codeId } = req.validated.params;

  const code = await updateDiscountCodeService(
    codeId,
    req.validated.body,
    buildActor(req),
  );

  return sendSuccess(res, {
    data: code,
  });
}

export async function deleteDiscountCode(req, res) {
  const { codeId } = req.validated.params;

  const result = await deleteDiscountCodeService(codeId, buildActor(req));

  return sendSuccess(res, {
    data: result,
  });
}
