import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

import { createTestPngBuffer } from "../../helpers/imageTestFile.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let Event;
let MediaAsset;

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;
let EVENT_USER_ROLES;

let MEDIA_ASSET_KINDS;

let uploadEventImageAssetService;
let listEventImageAssetsService;
let getEventMediaAssetUsageService;
let deleteEventImageAssetService;
let addImagesToEventService;
let updateEventService;
let getEventByIdService;
let getPublicMediaAssetFileService;

let uploadBufferMock;
let getBufferMock;
let deleteObjectMock;
let loggerWarnMock;

let removeImageFromEventService;

async function loadMediaStorageIntegrationModules() {
  vi.resetModules();

  uploadBufferMock = vi
    .fn()
    .mockImplementation(async ({ folder, originalName, storageTarget }) => {
      const callNumber = uploadBufferMock.mock.calls.length;

      return {
        key: `${folder}/mock-${callNumber}-${originalName || "file.bin"}`,
        bucket: "mock-storage",
        storageTarget: storageTarget || "local",
      };
    });

  getBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("stored image content"),
    contentType: "image/png",
    contentLength: Buffer.byteLength("stored image content"),
  });

  deleteObjectMock = vi.fn().mockResolvedValue({
    success: true,
  });

  loggerWarnMock = vi.fn();

  vi.doMock("../../../src/config/logger.js", () => ({
    logger: {
      info: vi.fn(),
      warn: loggerWarnMock,
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      features: {
        media: true,
        ticketing: true,
        mail: false,
      },
      storage: {
        local: {
          dir: "uploads-test",
        },
        public: {
          publicBaseUrl: "https://assets.example.test",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    withDatabaseTransaction: async (callback) => callback({}),
  }));

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: uploadBufferMock,
    getBuffer: getBufferMock,
    deleteObject: deleteObjectMock,
  }));

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");
  const mediaAssetModelModule =
    await import("../../../src/modules/mediaAssets/mediaAssets.model.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");
  const mediaAssetConstantsModule =
    await import("../../../src/modules/mediaAssets/mediaAsset.constants.js");

  const mediaAssetInternalServiceModule =
    await import("../../../src/modules/mediaAssets/internal/mediaAsset.internal.service.js");
  const mediaAssetPublicServiceModule =
    await import("../../../src/modules/mediaAssets/public/mediaAsset.public.service.js");
  const eventInternalServiceModule =
    await import("../../../src/modules/events/internal/event.internal.service.js");

  Event = eventModelModule.Event;
  MediaAsset = mediaAssetModelModule.MediaAsset;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  MEDIA_ASSET_KINDS = mediaAssetConstantsModule.MEDIA_ASSET_KINDS;

  uploadEventImageAssetService =
    mediaAssetInternalServiceModule.uploadEventImageAssetService;
  listEventImageAssetsService =
    mediaAssetInternalServiceModule.listEventImageAssetsService;
  getEventMediaAssetUsageService =
    mediaAssetInternalServiceModule.getEventMediaAssetUsageService;
  deleteEventImageAssetService =
    mediaAssetInternalServiceModule.deleteEventImageAssetService;

  getPublicMediaAssetFileService =
    mediaAssetPublicServiceModule.getPublicMediaAssetFileService;

  addImagesToEventService = eventInternalServiceModule.addImagesToEventService;
  removeImageFromEventService =
    eventInternalServiceModule.removeImageFromEventService;
  updateEventService = eventInternalServiceModule.updateEventService;
  getEventByIdService = eventInternalServiceModule.getEventByIdService;
}

function buildFutureSession() {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt,
    endAt,
    timezone: "Europe/Vienna",
    locationLabel: "Audimax",
    capacity: 100,
  };
}

function buildEventPayload(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    title: "Media Storage Test Event",
    slug: `media-storage-test-event-${suffix}`,
    shortDescription: "Event used by media/storage integration tests.",
    description: "This event verifies media asset handling.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    imageAssetIds: [],
    tags: ["media", "storage"],
    sessions: [buildFutureSession()],
    isFree: true,
    ...overrides,
  };
}

async function createEventDirectly(overrides = {}) {
  return Event.create(buildEventPayload(overrides));
}

async function createImageAssetDirectly(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return MediaAsset.create({
    kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
    folder: "media/events",
    url: `https://storage.example.test/media/events/${suffix}.png`,
    key: `media/events/${suffix}.png`,
    storageTarget: "local",
    filenameOriginal: "event-image.png",
    mimeType: "image/png",
    size: 1234,
    createdByEventUserId: null,
    updatedByEventUserId: null,
    ...overrides,
  });
}

