import { afterEach, describe, expect, it, vi } from "vitest";

let addImagesToEventServiceMock;
let removeImageFromEventServiceMock;

async function loadEventInternalController() {
  vi.resetModules();

  addImagesToEventServiceMock = vi.fn().mockResolvedValue({
    id: "event-1",
    title: "Demo Event",
    slug: "demo-event",
    imageAssetIds: ["asset-1", "asset-2"],
    imageAssets: [
      {
        id: "asset-1",
        filenameOriginal: "hero.png",
        fileUrl: "/api/public/media-assets/asset-1/file",
      },
      {
        id: "asset-2",
        filenameOriginal: "gallery.png",
        fileUrl: "/api/public/media-assets/asset-2/file",
      },
    ],
  });

  removeImageFromEventServiceMock = vi.fn().mockResolvedValue({
    id: "event-1",
    title: "Demo Event",
    slug: "demo-event",
    imageAssetIds: ["asset-2"],
    imageAssets: [
      {
        id: "asset-2",
        filenameOriginal: "gallery.png",
        fileUrl: "/api/public/media-assets/asset-2/file",
      },
    ],
  });

  vi.doMock(
    "../../../src/modules/events/internal/event.internal.service.js",
    () => ({
      addImagesToEventService: addImagesToEventServiceMock,
      removeImageFromEventService: removeImageFromEventServiceMock,
      archiveEventService: vi.fn(),
      cancelEventService: vi.fn(),
      createEventService: vi.fn(),
      deleteEventService: vi.fn(),
      featureEventService: vi.fn(),
      getEventByIdService: vi.fn(),
      listEventsService: vi.fn(),
      publishEventService: vi.fn(),
      updateEventService: vi.fn(),
    }),
  );

  vi.doMock(
    "../../../src/modules/events/internal/event.refund.service.js",
    () => ({
      getEventRefundPreviewService: vi.fn(),
      cancelEventAndRefundOrdersService: vi.fn(),
    }),
  );

  return import("../../../src/modules/events/internal/event.internal.controller.js");
}

function createJsonResponseMock() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };

  return res;
}

