import jwt from "jsonwebtoken";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createHttpTestApp } from "../../helpers/httpTestApp.js";
import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

import { createTestPngBuffer } from "../../helpers/imageTestFile.js";

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let app;
let Event;
let EventUser;
let MediaAsset;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;

let uploadBufferMock;
let getBufferMock;
let deleteObjectMock;

async function loadMediaRoutesIntegrationApp() {
  vi.resetModules();

  uploadBufferMock = vi
    .fn()
    .mockImplementation(
      async ({ folder, originalName, mimeType, storageTarget = "local" }) => {
        const safeName = String(originalName || "file.bin").replace(
          /[^a-zA-Z0-9._-]/g,
          "-",
        );

        return {
          key: `${folder}/route-${uploadBufferMock.mock.calls.length}-${safeName}`,
          bucket: "mock-storage",
          storageTarget,
          contentType: mimeType,
        };
      },
    );

  getBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("public image bytes"),
    contentType: "image/png",
    contentLength: Buffer.byteLength("public image bytes"),
  });

  deleteObjectMock = vi.fn().mockResolvedValue({
    success: true,
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      features: {
        ticketing: true,
        media: true,
        mail: false,
      },
      storage: {
        local: {
          dir: "uploads-test",
        },

        public: {
          enabled: true,
          endpoint: "https://s3.example.test",
          region: "auto",
          bucket: "test-public",
          publicBaseUrl: "https://assets.example.test",
          accessKeyId: "test-access-key",
          secretAccessKey: "test-secret-key",
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

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: uploadBufferMock,
    getBuffer: getBufferMock,
    deleteObject: deleteObjectMock,
  }));

  /**
   * Event routes import cancellation mail logic indirectly.
   * These tests are about media routes, not mail delivery.
   */
  vi.doMock("../../../src/modules/events/event.mail.service.js", () => ({
    sendEventCancelledMailsSafe: vi.fn().mockResolvedValue({
      sent: 0,
      failed: 0,
      skipped: true,
    }),
  }));

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");
  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
  const mediaAssetModelModule =
    await import("../../../src/modules/mediaAssets/mediaAssets.model.js");
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const internalEventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");
  const publicMediaAssetRoutesModule =
    await import("../../../src/modules/mediaAssets/public/mediaAsset.public.routes.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  Event = eventModelModule.Event;
  EventUser = eventUserModelModule.EventUser;
  MediaAsset = mediaAssetModelModule.MediaAsset;

  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  const router = (await import("express")).default.Router();

  router.use("/admin/events", internalEventRoutesModule.default);
  router.use("/public/media-assets", publicMediaAssetRoutesModule.default);

  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

function signExternalToken(payload = {}) {
  return jwt.sign(
    {
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      email: "thomas@example.com",
      role: "host_user",
      ...payload,
    },
    EXTERNAL_SECRET,
  );
}

async function createExternalEventUser({
  externalProvider = "dummy",
  externalUserId = "host-user-1",
  email = "thomas@example.com",
  role = EVENT_USER_ROLES.EVENT_ADMIN,
  isActive = true,
} = {}) {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
    externalProvider,
    externalUserId,
    emailSnapshot: email,
    passwordHash: null,
    firstNameSnapshot: "Thomas",
    lastNameSnapshot: "Hostuser",
    role,
    isActive,
    notes: "Created from media routes integration test",
  });
}

function buildCreateEventPayload(overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
  );

  return {
    title: "kiwi-events Media Route Event",
    slug: `kiwi-events-media-route-event-${Date.now()}`,
    shortDescription: "Integration test event for media routes",
    description: "This event was created by a media route integration test.",
    category: EVENT_CATEGORIES.EVENT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["integration", "media"],
    sessions: [
      {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        timezone: "Europe/Vienna",
        locationLabel: "Audimax",
        capacity: 100,
      },
    ],
    isFree: true,
    status: EVENT_STATUSES.DRAFT,
    ...overrides,
  };
}

async function createDraftEventDirectly(overrides = {}) {
  const payload = buildCreateEventPayload({
    slug: `media-route-draft-${Date.now()}`,
    status: EVENT_STATUSES.DRAFT,
    ...overrides,
  });

  return Event.create(payload);
}

