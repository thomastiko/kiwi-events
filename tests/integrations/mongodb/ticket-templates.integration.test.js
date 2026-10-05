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

let Event;
let EventUser;
let MediaAsset;
let Ticket;
let TicketTemplate;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_USER_AUTH_PROVIDER;
let EVENT_USER_ROLES;

let getTicketTemplateForEventService;
let saveTicketTemplateForEventService;
let resetTicketTemplateForEventService;
let uploadTicketTemplateImageForEventService;
let deleteTicketTemplateImageForEventService;
let deleteEventService;

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

  const eventModule =
    await import("../../../src/modules/events/event.model.js");
  const eventUserModule =
    await import("../../../src/modules/eventUsers/eventUser.model.js");
  const mediaAssetModule =
    await import("../../../src/modules/mediaAssets/mediaAssets.model.js");
  const ticketModule =
    await import("../../../src/modules/tickets/ticket.model.js");
  const ticketTemplateModelModule =
    await import("../../../src/modules/ticketTemplates/ticketTemplate.model.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const eventUserConstantsModule =
    await import("../../../src/modules/eventUsers/eventUser.constants.js");

  const ticketTemplateServiceModule =
    await import("../../../src/modules/ticketTemplates/ticketTemplate.service.js");
  const eventInternalServiceModule =
    await import("../../../src/modules/events/internal/event.internal.service.js");

  Event = eventModule.Event;
  EventUser = eventUserModule.EventUser;
  MediaAsset = mediaAssetModule.MediaAsset;
  Ticket = ticketModule.Ticket;
  TicketTemplate = ticketTemplateModelModule.TicketTemplate;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

  EVENT_USER_AUTH_PROVIDER = eventUserConstantsModule.EVENT_USER_AUTH_PROVIDER;
  EVENT_USER_ROLES = eventUserConstantsModule.EVENT_USER_ROLES;

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

  deleteEventService = eventInternalServiceModule.deleteEventService;
}

async function createEventUser({
  role = EVENT_USER_ROLES.EVENT_MANAGER,
  externalUserId = `user-${Date.now()}-${Math.random()}`,
  email = `${Math.random().toString(36).slice(2)}@example.com`,
} = {}) {
  return EventUser.create({
    authProvider: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
    externalProvider: "dummy",
    externalUserId,
    emailSnapshot: email,
    passwordHash: null,
    firstNameSnapshot: "Template",
    lastNameSnapshot: "Manager",
    role,
    isActive: true,
  });
}

function buildActor(eventUser) {
  return {
    eventUserId: String(eventUser._id),
    eventUser,
  };
}

