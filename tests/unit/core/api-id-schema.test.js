import { describe, expect, it } from "vitest";

import { apiIdSchema } from "../../../src/core/http/apiId.schema.js";

describe("API ID schema", () => {
  it("accepts MongoDB ObjectId strings", () => {
    expect(apiIdSchema.safeParse("64f000000000000000000001").success).toBe(
      true,
    );
  });

  it("accepts UUID strings used by SQL providers", () => {
    expect(
      apiIdSchema.safeParse("00000000-0000-4000-8000-000000000001").success,
    ).toBe(true);
  });

  it.each([
    "",
    " ",
    "not-an-id",
    "123",
    "64f00000000000000000000x",
    "00000000-0000-0000-0000-000000000000",
  ])("rejects invalid API id %j", (value) => {
    expect(apiIdSchema.safeParse(value).success).toBe(false);
  });
});
