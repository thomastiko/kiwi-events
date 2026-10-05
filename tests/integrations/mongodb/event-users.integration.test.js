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

let EventUser;
let MediaAsset;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let MEDIA_ASSET_KINDS;

let createEventUser;
let updateEventUser;
let deactivateEventUser;
let deleteEventUser;
let upsertEventUserByExternalUser;
let deactivateEventUserByExternalUser;
let reactivateEventUserByExternalUser;
let uploadEventUserProfileImage;
let deleteEventUserProfileImage;

let uploadBufferMock;
let deleteObjectMock;

async function loadEventUserIntegrationModules() {
  vi.resetModules();

  uploadBufferMock = vi
    .fn()
    .mockImplementation(async ({ folder, originalName, storageTarget }) => ({
      key: `${folder}/profile-${uploadBufferMock.mock.calls.length}-${originalName || "profile.png"}`,
      bucket: "mock-storage",
      storageTarget: storageTarget || "local",
    }));

  deleteObjectMock = vi.fn().mockResolvedValue({
    success: true,
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: "integration-local-jwt-secret",
      auth: {
        provider: "hybrid",
        localJwtSecret: "integration-local-jwt-secret",
        externalJwtSecret: "integration-external-jwt-secret",
      },
      storage: {
        public: {
          publicBaseUrl: "https://assets.example.test",
        },
      },
      features: {
        media: true,
        ticketing: true,
        mail: false,
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
  }));

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: uploadBufferMock,
    deleteObject: deleteObjectMock,
  }));

  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
  const mediaAssetModelModule =
    await import("../../../src/modules/mediaAssets/mediaAssets.model.js");
  const mediaAssetConstantsModule =
    await import("../../../src/modules/mediaAssets/mediaAsset.constants.js");
  const eventUserControllerModule =
    await import("../../../src/modules/eventUsers/eventUser.controller.js");

  EventUser = eventUserModelModule.EventUser;
  MediaAsset = mediaAssetModelModule.MediaAsset;

  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;

  MEDIA_ASSET_KINDS = mediaAssetConstantsModule.MEDIA_ASSET_KINDS;

  createEventUser = eventUserControllerModule.createEventUser;
  updateEventUser = eventUserControllerModule.updateEventUser;
  deactivateEventUser = eventUserControllerModule.deactivateEventUser;
  deleteEventUser = eventUserControllerModule.deleteEventUser;
  upsertEventUserByExternalUser =
    eventUserControllerModule.upsertEventUserByExternalUser;
  deactivateEventUserByExternalUser =
    eventUserControllerModule.deactivateEventUserByExternalUser;
  reactivateEventUserByExternalUser =
    eventUserControllerModule.reactivateEventUserByExternalUser;
  uploadEventUserProfileImage =
    eventUserControllerModule.uploadEventUserProfileImage;
  deleteEventUserProfileImage =
    eventUserControllerModule.deleteEventUserProfileImage;
}

function createResponseMock() {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((statusCode) => {
      res.statusCode = statusCode;
      return res;
    }),
    json: vi.fn((body) => {
      res.body = body;
      return res;
    }),
  };

  return res;
}

async function callController(handler, req) {
  const res = createResponseMock();

  await handler(req, res);

  return res;
}

function buildImageFile(overrides = {}) {
  const buffer = createTestPngBuffer();

  return {
    fieldname: "image",
    originalname: "profile.png",
    encoding: "7bit",
    mimetype: "image/png",
    buffer,
    size: buffer.length,
    ...overrides,
  };
}

