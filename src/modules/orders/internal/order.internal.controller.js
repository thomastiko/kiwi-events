import {
  cancelInternalOrderService,
  createManualOrderForEventService,
  getInternalOrderByIdService,
  listEventOrdersInternalService,
  refundInternalOrderService,
  resendInternalOrderMailService,
  updateInternalOrderBuyerService,
} from "./order.internal.service.js";
import { sendSuccess } from "../../../core/http/response.js";

function buildActor(req) {
  return {
    eventUserId: req.eventUser?.id || null,
    eventUser: req.eventUser || null,
  };
}

export async function getInternalOrderById(req, res) {
  const { id } = req.validated.params;

  const result = await getInternalOrderByIdService({
    actor: buildActor(req),
    orderId: id,
  });

  return sendSuccess(res, {
    data: result.order,

    meta: result.meta,
  });
}
export async function updateInternalOrderBuyer(req, res) {
  const { id } = req.validated.params;

  const result = await updateInternalOrderBuyerService({
    actor: buildActor(req),
    orderId: id,
    payload: req.validated.body,
  });

  return sendSuccess(res, {
    data: result.order,
    meta: result.meta,
  });
}
export async function resendInternalOrderMail(req, res) {
  const { id } = req.validated.params;
  const { type } = req.validated.body;

  const result = await resendInternalOrderMailService({
    actor: buildActor(req),
    orderId: id,
    type,
  });

  return sendSuccess(res, {
    data: result.order,
    meta: {
      ...result.meta,
      mailResend: result.mailResend,
    },
  });
}
export async function cancelInternalOrder(req, res) {
  const { id } = req.validated.params;
  const { reason } = req.validated.body;

  const result = await cancelInternalOrderService({
    actor: buildActor(req),

    orderId: id,

    reason: reason || null,
  });

  return sendSuccess(res, {
    data: result.order,

    meta: result.meta,
  });
}
export async function refundInternalOrder(req, res) {
  const { id } = req.validated.params;
  const { reason } = req.validated.body;

  const result = await refundInternalOrderService({
    actor: buildActor(req),

    orderId: id,

    reason: reason || null,
  });

  const refundExecution = result.refund || {};

  return sendSuccess(res, {
    data: result.order,

    meta: {
      ...result.meta,

      refundExecution: {
        skipped: Boolean(refundExecution.skipped),

        failed: Boolean(refundExecution.failed),

        reason: refundExecution.reason || null,

        alreadyRefundedDepositAmount: Number(
          refundExecution.alreadyRefundedDepositAmount || 0,
        ),

        remainingRefundAmount: Number(
          refundExecution.remainingRefundAmount || 0,
        ),

        providerRefundId:
          refundExecution.refund?.providerRefundId ||
          refundExecution.paymentRefund?.providerRefundId ||
          null,
      },
    },
  });
}
export async function listEventOrdersInternal(req, res) {
  const { eventId } = req.validated.params;
  const query = req.validated.query;

  const result = await listEventOrdersInternalService({
    actor: buildActor(req),
    eventId,
    page: query.page,
    limit: query.limit,
    status: query.status,
    paymentStatus: query.paymentStatus,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  return sendSuccess(res, {
    data: result.items,

    meta: result.meta,
  });
}

export async function createManualOrderForEvent(req, res) {
  const { eventId } = req.validated.params;

  const payload = req.validated.body;

  const contract = await createManualOrderForEventService({
    actor: buildActor(req),

    eventId,

    payload,
  });

  return sendSuccess(res, {
    status: 201,

    data: contract.data,

    meta: contract.meta,
  });
}