function buildEventUser(overrides = {}) {
  return {
    id: "6a0000000000000000000001",
    emailSnapshot: "admin@example.com",
    role: "event_admin",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("event image handlers", () => {
  it("uploads images to an event using req.files.image and req.files.images", async () => {
    const { uploadEventImages } = await loadEventInternalController();

    const imageFile = {
      originalname: "hero.png",
      mimetype: "image/png",
      buffer: Buffer.from("hero"),
      size: 4,
    };

    const imagesFile = {
      originalname: "gallery.png",
      mimetype: "image/png",
      buffer: Buffer.from("gallery"),
      size: 7,
    };

    const eventUser = buildEventUser();

    const req = {
      validated: {
        params: {
          id: "event-1",
        },
        query: {
          storageTarget: "public",
        },
      },
      files: {
        image: [imageFile],
        images: [imagesFile],
      },
      eventUser,
    };

    const res = createJsonResponseMock();

    await uploadEventImages(req, res);

    expect(addImagesToEventServiceMock).toHaveBeenCalledTimes(1);
    expect(addImagesToEventServiceMock).toHaveBeenCalledWith(
      "event-1",
      [imageFile, imagesFile],
      {
        eventUserId: "6a0000000000000000000001",
        eventUser,
      },
      {
        storageTarget: "public",
        updatedByEventUserId: "6a0000000000000000000001",
      },
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        id: "event-1",
        title: "Demo Event",
        slug: "demo-event",
        imageAssetIds: ["asset-1", "asset-2"],
        imageAssets: [
          {
            id: "asset-1",
            filenameOriginal: "hero.png",
            fileUrl: "/api/public/media-assets/asset-1/file",
          },
          {
            id: "asset-2",
            filenameOriginal: "gallery.png",
            fileUrl: "/api/public/media-assets/asset-2/file",
          },
        ],
      },
    });
  });

  it("uploads one image to an event using req.file fallback", async () => {
    const { uploadEventImages } = await loadEventInternalController();

    const file = {
      originalname: "single.png",
      mimetype: "image/png",
      buffer: Buffer.from("single"),
      size: 6,
    };

    const eventUser = buildEventUser({
      id: "6a0000000000000000000002",
    });

    const req = {
      validated: {
        params: {
          id: "event-1",
        },
        query: {},
      },
      file,
      eventUser,
    };

    const res = createJsonResponseMock();

    await uploadEventImages(req, res);

    expect(addImagesToEventServiceMock).toHaveBeenCalledWith(
      "event-1",
      [file],
      {
        eventUserId: "6a0000000000000000000002",
        eventUser,
      },
      {
        storageTarget: undefined,
        updatedByEventUserId: "6a0000000000000000000002",
      },
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("uses canonical req.eventUser.id for audit fields", async () => {
    const { uploadEventImages } = await loadEventInternalController();

    const file = {
      originalname: "hero.png",
      mimetype: "image/png",
      buffer: Buffer.from("hero"),
      size: 4,
    };

    const eventUser = {
      id: "6a0000000000000000000003",
      emailSnapshot: "manager@example.com",
      role: "event_manager",
    };

    const req = {
      validated: {
        params: {
          id: "event-1",
        },
        query: {},
      },
      files: {
        image: [file],
      },
      eventUser,
    };

    const res = createJsonResponseMock();

    await uploadEventImages(req, res);

    expect(addImagesToEventServiceMock).toHaveBeenCalledWith(
      "event-1",
      [file],
      {
        eventUserId: "6a0000000000000000000003",
        eventUser,
      },
      {
        storageTarget: undefined,
        updatedByEventUserId: "6a0000000000000000000003",
      },
    );
  });

  it("passes null audit ids when req.eventUser id is not a persistable ObjectId", async () => {
    const { uploadEventImages } = await loadEventInternalController();

    const eventUser = {
      id: "setup-admin",
      emailSnapshot: "setup@example.com",
      role: "event_admin",
    };

    const req = {
      validated: {
        params: {
          id: "event-1",
        },
        query: {},
      },
      files: {
        images: [
          {
            originalname: "hero.png",
            mimetype: "image/png",
            buffer: Buffer.from("hero"),
            size: 4,
          },
        ],
      },
      eventUser,
    };

    const res = createJsonResponseMock();

    await uploadEventImages(req, res);

    expect(addImagesToEventServiceMock).toHaveBeenCalledWith(
      "event-1",
      expect.any(Array),
      {
        eventUserId: null,
        eventUser,
      },
      {
        storageTarget: undefined,
        updatedByEventUserId: null,
      },
    );
  });

  it("passes an empty files array when no upload is present", async () => {
    const { uploadEventImages } = await loadEventInternalController();

    const eventUser = buildEventUser();

    const req = {
      validated: {
        params: {
          id: "event-1",
        },
        query: {},
      },
      eventUser,
    };

    const res = createJsonResponseMock();

    await uploadEventImages(req, res);

    expect(addImagesToEventServiceMock).toHaveBeenCalledWith(
      "event-1",
      [],
      {
        eventUserId: "6a0000000000000000000001",
        eventUser,
      },
      {
        storageTarget: undefined,
        updatedByEventUserId: "6a0000000000000000000001",
      },
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("removes an image reference from an event", async () => {
    const { removeEventImage } = await loadEventInternalController();

    const eventUser = buildEventUser();

    const req = {
      params: {
        id: "event-1",
        assetId: "asset-1",
      },
      eventUser,
    };

    const res = createJsonResponseMock();

    await removeEventImage(req, res);

    expect(removeImageFromEventServiceMock).toHaveBeenCalledTimes(1);
    expect(removeImageFromEventServiceMock).toHaveBeenCalledWith(
      "event-1",
      "asset-1",
      {
        eventUserId: "6a0000000000000000000001",
        eventUser,
      },
      {
        updatedByEventUserId: "6a0000000000000000000001",
      },
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        id: "event-1",
        title: "Demo Event",
        slug: "demo-event",
        imageAssetIds: ["asset-2"],
        imageAssets: [
          {
            id: "asset-2",
            filenameOriginal: "gallery.png",
            fileUrl: "/api/public/media-assets/asset-2/file",
          },
        ],
      },
    });
  });

  it("uses validated params when present for removing an image reference", async () => {
    const { removeEventImage } = await loadEventInternalController();

    const eventUser = buildEventUser({
      id: "6a0000000000000000000004",
    });

    const req = {
      params: {
        id: "raw-event-id",
        assetId: "raw-asset-id",
      },
      validated: {
        params: {
          id: "validated-event-id",
          assetId: "validated-asset-id",
        },
      },
      eventUser,
    };

    const res = createJsonResponseMock();

    await removeEventImage(req, res);

    expect(removeImageFromEventServiceMock).toHaveBeenCalledWith(
      "validated-event-id",
      "validated-asset-id",
      {
        eventUserId: "6a0000000000000000000004",
        eventUser,
      },
      {
        updatedByEventUserId: "6a0000000000000000000004",
      },
    );
  });
});
