import { z } from "zod";

import { PAYMENT_PROVIDERS } from "../payment.constants.js";

const paymentWebhookProviderSchema = z.enum([
  PAYMENT_PROVIDERS.MOLLIE,
  PAYMENT_PROVIDERS.STRIPE,
]);

export const paymentWebhookSchema = z.object({
  body: z.unknown(),
  params: z
    .object({
      provider: paymentWebhookProviderSchema,
    })
    .strict(),
  query: z.object({}).strict(),
});
