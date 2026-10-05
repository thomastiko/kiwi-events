export function toApiId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized || normalized === "[object Object]") {
    throw new TypeError("Cannot serialize an invalid API id.");
  }

  return normalized;
}

export function toApiDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const normalized = value.trim();

    const isIsoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(
      normalized,
    );

    const hasExplicitTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);

    if (!isIsoDateTime || !hasExplicitTimezone) {
      throw new TypeError(
        "Cannot serialize an API date without an explicit timezone.",
      );
    }

    date = new Date(normalized);
  } else {
    throw new TypeError("Cannot serialize an invalid API date.");
  }

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Cannot serialize an invalid API date.");
  }

  return date.toISOString();
}
