import { describe, expect, it } from "vitest";

import {
  toAdminDiscountCodeDto,
  toAdminDiscountCodeGroupDto,
} from "../../../src/modules/discountCodes/discountCode.dto.js";

const IDS = {
  event: "64f000000000000000000001",
  group: "64f000000000000000000002",
  code: "64f000000000000000000003",
};

const CREATED_AT = "2030-06-01T10:00:00.000Z";
const UPDATED_AT = "2030-06-01T11:00:00.000Z";

function buildGroup(overrides = {}) {
  return {
    id: IDS.group,
    eventId: IDS.event,
    name: "Partner",
    discountPercent: 15,
    isActive: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildCode(overrides = {}) {
  return {
    id: IDS.code,
    eventId: IDS.event,
    groupId: IDS.group,
    code: "PARTNER15",
    isActive: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe("discount code DTO contract", () => {
  it("serializes the canonical admin discount code group contract", () => {
    expect(toAdminDiscountCodeGroupDto(buildGroup())).toEqual({
      id: IDS.group,
      eventId: IDS.event,
      name: "Partner",
      discountPercent: 15,
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("serializes the canonical admin discount code contract", () => {
    expect(toAdminDiscountCodeDto(buildCode())).toEqual({
      id: IDS.code,
      eventId: IDS.event,
      groupId: IDS.group,
      code: "PARTNER15",
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("rejects missing required identifiers and strings", () => {
    expect(() =>
      toAdminDiscountCodeGroupDto(
        buildGroup({
          id: null,
        }),
      ),
    ).toThrow("Cannot serialize discount code data without id.");

    expect(() =>
      toAdminDiscountCodeGroupDto(
        buildGroup({
          name: "   ",
        }),
      ),
    ).toThrow("Cannot serialize discount code data without name.");

    expect(() =>
      toAdminDiscountCodeDto(
        buildCode({
          groupId: null,
        }),
      ),
    ).toThrow("Cannot serialize discount code data without groupId.");

    expect(() =>
      toAdminDiscountCodeDto(
        buildCode({
          code: "",
        }),
      ),
    ).toThrow("Cannot serialize discount code data without code.");
  });

  it.each([0, 101, 10.5, null, undefined])(
    "rejects invalid discountPercent value %s",
    (discountPercent) => {
      expect(() =>
        toAdminDiscountCodeGroupDto(
          buildGroup({
            discountPercent,
          }),
        ),
      ).toThrow("Cannot serialize an invalid discountPercent.");
    },
  );
});
