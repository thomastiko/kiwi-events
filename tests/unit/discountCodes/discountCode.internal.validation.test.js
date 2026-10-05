import { describe, expect, it } from "vitest";

import {
  createDiscountCodeGroupSchema,
  createDiscountCodesSchema,
  listDiscountCodeGroupsSchema,
  updateDiscountCodeGroupSchema,
  updateDiscountCodeSchema,
} from "../../../src/modules/discountCodes/internal/discountCode.internal.validation.js";

const IDS = {
  event: "64f000000000000000000001",
  group: "64f000000000000000000002",
  code: "64f000000000000000000003",
};

function emptyRequestParts() {
  return {
    params: {},
    query: {},
  };
}

describe("discount code internal validation", () => {
  it("accepts valid group list/create/update payloads", () => {
    expect(
      listDiscountCodeGroupsSchema.safeParse({
        body: {},
        params: {},
        query: {
          eventId: IDS.event,
        },
      }).success,
    ).toBe(true);

    const createResult = createDiscountCodeGroupSchema.safeParse({
      body: {
        eventId: IDS.event,
        name: "  Partner  ",
        discountPercent: 15,
        isActive: true,
      },
      ...emptyRequestParts(),
    });

    expect(createResult.success).toBe(true);
    expect(createResult.data.body.name).toBe("Partner");

    expect(
      updateDiscountCodeGroupSchema.safeParse({
        body: {
          name: "Updated",
          discountPercent: 25,
          isActive: false,
        },
        params: {
          groupId: IDS.group,
        },
        query: {},
      }).success,
    ).toBe(true);
  });

  it.each([0, 101, 12.5])(
    "rejects invalid group discount percentage %s",
    (discountPercent) => {
      expect(
        createDiscountCodeGroupSchema.safeParse({
          body: {
            eventId: IDS.event,
            name: "Partner",
            discountPercent,
          },
          ...emptyRequestParts(),
        }).success,
      ).toBe(false);
    },
  );

  it("requires at least one field for group and code updates and keeps ownership immutable", () => {
    expect(
      updateDiscountCodeGroupSchema.safeParse({
        body: {},
        params: {
          groupId: IDS.group,
        },
        query: {},
      }).success,
    ).toBe(false);

    expect(
      updateDiscountCodeGroupSchema.safeParse({
        body: {
          eventId: IDS.event,
        },
        params: {
          groupId: IDS.group,
        },
        query: {},
      }).success,
    ).toBe(false);

    expect(
      updateDiscountCodeSchema.safeParse({
        body: {},
        params: {
          codeId: IDS.code,
        },
        query: {},
      }).success,
    ).toBe(false);

    expect(
      updateDiscountCodeSchema.safeParse({
        body: {
          groupId: IDS.group,
        },
        params: {
          codeId: IDS.code,
        },
        query: {},
      }).success,
    ).toBe(false);
  });

  it("accepts either supplied codes or generateCount", () => {
    const suppliedCodes = createDiscountCodesSchema.safeParse({
      body: {
        codes: ["partner-10", "VIP_20"],
      },
      params: {
        groupId: IDS.group,
      },
      query: {},
    });

    expect(suppliedCodes.success).toBe(true);

    const generatedCodes = createDiscountCodesSchema.safeParse({
      body: {
        generateCount: 4,
      },
      params: {
        groupId: IDS.group,
      },
      query: {},
    });

    expect(generatedCodes.success).toBe(true);
  });

  it("rejects missing or conflicting code creation modes", () => {
    for (const body of [
      {},
      {
        codes: ["PARTNER10"],
        generateCount: 2,
      },
    ]) {
      expect(
        createDiscountCodesSchema.safeParse({
          body,
          params: {
            groupId: IDS.group,
          },
          query: {},
        }).success,
      ).toBe(false);
    }
  });

  it("enforces code syntax and generation limits", () => {
    for (const code of ["contains space", "bad/code", "äöü", ""]) {
      expect(
        createDiscountCodesSchema.safeParse({
          body: {
            codes: [code],
          },
          params: {
            groupId: IDS.group,
          },
          query: {},
        }).success,
      ).toBe(false);
    }

    for (const generateCount of [0, 1001, 1.5]) {
      expect(
        createDiscountCodesSchema.safeParse({
          body: {
            generateCount,
          },
          params: {
            groupId: IDS.group,
          },
          query: {},
        }).success,
      ).toBe(false);
    }
  });
});
