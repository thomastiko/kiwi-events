import { env } from "../../config/env.js";
import { features } from "../../config/features.js";
import { AppError } from "../../core/errors/AppError.js";
import { PAYMENT_PROVIDERS } from "../payments/payment.constants.js";

import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
} from "./ticketType.constants.js";
import { ticketTypeFeatureDisabledError } from "./ticketType.errors.js";

export function normalizeTicketTypePriceGross(value) {
  const priceGross = Number(value ?? 0);

  if (!Number.isSafeInteger(priceGross) || priceGross < 0) {
    throw AppError.badRequest("priceGross must be a non-negative integer.", {
      code: "TICKET_TYPE_PRICE_GROSS_INVALID",
      title: "Invalid ticket price",
      action:
        "Send priceGross as a non-negative integer in the smallest currency unit, for example cents for EUR.",
      fields: [
        {
          path: "body.priceGross",
          message:
            "priceGross must be a non-negative integer in the smallest currency unit.",
        },
      ],
    });
  }

  return priceGross;
}
export function normalizeTicketTypePricing({ pricingMode, priceGross }) {
  const normalizedPricingMode = String(pricingMode || "")
    .trim()
    .toLowerCase();

  if (
    !Object.values(TICKET_TYPE_PRICING_MODE).includes(normalizedPricingMode)
  ) {
    throw AppError.badRequest("Invalid ticket pricing mode.", {
      code: "TICKET_TYPE_PRICING_MODE_INVALID",
      title: "Invalid ticket pricing mode",
      action: "Choose free, fixed or donation as pricingMode.",
      fields: [
        {
          path: "body.pricingMode",
          message: "pricingMode must be free, fixed or donation.",
        },
      ],
    });
  }

  const normalizedPriceGross = normalizeTicketTypePriceGross(priceGross);

  if (
    normalizedPricingMode === TICKET_TYPE_PRICING_MODE.FREE &&
    normalizedPriceGross !== 0
  ) {
    throw AppError.badRequest("Free tickets must have a price of 0.", {
      code: "FREE_TICKET_PRICE_INVALID",
      title: "Invalid free ticket price",
      action: "Set priceGross to 0 for free tickets.",
      fields: [
        {
          path: "body.priceGross",
          message: "Free tickets must have priceGross 0.",
        },
      ],
    });
  }

  if (
    normalizedPricingMode === TICKET_TYPE_PRICING_MODE.FIXED &&
    normalizedPriceGross <= 0
  ) {
    throw AppError.badRequest("Fixed-price tickets require a positive price.", {
      code: "FIXED_TICKET_PRICE_REQUIRED",
      title: "Ticket price required",
      action: "Set priceGross to a value greater than 0.",
      fields: [
        {
          path: "body.priceGross",
          message: "Fixed-price tickets require priceGross greater than 0.",
        },
      ],
    });
  }

  if (
    normalizedPricingMode === TICKET_TYPE_PRICING_MODE.DONATION &&
    normalizedPriceGross !== 0
  ) {
    throw AppError.badRequest(
      "Donation tickets must not define a fixed price.",
      {
        code: "DONATION_TICKET_FIXED_PRICE_NOT_ALLOWED",
        title: "Invalid donation ticket price",
        action:
          "Set priceGross to 0. The donation amount is chosen during checkout.",
        fields: [
          {
            path: "body.priceGross",
            message: "Donation tickets must have priceGross 0.",
          },
        ],
      },
    );
  }

  return {
    pricingMode: normalizedPricingMode,
    priceGross: normalizedPriceGross,
  };
}
export function assertTicketTypePricingAllowed({
  ticketKind,
  pricingMode,
  priceGross,
}) {
  const numericPriceGross = normalizeTicketTypePriceGross(priceGross);

  if (
    ticketKind === TICKET_TYPE_KIND.DEPOSIT &&
    pricingMode !== TICKET_TYPE_PRICING_MODE.FIXED
  ) {
    throw AppError.badRequest("Deposit tickets require fixed pricing.", {
      code: "DEPOSIT_TICKET_PRICING_MODE_INVALID",
      title: "Invalid deposit ticket pricing",
      action: "Use pricingMode fixed for deposit tickets.",
      fields: [
        {
          path: "body.pricingMode",
          message: "Deposit tickets require fixed pricing.",
        },
      ],
    });
  }
  if (ticketKind !== TICKET_TYPE_KIND.DEPOSIT) {
    return;
  }

  if (!features.depositTickets) {
    throw ticketTypeFeatureDisabledError({
      code: "DEPOSIT_TICKETS_DISABLED",
      message: "Deposit tickets are not enabled.",
      featureName: "depositTickets",
      field: "ticketKind",
    });
  }

  if (numericPriceGross <= 0) {
    throw AppError.badRequest(
      "Deposit tickets require a positive ticket price.",
      {
        code: "DEPOSIT_TICKET_PRICE_REQUIRED",
        title: "Deposit ticket price required",
        action: "Set a price greater than 0 for deposit tickets.",
        fields: [
          {
            path: "body.priceGross",
            message: "Deposit tickets require a price greater than 0.",
          },
        ],
      },
    );
  }

  const paymentProvider = env.payments?.provider || PAYMENT_PROVIDERS.DISABLED;

  if (paymentProvider === PAYMENT_PROVIDERS.DISABLED) {
    throw AppError.badRequest(
      "Deposit tickets require an active payment provider.",
      {
        code: "DEPOSIT_TICKET_PAYMENT_PROVIDER_REQUIRED",
        title: "Payment provider required",
        action: "Configure Mollie or Stripe before creating deposit tickets.",
        fields: [
          {
            path: "body.ticketKind",
            message: "Deposit tickets require an active payment provider.",
          },
        ],
      },
    );
  }
}
