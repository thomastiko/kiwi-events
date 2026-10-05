import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

import { ORDER_BUYER_TYPE, ORDER_PAYMENT_PROVIDER } from "./order.constants.js";

import { toPublicOrderDto } from "./order.dto.js";

function requireApiId(value, fieldName) {
  const id = toApiId(value);

  if (id === null) {
    throw new TypeError(
      `Cannot serialize a checkout result without ${fieldName}.`,
    );
  }

  return id;
}

function requireApiDate(value, fieldName) {
  const date = toApiDate(value);

  if (date === null) {
    throw new TypeError(
      `Cannot serialize a checkout result without ${fieldName}.`,
    );
  }

  return date;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(
      `Cannot serialize a checkout result without ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeNullableString(value) {
  const normalized = String(value ?? "").trim();

  return normalized || null;
}

function normalizeBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Cannot serialize a checkout result without boolean ${fieldName}.`,
    );
  }

  return value;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(`Cannot serialize an invalid checkout ${fieldName}.`);
  }

  return normalized;
}

function normalizeCheckoutUrl(value) {
  const normalized = normalizeRequiredString(value, "checkout.checkoutUrl");

  let url;

  try {
    url = new URL(normalized);
  } catch {
    throw new TypeError("Cannot serialize an invalid checkout URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("Cannot serialize an invalid checkout URL.");
  }

  return url.toString();
}

function toPublicPaymentCheckoutDto(checkout, order) {
  if (!checkout) {
    return null;
  }

  if (order.payment.provider === ORDER_PAYMENT_PROVIDER.NONE) {
    throw new TypeError(
      "Cannot serialize a payment checkout for an order without a payment provider.",
    );
  }

  return {
    provider: order.payment.provider,

    url: normalizeCheckoutUrl(checkout.checkoutUrl),

    status: normalizeRequiredString(checkout.status, "checkout.status"),
  };
}

function toPublicGuestAccessDto(guestAccess, order) {
  if (!guestAccess) {
    return null;
  }

  if (order.buyer.type !== ORDER_BUYER_TYPE.GUEST) {
    throw new TypeError("Cannot serialize guest access for a non-guest order.");
  }

  const orderId = requireApiId(guestAccess.orderId, "guestAccess.orderId");

  if (orderId !== order.id) {
    throw new TypeError("Cannot serialize guest access for a different order.");
  }

  return {
    orderId,

    accessToken: normalizeRequiredString(
      guestAccess.token,
      "guestAccess.token",
    ),

    expiresAt: requireApiDate(guestAccess.expiresAt, "guestAccess.expiresAt"),
  };
}

function toPublicDocumentResultDto(documents) {
  if (!documents) {
    return null;
  }

  return {
    skipped: normalizeBoolean(documents.skipped, "documents.skipped"),

    reason: normalizeNullableString(documents.reason),

    generated: normalizeNonNegativeInteger(
      documents.generated ?? 0,
      "documents.generated",
    ),

    alreadyExisted: normalizeNonNegativeInteger(
      documents.alreadyExisted ?? 0,
      "documents.alreadyExisted",
    ),

    failed: normalizeNonNegativeInteger(
      documents.failed ?? 0,
      "documents.failed",
    ),
  };
}

function toPublicMailResultDto(mail) {
  if (!mail) {
    return null;
  }

  return {
    skipped: normalizeBoolean(mail.skipped, "mail.skipped"),

    reason: normalizeNullableString(mail.reason),
  };
}

export function toPublicCheckoutResultDto(result) {
  if (!result?.order) {
    throw new TypeError("Cannot serialize a checkout result without order.");
  }

  const order = toPublicOrderDto(result.order);

  const idempotencyReplayed = normalizeBoolean(
    result.idempotencyReplayed,
    "idempotencyReplayed",
  );

  const paymentInitializationFailed = normalizeBoolean(
    result.paymentInitializationFailed,
    "paymentInitializationFailed",
  );

  if (paymentInitializationFailed && result.checkout) {
    throw new TypeError(
      "Cannot serialize a failed payment initialization with an active checkout.",
    );
  }

  if (idempotencyReplayed && result.guestAccess) {
    throw new TypeError(
      "Cannot serialize a guest access token during idempotency replay.",
    );
  }

  return {
    data: {
      order,

      checkout: toPublicPaymentCheckoutDto(result.checkout, order),

      guestAccess: toPublicGuestAccessDto(result.guestAccess, order),
    },

    meta: {
      idempotencyReplayed,

      paymentInitializationFailed,

      message: normalizeNullableString(result.message),

      fulfillment: {
        documents: toPublicDocumentResultDto(result.documents),

        mail: toPublicMailResultDto(result.mail),
      },
    },
  };
}
