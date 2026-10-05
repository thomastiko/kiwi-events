import {
  ticketTypeStockInvalidError,
  ticketTypeStockTotalBelowSoldError,
} from "./ticketType.errors.js";

export function normalizeTicketTypeStockTotal(
  value,
  { field = "stockTotal" } = {},
) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const stockTotal = Number(value);

  if (!Number.isSafeInteger(stockTotal) || stockTotal < 0) {
    throw ticketTypeStockInvalidError({
      field,
      value,
    });
  }

  return stockTotal;
}

export function normalizeTicketTypeStockSold(
  value,
  { field = "stockSold" } = {},
) {
  const stockSold = Number(value ?? 0);

  if (!Number.isSafeInteger(stockSold) || stockSold < 0) {
    throw ticketTypeStockInvalidError({
      field,
      value,
    });
  }

  return stockSold;
}

export function assertTicketTypeStockIsValid({
  stockTotal,
  stockSold,
  field = "stockTotal",
}) {
  const normalizedStockTotal = normalizeTicketTypeStockTotal(stockTotal, {
    field,
  });

  const normalizedStockSold = normalizeTicketTypeStockSold(stockSold, {
    field: "stockSold",
  });

  if (
    normalizedStockTotal !== null &&
    normalizedStockTotal < normalizedStockSold
  ) {
    throw ticketTypeStockTotalBelowSoldError({
      stockTotal: normalizedStockTotal,
      stockSold: normalizedStockSold,
      field,
    });
  }

  return {
    stockTotal: normalizedStockTotal,
    stockSold: normalizedStockSold,
  };
}
