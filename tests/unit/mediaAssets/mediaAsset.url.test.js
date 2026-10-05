import { afterEach, describe, expect, it, vi } from "vitest";

async function loadUrlModule(publicBaseUrl = "https://assets.example.test/") {
  vi.resetModules();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      storage: {
        public: {
          publicBaseUrl,
        },
      },
    },
  }));

  return import("../../../src/modules/mediaAssets/mediaAsset.url.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("mediaAsset.url", () => {
  it("builds a direct public URL for public storage", async () => {
    const { getMediaAssetFileUrl } = await loadUrlModule();

    expect(
      getMediaAssetFileUrl({
        id: "asset-1",
        storageTarget: "public",
        key: "media/events/My Hero #1.png",
      }),
    ).toBe("https://assets.example.test/media/events/My%20Hero%20%231.png");
  });

  it.each(["local", "private"])(
    "keeps %s assets behind the Kiwi media endpoint",
    async (storageTarget) => {
      const { getMediaAssetFileUrl } = await loadUrlModule();

      expect(
        getMediaAssetFileUrl({
          id: "asset id/1",
          storageTarget,
          key: "media/events/file.png",
        }),
      ).toBe("/api/public/media-assets/asset%20id%2F1/file");
    },
  );

  it("requires a public base URL for public assets", async () => {
    const { getMediaAssetFileUrl } = await loadUrlModule("");

    expect(() =>
      getMediaAssetFileUrl({
        id: "asset-1",
        storageTarget: "public",
        key: "media/events/file.png",
      }),
    ).toThrow(/public storage base URL/i);
  });

  it("rejects missing or unsupported storage targets", async () => {
    const { getMediaAssetFileUrl } = await loadUrlModule();

    expect(() =>
      getMediaAssetFileUrl({
        id: "asset-1",
        key: "media/events/file.png",
      }),
    ).toThrow(/storageTarget/i);

    expect(() =>
      getMediaAssetFileUrl({
        id: "asset-1",
        storageTarget: "s3",
        key: "media/events/file.png",
      }),
    ).toThrow(/unsupported storage target/i);
  });
});
