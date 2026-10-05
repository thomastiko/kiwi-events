import { TICKET_TYPE_STATUS } from "./ticketType.constants.js";

function normalizeInteger(
  value,
  fieldName,
  { nullable = false, minimum = 0 } = {},
) {
  if (value === null || value === undefined) {
    if (nullable) {
      return null;
    }

    throw new TypeError(
      `Cannot derive ticket type availability without ${fieldName}.`,
    );
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < minimum) {
    throw new TypeError(
      `Cannot derive ticket type availability from invalid ${fieldName}.`,
    );
  }

  return normalized;
}

function normalizeDate(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(
      `Cannot derive ticket type availability from invalid ${fieldName}.`,
    );
  }

  return date;
}

function normalizeNow(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(
      "Cannot derive ticket type availability from an invalid current date.",
    );
  }

  return date;
}

export function getTicketTypeAvailability(
  ticketType,
  { now = new Date() } = {},
) {
  if (!ticketType) {
    throw new TypeError(
      "Cannot derive availability for a missing ticket type.",
    );
  }

  const currentDate = normalizeNow(now);

  const stockTotal = normalizeInteger(ticketType.stockTotal, "stockTotal", {
    nullable: true,
  });

  const stockSold = normalizeInteger(ticketType.stockSold, "stockSold");

  if (stockTotal !== null && stockSold > stockTotal) {
    throw new TypeError(
      "Cannot derive ticket type availability when stockSold exceeds stockTotal.",
    );
  }

  const stockRemaining = stockTotal === null ? null : stockTotal - stockSold;

  const isSoldOut =
    ticketType.status === TICKET_TYPE_STATUS.SOLD_OUT || stockRemaining === 0;

  const salesStartAt = normalizeDate(ticketType.salesStartAt, "salesStartAt");

  const salesEndAt = normalizeDate(ticketType.salesEndAt, "salesEndAt");

  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new TypeError(
      "Cannot derive ticket type availability from an invalid sales window.",
    );
  }

  const hasStarted = !salesStartAt || currentDate >= salesStartAt;

  const hasNotEnded = !salesEndAt || currentDate <= salesEndAt;

  const isSalesOpen =
    ticketType.status === TICKET_TYPE_STATUS.ACTIVE &&
    !isSoldOut &&
    hasStarted &&
    hasNotEnded;

  return {
    stockTotal,
    stockSold,
    stockRemaining,
    isSoldOut,
    isSalesOpen,
  };
}
