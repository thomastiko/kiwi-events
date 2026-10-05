import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEvent;
let findEventById;

let createMediaAsset;
let findMediaAssetById;

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;
let EVENT_USER_ROLES;

let MEDIA_ASSET_KINDS;

let uploadEventImageAssetService;
let listEventImageAssetsService;
let getEventMediaAssetUsageService;
let deleteEventImageAssetService;
let getPublicMediaAssetFileService;

let addImagesToEventService;
let removeImageFromEventService;
let updateEventService;
let getEventByIdService;

let uploadBufferMock;
let getBufferMock;
let deleteObjectMock;
let loggerWarnMock;

async function loadMediaStorageSqlIntegrationModules() {
  vi.resetModules();

  uploadBufferMock = vi
    .fn()
    .mockImplementation(
      async ({ folder, originalName, storageTarget = "local" }) => {
        const callNumber = uploadBufferMock.mock.calls.length;

        return {
          key: `${folder}/sql-mock-${callNumber}-${originalName || "file.bin"}`,
          bucket: "mock-storage",
          storageTarget,
          contentType: "image/png",
        };
      },
    );

  getBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("stored sql image content"),
    contentType: "image/png",
    contentLength: Buffer.byteLength("stored sql image content"),
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
          enabled: false,
          endpoint: "",
          region: "auto",
          bucket: "",
          publicBaseUrl: "",
          accessKeyId: "",
          secretAccessKey: "",
          forcePathStyle: false,
        },

        private: {
          enabled: false,
          endpoint: "",
          region: "auto",
          bucket: "",
          accessKeyId: "",
          secretAccessKey: "",
          forcePathStyle: false,
        },

        generated: {
          ticketPdfTarget: "local",
        },
      },
    },
  }));

  const TEST_FEATURES = {
    ticketing: true,
    guestCheckout: true,
    depositTickets: false,
    ticketPdf: false,
    ticketQr: false,
    mail: false,
    mailOrderConfirmation: false,
    mailEventCancellation: false,
    mailEventReminder: false,
    media: true,
    reminders: false,
  };

  vi.doMock("../../../src/config/features.js", () => ({
    features: TEST_FEATURES,
    getDefaultFeatures: () => TEST_FEATURES,
    getRuntimeFeatureOverrides: () => ({}),
    getFeatures: () => TEST_FEATURES,
    isFeatureEnabled: (featureName) => TEST_FEATURES[featureName] === true,
  }));

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: uploadBufferMock,
    getBuffer: getBufferMock,
    deleteObject: deleteObjectMock,
  }));

  vi.doMock("../../../src/modules/events/event.mail.service.js", () => ({
    sendEventCancelledMailsSafe: vi.fn().mockResolvedValue({
      sent: 0,
      failed: 0,
      skipped: true,
    }),
  }));

  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;
  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;
  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;

  const eventRepositoryModule =
    await import("../../../src/modules/events/repositories/event.repository.js");
  const mediaAssetRepositoryModule =
    await import("../../../src/modules/mediaAssets/repositories/mediaAsset.repository.js");

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

  createEvent = eventRepositoryModule.createEvent;
  findEventById = eventRepositoryModule.findEventById;

  createMediaAsset = mediaAssetRepositoryModule.createMediaAsset;
  findMediaAssetById = mediaAssetRepositoryModule.findMediaAssetById;

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
    locationDetails: "Room 1",
    capacity: 100,
    status: "scheduled",
  };
}

function buildEventPayload(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    title: "SQL Media Storage Test Event",
    slug: `sql-media-storage-test-event-${suffix}`,
    shortDescription: "Event used by SQL media/storage integration tests.",
    description: "This event verifies SQL media asset handling.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    imageAssetIds: [],
    tags: ["media", "storage", "sql"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: true,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL media/storage integration test",
    ...overrides,
  };
}

async function createEventDirectly(overrides = {}) {
  return createEvent(buildEventPayload(overrides));
}

