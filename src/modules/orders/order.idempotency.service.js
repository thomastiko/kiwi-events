import crypto from "node:crypto";

import {
  checkoutIdempotencyKeyInvalidError,
  checkoutIdempotencyKeyRequiredError,
  checkoutIdempotencyScopeUnavailableError,
} from "./order.errors.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/;

function cleanString(value) {
  return String(value || "").trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export function normalizeCheckoutIdempotencyKey(value) {
  const normalizedKey = cleanString(value);

  if (!normalizedKey) {
    throw checkoutIdempotencyKeyRequiredError();
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(normalizedKey)) {
    throw checkoutIdempotencyKeyInvalidError();
  }

  return normalizedKey;
}

export function buildCheckoutIdempotencyScope(actor = {}) {
  const externalProvider = cleanString(actor.externalProvider).toLowerCase();

  const externalUserId = cleanString(actor.externalUserId);

  if (actor.isHostService) {
    const hostServiceId = cleanString(actor.hostServiceId);

    if (externalProvider && hostServiceId) {
      return ["host-service", externalProvider, hostServiceId].join(":");
    }

    throw checkoutIdempotencyScopeUnavailableError();
  }

  if (externalProvider && externalUserId) {
    return ["external-user", externalProvider, externalUserId].join(":");
  }

  throw checkoutIdempotencyScopeUnavailableError();
}

export function buildCheckoutIdempotencyRequestHash(payload) {
  const canonicalPayload = canonicalize(payload);

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalPayload), "utf8")
    .digest("hex");
}

export function buildCheckoutIdempotencyContext({ actor, key, payload }) {
  return {
    scope: buildCheckoutIdempotencyScope(actor),
    key: normalizeCheckoutIdempotencyKey(key),
    requestHash: buildCheckoutIdempotencyRequestHash(payload),
  };
}
