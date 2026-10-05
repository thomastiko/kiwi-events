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
let EventUser;
let DiscountCodeGroup;
let DiscountCode;

let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let hashPassword;

async function loadDiscountCodesIntegrationApp() {
  vi.resetModules();

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
    },
  }));

  const TEST_FEATURES = {
    ticketing: true,
    discountCodes: true,
  };

  vi.doMock("../../../src/config/features.js", () => ({
    features: TEST_FEATURES,
    getDefaultFeatures: () => TEST_FEATURES,
    getRuntimeFeatureOverrides: () => ({}),
    getFeatures: () => TEST_FEATURES,
    isFeatureEnabled: (featureName) => TEST_FEATURES[featureName] === true,
  }));

  const expressModule = await import("express");

  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const discountCodeGroupModelModule =
    await import("../../../src/modules/discountCodes/discountCodeGroup.model.js");
  const discountCodeModelModule =
    await import("../../../src/modules/discountCodes/discountCode.model.js");
  const passwordServiceModule =
    await import("../../../src/core/security/password.service.js");

  const eventRoutesModule =
    await import("../../../src/modules/events/internal/event.internal.routes.js");
  const discountCodeRoutesModule =
    await import("../../../src/modules/discountCodes/internal/discountCode.internal.routes.js");
  const adminAuthRoutesModule =
    await import("../../../src/modules/adminAuth/adminAuth.routes.js");
  const featureMiddlewareModule =
    await import("../../../src/core/middleware/feature.middleware.js");
  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");
  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EventUser = eventUserModelModule.EventUser;
  EVENT_USER_ROLES = eventUserModelModule.EVENT_USER_ROLES;
  EVENT_USER_AUTH_PROVIDER = eventUserModelModule.EVENT_USER_AUTH_PROVIDER;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  DiscountCodeGroup = discountCodeGroupModelModule.DiscountCodeGroup;
  DiscountCode = discountCodeModelModule.DiscountCode;
  hashPassword = passwordServiceModule.hashPassword;

  const router = expressModule.default.Router();

  router.use("/admin/auth", adminAuthRoutesModule.default);
  router.use("/admin/events", eventRoutesModule.default);
  router.use(
    "/admin/discount-codes",
    featureMiddlewareModule.requireFeature("ticketing"),
    featureMiddlewareModule.requireFeature("discountCodes"),
    discountCodeRoutesModule.default,
  );

  app = createHttpTestApp({
    mountPath: "/api",
    router,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminAndToken({
  emailSnapshot = "admin@example.com",
  password = "secret123",
} = {}) {
  const passwordHash = await hashPassword(password);

  const admin = await EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot,
    passwordHash,
    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",
    role: EVENT_USER_ROLES.ADMIN,
    isActive: true,
    mustChangePassword: false,
    grants: [],
    denies: [],
  });

  const loginResponse = await request(app).post("/api/admin/auth/login").send({
    email: emailSnapshot,
    password,
  });

  expect(loginResponse.status).toBe(200);

  return {
    admin,
    accessToken: loginResponse.body.data.accessToken,
  };
}

function buildEventPayload(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    title: "Discount Code Integration Event",
    slug: `discount-code-integration-event-${suffix}`,
    shortDescription: "Discount code integration event",
    description: "Created by the discount code integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [
      {
        startAt: "2030-06-10T10:00:00.000Z",
        endAt: "2030-06-10T12:00:00.000Z",
        timezone: "Europe/Vienna",
        locationLabel: "Audimax",
        locationDetails: "Room 1",
        capacity: 100,
      },
    ],
    tags: [],
    faqs: [],
    isFree: false,
    salesStartAt: "2030-01-01T00:00:00.000Z",
    salesEndAt: "2030-06-09T00:00:00.000Z",
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Discount code integration test",
    ...overrides,
  };
}

async function createEvent(accessToken, overrides = {}) {
  const response = await request(app)
    .post("/api/admin/events")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(buildEventPayload(overrides));

  expect(response.status).toBe(201);

  return response.body.data;
}

async function createGroup(accessToken, eventId, overrides = {}) {
  const response = await request(app)
    .post("/api/admin/discount-codes/groups")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      eventId,
      name: "Partner",
      discountPercent: 10,
      ...overrides,
    });

  expect(response.status).toBe(201);

  return response.body.data;
}