async function createEventUserDirectly(overrides = {}) {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
    emailSnapshot: "direct@example.com",
    externalProvider: "dummy",
    externalUserId: `direct-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    firstNameSnapshot: "Direct",
    lastNameSnapshot: "User",
    role: EVENT_USER_ROLES.EVENT_MANAGER,
    isActive: true,
    notes: "",
    ...overrides,
  });
}

describe("EventUsers MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadEventUserIntegrationModules();
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

  it("creates a local EventUser with normalized email and hidden password hash", async () => {
    const res = await callController(createEventUser, {
      validated: {
        body: {
          authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
          emailSnapshot: "LOCAL@Example.COM",
          password: "secret123",
          firstNameSnapshot: " Local ",
          lastNameSnapshot: " User ",
          role: EVENT_USER_ROLES.ADMIN,
          mustChangePassword: true,
          notes: " Local admin ",
        },
      },
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.success).toBe(true);

    expect(res.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
      emailSnapshot: "local@example.com",
      externalProvider: null,
      externalUserId: null,
      firstNameSnapshot: "Local",
      lastNameSnapshot: "User",
      role: EVENT_USER_ROLES.ADMIN,
      mustChangePassword: true,
      notes: "Local admin",
      isActive: true,
    });

    expect(res.body.data.passwordHash).toBeUndefined();

    const userInDb = await EventUser.findById(res.body.data.id)
      .select("+passwordHash")
      .lean();

    expect(userInDb.emailSnapshot).toBe("local@example.com");
    expect(userInDb.passwordHash).toBeTruthy();
    expect(userInDb.passwordHash).not.toBe("secret123");
  });

  it("creates an external EventUser without local password hash", async () => {
    const res = await callController(createEventUser, {
      validated: {
        body: {
          authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
          emailSnapshot: "external@example.com",
          externalProvider: "dummy",
          externalUserId: "host-user-1",
          firstNameSnapshot: "External",
          lastNameSnapshot: "User",
          role: EVENT_USER_ROLES.EVENT_MANAGER,
        },
      },
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
      emailSnapshot: "external@example.com",
      externalProvider: "dummy",
      externalUserId: "host-user-1",
      firstNameSnapshot: "External",
      lastNameSnapshot: "User",
      role: EVENT_USER_ROLES.EVENT_MANAGER,
      isActive: true,
    });

    const userInDb = await EventUser.findById(res.body.data.id)
      .select("+passwordHash")
      .lean();

    expect(userInDb.passwordHash).toBeNull();
  });

  it("creates a hybrid EventUser with external identity and local password", async () => {
    const res = await callController(createEventUser, {
      validated: {
        body: {
          authProvider: EVENT_USER_AUTH_PROVIDER.HYBRID,
          emailSnapshot: "hybrid@example.com",
          password: "secret123",
          externalProvider: "dummy",
          externalUserId: "host-hybrid-1",
          firstNameSnapshot: "Hybrid",
          lastNameSnapshot: "User",
          role: EVENT_USER_ROLES.EVENT_ADMIN,
        },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.HYBRID,
      emailSnapshot: "hybrid@example.com",
      externalProvider: "dummy",
      externalUserId: "host-hybrid-1",
    });

    const userInDb = await EventUser.findById(res.body.data.id)
      .select("+passwordHash")
      .lean();

    expect(userInDb.passwordHash).toBeTruthy();
    expect(userInDb.passwordHash).not.toBe("secret123");
  });

  it("blocks duplicate local or hybrid email addresses", async () => {
    await createEventUserDirectly({
      authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
      emailSnapshot: "duplicate@example.com",
      passwordHash: "hash",
      externalProvider: null,
      externalUserId: null,
      role: EVENT_USER_ROLES.ADMIN,
    });

    await expect(
      callController(createEventUser, {
        validated: {
          body: {
            authProvider: EVENT_USER_AUTH_PROVIDER.HYBRID,
            emailSnapshot: "DUPLICATE@example.com",
            password: "secret123",
            externalProvider: "dummy",
            externalUserId: "unique-external-id",
            role: EVENT_USER_ROLES.EVENT_MANAGER,
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "This email is already used by another local or hybrid EventUser.",
    });
  });

  it("blocks duplicate external identities", async () => {
    await createEventUserDirectly({
      authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
      emailSnapshot: "first@example.com",
      externalProvider: "dummy",
      externalUserId: "duplicate-external-id",
    });

    await expect(
      callController(createEventUser, {
        validated: {
          body: {
            authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
            emailSnapshot: "second@example.com",
            externalProvider: "dummy",
            externalUserId: "duplicate-external-id",
            role: EVENT_USER_ROLES.EVENT_MANAGER,
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "This external identity is already linked to another EventUser.",
    });
  });

  it("updates an external EventUser with a password and converts it to hybrid", async () => {
    const eventUser = await createEventUserDirectly({
      authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
      emailSnapshot: "external-to-hybrid@example.com",
      externalProvider: "dummy",
      externalUserId: "external-to-hybrid-1",
      role: EVENT_USER_ROLES.EVENT_MANAGER,
    });

    const res = await callController(updateEventUser, {
      validated: {
        params: {
          id: String(eventUser._id),
        },
        body: {
          emailSnapshot: "new-login@example.com",
          password: "secret123",
          firstNameSnapshot: "Updated",
          role: EVENT_USER_ROLES.EVENT_ADMIN,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.HYBRID,
      emailSnapshot: "new-login@example.com",
      externalProvider: "dummy",
      externalUserId: "external-to-hybrid-1",
      firstNameSnapshot: "Updated",
      role: EVENT_USER_ROLES.EVENT_ADMIN,
    });

    const userInDb = await EventUser.findById(eventUser._id)
      .select("+passwordHash")
      .lean();

    expect(userInDb.authProvider).toBe(EVENT_USER_AUTH_PROVIDER.HYBRID);
    expect(userInDb.passwordHash).toBeTruthy();
    expect(userInDb.passwordHash).not.toBe("secret123");
  });

  it("deactivates and deletes EventUsers by id", async () => {
    const eventUser = await createEventUserDirectly({
      externalUserId: "deactivate-delete-user",
      isActive: true,
    });

    const deactivateRes = await callController(deactivateEventUser, {
      validated: {
        params: {
          id: String(eventUser._id),
        },
      },
    });

    expect(deactivateRes.statusCode).toBe(200);
    expect(deactivateRes.body.data.isActive).toBe(false);

    const inactiveInDb = await EventUser.findById(eventUser._id).lean();
    expect(inactiveInDb.isActive).toBe(false);

    const deleteRes = await callController(deleteEventUser, {
      validated: {
        params: {
          id: String(eventUser._id),
        },
      },
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body).toEqual({
      success: true,
      data: {
        deleted: true,
      },
    });

    const deletedInDb = await EventUser.findById(eventUser._id).lean();
    expect(deletedInDb).toBeNull();
  });

  it("upserts, updates, deactivates and reactivates an EventUser by external identity", async () => {
    const createRes = await callController(upsertEventUserByExternalUser, {
      validated: {
        params: {
          provider: "dummy",
          externalUserId: "bridge-user-1",
        },
        body: {
          authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
          emailSnapshot: "bridge@example.com",
          firstNameSnapshot: "Bridge",
          lastNameSnapshot: "User",
          role: EVENT_USER_ROLES.EVENT_MANAGER,
        },
      },
    });

    expect(createRes.statusCode).toBe(200);
    expect(createRes.body.data).toMatchObject({
      authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
      externalProvider: "dummy",
      externalUserId: "bridge-user-1",
      emailSnapshot: "bridge@example.com",
      firstNameSnapshot: "Bridge",
      role: EVENT_USER_ROLES.EVENT_MANAGER,
      isActive: true,
    });

    const firstId = createRes.body.data.id;

    const updateRes = await callController(upsertEventUserByExternalUser, {
      validated: {
        params: {
          provider: "dummy",
          externalUserId: "bridge-user-1",
        },
        body: {
          authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
          emailSnapshot: "bridge.updated@example.com",
          firstNameSnapshot: "Bridge Updated",
          lastNameSnapshot: "User",
          role: EVENT_USER_ROLES.EVENT_ADMIN,
        },
      },
    });

    expect(updateRes.body.data.id).toBe(firstId);
    expect(updateRes.body.data).toMatchObject({
      emailSnapshot: "bridge.updated@example.com",
      firstNameSnapshot: "Bridge Updated",
      role: EVENT_USER_ROLES.EVENT_ADMIN,
      isActive: true,
    });

    const deactivateRes = await callController(
      deactivateEventUserByExternalUser,
      {
        validated: {
          params: {
            provider: "dummy",
            externalUserId: "bridge-user-1",
          },
        },
      },
    );

    expect(deactivateRes.body.data.isActive).toBe(false);

    const reactivateRes = await callController(
      reactivateEventUserByExternalUser,
      {
        validated: {
          params: {
            provider: "dummy",
            externalUserId: "bridge-user-1",
          },
        },
      },
    );

    expect(reactivateRes.body.data.isActive).toBe(true);

    const usersInDb = await EventUser.find({
      externalProvider: "dummy",
      externalUserId: "bridge-user-1",
    }).lean();

    expect(usersInDb).toHaveLength(1);
    expect(usersInDb[0].isActive).toBe(true);
  });

  it("uploads and replaces an EventUser profile image while deleting the old storage object", async () => {
    const actingUser = await createEventUserDirectly({
      externalUserId: "acting-profile-admin",
      role: EVENT_USER_ROLES.ADMIN,
    });

    const targetUser = await createEventUserDirectly({
      externalUserId: "profile-target",
      profileImageAssetId: null,
    });

    const firstUploadRes = await callController(uploadEventUserProfileImage, {
      validated: {
        params: {
          id: String(targetUser._id),
        },
        query: {
          storageTarget: "public",
        },
      },
      file: buildImageFile({
        originalname: "first-profile.png",
      }),
      eventUser: actingUser,
    });

    expect(firstUploadRes.statusCode).toBe(200);
    expect(firstUploadRes.body.data.profileImageAssetId).toBeTruthy();
    expect(firstUploadRes.body.data.profileImageAsset).toMatchObject({
      filenameOriginal: "first-profile.png",
      mimeType: "image/png",
    });
    const returnedProfileImage = firstUploadRes.body.data.profileImageAsset;

    expect(returnedProfileImage.fileUrl).toMatch(
      /^https:\/\/assets\.example\.test\//,
    );

    expect(returnedProfileImage).not.toHaveProperty("url");
    expect(returnedProfileImage).not.toHaveProperty("proxyUrl");
    expect(returnedProfileImage).not.toHaveProperty("storageUrl");
    expect(returnedProfileImage).not.toHaveProperty("key");

    const firstAssetId = firstUploadRes.body.data.profileImageAssetId;

    const firstAssetInDb = await MediaAsset.findById(firstAssetId).lean();

    expect(firstAssetInDb).toMatchObject({
      kind: MEDIA_ASSET_KINDS.EVENT_STAFF_PROFILE_IMAGE,
      folder: "events/staff/profile-images",
      filenameOriginal: "first-profile.png",
      storageTarget: "public",
    });
    expect(firstAssetInDb).not.toHaveProperty("url");
    expect(returnedProfileImage.fileUrl).toBe(
      `https://assets.example.test/${firstAssetInDb.key}`,
    );

    expect(deleteObjectMock).not.toHaveBeenCalled();

    const secondUploadRes = await callController(uploadEventUserProfileImage, {
      validated: {
        params: {
          id: String(targetUser._id),
        },
        query: {
          storageTarget: "private",
        },
      },
      file: buildImageFile({
        originalname: "second-profile.png",
      }),
      eventUser: actingUser,
    });

    expect(secondUploadRes.statusCode).toBe(200);

    const secondAssetId = secondUploadRes.body.data.profileImageAssetId;

    expect(String(secondAssetId)).not.toBe(String(firstAssetId));

    const oldAssetInDb = await MediaAsset.findById(firstAssetId).lean();
    const secondAssetInDb = await MediaAsset.findById(secondAssetId).lean();

    expect(oldAssetInDb).toBeNull();
    expect(secondAssetInDb).toMatchObject({
      storageTarget: "private",
    });

    expect(deleteObjectMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: firstAssetInDb.key,
      storageTarget: "public",
    });
  });

  it("keeps the previous profile image when replacement upload fails", async () => {
    const actingUser = await createEventUserDirectly({
      externalUserId: "acting-profile-rollback-admin",
      role: EVENT_USER_ROLES.ADMIN,
    });

    const targetUser = await createEventUserDirectly({
      externalUserId: "profile-rollback-target",
      profileImageAssetId: null,
    });

    const firstUploadRes = await callController(uploadEventUserProfileImage, {
      validated: {
        params: {
          id: String(targetUser._id),
        },
        query: {
          storageTarget: "private",
        },
      },
      file: buildImageFile({
        originalname: "stable-profile.png",
      }),
      eventUser: actingUser,
    });

    const oldAssetId = firstUploadRes.body.data.profileImageAssetId;
    const oldAsset = await MediaAsset.findById(oldAssetId).lean();

    uploadBufferMock.mockRejectedValueOnce(new Error("upload failed"));

    await expect(
      uploadEventUserProfileImage(
        {
          validated: {
            params: {
              id: String(targetUser._id),
            },
            query: {
              storageTarget: "public",
            },
          },
          file: buildImageFile({
            originalname: "failed-profile.png",
          }),
          eventUser: actingUser,
        },
        createResponseMock(),
      ),
    ).rejects.toThrow("upload failed");

    const targetInDb = await EventUser.findById(targetUser._id).lean();
    const oldAssetInDb = await MediaAsset.findById(oldAssetId).lean();

    expect(String(targetInDb.profileImageAssetId)).toBe(String(oldAssetId));
    expect(oldAssetInDb).toMatchObject({
      key: oldAsset.key,
      storageTarget: "private",
    });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("deletes an EventUser profile image and clears profileImageAssetId", async () => {
    const actingUser = await createEventUserDirectly({
      externalUserId: "acting-profile-delete-admin",
      role: EVENT_USER_ROLES.ADMIN,
    });

    const targetUser = await createEventUserDirectly({
      externalUserId: "profile-delete-target",
      profileImageAssetId: null,
    });

    const uploadRes = await callController(uploadEventUserProfileImage, {
      validated: {
        params: {
          id: String(targetUser._id),
        },
        query: {},
      },
      file: buildImageFile({
        originalname: "delete-profile.png",
      }),
      eventUser: actingUser,
    });

    const assetId = uploadRes.body.data.profileImageAssetId;
    const assetInDb = await MediaAsset.findById(assetId).lean();

    vi.clearAllMocks();

    const deleteRes = await callController(deleteEventUserProfileImage, {
      validated: {
        params: {
          id: String(targetUser._id),
        },
      },
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.data.profileImageAssetId).toBeNull();

    const targetInDb = await EventUser.findById(targetUser._id).lean();
    const deletedAssetInDb = await MediaAsset.findById(assetId).lean();

    expect(targetInDb.profileImageAssetId).toBeNull();
    expect(deletedAssetInDb).toBeNull();

    expect(deleteObjectMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: assetInDb.key,
      storageTarget: "local",
    });
  });
});
