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

const LOCAL_SECRET = "integration-local-jwt-secret";
const EXTERNAL_SECRET = "integration-external-jwt-secret";

let Event;
let TicketType;
let Order;
let Ticket;

let EVENT_STATUSES;
let EVENT_VISIBILITIES;
let EVENT_CATEGORIES;

let TICKET_TYPE_STATUS;
let TICKET_TYPE_KIND;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let generateTicketsForOrderService;
let generateTicketDocumentsForOrderService;
let getOwnTicketDocumentService;

let generateOfficialTicketDocument;
let buildExistingOfficialTicketAttachment;
let buildOfficialTicketAttachment;

let uploadBufferMock;
let getBufferMock;
let deleteObjectMock;

async function loadTicketDocumentsIntegrationModules({
  ticketing = true,
  payments = true,
  guestCheckout = true,
  ticketPdf = true,
  ticketQr = false,
  mail = false,
} = {}) {
  vi.resetModules();

  uploadBufferMock = vi
    .fn()
    .mockImplementation(async ({ key, storageTarget }) => ({
      key,
      bucket: "mock-storage",
      storageTarget: storageTarget || "local",
    }));

  getBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("%PDF-1.4 stored ticket pdf"),
    contentType: "application/pdf",
    contentLength: Buffer.byteLength("%PDF-1.4 stored ticket pdf"),
  });

  deleteObjectMock = vi.fn().mockResolvedValue({
    success: true,
  });

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      jwtSecret: LOCAL_SECRET,
      branding: {
        appName: "Kiwi Events Test",
        locale: "de-AT",
        ticketTitle: "Test Ticket",
        ticketSubtitle: "Official test ticket.",
        defaultCurrency: "EUR",
      },
      auth: {
        provider: "hybrid",
        localJwtSecret: LOCAL_SECRET,
        externalJwtSecret: EXTERNAL_SECRET,
      },
      features: {
        ticketing,
        payments,
        guestCheckout,
        ticketPdf,
        ticketQr,
        mail,
      },
      storage: {
        generated: {
          ticketPdfTarget: "local",
        },
      },
      payments: {
        provider: "mollie",
        mollie: {
          redirectUrl: "https://frontend.example.test/payment-return",
          webhookUrl: "https://api.example.test/api/webhooks/payments/mollie",
        },
      },
    },
  }));

  vi.doMock("../../../src/modules/database/database.service.js", () => ({
    getDatabaseProvider: () => "mongodb",
    withDatabaseTransaction: async (callback) => callback({}),
  }));

  vi.doMock("../../../src/config/features.js", () => {
    const mockedFeatures = {
      ticketing,
      payments,
      guestCheckout,
      ticketPdf,
      ticketQr,
      mail,
    };

    return {
      features: mockedFeatures,
      isFeatureEnabled: (featureName) => Boolean(mockedFeatures[featureName]),
    };
  });

  vi.doMock("../../../src/modules/storage/storage.service.js", () => ({
    uploadBuffer: uploadBufferMock,
    getBuffer: getBufferMock,
    deleteObject: deleteObjectMock,
  }));

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
    createPaymentRefund: vi.fn(),
  }));

  const eventModelModule =
    await import("../../../src/modules/events/event.model.js");
  const ticketTypeModelModule =
    await import("../../../src/modules/ticketTypes/ticketType.model.js");
  const orderModelModule =
    await import("../../../src/modules/orders/order.model.js");
  const ticketModelModule =
    await import("../../../src/modules/tickets/ticket.model.js");

  const eventConstantsModule =
    await import("../../../src/modules/events/event.constants.js");
  const ticketTypeConstantsModule =
    await import("../../../src/modules/ticketTypes/ticketType.constants.js");
  const orderConstantsModule =
    await import("../../../src/modules/orders/order.constants.js");

  const ticketServiceModule =
    await import("../../../src/modules/tickets/ticket.service.js");
  const ticketDocumentServiceModule =
    await import("../../../src/modules/tickets/ticketDocument.service.js");

  Event = eventModelModule.Event;
  TicketType = ticketTypeModelModule.TicketType;
  Order = orderModelModule.Order;
  Ticket = ticketModelModule.Ticket;

  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;
  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;

  TICKET_TYPE_STATUS = ticketTypeConstantsModule.TICKET_TYPE_STATUS;
  TICKET_TYPE_KIND = ticketTypeConstantsModule.TICKET_TYPE_KIND;

  ORDER_BUYER_TYPE = orderConstantsModule.ORDER_BUYER_TYPE;
  ORDER_PAYMENT_PROVIDER = orderConstantsModule.ORDER_PAYMENT_PROVIDER;
  ORDER_PAYMENT_STATUS = orderConstantsModule.ORDER_PAYMENT_STATUS;
  ORDER_STATUS = orderConstantsModule.ORDER_STATUS;

  generateTicketsForOrderService =
    ticketServiceModule.generateTicketsForOrderService;
  generateTicketDocumentsForOrderService =
    ticketServiceModule.generateTicketDocumentsForOrderService;
  getOwnTicketDocumentService = ticketServiceModule.getOwnTicketDocumentService;

  generateOfficialTicketDocument =
    ticketDocumentServiceModule.generateOfficialTicketDocument;
  buildExistingOfficialTicketAttachment =
    ticketDocumentServiceModule.buildExistingOfficialTicketAttachment;
  buildOfficialTicketAttachment =
    ticketDocumentServiceModule.buildOfficialTicketAttachment;
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