describe("Discount codes MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadDiscountCodesIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("manages groups and codes, normalizes codes and enforces uniqueness per event", async () => {
    const { accessToken } = await createAdminAndToken();
    const event = await createEvent(accessToken);
    const group = await createGroup(accessToken, event.id);

    expect(group).toMatchObject({
      id: expect.any(String),
      eventId: event.id,
      name: "Partner",
      discountPercent: 10,
      isActive: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listGroupsResponse = await request(app)
      .get("/api/admin/discount-codes/groups")
      .query({
        eventId: event.id,
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listGroupsResponse.status).toBe(200);
    expect(listGroupsResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: group.id,
          eventId: event.id,
        }),
      ]),
    );

    const updateGroupResponse = await request(app)
      .patch(`/api/admin/discount-codes/groups/${group.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Partners 2026",
        discountPercent: 15,
        isActive: false,
      });

    expect(updateGroupResponse.status).toBe(200);
    expect(updateGroupResponse.body.data).toMatchObject({
      id: group.id,
      eventId: event.id,
      name: "Partners 2026",
      discountPercent: 15,
      isActive: false,
    });

    const createCodesResponse = await request(app)
      .post(`/api/admin/discount-codes/groups/${group.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        codes: ["partner-15", "vip_15"],
      });

    expect(createCodesResponse.status).toBe(201);
    expect(createCodesResponse.body.data).toHaveLength(2);
    expect(createCodesResponse.body.data.map((item) => item.code)).toEqual([
      "PARTNER-15",
      "VIP_15",
    ]);

    const firstCode = createCodesResponse.body.data[0];

    const updateCodeResponse = await request(app)
      .patch(`/api/admin/discount-codes/${firstCode.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        code: "partner-special",
        isActive: false,
      });

    expect(updateCodeResponse.status).toBe(200);
    expect(updateCodeResponse.body.data).toMatchObject({
      id: firstCode.id,
      eventId: event.id,
      groupId: group.id,
      code: "PARTNER-SPECIAL",
      isActive: false,
    });

    const deleteCodeResponse = await request(app)
      .delete(`/api/admin/discount-codes/${firstCode.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteCodeResponse.status).toBe(200);
    expect(deleteCodeResponse.body.data).toEqual({
      deleted: true,
    });

    const listCodesResponse = await request(app)
      .get(`/api/admin/discount-codes/groups/${group.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listCodesResponse.status).toBe(200);
    expect(listCodesResponse.body.data.map((item) => item.code)).toEqual([
      "VIP_15",
    ]);

    const duplicateResponse = await request(app)
      .post(`/api/admin/discount-codes/groups/${group.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        codes: ["vip_15"],
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toMatchObject({
      success: false,
      error: {
        code: "DISCOUNT_CODE_ALREADY_EXISTS",
      },
    });

    const secondEvent = await createEvent(accessToken, {
      title: "Second Discount Event",
      slug: "second-discount-event",
    });
    const secondGroup = await createGroup(accessToken, secondEvent.id, {
      name: "Second Event Group",
    });

    const sameCodeOtherEventResponse = await request(app)
      .post(`/api/admin/discount-codes/groups/${secondGroup.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        codes: ["vip_15"],
      });

    expect(sameCodeOtherEventResponse.status).toBe(201);
    expect(sameCodeOtherEventResponse.body.data[0].code).toBe("VIP_15");
  });

  it("generates unique readable codes and cascades codes when a group is deleted", async () => {
    const { accessToken } = await createAdminAndToken();
    const event = await createEvent(accessToken);
    const group = await createGroup(accessToken, event.id);

    const generateResponse = await request(app)
      .post(`/api/admin/discount-codes/groups/${group.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        generateCount: 4,
      });

    expect(generateResponse.status).toBe(201);
    expect(generateResponse.body.data).toHaveLength(4);

    const generatedValues = generateResponse.body.data.map((item) => item.code);

    expect(new Set(generatedValues).size).toBe(4);

    for (const code of generatedValues) {
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }

    const listCodesResponse = await request(app)
      .get(`/api/admin/discount-codes/groups/${group.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listCodesResponse.status).toBe(200);
    expect(listCodesResponse.body.data).toHaveLength(4);

    const deleteGroupResponse = await request(app)
      .delete(`/api/admin/discount-codes/groups/${group.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteGroupResponse.status).toBe(200);
    expect(deleteGroupResponse.body.data).toEqual({
      deleted: true,
    });

    expect(
      await DiscountCode.countDocuments({
        groupId: group.id,
      }),
    ).toBe(0);

    expect(await DiscountCodeGroup.countDocuments({ _id: group.id })).toBe(0);
  });

  it("removes discount code data when an unused event is hard deleted", async () => {
    const { accessToken } = await createAdminAndToken();
    const event = await createEvent(accessToken, {
      slug: "discount-event-delete-cleanup",
    });
    const group = await createGroup(accessToken, event.id);

    const createCodesResponse = await request(app)
      .post(`/api/admin/discount-codes/groups/${group.id}/codes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        codes: ["DELETE-ME"],
      });

    expect(createCodesResponse.status).toBe(201);

    const deleteEventResponse = await request(app)
      .delete(`/api/admin/events/${event.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteEventResponse.status).toBe(200);
    expect(deleteEventResponse.body.data).toEqual({
      deleted: true,
    });

    expect(
      await DiscountCode.countDocuments({
        eventId: event.id,
      }),
    ).toBe(0);

    expect(
      await DiscountCodeGroup.countDocuments({
        eventId: event.id,
      }),
    ).toBe(0);
  });
});
