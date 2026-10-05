function requiredString(value, field) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`Guest access recovery DTO requires "${field}".`);
  }

  return normalized;
}

function requiredDate(value, field) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Guest access recovery DTO requires valid "${field}".`);
  }

  return date.toISOString();
}

export function toGuestAccessRecoveryDto(result) {
  const guestAccess = result?.guestAccess;

  if (!guestAccess) {
    throw new TypeError("Guest access recovery DTO requires guestAccess.");
  }

  return {
    orderId: requiredString(guestAccess.orderId, "guestAccess.orderId"),

    accessToken: requiredString(guestAccess.token, "guestAccess.token"),

    expiresAt: requiredDate(guestAccess.expiresAt, "guestAccess.expiresAt"),
  };
}
