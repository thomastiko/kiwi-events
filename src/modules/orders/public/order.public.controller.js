import {
  checkoutPublicOrderService,
  listOwnOrdersService,
  getOwnOrderByIdService,
  cancelOwnOrderService,
  getGuestOrderByAccessTokenService,
  cancelGuestOrderByAccessTokenService,
} from "./order.public.service.js";

import { buildCheckoutIdempotencyContext } from "../order.idempotency.service.js";
import { sendSuccess } from "../../../core/http/response.js";

import { toPublicCheckoutResultDto } from "../order.checkout.dto.js";

import { reissueGuestAccessService } from "../order.guestAccessRecovery.service.js";
import { toGuestAccessRecoveryDto } from "../order.guestAccessRecovery.dto.js";

function buildExternalActor(req) {
  const identity = req.identity || null;

  return {
    eventUserId: req.eventUser?.id || null,
    eventUser: req.eventUser || null,

    externalProvider: identity?.externalProvider || null,
    externalUserId: identity?.externalUserId || null,
    email: identity?.email || null,

    isHostService: Boolean(identity?.isHostService),
    tokenType: identity?.tokenType || null,
    hostServiceId: identity?.hostServiceId || null,

    rawClaims: identity?.rawClaims || null,
  };
}

export async function checkoutPublicOrder(req, res) {
  const payload = req.validated.body;

  const actor = buildExternalActor(req);

  const idempotency = buildCheckoutIdempotencyContext({
    actor,

    key: req.get("Idempotency-Key"),

    payload,
  });

  const result = await checkoutPublicOrderService({
    actor,

    eventId: payload.eventId,

    discountCode: payload.discountCode || null,

    items: payload.items,

    guest: payload.guest || null,

    customer: payload.customer || null,

    idempotency,
  });

  const contract = toPublicCheckoutResultDto(result);

  const wasReplayed = contract.meta.idempotencyReplayed;

  res.setHeader(
    "Idempotency-Replayed",

    wasReplayed ? "true" : "false",
  );

  return sendSuccess(res, {
    status: wasReplayed ? 200 : 201,

    data: contract.data,

    meta: contract.meta,
  });
}
export async function reissueGuestAccess(req, res) {
  const payload = req.validated.body;

  const result = await reissueGuestAccessService({
    actor: buildExternalActor(req),

    orderNumber: payload.orderNumber,
    email: payload.email,
  });

  return sendSuccess(res, {
    data: toGuestAccessRecoveryDto(result),
  });
}
export async function listOwnOrders(req, res) {
  const query = req.validated.query;

  const result = await listOwnOrdersService({
    actor: buildExternalActor(req),
    page: query.page,
    limit: query.limit,
    status: query.status,
    paymentStatus: query.paymentStatus,
  });

  return res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
}

export async function getOwnOrderById(req, res) {
  const { id } = req.validated.params;

  const order = await getOwnOrderByIdService({
    actor: buildExternalActor(req),
    orderId: id,
  });

  return res.status(200).json({
    success: true,
    data: order,
  });
}

export async function cancelOwnOrder(req, res) {
  const { id } = req.validated.params;

  const payload = req.validated.body;

  const order = await cancelOwnOrderService({
    actor: buildExternalActor(req),

    orderId: id,

    reason: payload.reason,
  });

  return sendSuccess(res, {
    data: order,
  });
}

export async function getGuestOrderByAccessToken(req, res) {
  const { id } = req.validated.params;

  const { accessToken } = req.validated.query;

  const result = await getGuestOrderByAccessTokenService({
    orderId: id,

    accessToken,
  });

  return sendSuccess(res, {
    data: result,
  });
}
export async function cancelGuestOrder(req, res) {
  const { id } = req.validated.params;

  const { accessToken, reason } = req.validated.body;

  const order = await cancelGuestOrderByAccessTokenService({
    orderId: id,

    accessToken,

    reason,
  });

  return sendSuccess(res, {
    data: order,
  });
}
