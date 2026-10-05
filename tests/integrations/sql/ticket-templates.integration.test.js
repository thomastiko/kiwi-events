import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEventUser;
let createEvent;
let createTicketType;
let createOrder;
let ensureTicketForOrderSlot;
let findTicketById;
let setTicketPdfDocument;

let getTicketTemplateForEventService;
let saveTicketTemplateForEventService;
let resetTicketTemplateForEventService;
let uploadTicketTemplateImageForEventService;
let deleteTicketTemplateImageForEventService;
let findTicketTemplateByEventId;
let findMediaAssetById;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_USER_ROLES;
let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;
let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let uploadBufferMock;
let deleteObjectMock;

function buildCustomTemplate({
  title = "Custom {{event.title}}",
  imageAssetId = null,
} = {}) {
  const elements = [
    {
      id: "custom-title",
      type: "text",
      x: 30,
      y: 30,
      width: 300,
      value: title,
      font: "Helvetica-Bold",
      fontSize: 18,
      color: "#112233",
      align: "left",
    },
  ];

  if (imageAssetId) {
    elements.push({
      id: "custom-logo",
      type: "image",
      x: 380,
      y: 30,
      width: 120,
      height: 60,
      assetId: String(imageAssetId),
      fit: "contain",
      align: "center",
      valign: "center",
    });
  }

  return {
    page: {
      width: 595.28,
      height: 841.89,
      backgroundColor: "#ffffff",
    },
    elements,
  };
}

async function loadModules() {
  vi.resetModules();

  uploadBufferMock = vi
    .fn()
    .mockImplementation(async ({ folder, originalName, storageTarget }) => ({
      key: `${folder}/${originalName}`,
      bucket: "mock-storage",
      storageTarget: storageTarget || "local",
    }));

  deleteObjectMock = vi.fn().mockResolvedValue({
    success: true,
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      auth: {
        provider: "hybrid",
        localJwtSecret: "integration-local-jwt-secret",
        externalJwtSecret: "integration-external-jwt-secret",
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
          publicBaseUrl: "https://assets.example.test",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: uploadBufferMock,
    deleteObject: deleteObjectMock,
    getBuffer: vi.fn(),
  }));

  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;
  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;
  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;

  const eventUserRepositoryModule =
    await import("../../../src/modules/eventUsers/repositories/eventUser.repository.js");
  const eventRepositoryModule =
    await import("../../../src/modules/events/repositories/event.repository.js");
  const ticketTypeRepositoryModule =
    await import("../../../src/modules/ticketTypes/repositories/ticketType.repository.js");
  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");
  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");
  const mediaAssetRepositoryModule =
    await import("../../../src/modules/mediaAssets/repositories/mediaAsset.repository.js");

  const ticketTemplateServiceModule =
    await import("../../../src/modules/ticketTemplates/ticketTemplate.service.js");
  const ticketTemplateRepositoryModule =
    await import("../../../src/modules/ticketTemplates/repositories/ticketTemplate.repository.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");

  createEventUser = eventUserRepositoryModule.createEventUser;
  createEvent = eventRepositoryModule.createEvent;
  createTicketType = ticketTypeRepositoryModule.createTicketType;
  createOrder = orderRepositoryModule.createOrder;
  ensureTicketForOrderSlot = ticketRepositoryModule.ensureTicketForOrderSlot;
  findTicketById = ticketRepositoryModule.findTicketById;
  setTicketPdfDocument = ticketRepositoryModule.setTicketPdfDocument;
  findMediaAssetById = mediaAssetRepositoryModule.findMediaAssetById;

  getTicketTemplateForEventService =
    ticketTemplateServiceModule.getTicketTemplateForEventService;
  saveTicketTemplateForEventService =
    ticketTemplateServiceModule.saveTicketTemplateForEventService;
  resetTicketTemplateForEventService =
    ticketTemplateServiceModule.resetTicketTemplateForEventService;
  uploadTicketTemplateImageForEventService =
    ticketTemplateServiceModule.uploadTicketTemplateImageForEventService;
  deleteTicketTemplateImageForEventService =
    ticketTemplateServiceModule.deleteTicketTemplateImageForEventService;
  findTicketTemplateByEventId =
    ticketTemplateRepositoryModule.findTicketTemplateByEventId;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;
  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;
  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;
}