function buildExternalActor(overrides = {}) {
  return {
    externalProvider: "dummy",
    externalUserId: "host-customer-1",
    email: "kunde@example.com",
    rawClaims: {
      firstName: "Max",
      lastName: "Kunde",
    },
    ...overrides,
  };
}

async function createPublishedEvent(overrides = {}) {
  return Event.create({
    title: "Ticket Documents Event",
    slug: `ticket-documents-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "Ticket documents integration event",
    description: "Created by ticket documents integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    sessions: [buildFutureSession()],
    isFree: false,
    publishedAt: new Date(),
    ...overrides,
  });
}

async function createTicketType(event, overrides = {}) {
  return TicketType.create({
    eventId: event._id,
    name: `${event.title} - Document Ticket`,
    displayName: "Document Ticket",
    description: "Ticket document test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "fixed",
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 10,
    stockSold: 0,
    minPerOrder: 1,
    maxPerOrder: 5,
    isPersonalized: false,
    sortOrder: 0,
    ...overrides,
  });
}

async function createConfirmedOrderWithTickets({ quantity = 1 } = {}) {
  const event = await createPublishedEvent();
  const ticketType = await createTicketType(event, {
    stockSold: quantity,
  });

  const totalPrice = 2500 * quantity;

  const order = await Order.create({
    orderNumber: `ORD-DOC-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,

    buyerType: ORDER_BUYER_TYPE.EXTERNAL_USER,
    buyerExternalProvider: "dummy",
    buyerExternalUserId: "host-customer-1",
    buyerEmailSnapshot: "kunde@example.com",
    buyerFirstNameSnapshot: "Max",
    buyerLastNameSnapshot: "Kunde",
    buyerDisplayNameSnapshot: "Max Kunde",
    buyerRawExternalSnapshot: null,

    eventId: event._id,
    eventTitleSnapshot: event.title,
    eventSlugSnapshot: event.slug,
    eventCategorySnapshot: event.category,
    eventLocationSnapshot: event.location,
    eventStartsAtSnapshot: event.sessions[0].startAt,

    items: [
      {
        ticketTypeId: ticketType._id,
        eventId: event._id,
        quantity,
        unitPrice: 2500,
        lineTotal: totalPrice,
        currency: "EUR",
        ticketTypeNameSnapshot: ticketType.displayName,
        ticketTypeDescriptionSnapshot: ticketType.description,
        ticketKindSnapshot: ticketType.ticketKind,
        pricingModeSnapshot: ticketType.pricingMode,
      },
    ],

    currency: "EUR",
    subtotal: totalPrice,
    totalPrice,

    status: ORDER_STATUS.CONFIRMED,
    paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,
    paymentProviderPaymentId: "pay_doc_123",
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: new Date(),
    expiresAt: null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,
  });

  const tickets = await generateTicketsForOrderService(order._id, {
    createdByEventUserId: null,
    updatedByEventUserId: null,
  });

  return {
    event,
    ticketType,
    order,
    tickets,
  };
}