describe("Media routes MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadMediaRoutesIntegrationApp();
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

  it("allows an external event_admin to upload multiple images to an event", async () => {
    const eventUser = await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createDraftEventDirectly({
      slug: "media-upload-event-admin",
      createdByEventUserId: eventUser._id,
    });

    const token = signExternalToken();

    const response = await request(app)
      .post(`/api/admin/events/${event._id}/images?storageTarget=public`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", createTestPngBuffer(), {
        filename: "hero.png",
        contentType: "image/png",
      })
      .attach("images", createTestPngBuffer(), {
        filename: "gallery.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(uploadBufferMock).toHaveBeenCalledTimes(2);
    expect(uploadBufferMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        folder: "media/events",
        originalName: "hero.png",
        mimeType: "image/png",
        storageTarget: "public",
      }),
    );
    expect(uploadBufferMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        folder: "media/events",
        originalName: "gallery.png",
        mimeType: "image/png",
        storageTarget: "public",
      }),
    );

    expect(response.body.data.imageAssetIds).toHaveLength(2);
    expect(response.body.data.imageAssets).toHaveLength(2);

    expect(response.body.data.imageAssets[0]).toMatchObject({
      filenameOriginal: "hero.png",
      mimeType: "image/png",
    });
    expect(response.body.data.imageAssets[0].fileUrl).toMatch(
      /^https:\/\/assets\.example\.test\/media\/events\//,
    );
    expect(response.body.data.imageAssets[0]).toMatchObject({
      filenameOriginal: "hero.png",
      mimeType: "image/png",
    });

    expect(response.body.data.imageAssets[0].fileUrl).toMatch(
      /^https:\/\/assets\.example\.test\/media\/events\//,
    );

    const returnedImageAsset = response.body.data.imageAssets[0];

    expect(returnedImageAsset.fileUrl).toMatch(
      /^https:\/\/assets\.example\.test\/media\/events\//,
    );

    expect(returnedImageAsset).not.toHaveProperty("url");
    expect(returnedImageAsset).not.toHaveProperty("proxyUrl");
    expect(returnedImageAsset).not.toHaveProperty("storageUrl");
    expect(returnedImageAsset).not.toHaveProperty("key");

    const eventInDb = await Event.findById(event._id).lean();
    const mediaAssetsInDb = await MediaAsset.find({})
      .sort({ createdAt: 1 })
      .lean();

    expect(eventInDb.imageAssetIds.map(String)).toEqual(
      response.body.data.imageAssetIds.map(String),
    );

    expect(mediaAssetsInDb).toHaveLength(2);
    expect(mediaAssetsInDb[0]).toMatchObject({
      filenameOriginal: "hero.png",
      mimeType: "image/png",
      folder: "media/events",
      storageTarget: "public",
    });
    expect(response.body.data.imageAssets[0].fileUrl).toBe(
      `https://assets.example.test/${mediaAssetsInDb[0].key}`,
    );
    expect(String(mediaAssetsInDb[0].createdByEventUserId)).toBe(
      String(eventUser._id),
    );
  });

  it("blocks users whose role has no event update permission from uploading images to an event", async () => {
    await createExternalEventUser({
      externalUserId: "blocked-media-user-1",
      email: "blocked-media@example.com",
      role: "no_media_upload",
    });

    const event = await createDraftEventDirectly({
      slug: "media-upload-role-blocked",
    });

    const token = signExternalToken({
      externalProvider: "dummy",
      externalUserId: "blocked-media-user-1",
      email: "blocked-media@example.com",
    });

    const response = await request(app)
      .post(`/api/admin/events/${event._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", createTestPngBuffer(), {
        filename: "hero.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "INSUFFICIENT_EVENT_PERMISSIONS",
        message: "Insufficient event permissions.",
      },
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();

    const mediaAssetsInDb = await MediaAsset.find({}).lean();
    const eventInDb = await Event.findById(event._id).lean();

    expect(mediaAssetsInDb).toHaveLength(0);
    expect(eventInDb.imageAssetIds).toHaveLength(0);
  });

  it("rejects non-image uploads before they reach storage", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createDraftEventDirectly({
      slug: "media-upload-invalid-file-type",
    });

    const token = signExternalToken();

    const response = await request(app)
      .post(`/api/admin/events/${event._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", Buffer.from("not an image"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "INVALID_MEDIA_FILE_TYPE",
        message: expect.stringMatching(/image/i),
      },
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();

    const mediaAssetsInDb = await MediaAsset.find({}).lean();
    const eventInDb = await Event.findById(event._id).lean();

    expect(mediaAssetsInDb).toHaveLength(0);
    expect(eventInDb.imageAssetIds).toHaveLength(0);
  });

  it("removes one image reference from an event without deleting the media asset", async () => {
    const eventUser = await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createDraftEventDirectly({
      slug: "media-remove-image-reference",
      createdByEventUserId: eventUser._id,
    });

    const token = signExternalToken();

    const uploadResponse = await request(app)
      .post(`/api/admin/events/${event._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", createTestPngBuffer(), {
        filename: "first.png",
        contentType: "image/png",
      })
      .attach("images", createTestPngBuffer(), {
        filename: "second.png",
        contentType: "image/png",
      });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.data.imageAssetIds).toHaveLength(2);

    const [firstAssetId, secondAssetId] =
      uploadResponse.body.data.imageAssetIds;

    const deleteResponse = await request(app)
      .delete(`/api/admin/events/${event._id}/images/${firstAssetId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);

    expect(deleteResponse.body.data.imageAssetIds).toEqual([secondAssetId]);
    expect(deleteResponse.body.data.imageAssets).toHaveLength(1);
    expect(deleteResponse.body.data.imageAssets[0]).toMatchObject({
      filenameOriginal: "second.png",
      fileUrl: `/api/public/media-assets/${secondAssetId}/file`,
    });

    expect(deleteObjectMock).not.toHaveBeenCalled();

    const firstAssetInDb = await MediaAsset.findById(firstAssetId).lean();
    const secondAssetInDb = await MediaAsset.findById(secondAssetId).lean();
    const eventInDb = await Event.findById(event._id).lean();

    expect(firstAssetInDb).toBeDefined();
    expect(secondAssetInDb).toBeDefined();
    expect(eventInDb.imageAssetIds.map(String)).toEqual([
      String(secondAssetId),
    ]);
  });

  it("returns 404 when removing an image that is not assigned to the event", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const firstEvent = await createDraftEventDirectly({
      slug: "media-remove-source-event",
    });
    const secondEvent = await createDraftEventDirectly({
      slug: "media-remove-target-event",
    });

    const token = signExternalToken();

    const uploadResponse = await request(app)
      .post(`/api/admin/events/${firstEvent._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", createTestPngBuffer(), {
        filename: "first.png",
        contentType: "image/png",
      });

    expect(uploadResponse.status).toBe(200);

    const [assetId] = uploadResponse.body.data.imageAssetIds;

    const deleteResponse = await request(app)
      .delete(`/api/admin/events/${secondEvent._id}/images/${assetId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(deleteResponse.status).toBe(404);
    expect(deleteResponse.body).toMatchObject({
      success: false,
      error: {
        code: "EVENT_IMAGE_ASSET_NOT_ASSIGNED",
        message: "Image asset is not assigned to this event.",
      },
    });

    const sourceEventInDb = await Event.findById(firstEvent._id).lean();
    const targetEventInDb = await Event.findById(secondEvent._id).lean();
    const assetInDb = await MediaAsset.findById(assetId).lean();

    expect(sourceEventInDb.imageAssetIds.map(String)).toEqual([
      String(assetId),
    ]);
    expect(targetEventInDb.imageAssetIds).toHaveLength(0);
    expect(assetInDb).toBeDefined();
  });
  it("rejects an invalid event id before processing uploaded files", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const token = signExternalToken();

    const response = await request(app)
      .post("/api/admin/events/not-an-id/images")
      .set("Authorization", `Bearer ${token}`)
      .attach("image", createTestPngBuffer(), {
        filename: "invalid-event.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: "id",
            message: "Invalid ID.",
          }),
        ]),
      },
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid public media id before accessing storage", async () => {
    const response = await request(app).get(
      "/api/public/media-assets/not-an-id/file",
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: "id",
            message: "Invalid ID.",
          }),
        ]),
      },
    });

    expect(getBufferMock).not.toHaveBeenCalled();
  });
  it("downloads an uploaded media asset through the public media route", async () => {
    await createExternalEventUser({
      role: EVENT_USER_ROLES.ADMIN,
    });

    const event = await createDraftEventDirectly({
      slug: "media-public-download",
    });

    const token = signExternalToken();

    const uploadResponse = await request(app)
      .post(`/api/admin/events/${event._id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", createTestPngBuffer(), {
        filename: "download.png",
        contentType: "image/png",
      });

    expect(uploadResponse.status).toBe(200);

    const [assetId] = uploadResponse.body.data.imageAssetIds;
    const assetInDb = await MediaAsset.findById(assetId).lean();

    const downloadResponse = await request(app).get(
      `/api/public/media-assets/${assetId}/file`,
    );

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("image/png");
    expect(downloadResponse.headers["content-disposition"]).toBe(
      'inline; filename="download.png"',
    );
    expect(downloadResponse.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(downloadResponse.headers["cross-origin-resource-policy"]).toBe(
      "cross-origin",
    );
    expect(downloadResponse.headers["access-control-allow-origin"]).toBe("*");

    expect(getBufferMock).toHaveBeenCalledTimes(1);
    expect(getBufferMock).toHaveBeenCalledWith({
      key: assetInDb.key,
      storageTarget: "local",
    });

    expect(
      Buffer.from(downloadResponse.body).equals(
        Buffer.from("public image bytes"),
      ),
    ).toBe(true);
  });
});
