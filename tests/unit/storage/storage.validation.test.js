import { describe, expect, it } from "vitest";

import {
  optionalStorageTargetQuerySchema,
  storageTargetSchema,
} from "../../../src/modules/storage/storage.validation.js";

describe("storage validation", () => {
  it.each(["local", "public", "private"])(
    "accepts the %s storage target",
    (storageTarget) => {
      expect(storageTargetSchema.safeParse(storageTarget)).toMatchObject({
        success: true,
        data: storageTarget,
      });
    },
  );

  it("rejects unsupported storage targets", () => {
    const result = storageTargetSchema.safeParse("s3");

    expect(result.success).toBe(false);
  });

  it("allows an omitted storageTarget query", () => {
    expect(optionalStorageTargetQuerySchema.safeParse({})).toEqual({
      success: true,
      data: {},
    });
  });

  it("accepts an explicit storageTarget query", () => {
    expect(
      optionalStorageTargetQuerySchema.safeParse({
        storageTarget: "public",
      }),
    ).toEqual({
      success: true,
      data: {
        storageTarget: "public",
      },
    });
  });

  it("rejects unrelated query parameters", () => {
    const result = optionalStorageTargetQuerySchema.safeParse({
      storageTarget: "private",
      provider: "s3",
    });

    expect(result.success).toBe(false);
  });
});