async function createImageAssetDirectly(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return createMediaAsset({
    kind: MEDIA_ASSET_KINDS.EVENT_IMAGE,
    folder: "media/events",
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
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

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
    eventUserId: "00000000-0000-4000-8000-000000000001",
    eventUser: {
      id: "00000000-0000-4000-8000-000000000001",
      role: EVENT_USER_ROLES.ADMIN,
      grants: [],
      denies: [],
      isActive: true,
    },
    ...overrides,
  };
}

describe("Media/Storage SQL integration", () => {
  beforeAll(async () => {
    await loadMediaStorageSqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    vi.clearAllMocks();

    uploadBufferMock.mockImplementation(
      async ({ folder, originalName, storageTarget = "local" }) => {
        const callNumber = uploadBufferMock.mock.calls.length;

        return {
          key: `${folder}/sql-mock-${callNumber}-${originalName || "file.bin"}`,
          bucket: "mock-storage",
          storageTarget,
          contentType: "image/png",
        };
      },
    );

    getBufferMock.mockResolvedValue({
      buffer: Buffer.from("stored sql image content"),
      contentType: "image/png",
      contentLength: Buffer.byteLength("stored sql image content"),
    });

    deleteObjectMock.mockResolvedValue({
      success: true,
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uploads an event image through the storage abstraction and creates a SQL media asset", async () => {
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
    expect(asset.createdByEventUserId).toBe(actor.eventUserId);
    expect(asset.updatedByEventUserId).toBe(actor.eventUserId);

    const assetInDb = await findMediaAssetById(asset.id, {
      lean: true,
    });

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
      message: "A valid image file is required.",
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();

    const assets = await listEventImageAssetsService();

    expect(assets).toHaveLength(0);
  });

  it("downloads a public event image from storage by media asset id", async () => {
    const asset = await createImageAssetDirectly({
      filenameOriginal: "hero.png",
      mimeType: "image/png",
      key: "media/events/hero.png",
    });

    const result = await getPublicMediaAssetFileService(asset.id);

    expect(getBufferMock).toHaveBeenCalledTimes(1);
    expect(getBufferMock).toHaveBeenCalledWith({
      key: "media/events/hero.png",
      storageTarget: "local",
    });

    expect(result).toMatchObject({
      filename: "hero.png",
      contentType: "image/png",
      contentLength: Buffer.byteLength("stored sql image content"),
      cacheControl: "public, max-age=31536000, immutable",
    });

    expect(result.buffer.equals(Buffer.from("stored sql image content"))).toBe(
      true,
    );
  });

  it("lists event image assets with usage information from SQL events", async () => {
    const sharedAsset = await createImageAssetDirectly({
      filenameOriginal: "shared.png",
      key: "media/events/shared.png",
    });

    const secondAsset = await createImageAssetDirectly({
      filenameOriginal: "second.png",
      key: "media/events/second.png",
    });

    await createEventDirectly({
      title: "SQL First Event Using Shared Image",
      slug: "sql-first-event-using-shared-image",
      imageAssetIds: [sharedAsset.id],
    });

    await createEventDirectly({
      title: "SQL Second Event Using Both Images",
      slug: "sql-second-event-using-both-images",
      imageAssetIds: [sharedAsset.id, secondAsset.id],
    });

    const assets = await listEventImageAssetsService();

    const sharedResult = assets.find(
      (asset) => String(asset.id) === String(sharedAsset.id),
    );
    const secondResult = assets.find(
      (asset) => String(asset.id) === String(secondAsset.id),
    );

    expect(sharedResult).toBeDefined();
    expect(sharedResult.isUsed).toBe(true);
    expect(sharedResult.usedBy).toHaveLength(2);
    expect(sharedResult.usedBy.map((event) => event.slug).sort()).toEqual([
      "sql-first-event-using-shared-image",
      "sql-second-event-using-both-images",
    ]);

    expect(secondResult).toBeDefined();
    expect(secondResult.isUsed).toBe(true);
    expect(secondResult.usedBy).toHaveLength(1);
    expect(secondResult.usedBy[0]).toMatchObject({
      title: "SQL Second Event Using Both Images",
      slug: "sql-second-event-using-both-images",
    });
  });

  it("returns usage information for a single event image asset", async () => {
    const asset = await createImageAssetDirectly({
      filenameOriginal: "usage.png",
      key: "media/events/usage.png",
    });

    await createEventDirectly({
      title: "SQL Event With Usage Image",
      slug: "sql-event-with-usage-image",
      imageAssetIds: [asset.id],
    });

    const usage = await getEventMediaAssetUsageService(asset.id);

    expect(usage.isUsed).toBe(true);
    expect(usage.usedBy).toHaveLength(1);
    expect(usage.usedBy[0]).toMatchObject({
      title: "SQL Event With Usage Image",
      slug: "sql-event-with-usage-image",
    });
  });

  it("deletes an unused event image asset and deletes the storage object", async () => {
    const asset = await createImageAssetDirectly({
      key: "media/events/delete-me.png",
    });

    const result = await deleteEventImageAssetService(asset.id);

    expect(result).toEqual({ deleted: true });
    expect(deleteObjectMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "media/events/delete-me.png",
      storageTarget: "local",
    });

    const assetInDb = await findMediaAssetById(asset.id, {
      lean: true,
    });

    expect(assetInDb).toBeNull();
  });

  it("keeps deletion idempotent on DB side when storage deletion fails", async () => {
    deleteObjectMock.mockRejectedValueOnce(new Error("storage down"));

    const asset = await createImageAssetDirectly({
      key: "media/events/storage-delete-fails.png",
    });

    const result = await deleteEventImageAssetService(asset.id);

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

    const assetInDb = await findMediaAssetById(asset.id, {
      lean: true,
    });

    expect(assetInDb).toBeNull();
  });

  it("blocks deleting an event image asset while it is still used by an event", async () => {
    const asset = await createImageAssetDirectly({
      key: "media/events/in-use.png",
    });

    await createEventDirectly({
      title: "SQL Event Using Image",
      slug: "sql-event-using-image",
      imageAssetIds: [asset.id],
    });

    await expect(deleteEventImageAssetService(asset.id)).rejects.toMatchObject({
      statusCode: 409,
      message: "Image is still in use by at least one event.",
    });

    expect(deleteObjectMock).not.toHaveBeenCalled();

    const assetInDb = await findMediaAssetById(asset.id, {
      lean: true,
    });

    expect(assetInDb).toBeDefined();
  });

  it("adds uploaded images to an existing SQL event", async () => {
    const event = await createEventDirectly({
      title: "SQL Event Before Upload",
      slug: "sql-event-before-upload",
    });

    const updatedEvent = await addImagesToEventService(
      event.id,
      [buildImageFile({ originalname: "first.png" })],
      buildEventAdminActor(),
      {
        updatedByEventUserId: "00000000-0000-4000-8000-000000000001",
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

    const eventInDb = await findEventById(event.id, {
      lean: true,
    });

    expect(eventInDb.imageAssetIds.map(String)).toEqual(
      updatedEvent.imageAssetIds.map(String),
    );
  });

  it("allows one media asset to be reused by multiple SQL events through imageAssetIds", async () => {
    const sharedAsset = await createImageAssetDirectly({
      filenameOriginal: "reusable.png",
      key: "media/events/reusable.png",
    });

    const firstEvent = await createEventDirectly({
      title: "SQL Reusable Media First Event",
      slug: "sql-reusable-media-first-event",
    });

    const secondEvent = await createEventDirectly({
      title: "SQL Reusable Media Second Event",
      slug: "sql-reusable-media-second-event",
    });

    const actor = buildEventAdminActor();

    await updateEventService(
      firstEvent.id,
      {
        imageAssetIds: [String(sharedAsset.id)],
        updatedByEventUserId: actor.eventUserId,
      },
      actor,
    );

    await updateEventService(
      secondEvent.id,
      {
        imageAssetIds: [String(sharedAsset.id)],
        updatedByEventUserId: actor.eventUserId,
      },
      actor,
    );

    const firstResult = await getEventByIdService(firstEvent.id, actor);
    const secondResult = await getEventByIdService(secondEvent.id, actor);
    const usage = await getEventMediaAssetUsageService(sharedAsset.id);

    expect(firstResult.imageAssetIds).toEqual([String(sharedAsset.id)]);
    expect(secondResult.imageAssetIds).toEqual([String(sharedAsset.id)]);

    expect(firstResult.imageAssets[0]).toMatchObject({
      fileUrl: `/api/public/media-assets/${sharedAsset.id}/file`,
      filenameOriginal: "reusable.png",
    });

    expect(secondResult.imageAssets[0]).toMatchObject({
      fileUrl: `/api/public/media-assets/${sharedAsset.id}/file`,
      filenameOriginal: "reusable.png",
    });

    expect(usage.isUsed).toBe(true);
    expect(usage.usedBy.map((event) => event.slug).sort()).toEqual([
      "sql-reusable-media-first-event",
      "sql-reusable-media-second-event",
    ]);
  });

  it("removes one image reference from an event without deleting the media asset", async () => {
    const firstAsset = await createImageAssetDirectly({
      filenameOriginal: "first.png",
      key: "media/events/remove-first.png",
    });

    const secondAsset = await createImageAssetDirectly({
      filenameOriginal: "second.png",
      key: "media/events/remove-second.png",
    });

    const event = await createEventDirectly({
      title: "SQL Event With Two Images",
      slug: "sql-event-with-two-images",
      imageAssetIds: [firstAsset.id, secondAsset.id],
      createdByEventUserId: "00000000-0000-4000-8000-000000000001",
    });

    const result = await removeImageFromEventService(
      event.id,
      firstAsset.id,
      buildEventAdminActor(),
      {
        updatedByEventUserId: "00000000-0000-4000-8000-000000000001",
      },
    );

    expect(result.imageAssetIds).toEqual([String(secondAsset.id)]);
    expect(result.imageAssets).toHaveLength(1);
    expect(result.imageAssets[0]).toMatchObject({
      filenameOriginal: "second.png",
      fileUrl: `/api/public/media-assets/${secondAsset.id}/file`,
    });

    expect(deleteObjectMock).not.toHaveBeenCalled();

    const firstAssetInDb = await findMediaAssetById(firstAsset.id, {
      lean: true,
    });
    const secondAssetInDb = await findMediaAssetById(secondAsset.id, {
      lean: true,
    });
    const eventInDb = await findEventById(event.id, {
      lean: true,
    });

    expect(firstAssetInDb).toBeDefined();
    expect(secondAssetInDb).toBeDefined();
    expect(eventInDb.imageAssetIds.map(String)).toEqual([
      String(secondAsset.id),
    ]);
  });

  it("returns 404 when removing an image that is not assigned to the event", async () => {
    const assignedAsset = await createImageAssetDirectly({
      filenameOriginal: "assigned.png",
      key: "media/events/assigned.png",
    });

    const unassignedAsset = await createImageAssetDirectly({
      filenameOriginal: "unassigned.png",
      key: "media/events/unassigned.png",
    });

    const event = await createEventDirectly({
      title: "SQL Event With Assigned Image",
      slug: "sql-event-with-assigned-image",
      imageAssetIds: [assignedAsset.id],
      createdByEventUserId: "00000000-0000-4000-8000-000000000001",
    });

    await expect(
      removeImageFromEventService(
        event.id,
        unassignedAsset.id,
        buildEventAdminActor(),
        {
          updatedByEventUserId: "00000000-0000-4000-8000-000000000001",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Image asset is not assigned to this event.",
    });

    const eventInDb = await findEventById(event.id, {
      lean: true,
    });

    expect(eventInDb.imageAssetIds.map(String)).toEqual([
      String(assignedAsset.id),
    ]);
  });
});
