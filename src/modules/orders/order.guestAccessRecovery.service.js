import { findGuestOrderForRecovery } from "./repositories/order.repository.js";
import { issueGuestAccessForOrderService } from "./order.guestAccess.service.js";
import {
  guestAccessRecoveryHostServiceRequiredError,
  guestAccessRecoveryNotFoundError,
} from "./order.errors.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function cleanEmail(value) {
  return cleanString(value).toLowerCase();
}

export async function reissueGuestAccessService({ actor, orderNumber, email }) {
  const hostServiceProvider = cleanString(actor?.externalProvider);
  const hostServiceId = cleanString(actor?.hostServiceId);

  if (!actor?.isHostService || !hostServiceProvider || !hostServiceId) {
    throw guestAccessRecoveryHostServiceRequiredError();
  }

  const order = await findGuestOrderForRecovery(
    {
      orderNumber: cleanString(orderNumber),
      email: cleanEmail(email),
      hostServiceProvider,
      hostServiceId,
    },
    {
      lean: true,
    },
  );

  if (!order) {
    throw guestAccessRecoveryNotFoundError();
  }

  return issueGuestAccessForOrderService(order);
}
