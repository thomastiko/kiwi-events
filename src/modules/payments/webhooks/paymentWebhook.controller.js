import { sendSuccess } from "../../../core/http/response.js";
import { handlePaymentWebhookService } from "../../orders/public/order.public.service.js";

export async function handlePaymentWebhook(req, res) {
  await handlePaymentWebhookService({
    provider: req.validated.params.provider,
    body: req.body,
    headers: req.headers,
    rawBody: req.rawBody,
  });

  return sendSuccess(res, {
    data: null,
  });
}
