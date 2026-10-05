// src/modules/orders/order.guestAccess.service.js

import crypto from "node:crypto";
import { rotateGuestAccessTokenForOrder } from "./repositories/order.repository.js";
import {
  guestAccessIssuanceFailedError,
  guestAccessWindowExpiredError,
} from "./order.errors.js";
const TOKEN_BYTES = 32;

export function createGuestAccessToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashGuestAccessToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

export function getGuestAccessExpiryDate(order) {
  const eventStartsAt = order?.eventStartsAtSnapshot
    ? new Date(order.eventStartsAtSnapshot)
    : null;

  if (eventStartsAt && !Number.isNaN(eventStartsAt.getTime())) {
    return new Date(eventStartsAt.getTime() + 24 * 60 * 60 * 1000);
  }

  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
export async function issueGuestAccessForOrderService(order) {
  if (!order?.id) {
    throw new TypeError("Guest access issuance requires an order.");
  }

  const expiresAt = getGuestAccessExpiryDate(order);

  if (expiresAt.getTime() <= Date.now()) {
    throw guestAccessWindowExpiredError(order.id, expiresAt);
  }

  const token = createGuestAccessToken();
  const tokenHash = hashGuestAccessToken(token);

  const updatedOrder = await rotateGuestAccessTokenForOrder(
    {
      orderId: order.id,
      hostServiceProvider: order.hostServiceProvider,
      hostServiceId: order.hostServiceId,
      tokenHash,
      expiresAt,
    },
    {
      lean: true,
    },
  );

  if (!updatedOrder) {
    throw guestAccessIssuanceFailedError(order.id);
  }

  return {
    order: updatedOrder,

    guestAccess: {
      orderId: updatedOrder.id,
      token,
      expiresAt,
    },
  };
}
