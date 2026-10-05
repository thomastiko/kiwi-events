import { describe, expect, it } from "vitest";

import {
  buildOrderBuyerSnapshot,
  getOrderBuyerRecipient,
  getOrderBuyerSnapshot,
} from "../../../src/modules/orders/order.buyerSnapshot.js";

describe("order buyer snapshot", () => {
  it("builds the canonical normalized buyer snapshot", () => {
    expect(
      buildOrderBuyerSnapshot({
        email: "  BUYER@Example.COM ",
        firstName: " Ada ",
        lastName: " Lovelace ",
      }),
    ).toEqual({
      buyerEmailSnapshot: "buyer@example.com",
      buyerFirstNameSnapshot: "Ada",
      buyerLastNameSnapshot: "Lovelace",
      buyerDisplayNameSnapshot: "Ada Lovelace",
    });
  });

  it("uses an explicit display name when provided", () => {
    expect(
      buildOrderBuyerSnapshot({
        email: "buyer@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        displayName: "Countess Ada",
      }),
    ).toMatchObject({
      buyerDisplayNameSnapshot: "Countess Ada",
    });
  });

  it("reads only canonical buyer snapshot fields", () => {
    const order = {
      buyerEmailSnapshot: "CURRENT@EXAMPLE.COM",
      buyerFirstNameSnapshot: "Current",
      buyerLastNameSnapshot: "Buyer",
      buyerDisplayNameSnapshot: "",

      guestEmailSnapshot: "legacy@example.com",
      guestFirstNameSnapshot: "Legacy",

      customer: {
        emailSnapshot: "customer-legacy@example.com",
        firstNameSnapshot: "Customer Legacy",
      },
    };

    expect(getOrderBuyerSnapshot(order)).toEqual({
      email: "current@example.com",
      firstName: "Current",
      lastName: "Buyer",
      displayName: "Current Buyer",
    });

    expect(getOrderBuyerRecipient(order)).toEqual({
      email: "current@example.com",
      name: "Current Buyer",
    });
  });

  it("returns a null recipient email when the canonical snapshot is empty", () => {
    expect(
      getOrderBuyerRecipient({
        buyerEmailSnapshot: "",
        buyerFirstNameSnapshot: "",
        buyerLastNameSnapshot: "",
        buyerDisplayNameSnapshot: "",
      }),
    ).toEqual({
      email: null,
      name: "",
    });
  });
});
