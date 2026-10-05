import { AppError } from "../../core/errors/AppError.js";
import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
} from "../ticketTypes/ticketType.constants.js";
import { normalizeTicketTypePriceGross } from "../ticketTypes/ticketType.pricing.js";

const PRICING_MODE_VALUES = Object.values(TICKET_TYPE_PRICING_MODE);

function donationAmountRequiredError(fieldPath) {
  return AppError.badRequest("Donation tickets require a donation amount.", {
    code: "DONATION_AMOUNT_REQUIRED",
    title: "Donation amount required",
    action: "Choose a donation amount greater than 0.",
    fields: [
      {
        path: fieldPath,
        message: "A donation amount greater than 0 is required.",
      },
    ],
  });
}

function donationAmountInvalidError(fieldPath) {
  return AppError.badRequest("Donation amount must be a positive integer.", {
    code: "DONATION_AMOUNT_INVALID",
    title: "Invalid donation amount",
    action:
      "Send the donation amount as a positive integer in the smallest currency unit.",
    fields: [
      {
        path: fieldPath,
        message:
          "Donation amount must be a positive integer in the smallest currency unit.",
      },
    ],
  });
}

function donationAmountNotAllowedError(fieldPath) {
  return AppError.badRequest(
    "Donation amount is only allowed for donation tickets.",
    {
      code: "DONATION_AMOUNT_NOT_ALLOWED",
      title: "Donation amount not allowed",
      action: "Remove donationAmountGross or choose a donation ticket.",
      fields: [
        {
          path: fieldPath,
          message: "donationAmountGross is only allowed for donation tickets.",
        },
      ],
    },
  );
}

function normalizeDonationAmountGross(value, fieldPath) {
  if (value === undefined || value === null) {
    throw donationAmountRequiredError(fieldPath);
  }

  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw donationAmountInvalidError(fieldPath);
  }

  return amount;
}

export function resolveOrderItemPricing({
  ticketType,
  donationAmountGross,
  fieldPath = "body.items[].donationAmountGross",
}) {
  const pricingMode = String(ticketType?.pricingMode || "")
    .trim()
    .toLowerCase();

  if (!PRICING_MODE_VALUES.includes(pricingMode)) {
    throw new TypeError(
      "Cannot price an order item without a valid ticket pricing mode.",
    );
  }

  if (pricingMode === TICKET_TYPE_PRICING_MODE.FREE) {
    if (donationAmountGross !== undefined && donationAmountGross !== null) {
      throw donationAmountNotAllowedError(fieldPath);
    }

    return {
      pricingMode,
      unitPrice: 0,
    };
  }

  if (pricingMode === TICKET_TYPE_PRICING_MODE.FIXED) {
    if (donationAmountGross !== undefined && donationAmountGross !== null) {
      throw donationAmountNotAllowedError(fieldPath);
    }

    const unitPrice = normalizeTicketTypePriceGross(ticketType.priceGross);

    if (unitPrice <= 0) {
      throw new TypeError(
        "Cannot price a fixed ticket without a positive price.",
      );
    }

    return {
      pricingMode,
      unitPrice,
    };
  }

  return {
    pricingMode,
    unitPrice: normalizeDonationAmountGross(donationAmountGross, fieldPath),
  };
}
export function getDiscountableOrderSubtotal(items = []) {
  if (!Array.isArray(items)) {
    throw new TypeError(
      "Cannot calculate a discountable subtotal without order items.",
    );
  }

  let subtotal = 0;

  for (const item of items) {
    const lineTotal = Number(item?.lineTotal);

    if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) {
      throw new TypeError(
        "Cannot calculate a discount from an invalid order item line total.",
      );
    }

    const isDiscountable =
      item.ticketKindSnapshot === TICKET_TYPE_KIND.NORMAL &&
      item.pricingModeSnapshot === TICKET_TYPE_PRICING_MODE.FIXED;

    if (!isDiscountable) {
      continue;
    }

    subtotal += lineTotal;

    if (!Number.isSafeInteger(subtotal)) {
      throw new TypeError(
        "Discountable order subtotal exceeds the supported integer range.",
      );
    }
  }

  return subtotal;
}

export function calculatePercentageDiscountAmount({ amount, discountPercent }) {
  const normalizedAmount = Number(amount);
  const normalizedPercent = Number(discountPercent);

  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < 0) {
    throw new TypeError(
      "Discount base amount must be a non-negative safe integer.",
    );
  }

  if (
    !Number.isInteger(normalizedPercent) ||
    normalizedPercent < 1 ||
    normalizedPercent > 100
  ) {
    throw new TypeError(
      "Discount percent must be an integer between 1 and 100.",
    );
  }

  if (normalizedAmount === 0) {
    return 0;
  }

  const numerator = BigInt(normalizedAmount) * BigInt(normalizedPercent);

  const discount = (numerator + 50n) / 100n;

  return Number(discount);
}
