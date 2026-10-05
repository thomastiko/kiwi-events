import { afterEach, describe, expect, it, vi } from "vitest";

let listEventImageAssetsServiceMock;
let deleteEventImageAssetServiceMock;
let getPublicMediaAssetFileServiceMock;

async function loadInternalMediaAssetController() {
  vi.resetModules();

  listEventImageAssetsServiceMock = vi.fn().mockResolvedValue([
    {
      id: "asset-1",

      kind: "event_image",

      folder: "media/events",
      key: "media/events/internal-hero.png",
      storageTarget: "local",

      filenameOriginal: "hero.png",
      mimeType: "image/png",
      size: 123,

      createdByEventUserId: "user-1",
      updatedByEventUserId: "user-1",

      isUsed: true,

      usedBy: [
        {
          eventId: "event-1",
          title: "Demo Event",
          slug: "demo-event",
          status: "published",
        },
      ],

      createdAt: new Date("2030-01-01T10:00:00.000Z"),

      updatedAt: new Date("2030-01-02T10:00:00.000Z"),
    },
  ]);

  deleteEventImageAssetServiceMock = vi.fn().mockResolvedValue({
    deleted: true,
  });

  vi.doMock(
    "../../../src/modules/mediaAssets/internal/mediaAsset.internal.service.js",
    () => ({
      listEventImageAssetsService: listEventImageAssetsServiceMock,
      deleteEventImageAssetService: deleteEventImageAssetServiceMock,
    }),
  );

  return import("../../../src/modules/mediaAssets/internal/mediaAsset.internal.controller.js");
}

async function loadPublicMediaAssetController() {
  vi.resetModules();

  getPublicMediaAssetFileServiceMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("image content"),
    contentType: "image/png",
    filename: "hero.png",
    cacheControl: "public, max-age=31536000, immutable",
    contentLength: Buffer.byteLength("image content"),
  });

  vi.doMock(
    "../../../src/modules/mediaAssets/public/mediaAsset.public.service.js",
    () => ({
      getPublicMediaAssetFileService: getPublicMediaAssetFileServiceMock,
    }),
  );

  return import("../../../src/modules/mediaAssets/public/mediaAsset.public.controller.js");
}

function createJsonResponseMock() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };

  return res;
}

function createSendResponseMock() {
  const headers = {};

  const res = {
    headers,
    setHeader: vi.fn((key, value) => {
      headers[key] = value;
    }),
    status: vi.fn(() => res),
    send: vi.fn(() => res),
  };

  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("mediaAsset.internal.controller", () => {
  it("lists event image assets", async () => {
    const { listEventImageAssetsHandler } =
      await loadInternalMediaAssetController();

    const res = createJsonResponseMock();

    await listEventImageAssetsHandler({}, res);

    expect(listEventImageAssetsServiceMock).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,

      data: [
        {
          id: "asset-1",

          kind: "event_image",

          fileUrl: "/api/public/media-assets/asset-1/file",

          filenameOriginal: "hero.png",
          mimeType: "image/png",
          size: 123,

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
        },
      ],
    });
  });

  it("deletes an event image asset using validated params", async () => {
    const { deleteEventImageAssetHandler } =
      await loadInternalMediaAssetController();

    const req = {
      validated: {
        params: {
          id: "asset-1",
        },
      },
    };

    const res = createJsonResponseMock();

    await deleteEventImageAssetHandler(req, res);

    expect(deleteEventImageAssetServiceMock).toHaveBeenCalledTimes(1);
    expect(deleteEventImageAssetServiceMock).toHaveBeenCalledWith("asset-1");

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        deleted: true,
      },
    });
  });
});

describe("mediaAsset.public.controller", () => {
  it("downloads a public media asset file and sets public image headers", async () => {
    const { downloadPublicMediaAssetFileHandler } =
      await loadPublicMediaAssetController();

    const req = {
      params: {
        id: "asset-1",
      },
    };

    const res = createSendResponseMock();

    await downloadPublicMediaAssetFileHandler(req, res);

    expect(getPublicMediaAssetFileServiceMock).toHaveBeenCalledTimes(1);
    expect(getPublicMediaAssetFileServiceMock).toHaveBeenCalledWith("asset-1");

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'inline; filename="hero.png"',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cross-Origin-Resource-Policy",
      "cross-origin",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "*",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Length",
      String(Buffer.byteLength("image content")),
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(Buffer.from("image content"));
  });

  it("sanitizes filenames in Content-Disposition header", async () => {
    getPublicMediaAssetFileServiceMock = vi.fn().mockResolvedValue({
      buffer: Buffer.from("image content"),
      contentType: "image/png",
      filename: 'bad"\r\nX-Injected: yes.png',
      cacheControl: null,
      contentLength: null,
    });

    vi.resetModules();

    vi.doMock(
      "../../../src/modules/mediaAssets/public/mediaAsset.public.service.js",
      () => ({
        getPublicMediaAssetFileService: getPublicMediaAssetFileServiceMock,
      }),
    );

    const { downloadPublicMediaAssetFileHandler } =
      await import("../../../src/modules/mediaAssets/public/mediaAsset.public.controller.js");

    const res = createSendResponseMock();

    await downloadPublicMediaAssetFileHandler(
      {
        params: {
          id: "asset-1",
        },
      },
      res,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'inline; filename="badX-Injected: yes.png"',
    );

    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Cache-Control",
      expect.anything(),
    );
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Content-Length",
      expect.anything(),
    );
  });
});
