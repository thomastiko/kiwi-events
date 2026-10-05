import { describe, expect, it } from "vitest";

import { toMediaAssetDto } from "../../../src/modules/mediaAssets/mediaAsset.dto.js";

describe("MediaAssetDto contract", () => {
  it("serializes a canonical media asset without storage internals", () => {
    const result = toMediaAssetDto({
      id: "asset-1",

      kind: "event_image",

      folder: "media/events",
      key: "media/events/secret-storage-key.png",
      storageTarget: "local",

      filenameOriginal: "hero.png",
      mimeType: "image/png",
      size: 12345,

      createdByEventUserId: "user-1",
      updatedByEventUserId: "user-2",

      isUsed: true,

      usedBy: [
        {
          eventId: "event-1",
          title: "Demo Event",
          slug: "demo-event",
          status: "published",

          _id: "must-not-leak",
          internalOnly: true,
        },
      ],

      createdAt: new Date("2030-01-01T10:00:00.000Z"),

      updatedAt: new Date("2030-01-02T10:00:00.000Z"),

      _id: "must-not-leak",
      __v: 4,
      internalOnly: true,
    });

    expect(result).toEqual({
      id: "asset-1",

      kind: "event_image",

      fileUrl: "/api/public/media-assets/asset-1/file",

      filenameOriginal: "hero.png",
      mimeType: "image/png",
      size: 12345,

      isUsed: true,

      usedBy: [
        {
          eventId: "event-1",
          title: "Demo Event",
          slug: "demo-event",
          status: "published",
        },
      ],

      createdAt: "2030-01-01T10:00:00.000Z",
      updatedAt: "2030-01-02T10:00:00.000Z",
    });

    expect(result).not.toHaveProperty("folder");
    expect(result).not.toHaveProperty("key");
    expect(result).not.toHaveProperty("storageTarget");

    expect(result).not.toHaveProperty("createdByEventUserId");

    expect(result).not.toHaveProperty("updatedByEventUserId");

    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("__v");
  });

  it("serializes an unused media asset", () => {
    const result = toMediaAssetDto({
      id: "asset-2",

      kind: "event_image",

      key: "media/events/unused.png",
      storageTarget: "local",

      filenameOriginal: "unused.png",
      mimeType: "image/png",
      size: 42,

      isUsed: false,
      usedBy: [],

      createdAt: new Date("2030-01-01T10:00:00.000Z"),

      updatedAt: new Date("2030-01-01T10:00:00.000Z"),
    });

    expect(result.isUsed).toBe(false);
    expect(result.usedBy).toEqual([]);
  });

  it("does not fall back to MongoDB _id", () => {
    expect(() =>
      toMediaAssetDto({
        _id: "64f000000000000000000001",

        kind: "event_image",

        filenameOriginal: "hero.png",
        mimeType: "image/png",
        size: 10,

        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toThrow(/without id/i);
  });
});
