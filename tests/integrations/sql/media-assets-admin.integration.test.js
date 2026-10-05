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

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let app;
let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEventUser;
let createMediaAsset;
let createEvent;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let deleteObjectMock;

async function loadMediaAssetsAdminSqlApp() {
  vi.resetModules();
  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;

  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;

  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;
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

  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");

  const eventUserRepositoryModule =
    await import("../../../src/modules/eventUsers/repositories/eventUser.repository.js");

  const mediaAssetRepositoryModule =
    await import("../../../src/modules/mediaAssets/repositories/mediaAsset.repository.js");

  const eventRepositoryModule =
    await import("../../../src/modules/events/repositories/event.repository.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");

  const routesModule =
    await import("../../../src/modules/mediaAssets/internal/mediaAsset.internal.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  createEventUser = eventUserRepositoryModule.createEventUser;

  createMediaAsset = mediaAssetRepositoryModule.createMediaAsset;

  createEvent = eventRepositoryModule.createEvent;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

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
  const admin = await createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot: "admin@example.com",
    passwordHash: "not-used",

    externalProvider: null,
    externalUserId: null,

    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",

    profileBio: "",
    profileImageAssetId: null,

    role: EVENT_USER_ROLES.ADMIN,

    isActive: true,
    mustChangePassword: false,

    lastLoginAt: null,
    notes: "",
  });

  return jwt.sign(
    {
      eventUserId: admin.id,
      email: admin.emailSnapshot,
      role: EVENT_USER_ROLES.ADMIN,
      type: "KIWI_EVENTS_admin",
    },
    LOCAL_SECRET,
  );
}

async function createEventImageAsset({ key, filename }) {
  return createMediaAsset({
    kind: "event_image",

    folder: "media/events",
    key,
    storageTarget: "local",

    filenameOriginal: filename,
    mimeType: "image/png",
    size: 1234,

    createdByEventUserId: null,
    updatedByEventUserId: null,
  });
}

async function createEventUsingAsset(asset) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return createEvent({
    title: "Media Asset Usage Event",

    slug: `media-asset-usage-${Date.now()}`,

    shortDescription: "",
    description: "",

    category: EVENT_CATEGORIES.EVENT,

    status: EVENT_STATUSES.DRAFT,

    visibility: EVENT_VISIBILITIES.PUBLIC,

    location: "",

    imageAssetIds: [asset.id],

    tags: [],

    sessions: [
      {
        startAt,
        endAt,

        timezone: "Europe/Vienna",

        locationLabel: "",
        locationDetails: "",

        capacity: null,

        status: "scheduled",
      },
    ],

    faqs: [],

    isFree: true,

    createdByEventUserId: null,
    updatedByEventUserId: null,
  });
}

function expectUuid(value) {
  expect(value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
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

describe("Admin media assets SQL HTTP contract", () => {
  beforeAll(async () => {
    await loadMediaAssetsAdminSqlApp();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    deleteObjectMock.mockClear();
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

  it("lists canonical event image assets and deletes one through its UUID route", async () => {
    const accessToken = await createAdminToken();

    const usedAsset = await createEventImageAsset({
      key: "media/events/used.png",
      filename: "used.png",
    });

    const unusedAsset = await createEventImageAsset({
      key: "media/events/unused.png",
      filename: "unused.png",
    });

    expectUuid(usedAsset.id);
    expectUuid(unusedAsset.id);

    const event = await createEventUsingAsset(usedAsset);

    const listResponse = await request(app)
      .get("/api/admin/media-assets/events")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);
    expect(listResponse.body.data).toHaveLength(2);

    const usedResult = listResponse.body.data.find(
      (asset) => asset.id === usedAsset.id,
    );

    const unusedResult = listResponse.body.data.find(
      (asset) => asset.id === unusedAsset.id,
    );

    expect(usedResult).toMatchObject({
      id: usedAsset.id,

      kind: "event_image",

      fileUrl: `/api/public/media-assets/${usedAsset.id}/file`,

      filenameOriginal: "used.png",
      mimeType: "image/png",
      size: 1234,

      isUsed: true,

      usedBy: [
        {
          eventId: event.id,
          title: "Media Asset Usage Event",
          slug: event.slug,
          status: EVENT_STATUSES.DRAFT,
        },
      ],
    });

    expect(unusedResult).toMatchObject({
      id: unusedAsset.id,

      filenameOriginal: "unused.png",

      isUsed: false,
      usedBy: [],
    });

    expectNoInternalFields(listResponse.body);

    /*
     * Important:
     * unusedAsset.id is a SQL UUID.
     * This proves the admin route is provider-neutral.
     */
    const deleteResponse = await request(app)
      .delete(`/api/admin/media-assets/events/${unusedAsset.id}`)
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
