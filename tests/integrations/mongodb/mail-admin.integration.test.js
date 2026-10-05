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

let EventUser;
let EVENT_USER_ROLES;
let EVENT_USER_AUTH_PROVIDER;

let sendMailMock;

async function loadMailAdminMongoIntegrationApp() {
  vi.resetModules();

  sendMailMock = vi.fn().mockResolvedValue({
    messageId: "mail_admin_provider_message_1",
    response: "250 queued",
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },

      mail: {
        provider: "smtp",

        defaults: {
          fromName: "Kiwi Events Test",
          fromEmail: "noreply@example.test",
          replyTo: "reply@example.test",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/mail/mail.transport.service.js", () => ({
    getDefaultMailSender: () => ({
      fromName: "Kiwi Events Test",
      fromEmail: "noreply@example.test",
      replyTo: "reply@example.test",
    }),

    sendMail: sendMailMock,

    clearCachedMailTransporter: vi.fn(),

    verifyMailTransport: vi.fn().mockResolvedValue(true),
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    isMongoDatabase: () => true,
    isSqlDatabase: () => false,
    getDatabaseConnection: vi.fn(),
  }));

  const eventUserModelModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");

  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");

  const mailRoutesModule =
    await import("../../../src/modules/mail/internal/mail.internal.routes.js");

  const errorHandlerModule =
    await import("../../../src/core/errors/errorHandler.js");

  const notFoundHandlerModule =
    await import("../../../src/core/errors/notFoundHandler.js");

  EventUser = eventUserModelModule.EventUser;

  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;

  app = createHttpTestApp({
    mountPath: "/api/admin/mail",
    router: mailRoutesModule.default,
    notFoundHandler: notFoundHandlerModule.notFoundHandler,
    errorHandler: errorHandlerModule.errorHandler,
  });
}

async function createAdminToken() {
  const admin = await EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,

    emailSnapshot: "admin@example.com",
    passwordHash: "not-used-in-this-test",

    firstNameSnapshot: "Admin",
    lastNameSnapshot: "User",

    role: EVENT_USER_ROLES.ADMIN,

    isActive: true,
    mustChangePassword: false,
  });

  return jwt.sign(
    {
      eventUserId: String(admin._id),
      email: "admin@example.com",
      role: EVENT_USER_ROLES.ADMIN,
      type: "KIWI_EVENTS_admin",
    },
    LOCAL_SECRET,
  );
}

function buildTemplatePayload(overrides = {}) {
  return {
    key: "admin.contract.test",
    module: "mail",
    category: "integration",

    name: "Admin contract test",

    description: "Template for the admin mail HTTP contract.",

    subject: "Hello {{firstName}}",

    html: "<p>Hello {{firstName}}</p>",
    text: "Hello {{firstName}}",

    variables: ["firstName"],

    fromName: "",
    fromEmail: "",
    replyTo: "",

    status: "active",
    ...overrides,
  };
}

function expectNoPersistenceFields(value) {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('"_id"');
  expect(serialized).not.toContain('"__v"');
}

function expectMongoId(value) {
  expect(value).toMatch(/^[a-f\d]{24}$/i);
}

