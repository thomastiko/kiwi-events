import { describe, expect, it } from "vitest";

import {
  calculatePercentageDiscountAmount,
  getDiscountableOrderSubtotal,
} from "../../../src/modules/orders/order.pricing.js";

function buildItem({
  lineTotal,
  ticketKindSnapshot = "normal",
  pricingModeSnapshot = "fixed",
}) {
  return {
    lineTotal,
    ticketKindSnapshot,
    pricingModeSnapshot,
  };
}

describe("order discount pricing", () => {
  it("discounts only normal fixed-price order lines", () => {
    const subtotal = getDiscountableOrderSubtotal([
      buildItem({
        lineTotal: 2500,
      }),
      buildItem({
        lineTotal: 1200,
        ticketKindSnapshot: "deposit",
      }),
      buildItem({
        lineTotal: 1800,
        pricingModeSnapshot: "donation",
      }),
      buildItem({
        lineTotal: 0,
        pricingModeSnapshot: "free",
      }),
      buildItem({
        lineTotal: 500,
      }),
    ]);

    expect(subtotal).toBe(3000);
  });

  it("returns zero when an order has no discountable lines", () => {
    expect(
      getDiscountableOrderSubtotal([
        buildItem({
          lineTotal: 1000,
          ticketKindSnapshot: "deposit",
        }),
        buildItem({
          lineTotal: 1500,
          pricingModeSnapshot: "donation",
        }),
      ]),
    ).toBe(0);
  });

  it("rejects malformed or overflowing discountable subtotals", () => {
    expect(() => getDiscountableOrderSubtotal(null)).toThrow(
      "Cannot calculate a discountable subtotal without order items.",
    );

    expect(() =>
      getDiscountableOrderSubtotal([
        buildItem({
          lineTotal: -1,
        }),
      ]),
    ).toThrow(
      "Cannot calculate a discount from an invalid order item line total.",
    );

    expect(() =>
      getDiscountableOrderSubtotal([
        buildItem({
          lineTotal: Number.MAX_SAFE_INTEGER,
        }),
        buildItem({
          lineTotal: 1,
        }),
      ]),
    ).toThrow(
      "Discountable order subtotal exceeds the supported integer range.",
    );
  });

  it.each([
    {
      amount: 5000,
      percent: 10,
      expected: 500,
    },
    {
      amount: 999,
      percent: 15,
      expected: 150,
    },
    {
      amount: 5,
      percent: 10,
      expected: 1,
    },
    {
      amount: 4,
      percent: 10,
      expected: 0,
    },
    {
      amount: 2500,
      percent: 100,
      expected: 2500,
    },
    {
      amount: 0,
      percent: 50,
      expected: 0,
    },
  ])(
    "calculates $percent% of $amount as $expected cents",
    ({ amount, percent, expected }) => {
      expect(
        calculatePercentageDiscountAmount({
          amount,
          discountPercent: percent,
        }),
      ).toBe(expected);
    },
  );

  it("rejects invalid percentage discount inputs", () => {
    for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        calculatePercentageDiscountAmount({
          amount,
          discountPercent: 10,
        }),
      ).toThrow("Discount base amount must be a non-negative safe integer.");
    }

    for (const discountPercent of [0, 101, 10.5]) {
      expect(() =>
        calculatePercentageDiscountAmount({
          amount: 1000,
          discountPercent,
        }),
      ).toThrow("Discount percent must be an integer between 1 and 100.");
    }
  });
});