describe("Ticket documents MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await loadTicketDocumentsIntegrationModules();
  });

  beforeEach(async () => {
    await clearMongoTestDb();
    uploadBufferMock?.mockClear();
    getBufferMock?.mockClear();
    deleteObjectMock?.mockClear();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("skips ticket document generation when ticket PDF feature is disabled", async () => {
    await loadTicketDocumentsIntegrationModules({
      ticketPdf: false,
      ticketQr: false,
    });

    await clearMongoTestDb();

    const { order } = await createConfirmedOrderWithTickets({
      quantity: 2,
    });

    const result = await generateTicketDocumentsForOrderService({
      order,
    });

    expect(result).toMatchObject({
      skipped: true,
      reason: "ticket_pdf_disabled",
      generated: 0,
      alreadyExisted: 0,
      failed: 0,
      errors: [],
    });

    expect(uploadBufferMock).not.toHaveBeenCalled();

    await loadTicketDocumentsIntegrationModules();
  });
  it("does not expose private storage metadata in generated ticket documents", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const result = await generateOfficialTicketDocument({
      ticket: tickets[0],
    });

    expect(result.document).toEqual({
      mimeType: "application/pdf",
      filename: `ticket-${tickets[0].ticketCode}.pdf`,
      version: 1,
      templateSource: "default",
      templateRevision: 0,
    });
    expect(result.document).not.toHaveProperty("url");
    expect(result.document).not.toHaveProperty("key");
    expect(result.document).not.toHaveProperty("storageKey");

    expect(result.ticket.ticketPdfStorageKey).toMatch(
      /^tickets\/.+\/.+\/ticket-v1-[0-9a-f-]{36}\.pdf$/,
    );

    expect(uploadBufferMock).toHaveBeenCalledTimes(1);
    expect(uploadBufferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^tickets\/.+\/.+\/ticket-v1-[0-9a-f-]{36}\.pdf$/,
        ),
        mimeType: "application/pdf",
      }),
    );
  });
  it("generates ticket PDFs, uploads them and stores PDF fields on tickets", async () => {
    const { order } = await createConfirmedOrderWithTickets({
      quantity: 2,
    });

    const result = await generateTicketDocumentsForOrderService({
      order,
    });

    expect(result).toMatchObject({
      skipped: false,
      generated: 2,
      alreadyExisted: 0,
      failed: 0,
      errors: [],
    });

    expect(uploadBufferMock).toHaveBeenCalledTimes(2);

    for (const call of uploadBufferMock.mock.calls) {
      const payload = call[0];

      expect(Buffer.isBuffer(payload.buffer)).toBe(true);
      expect(payload.buffer.length).toBeGreaterThan(100);
      expect(payload.mimeType).toBe("application/pdf");
      expect(payload.originalName).toMatch(/^ticket-TKT-/);
      expect(payload.key).toMatch(
        /^tickets\/.+\/.+\/ticket-v1-[0-9a-f-]{36}\.pdf$/,
      );
    }

    const ticketsInDb = await Ticket.find({
      orderId: order._id,
    }).lean();

    expect(ticketsInDb).toHaveLength(2);

    for (const ticket of ticketsInDb) {
      expect(ticket.ticketPdfStorageKey).toEqual(expect.any(String));
      expect(ticket.ticketPdfStorageKey).toMatch(
        new RegExp(
          `^tickets/${String(ticket.eventId)}/${String(ticket._id)}/ticket-v1-[0-9a-f-]{36}\\.pdf$`,
        ),
      );
      expect(ticket.ticketPdfStorageTarget).toBe("local");
      expect(ticket.ticketPdfGeneratedAt).toBeTruthy();
    }
  });

  it("does not regenerate PDFs for tickets that already have a storage key", async () => {
    const { order, tickets } = await createConfirmedOrderWithTickets({
      quantity: 2,
    });

    await Ticket.findByIdAndUpdate(tickets[0].id, {
      $set: {
        ticketPdfStorageKey: `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-existing.pdf`,
        ticketPdfStorageTarget: "local",
        ticketPdfGeneratedAt: new Date(),
      },
    });

    const result = await generateTicketDocumentsForOrderService({
      order,
    });

    expect(result).toMatchObject({
      skipped: false,
      generated: 1,
      alreadyExisted: 1,
      failed: 0,
      errors: [],
    });

    expect(uploadBufferMock).toHaveBeenCalledTimes(1);
  });

  it("regenerates to an immutable key and deletes the previous stored PDF", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const oldKey = `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-old.pdf`;

    const generatedAt = new Date();

    await Ticket.updateOne(
      {
        _id: tickets[0].id,
      },
      {
        $set: {
          ticketPdfStorageKey: oldKey,
          ticketPdfStorageTarget: "private",
          ticketPdfGeneratedAt: generatedAt,
        },
      },
    );

    const ticketWithPdf = {
      ...tickets[0],
      ticketPdfStorageKey: oldKey,
      ticketPdfStorageTarget: "private",
      ticketPdfGeneratedAt: generatedAt,
    };

    const result = await generateOfficialTicketDocument({
      ticket: ticketWithPdf,
    });

    expect(result.ticket.ticketPdfStorageKey).not.toBe(oldKey);
    expect(result.ticket.ticketPdfStorageKey).toMatch(
      /^tickets\/.+\/.+\/ticket-v1-[0-9a-f-]{36}\.pdf$/,
    );
    expect(result.ticket.ticketPdfStorageTarget).toBe("local");

    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: oldKey,
      storageTarget: "private",
    });
  });

  it("builds an attachment from an existing stored ticket PDF", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const storedBuffer = Buffer.from("%PDF-1.4 existing stored pdf");

    getBufferMock.mockResolvedValueOnce({
      buffer: storedBuffer,
      contentType: "application/pdf",
      contentLength: storedBuffer.length,
    });

    const ticketWithPdf = await Ticket.findByIdAndUpdate(
      tickets[0].id,
      {
        $set: {
          ticketPdfStorageKey: `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-existing.pdf`,
          ticketPdfStorageTarget: "local",
          ticketPdfGeneratedAt: new Date(),
        },
      },
      {
        new: true,
        lean: true,
      },
    );

    const attachment = await buildExistingOfficialTicketAttachment({
      ticket: ticketWithPdf,
    });

    expect(getBufferMock).toHaveBeenCalledTimes(1);
    expect(getBufferMock).toHaveBeenCalledWith({
      key: ticketWithPdf.ticketPdfStorageKey,
      storageTarget: "local",
    });

    expect(attachment).toMatchObject({
      filename: `ticket-${ticketWithPdf.ticketCode}.pdf`,
      content: storedBuffer,
      contentType: "application/pdf",
    });
  });

  it("returns an existing ticket PDF document for the owning external user", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const storedBuffer = Buffer.from("%PDF-1.4 own stored pdf");

    getBufferMock.mockResolvedValueOnce({
      buffer: storedBuffer,
      contentType: "application/pdf",
      contentLength: storedBuffer.length,
    });

    const ticketWithPdf = await Ticket.findByIdAndUpdate(
      tickets[0].id,
      {
        $set: {
          ticketPdfStorageKey: `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-existing.pdf`,
          ticketPdfStorageTarget: "local",
          ticketPdfGeneratedAt: new Date(),
        },
      },
      {
        new: true,
        lean: true,
      },
    );

    const result = await getOwnTicketDocumentService({
      actor: buildExternalActor(),
      ticketId: ticketWithPdf._id,
    });

    expect(getBufferMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      filename: `ticket-${ticketWithPdf.ticketCode}.pdf`,
      contentType: "application/pdf",
      contentLength: storedBuffer.length,
    });
    expect(result.buffer.equals(storedBuffer)).toBe(true);
  });

  it("generates and returns a ticket PDF document for the owning external user when none exists", async () => {
    const { tickets } = await createConfirmedOrderWithTickets({
      quantity: 1,
    });

    const result = await getOwnTicketDocumentService({
      actor: buildExternalActor(),
      ticketId: tickets[0].id,
    });

    expect(uploadBufferMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      filename: `ticket-${tickets[0].ticketCode}.pdf`,
      contentType: "application/pdf",
    });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.contentLength).toBe(result.buffer.length);

    const ticketInDb = await Ticket.findById(tickets[0].id).lean();

    expect(ticketInDb.ticketPdfStorageKey).toEqual(expect.any(String));
    expect(ticketInDb.ticketPdfStorageTarget).toBe("local");
    expect(ticketInDb.ticketPdfGeneratedAt).toBeTruthy();
  });
});
