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

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let app;

let Event;
let EventUser;
let MediaAsset;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let deleteObjectMock;

async function loadMediaAssetsAdminMongoApp() {
  vi.resetModules();

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
    },
  }));

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: vi.fn(),
    deleteObject: deleteObjectMock,
  }));

  const eventModule =
    await import("../../../src/modules/events/event.model.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const eventUserModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");

  const mediaAssetModule =
    await import("../../../src/modules/mediaAssets/mediaAssets.model.js");

  const routesModule =
    await import("../../../src/modules/mediaAssets/internal/mediaAsset.internal.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  Event = eventModule.Event;
  EventUser = eventUserModule.EventUser;
  MediaAsset = mediaAssetModule.MediaAsset;

  EVENT_USER_ROLES = eventUserModule.EVENT_USER_ROLES;

  EVENT_USER_AUTH_PROVIDER = eventUserModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;

  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  app = createHttpTestApp({
    mountPath: "/api/admin/media-assets",
    router: routesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminToken() {
  const admin = await EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot: "admin@example.com",
    passwordHash: "not-used",

    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",

    role: EVENT_USER_ROLES.ADMIN,

    isActive: true,
    mustChangePassword: false,
  });

  return jwt.sign(
    {
      eventUserId: String(admin._id),
      email: admin.emailSnapshot,
      role: EVENT_USER_ROLES.ADMIN,
      type: "KIWI_EVENTS_admin",
    },
    LOCAL_SECRET,
  );
}

async function createEventImageAsset({ key, filename }) {
  return MediaAsset.create({
    kind: "event_image",

    folder: "media/events",
    key,
    storageTarget: "local",

    filenameOriginal: filename,
    mimeType: "image/png",
    size: 1234,
  });
}

async function createEventUsingAsset(asset) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return Event.create({
    title: "Media Asset Usage Event",
    slug: `media-asset-usage-${Date.now()}`,

    shortDescription: "",
    description: "",

    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,

    location: "",

    imageAssetIds: [asset._id],

    sessions: [
      {
        startAt,
        endAt,
        timezone: "Europe/Vienna",
        status: "scheduled",
      },
    ],

    isFree: true,
  });
}

function expectNoInternalFields(value) {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('"_id"');
  expect(serialized).not.toContain('"__v"');
  expect(serialized).not.toContain('"folder"');
  expect(serialized).not.toContain('"key"');
  expect(serialized).not.toContain('"storageTarget"');

  expect(serialized).not.toContain('"createdByEventUserId"');

  expect(serialized).not.toContain('"updatedByEventUserId"');
}

describe("Admin media assets MongoDB HTTP contract", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadMediaAssetsAdminMongoApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    deleteObjectMock.mockClear();
    deleteObjectMock.mockResolvedValue({
      success: true,
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("lists canonical event image assets and deletes an unused asset", async () => {
    const accessToken = await createAdminToken();

    const usedAsset = await createEventImageAsset({
      key: "media/events/used.png",
      filename: "used.png",
    });

    const unusedAsset = await createEventImageAsset({
      key: "media/events/unused.png",
      filename: "unused.png",
    });

    const event = await createEventUsingAsset(usedAsset);

    const listResponse = await request(app)
      .get("/api/admin/media-assets/events")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);
    expect(listResponse.body.data).toHaveLength(2);

    const usedResult = listResponse.body.data.find(
      (asset) => asset.id === String(usedAsset._id),
    );

    const unusedResult = listResponse.body.data.find(
      (asset) => asset.id === String(unusedAsset._id),
    );

    expect(usedResult).toMatchObject({
      id: String(usedAsset._id),

      kind: "event_image",

      fileUrl: `/api/public/media-assets/${usedAsset._id}/file`,

      filenameOriginal: "used.png",
      mimeType: "image/png",
      size: 1234,

      isUsed: true,

      usedBy: [
        {
          eventId: String(event._id),
          title: "Media Asset Usage Event",
          slug: event.slug,
          status: EVENT_STATUSES.DRAFT,
        },
      ],
    });

    expect(unusedResult).toMatchObject({
      id: String(unusedAsset._id),

      filenameOriginal: "unused.png",

      isUsed: false,
      usedBy: [],
    });

    expectNoInternalFields(listResponse.body);

    const deleteResponse = await request(app)
      .delete(`/api/admin/media-assets/events/${unusedAsset._id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(200);

    expect(deleteResponse.body).toEqual({
      success: true,
      data: {
        deleted: true,
      },
    });

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "media/events/unused.png",
      storageTarget: "local",
    });

    const deletedInDb = await MediaAsset.findById(unusedAsset._id).lean();

    expect(deletedInDb).toBeNull();
  });

  it("rejects access without authentication", async () => {
    const response = await request(app).get("/api/admin/media-assets/events");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      success: false,

      error: {
        code: "AUTH_TOKEN_REQUIRED",
      },
    });
  });
});