async function createEventUserForTest({
  role = EVENT_USER_ROLES.EVENT_MANAGER,
  email = `${Math.random().toString(36).slice(2)}@example.com`,
} = {}) {
  return createEventUser({
    authProvider: EVENT_USER_AUTH_PROVIDER.LOCAL,
    emailSnapshot: email,
    passwordHash: "not-used-in-template-tests",
    firstNameSnapshot: "Template",
    lastNameSnapshot: "Manager",
    role,
    isActive: true,
    mustChangePassword: false,
  });
}

function buildActor(eventUser) {
  return {
    eventUserId: String(eventUser.id),
    eventUser,
  };
}

async function createEventOwnedBy(eventUser, overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return createEvent({
    title: "SQL Ticket Template Event",
    slug: `sql-ticket-template-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL ticket template integration event",
    description: "SQL ticket template integration event.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    imageAssetIds: [],
    tags: ["ticket-template"],
    sessions: [
      {
        startAt,
        endAt,
        timezone: "Europe/Vienna",
        locationLabel: "Audimax",
        locationDetails: "",
        capacity: 100,
        status: "scheduled",
      },
    ],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "",
    createdByEventUserId: eventUser.id,
    updatedByEventUserId: eventUser.id,
    ...overrides,
  });
}

async function createTicketWithStoredPdf(event, actor) {
  const ticketType = await createTicketType({
    eventId: event.id,
    name: `template-ticket-${Date.now()}`,
    displayName: "Template Ticket",
    description: "Template ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "fixed",
    priceGross: 1000,
    currency: "EUR",
    stockTotal: 10,
    stockSold: 0,
    minPerOrder: 1,
    maxPerOrder: 5,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isPersonalized: false,
    sessionIds: [],
    sortOrder: 0,
    createdByEventUserId: actor.eventUserId,
    updatedByEventUserId: actor.eventUserId,
  });

  const order = await createOrder({
    orderNumber: `ORD-TEMPLATE-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    buyerType: ORDER_BUYER_TYPE.GUEST,
    buyerEmailSnapshot: "buyer@example.com",
    buyerFirstNameSnapshot: "Ticket",
    buyerLastNameSnapshot: "Buyer",
    buyerDisplayNameSnapshot: "Ticket Buyer",
    eventId: event.id,
    eventTitleSnapshot: event.title,
    eventSlugSnapshot: event.slug,
    eventCategorySnapshot: event.category,
    eventLocationSnapshot: event.location,
    eventStartsAtSnapshot: event.sessions?.[0]?.startAt || null,
    items: [
      {
        ticketTypeId: ticketType.id,
        eventId: event.id,
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
        currency: "EUR",
        ticketTypeNameSnapshot: ticketType.displayName,
        ticketTypeDescriptionSnapshot: ticketType.description,
        ticketKindSnapshot: ticketType.ticketKind,
      },
    ],
    currency: "EUR",
    subtotal: 1000,
    totalPrice: 1000,
    status: ORDER_STATUS.CONFIRMED,
    paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    paymentProvider: ORDER_PAYMENT_PROVIDER.NONE,
    confirmedAt: new Date(),
    createdByEventUserId: actor.eventUserId,
    updatedByEventUserId: actor.eventUserId,
    metadata: null,
  });

  return ensureTicketForOrderSlot({
    ticketCode: `TKT-SQL-TEMPLATE-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    orderId: order.id,
    orderItemIndex: 0,
    orderItemUnitIndex: 0,
    eventId: event.id,
    ticketTypeId: ticketType.id,
    buyerType: "guest",
    buyerEmailSnapshot: "buyer@example.com",
    buyerFirstNameSnapshot: "Ticket",
    buyerLastNameSnapshot: "Buyer",
    buyerDisplayNameSnapshot: "Ticket Buyer",
    holderType: "buyer",
    holderEmailSnapshot: "buyer@example.com",
    holderFirstNameSnapshot: "Ticket",
    holderLastNameSnapshot: "Buyer",
    holderDisplayNameSnapshot: "Ticket Buyer",
    eventTitleSnapshot: event.title,
    eventSlugSnapshot: event.slug,
    eventCategorySnapshot: event.category,
    eventStartsAtSnapshot: event.sessions?.[0]?.startAt || null,
    ticketTypeNameSnapshot: ticketType.displayName,
    ticketTypeDescriptionSnapshot: ticketType.description,
    ticketKind: ticketType.ticketKind,
    unitPrice: 1000,
    currency: "EUR",
    status: "active",
    ticketPdfStorageKey: `tickets/${event.id}/old-ticket.pdf`,
    ticketPdfStorageTarget: "local",
    ticketPdfGeneratedAt: new Date(),
    createdByEventUserId: actor.eventUserId,
    updatedByEventUserId: actor.eventUserId,
  });
}

function buildPngUpload() {
  const buffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  ]);

  return {
    buffer,
    originalname: "logo.png",
    mimetype: "image/png",
    size: buffer.length,
  };
}

describe("ticket templates SQL integration", () => {
  beforeAll(async () => {
    await loadModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    uploadBufferMock.mockClear();
    deleteObjectMock.mockClear();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns the default template and enforces manage-own/manage-all access", async () => {
    const owner = await createEventUserForTest();
    const otherManager = await createEventUserForTest();
    const eventAdmin = await createEventUserForTest({
      role: EVENT_USER_ROLES.EVENT_ADMIN,
    });

    const event = await createEventOwnedBy(owner);

    await expect(
      getTicketTemplateForEventService({
        eventId: event.id,
        actor: buildActor(owner),
      }),
    ).resolves.toMatchObject({
      source: "default",
      schemaVersion: 1,
      revision: 0,
      images: [],
    });

    await expect(
      getTicketTemplateForEventService({
        eventId: event.id,
        actor: buildActor(otherManager),
      }),
    ).rejects.toMatchObject({
      code: "EVENT_MANAGE_FORBIDDEN",
      statusCode: 403,
    });

    await expect(
      getTicketTemplateForEventService({
        eventId: event.id,
        actor: buildActor(eventAdmin),
      }),
    ).resolves.toMatchObject({
      source: "default",
    });
  });

  it("persists atomic revisions, invalidates stored PDFs and resets to default", async () => {
    const owner = await createEventUserForTest();
    const actor = buildActor(owner);
    const event = await createEventOwnedBy(owner);
    const ticket = await createTicketWithStoredPdf(event, actor);

    const ticketCodeBefore = ticket.ticketCode;

    const firstSave = await saveTicketTemplateForEventService({
      eventId: event.id,
      template: buildCustomTemplate({
        title: "First {{event.title}}",
      }),
      actor,
    });

    expect(firstSave).toMatchObject({
      source: "custom",
      schemaVersion: 1,
      revision: 1,
    });

    let ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.ticketPdfStorageKey).toBeNull();
    expect(ticketInDb.ticketPdfStorageTarget).toBeNull();
    expect(ticketInDb.ticketPdfGeneratedAt).toBeNull();
    expect(ticketInDb.ticketCode).toBe(ticketCodeBefore);

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: `tickets/${event.id}/old-ticket.pdf`,
      storageTarget: "local",
    });

    deleteObjectMock.mockClear();

    const secondSave = await saveTicketTemplateForEventService({
      eventId: event.id,
      template: buildCustomTemplate({
        title: "Second {{ticket.code}}",
      }),
      actor,
    });

    expect(secondSave).toMatchObject({
      source: "custom",
      revision: 2,
    });

    const storedTemplate = await findTicketTemplateByEventId(event.id, {
      lean: true,
    });

    expect(storedTemplate).toMatchObject({
      eventId: event.id,
      schemaVersion: 1,
      revision: 2,
    });

    await setTicketPdfDocument(ticket.id, {
      ticketPdfStorageKey: "tickets/regenerated.pdf",
      ticketPdfStorageTarget: "local",
      ticketPdfGeneratedAt: new Date(),
      updatedByEventUserId: actor.eventUserId,
    });

    const reset = await resetTicketTemplateForEventService({
      eventId: event.id,
      actor,
    });

    expect(reset).toMatchObject({
      source: "default",
      schemaVersion: 1,
      revision: 0,
    });

    await expect(
      findTicketTemplateByEventId(event.id, {
        lean: true,
      }),
    ).resolves.toBeNull();

    ticketInDb = await findTicketById(ticket.id, {
      lean: true,
    });

    expect(ticketInDb.ticketPdfStorageKey).toBeNull();
    expect(ticketInDb.ticketPdfStorageTarget).toBeNull();
    expect(ticketInDb.ticketPdfGeneratedAt).toBeNull();
    expect(ticketInDb.ticketCode).toBe(ticketCodeBefore);

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "tickets/regenerated.pdf",
      storageTarget: "local",
    });
  });

  it("persists event-owned template images and blocks foreign or in-use images", async () => {
    const owner = await createEventUserForTest();
    const otherOwner = await createEventUserForTest();

    const actor = buildActor(owner);
    const otherActor = buildActor(otherOwner);

    const event = await createEventOwnedBy(owner);
    const otherEvent = await createEventOwnedBy(otherOwner);

    const image = await uploadTicketTemplateImageForEventService({
      eventId: event.id,
      file: buildPngUpload(),
      actor,
    });

    expect(image).toMatchObject({
      kind: "ticket_template_image",
      mimeType: "image/png",
      filenameOriginal: "logo.png",
      ownerEventId: event.id,
    });

    const imageInDb = await findMediaAssetById(image.id, {
      lean: true,
    });

    expect(imageInDb).toMatchObject({
      id: image.id,
      ownerEventId: event.id,
      kind: "ticket_template_image",
    });

    const foreignImage = await uploadTicketTemplateImageForEventService({
      eventId: otherEvent.id,
      file: buildPngUpload(),
      actor: otherActor,
    });

    await expect(
      saveTicketTemplateForEventService({
        eventId: event.id,
        template: buildCustomTemplate({
          imageAssetId: foreignImage.id,
        }),
        actor,
      }),
    ).rejects.toMatchObject({
      code: "TICKET_TEMPLATE_IMAGE_NOT_OWNED_BY_EVENT",
      statusCode: 400,
    });

    await saveTicketTemplateForEventService({
      eventId: event.id,
      template: buildCustomTemplate({
        imageAssetId: image.id,
      }),
      actor,
    });

    await expect(
      deleteTicketTemplateImageForEventService({
        eventId: event.id,
        assetId: image.id,
        actor,
      }),
    ).rejects.toMatchObject({
      code: "TICKET_TEMPLATE_IMAGE_IN_USE",
      statusCode: 409,
    });

    await saveTicketTemplateForEventService({
      eventId: event.id,
      template: buildCustomTemplate(),
      actor,
    });

    await expect(
      deleteTicketTemplateImageForEventService({
        eventId: event.id,
        assetId: image.id,
        actor,
      }),
    ).resolves.toEqual({
      deleted: true,
    });

    await expect(
      findMediaAssetById(image.id, {
        lean: true,
      }),
    ).resolves.toBeNull();

    expect(deleteObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(
          `media/ticket-templates/${event.id}/logo.png`,
        ),
        storageTarget: "local",
      }),
    );
  });
});