describe("Admin mail MongoDB HTTP contract", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadMailAdminMongoIntegrationApp();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    sendMailMock.mockClear();
    sendMailMock.mockResolvedValue({
      messageId: "mail_admin_provider_message_1",
      response: "250 queued",
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses one canonical HTTP contract for templates and logs", async () => {
    const accessToken = await createAdminToken();

    /*
     * CREATE TEMPLATE
     */
    const createResponse = await request(app)
      .post("/api/admin/mail/templates")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(buildTemplatePayload());

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);

    const templateId = createResponse.body.data.id;

    expectMongoId(templateId);

    expect(createResponse.body.data).toMatchObject({
      id: templateId,

      key: "admin.contract.test",
      module: "mail",
      category: "integration",

      name: "Admin contract test",

      subject: "Hello {{firstName}}",

      status: "active",
      isSystem: false,
    });

    expectNoPersistenceFields(createResponse.body);

    /*
     * LIST TEMPLATES
     */
    const listResponse = await request(app)
      .get("/api/admin/mail/templates?page=1&limit=10&module=mail")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);

    expect(listResponse.body).toMatchObject({
      success: true,

      meta: {
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      },
    });

    expect(listResponse.body.pagination).toBeUndefined();

    expect(listResponse.body.data).toHaveLength(1);

    expect(listResponse.body.data[0].id).toBe(templateId);

    expectNoPersistenceFields(listResponse.body);

    /*
     * DETAIL
     */
    const detailResponse = await request(app)
      .get(`/api/admin/mail/templates/${templateId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(detailResponse.status).toBe(200);

    expect(detailResponse.body.data).toMatchObject({
      id: templateId,
      key: "admin.contract.test",
    });

    expectNoPersistenceFields(detailResponse.body);

    /*
     * UPDATE
     */
    const updateResponse = await request(app)
      .patch(`/api/admin/mail/templates/${templateId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Updated admin contract test",
        subject: "Updated {{firstName}}",
      });

    expect(updateResponse.status).toBe(200);

    expect(updateResponse.body.data).toMatchObject({
      id: templateId,
      name: "Updated admin contract test",
      subject: "Updated {{firstName}}",
    });

    expectNoPersistenceFields(updateResponse.body);

    /*
     * TEST MAIL
     */
    const testResponse = await request(app)
      .post(`/api/admin/mail/templates/${templateId}/test`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        to: {
          email: "Recipient@Example.com",
          name: "Test Recipient",
        },

        variables: {
          firstName: "Ada",
        },
      });

    expect(testResponse.status).toBe(200);

    expect(testResponse.body).toMatchObject({
      success: true,

      data: {
        success: true,
        providerMessageId: "mail_admin_provider_message_1",
      },
    });

    const firstLogId = testResponse.body.data.emailLogId;

    expectMongoId(firstLogId);

    expect(sendMailMock).toHaveBeenCalledTimes(1);

    /*
     * LIST LOGS
     */
    const logListResponse = await request(app)
      .get("/api/admin/mail/logs?page=1&limit=10&status=sent")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(logListResponse.status).toBe(200);

    expect(logListResponse.body).toMatchObject({
      success: true,

      meta: {
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      },
    });

    expect(logListResponse.body.pagination).toBeUndefined();

    expect(logListResponse.body.data).toHaveLength(1);

    expect(logListResponse.body.data[0]).toMatchObject({
      id: firstLogId,

      templateKey: "admin.contract.test",
      templateId,

      module: "mail",

      to: {
        email: "recipient@example.com",
        name: "Test Recipient",
      },

      status: "sent",

      provider: "smtp",

      source: {
        module: "mail",
        entityType: "EmailTemplate",
        entityId: templateId,
      },
    });

    expectNoPersistenceFields(logListResponse.body);

    /*
     * LOG DETAIL
     */
    const logDetailResponse = await request(app)
      .get(`/api/admin/mail/logs/${firstLogId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(logDetailResponse.status).toBe(200);

    expect(logDetailResponse.body.data).toMatchObject({
      id: firstLogId,
      templateId,
      templateKey: "admin.contract.test",
      status: "sent",
    });

    expectNoPersistenceFields(logDetailResponse.body);

    /*
     * GENERIC LOG RESEND WAS REMOVED
     */
    const removedResendResponse = await request(app)
      .post(`/api/admin/mail/logs/${firstLogId}/resend`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(removedResendResponse.status).toBe(404);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    /*
     * DELETE TEMPLATE
     */
    const deleteResponse = await request(app)
      .delete(`/api/admin/mail/templates/${templateId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(200);

    expect(deleteResponse.body).toEqual({
      success: true,
      data: {
        deleted: true,
      },
    });

    expectNoPersistenceFields(deleteResponse.body);
  });

  it("rejects admin mail access without authentication", async () => {
    const response = await request(app).get("/api/admin/mail/templates");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "AUTH_TOKEN_REQUIRED",
      },
    });
  });
});