async function createEventOwnedBy(eventUser, overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return Event.create({
    title: "Ticket Template Event",
    slug: `ticket-template-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "Ticket template integration event",
    description: "Ticket template integration event.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [
      {
        startAt,
        endAt,
        timezone: "Europe/Vienna",
        status: "scheduled",
      },
    ],
    isFree: true,
    createdByEventUserId: eventUser._id,
    updatedByEventUserId: eventUser._id,
    ...overrides,
  });
}

async function createTicketWithStoredPdf(event, actor) {
  return Ticket.create({
    ticketCode: `TKT-TEMPLATE-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    orderId: new event._id.constructor(),
    orderItemIndex: 0,
    orderItemUnitIndex: 0,
    eventId: event._id,
    ticketTypeId: new event._id.constructor(),
    buyerEmailSnapshot: "buyer@example.com",
    holderEmailSnapshot: "buyer@example.com",
    eventTitleSnapshot: event.title,
    ticketTypeNameSnapshot: "Template Ticket",
    unitPrice: 0,
    currency: "EUR",
    ticketPdfStorageKey: `tickets/${event._id}/old-ticket.pdf`,
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

describe("ticket templates MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();

    uploadBufferMock.mockClear();
    deleteObjectMock.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns the default template and enforces manage-own/manage-all access", async () => {
    const owner = await createEventUser();
    const otherManager = await createEventUser();
    const eventAdmin = await createEventUser({
      role: EVENT_USER_ROLES.EVENT_ADMIN,
    });

    const event = await createEventOwnedBy(owner);

    const result = await getTicketTemplateForEventService({
      eventId: String(event._id),
      actor: buildActor(owner),
    });

    expect(result).toMatchObject({
      source: "default",
      schemaVersion: 1,
      revision: 0,
      template: {
        page: {
          width: 595.28,
          height: 841.89,
          backgroundColor: "#ffffff",
        },
        elements: expect.any(Array),
      },
      images: [],
    });

    await expect(
      getTicketTemplateForEventService({
        eventId: String(event._id),
        actor: buildActor(otherManager),
      }),
    ).rejects.toMatchObject({
      code: "EVENT_MANAGE_FORBIDDEN",
      statusCode: 403,
    });

    await expect(
      getTicketTemplateForEventService({
        eventId: String(event._id),
        actor: buildActor(eventAdmin),
      }),
    ).resolves.toMatchObject({
      source: "default",
    });
  });

  it("saves revisions, invalidates stored PDFs and resets to the default template", async () => {
    const owner = await createEventUser();
    const actor = buildActor(owner);
    const event = await createEventOwnedBy(owner);
    const ticket = await createTicketWithStoredPdf(event, actor);

    const ticketCodeBefore = ticket.ticketCode;

    const firstSave = await saveTicketTemplateForEventService({
      eventId: String(event._id),
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

    let ticketInDb = await Ticket.findById(ticket._id).lean();

    expect(ticketInDb.ticketPdfStorageKey).toBeNull();
    expect(ticketInDb.ticketPdfStorageTarget).toBeNull();
    expect(ticketInDb.ticketPdfGeneratedAt).toBeNull();
    expect(ticketInDb.ticketCode).toBe(ticketCodeBefore);

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: `tickets/${String(event._id)}/old-ticket.pdf`,
      storageTarget: "local",
    });

    deleteObjectMock.mockClear();

    const secondSave = await saveTicketTemplateForEventService({
      eventId: String(event._id),
      template: buildCustomTemplate({
        title: "Second {{ticket.code}}",
      }),
      actor,
    });

    expect(secondSave).toMatchObject({
      source: "custom",
      revision: 2,
    });

    await Ticket.updateOne(
      {
        _id: ticket._id,
      },
      {
        $set: {
          ticketPdfStorageKey: "tickets/regenerated.pdf",
          ticketPdfStorageTarget: "local",
          ticketPdfGeneratedAt: new Date(),
        },
      },
    );

    const reset = await resetTicketTemplateForEventService({
      eventId: String(event._id),
      actor,
    });

    expect(reset).toMatchObject({
      source: "default",
      schemaVersion: 1,
      revision: 0,
    });

    expect(
      await TicketTemplate.findOne({
        eventId: event._id,
      }).lean(),
    ).toBeNull();

    ticketInDb = await Ticket.findById(ticket._id).lean();

    expect(ticketInDb.ticketPdfStorageKey).toBeNull();
    expect(ticketInDb.ticketPdfStorageTarget).toBeNull();
    expect(ticketInDb.ticketPdfGeneratedAt).toBeNull();
    expect(ticketInDb.ticketCode).toBe(ticketCodeBefore);

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "tickets/regenerated.pdf",
      storageTarget: "local",
    });
  });

  it("owns template images per event and blocks deletion while an image is in use", async () => {
    const owner = await createEventUser();
    const otherOwner = await createEventUser();

    const actor = buildActor(owner);
    const otherActor = buildActor(otherOwner);

    const event = await createEventOwnedBy(owner);
    const otherEvent = await createEventOwnedBy(otherOwner);

    const image = await uploadTicketTemplateImageForEventService({
      eventId: String(event._id),
      file: buildPngUpload(),
      actor,
    });

    expect(image).toMatchObject({
      kind: "ticket_template_image",
      mimeType: "image/png",
      filenameOriginal: "logo.png",
      ownerEventId: String(event._id),
    });

    expect(uploadBufferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/png",
        originalName: "logo.png",
        folder: `media/ticket-templates/${String(event._id)}`,
        storageTarget: undefined,
      }),
    );

    const foreignImage = await uploadTicketTemplateImageForEventService({
      eventId: String(otherEvent._id),
      file: buildPngUpload(),
      actor: otherActor,
    });

    await expect(
      saveTicketTemplateForEventService({
        eventId: String(event._id),
        template: buildCustomTemplate({
          imageAssetId: foreignImage.id,
        }),
        actor,
      }),
    ).rejects.toMatchObject({
      code: "TICKET_TEMPLATE_IMAGE_NOT_OWNED_BY_EVENT",
      statusCode: 400,
    });

    const saved = await saveTicketTemplateForEventService({
      eventId: String(event._id),
      template: buildCustomTemplate({
        imageAssetId: image.id,
      }),
      actor,
    });

    expect(saved.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: image.id,
          ownerEventId: String(event._id),
        }),
      ]),
    );

    await expect(
      deleteTicketTemplateImageForEventService({
        eventId: String(event._id),
        assetId: image.id,
        actor,
      }),
    ).rejects.toMatchObject({
      code: "TICKET_TEMPLATE_IMAGE_IN_USE",
      statusCode: 409,
    });

    await saveTicketTemplateForEventService({
      eventId: String(event._id),
      template: buildCustomTemplate(),
      actor,
    });

    await expect(
      deleteTicketTemplateImageForEventService({
        eventId: String(event._id),
        assetId: image.id,
        actor,
      }),
    ).resolves.toEqual({
      deleted: true,
    });

    expect(await MediaAsset.findById(image.id).lean()).toBeNull();

    expect(deleteObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(
          `media/ticket-templates/${String(event._id)}/logo.png`,
        ),
        storageTarget: "local",
      }),
    );
  });

  it("rejects GIF and WEBP uploads because PDF ticket images must be PNG or JPEG", async () => {
    const owner = await createEventUser();
    const actor = buildActor(owner);
    const event = await createEventOwnedBy(owner);

    const gifBuffer = Buffer.from("GIF89a000000", "ascii");

    await expect(
      uploadTicketTemplateImageForEventService({
        eventId: String(event._id),
        file: {
          buffer: gifBuffer,
          originalname: "logo.gif",
          mimetype: "image/gif",
          size: gifBuffer.length,
        },
        actor,
      }),
    ).rejects.toMatchObject({
      code: "PDF_COMPATIBLE_IMAGE_REQUIRED",
      statusCode: 400,
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();
  });

  it("removes the custom template and template images when an unused event is hard-deleted", async () => {
    const owner = await createEventUser();
    const actor = buildActor(owner);
    const event = await createEventOwnedBy(owner);

    const image = await uploadTicketTemplateImageForEventService({
      eventId: String(event._id),
      file: buildPngUpload(),
      actor,
    });

    await saveTicketTemplateForEventService({
      eventId: String(event._id),
      template: buildCustomTemplate({
        imageAssetId: image.id,
      }),
      actor,
    });

    await expect(deleteEventService(String(event._id), actor)).resolves.toEqual(
      {
        deleted: true,
      },
    );

    expect(await Event.findById(event._id).lean()).toBeNull();

    expect(
      await TicketTemplate.findOne({
        eventId: event._id,
      }).lean(),
    ).toBeNull();

    expect(await MediaAsset.findById(image.id).lean()).toBeNull();

    expect(deleteObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(
          `media/ticket-templates/${String(event._id)}/logo.png`,
        ),
        storageTarget: "local",
      }),
    );
  });
});