function buildImageFile(overrides = {}) {
  const buffer = createTestPngBuffer();

  return {
    fieldname: "image",
    originalname: "event-photo.png",
    encoding: "7bit",
    mimetype: "image/png",
    buffer,
    size: buffer.length,
    ...overrides,
  };
}

function buildEventAdminActor(overrides = {}) {
  return {
    eventUserId: "6a0000000000000000000001",
    eventUser: {
      id: "6a0000000000000000000001",
      role: EVENT_USER_ROLES.ADMIN,
      grants: [],
      denies: [],
      isActive: true,
    },
    ...overrides,
  };
}

describe("Media/Storage MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadMediaStorageIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uploads an event image through the storage abstraction and creates a media asset", async () => {
    const actor = buildEventAdminActor();
    const file = buildImageFile();

    const asset = await uploadEventImageAssetService({
      file,
      actor,
    });

    expect(uploadBufferMock).toHaveBeenCalledTimes(1);
    expect(uploadBufferMock).toHaveBeenCalledWith({
      buffer: file.buffer,
      mimeType: "image/png",
      originalName: "event-photo.png",
      folder: "media/events",
      storageTarget: undefined,
    });

    expect(asset).toMatchObject({
      kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
      folder: "media/events",
      filenameOriginal: "event-photo.png",
      mimeType: "image/png",
      size: file.size,
    });

    expect(asset.id).toEqual(expect.any(String));
    expect(asset._id).toBeUndefined();
    expect(asset.__v).toBeUndefined();

    expect(asset.key).toContain("media/events/");
    expect(asset).not.toHaveProperty("url");

    expect(asset.createdByEventUserId).toBe(actor.eventUserId);
    expect(asset.updatedByEventUserId).toBe(actor.eventUserId);

    const assetInDb = await MediaAsset.findById(asset.id).lean();

    expect(assetInDb).toBeDefined();
    expect(assetInDb.kind).toBe(MEDIA_ASSET_KINDS.EVENT_IMAGE);
    expect(assetInDb.key).toBe(asset.key);
  });

  it("rejects event image upload without a valid file buffer", async () => {
    await expect(
      uploadEventImageAssetService({
        file: {
          originalname: "broken.png",
          mimetype: "image/png",
          size: 0,
        },
        actor: buildEventAdminActor(),
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALID_IMAGE_FILE_REQUIRED",
      message: "A valid image file is required.",
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it("downloads a public event image from storage by media asset id", async () => {
    const asset = await createImageAssetDirectly({
      filenameOriginal: "hero.png",
      mimeType: "image/png",
      key: "media/events/hero.png",
    });

    const result = await getPublicMediaAssetFileService(asset._id);

    expect(getBufferMock).toHaveBeenCalledTimes(1);
    expect(getBufferMock).toHaveBeenCalledWith({
      key: "media/events/hero.png",
      storageTarget: "local",
    });

    expect(result).toMatchObject({
      filename: "hero.png",
      contentType: "image/png",
      contentLength: Buffer.byteLength("stored image content"),
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(result.buffer.equals(Buffer.from("stored image content"))).toBe(
      true,
    );
  });

  it("lists event image assets with usage information", async () => {
    const sharedAsset = await createImageAssetDirectly({
      filenameOriginal: "shared.png",
      key: "media/events/shared.png",
    });

    const secondAsset = await createImageAssetDirectly({
      filenameOriginal: "second.png",
      key: "media/events/second.png",
    });

    await createEventDirectly({
      title: "First Event Using Shared Image",
      slug: "first-event-using-shared-image",
      imageAssetIds: [sharedAsset._id],
    });

    await createEventDirectly({
      title: "Second Event Using Both Images",
      slug: "second-event-using-both-images",
      imageAssetIds: [sharedAsset._id, secondAsset._id],
    });

    const assets = await listEventImageAssetsService();

    const sharedResult = assets.find(
      (asset) => asset.id === String(sharedAsset._id),
    );

    const secondResult = assets.find(
      (asset) => asset.id === String(secondAsset._id),
    );

    expect(sharedResult).toBeDefined();
    expect(sharedResult.isUsed).toBe(true);
    expect(sharedResult.usedBy).toHaveLength(2);
    expect(sharedResult.usedBy.map((event) => event.slug).sort()).toEqual([
      "first-event-using-shared-image",
      "second-event-using-both-images",
    ]);

    expect(secondResult).toBeDefined();
    expect(secondResult.isUsed).toBe(true);
    expect(secondResult.usedBy).toHaveLength(1);
    expect(secondResult.usedBy[0]).toMatchObject({
      title: "Second Event Using Both Images",
      slug: "second-event-using-both-images",
    });
  });

  it("returns usage information for a single event image asset", async () => {
    const asset = await createImageAssetDirectly({
      filenameOriginal: "usage.png",
      key: "media/events/usage.png",
    });

    await createEventDirectly({
      title: "Event With Usage Image",
      slug: "event-with-usage-image",
      imageAssetIds: [asset._id],
    });

    const usage = await getEventMediaAssetUsageService(asset._id);

    expect(usage.isUsed).toBe(true);
    expect(usage.usedBy).toHaveLength(1);
    expect(usage.usedBy[0]).toMatchObject({
      title: "Event With Usage Image",
      slug: "event-with-usage-image",
    });
  });

  it("deletes an unused event image asset and deletes the storage object", async () => {
    const asset = await createImageAssetDirectly({
      key: "media/events/delete-me.png",
    });

    const result = await deleteEventImageAssetService(asset._id);

    expect(result).toEqual({ deleted: true });
    expect(deleteObjectMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "media/events/delete-me.png",
      storageTarget: "local",
    });

    const assetInDb = await MediaAsset.findById(asset._id).lean();
    expect(assetInDb).toBeNull();
  });

  it("keeps deletion idempotent on DB side when storage deletion fails", async () => {
    deleteObjectMock.mockRejectedValueOnce(new Error("storage down"));

    const asset = await createImageAssetDirectly({
      key: "media/events/storage-delete-fails.png",
    });

    const result = await deleteEventImageAssetService(asset._id);

    expect(result).toEqual({ deleted: true });
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "media/events/storage-delete-fails.png",
      storageTarget: "local",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "media_asset.storage_delete_failed",
      expect.objectContaining({
        key: "media/events/storage-delete-fails.png",
        storageTarget: "local",
        action: "delete_event_image_asset",
      }),
    );

    const assetInDb = await MediaAsset.findById(asset._id).lean();
    expect(assetInDb).toBeNull();
  });

  it("blocks deleting an event image asset while it is still used by an event", async () => {
    const asset = await createImageAssetDirectly({
      key: "media/events/in-use.png",
    });

    await createEventDirectly({
      title: "Event Using Image",
      slug: "event-using-image",
      imageAssetIds: [asset._id],
    });

    await expect(deleteEventImageAssetService(asset._id)).rejects.toMatchObject(
      {
        statusCode: 409,
        code: "EVENT_IMAGE_ASSET_IN_USE",
        message: "Image is still in use by at least one event.",
      },
    );

    expect(deleteObjectMock).not.toHaveBeenCalled();

    const assetInDb = await MediaAsset.findById(asset._id).lean();
    expect(assetInDb).toBeDefined();
  });

  it("adds uploaded images to an existing event", async () => {
    const event = await createEventDirectly({
      title: "Event Before Upload",
      slug: "event-before-upload",
    });

    const updatedEvent = await addImagesToEventService(
      event._id,
      [buildImageFile({ originalname: "first.png" })],
      buildEventAdminActor(),
      {
        updatedByEventUserId: "6a0000000000000000000001",
      },
    );

    expect(uploadBufferMock).toHaveBeenCalledTimes(1);
    expect(updatedEvent.imageAssetIds).toHaveLength(1);
    expect(updatedEvent.imageAssets).toHaveLength(1);
    expect(updatedEvent.imageAssets[0]).toMatchObject({
      fileUrl: `/api/public/media-assets/${updatedEvent.imageAssetIds[0]}/file`,
      filenameOriginal: "first.png",
      mimeType: "image/png",
    });

    const eventInDb = await Event.findById(event._id).lean();

    expect(eventInDb.imageAssetIds.map(String)).toEqual(
      updatedEvent.imageAssetIds.map(String),
    );
  });

  it("allows one media asset to be reused by multiple events through imageAssetIds", async () => {
    const sharedAsset = await createImageAssetDirectly({
      filenameOriginal: "reusable.png",
      key: "media/events/reusable.png",
    });

    const firstEvent = await createEventDirectly({
      title: "Reusable Media First Event",
      slug: "reusable-media-first-event",
    });

    const secondEvent = await createEventDirectly({
      title: "Reusable Media Second Event",
      slug: "reusable-media-second-event",
    });

    const actor = buildEventAdminActor();

    await updateEventService(
      firstEvent._id,
      {
        imageAssetIds: [String(sharedAsset._id)],
        updatedByEventUserId: actor.eventUserId,
      },
      actor,
    );

    await updateEventService(
      secondEvent._id,
      {
        imageAssetIds: [String(sharedAsset._id)],
        updatedByEventUserId: actor.eventUserId,
      },
      actor,
    );

    const firstResult = await getEventByIdService(firstEvent._id, actor);
    const secondResult = await getEventByIdService(secondEvent._id, actor);
    const usage = await getEventMediaAssetUsageService(sharedAsset._id);

    expect(firstResult.imageAssetIds).toEqual([String(sharedAsset._id)]);
    expect(secondResult.imageAssetIds).toEqual([String(sharedAsset._id)]);

    expect(firstResult.imageAssets[0]).toMatchObject({
      fileUrl: `/api/public/media-assets/${sharedAsset._id}/file`,
      filenameOriginal: "reusable.png",
    });

    expect(secondResult.imageAssets[0]).toMatchObject({
      fileUrl: `/api/public/media-assets/${sharedAsset._id}/file`,
      filenameOriginal: "reusable.png",
    });

    expect(usage.isUsed).toBe(true);
    expect(usage.usedBy.map((event) => event.slug).sort()).toEqual([
      "reusable-media-first-event",
      "reusable-media-second-event",
    ]);
  });
  it("removes one image reference from an event without deleting the media asset", async () => {
    const firstAsset = await createImageAssetDirectly({
      filenameOriginal: "first.png",
      key: "media/events/first.png",
    });

    const secondAsset = await createImageAssetDirectly({
      filenameOriginal: "second.png",
      key: "media/events/second.png",
    });

    const event = await createEventDirectly({
      title: "Event With Removable Images",
      slug: "event-with-removable-images",
      imageAssetIds: [firstAsset._id, secondAsset._id],
      createdByEventUserId: "6a0000000000000000000001",
    });

    const result = await removeImageFromEventService(
      event._id,
      firstAsset._id,
      buildEventAdminActor(),
      {
        updatedByEventUserId: "6a0000000000000000000001",
      },
    );

    expect(result.imageAssetIds).toEqual([String(secondAsset._id)]);
    expect(result.imageAssets).toHaveLength(1);
    expect(result.imageAssets[0]).toMatchObject({
      filenameOriginal: "second.png",
      fileUrl: `/api/public/media-assets/${secondAsset._id}/file`,
    });

    const firstAssetInDb = await MediaAsset.findById(firstAsset._id).lean();
    const secondAssetInDb = await MediaAsset.findById(secondAsset._id).lean();

    expect(firstAssetInDb).toBeDefined();
    expect(secondAssetInDb).toBeDefined();
    expect(deleteObjectMock).not.toHaveBeenCalled();

    const eventInDb = await Event.findById(event._id).lean();

    expect(eventInDb.imageAssetIds.map(String)).toEqual([
      String(secondAsset._id),
    ]);
  });

  it("rejects removing an image that is not assigned to the event", async () => {
    const assignedAsset = await createImageAssetDirectly({
      filenameOriginal: "assigned.png",
      key: "media/events/assigned.png",
    });

    const unassignedAsset = await createImageAssetDirectly({
      filenameOriginal: "unassigned.png",
      key: "media/events/unassigned.png",
    });

    const event = await createEventDirectly({
      title: "Event With Assigned Image",
      slug: "event-with-assigned-image",
      imageAssetIds: [assignedAsset._id],
      createdByEventUserId: "6a0000000000000000000001",
    });

    await expect(
      removeImageFromEventService(
        event._id,
        unassignedAsset._id,
        buildEventAdminActor(),
        {
          updatedByEventUserId: "6a0000000000000000000001",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "EVENT_IMAGE_ASSET_NOT_ASSIGNED",
      message: "Image asset is not assigned to this event.",
    });

    const eventInDb = await Event.findById(event._id).lean();

    expect(eventInDb.imageAssetIds.map(String)).toEqual([
      String(assignedAsset._id),
    ]);
  });
});
