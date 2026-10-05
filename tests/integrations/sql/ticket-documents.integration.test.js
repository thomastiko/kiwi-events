import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_JWT_SECRET = "integration-local-jwt-secret";
const TEST_EXTERNAL_JWT_SECRET = "integration-external-jwt-secret";

let clearSqlTestDb;
let connectSqlTestDb;
let disconnectSqlTestDb;

let createEvent;
let createTicketType;
let reserveTicketTypeStock;

let createOrder;

let findTicketsByOrderId;
let findTicketById;
let setTicketPdfDocument;

let generateTicketsForOrderService;
let generateTicketDocumentsForOrderService;
let getOwnTicketDocumentService;

let generateOfficialTicketDocument;
let buildExistingOfficialTicketAttachment;

let EVENT_CATEGORIES;
let EVENT_STATUSES;
let EVENT_VISIBILITIES;

let TICKET_TYPE_KIND;
let TICKET_TYPE_STATUS;

let ORDER_BUYER_TYPE;
let ORDER_PAYMENT_PROVIDER;
let ORDER_PAYMENT_STATUS;
let ORDER_STATUS;

let TEST_FEATURES;

let uploadBufferMock;
let getBufferMock;
let deleteObjectMock;

async function loadTicketDocumentsSqlIntegrationModules({
  ticketing = true,
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
      jwtSecret: TEST_JWT_SECRET,
      branding: {
        appName: "Kiwi Events Test",
        locale: "de-AT",
        ticketTitle: "Test Ticket",
        ticketSubtitle: "Official test ticket.",
        defaultCurrency: "EUR",
      },
      auth: {
        provider: "hybrid",
        localJwtSecret: TEST_JWT_SECRET,
        externalJwtSecret: TEST_EXTERNAL_JWT_SECRET,
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

  TEST_FEATURES = {
    ticketing,
    guestCheckout,
    depositTickets: false,
    ticketPdf,
    ticketQr,
    mail,
    mailOrderConfirmation: mail,
    mailEventCancellation: mail,
    mailEventReminder: false,
    media: false,
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

  vi.doMock("../../../src/modules/payments/payment.service.js", () => ({
    createPaymentSession: vi.fn(),
    getPaymentSession: vi.fn(),
    createPaymentRefund: vi.fn(),
  }));

  const sqlTestDbModule = await import("../../helpers/sqlTestDb.js");

  clearSqlTestDb = sqlTestDbModule.clearSqlTestDb;
  connectSqlTestDb = sqlTestDbModule.connectSqlTestDb;
  disconnectSqlTestDb = sqlTestDbModule.disconnectSqlTestDb;

  const eventRepositoryModule =
    await import("../../../src/modules/events/repositories/event.repository.js");
  const ticketTypeRepositoryModule =
    await import("../../../src/modules/ticketTypes/repositories/ticketType.repository.js");
  const orderRepositoryModule =
    await import("../../../src/modules/orders/repositories/order.repository.js");
  const ticketRepositoryModule =
    await import("../../../src/modules/tickets/repositories/ticket.repository.js");

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

  createEvent = eventRepositoryModule.createEvent;

  createTicketType = ticketTypeRepositoryModule.createTicketType;
  reserveTicketTypeStock = ticketTypeRepositoryModule.reserveTicketTypeStock;

  createOrder = orderRepositoryModule.createOrder;

  findTicketsByOrderId = ticketRepositoryModule.findTicketsByOrderId;
  findTicketById = ticketRepositoryModule.findTicketById;
  setTicketPdfDocument = ticketRepositoryModule.setTicketPdfDocument;

  EVENT_CATEGORIES = eventConstantsModule.EVENT_CATEGORIES;
  EVENT_STATUSES = eventConstantsModule.EVENT_STATUSES;
  EVENT_VISIBILITIES = eventConstantsModule.EVENT_VISIBILITIES;

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
  return createEvent({
    title: "SQL Ticket Documents Event",
    slug: `sql-ticket-documents-event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    shortDescription: "SQL ticket documents integration event",
    description: "Created by SQL ticket documents integration test.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.PUBLISHED,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    tags: ["sql", "ticket-documents"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: false,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    notesInternal: "Created by SQL ticket documents integration test",
    ...overrides,
  });
}

async function createDocumentTicketType(event, overrides = {}) {
  return createTicketType({
    eventId: event.id,
    name: `${event.title} - Document Ticket`,
    displayName: "SQL Document Ticket",
    description: "SQL ticket document test ticket",
    status: TICKET_TYPE_STATUS.ACTIVE,
    ticketKind: TICKET_TYPE_KIND.NORMAL,
    pricingMode: "fixed",
    priceGross: 2500,
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
    ...overrides,
  });
}

async function createConfirmedOrderWithTickets({ quantity = 1 } = {}) {
  const event = await createPublishedEvent();

  const ticketType = await createDocumentTicketType(event, {
    displayName: "SQL Document Ticket",
    pricingMode: "fixed",
    priceGross: 2500,
    stockTotal: 10,
    stockSold: 0,
  });

  const totalPrice = 2500 * quantity;

  const order = await createOrder({
    orderNumber: `ORD-SQL-DOC-${Date.now()}-${Math.random()
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
        quantity,
        unitPrice: 2500,
        lineTotal: totalPrice,
        currency: "EUR",
        ticketTypeNameSnapshot: ticketType.displayName,
        ticketTypeDescriptionSnapshot: ticketType.description,
        ticketKindSnapshot: ticketType.ticketKind,
      },
    ],

    currency: "EUR",
    subtotal: totalPrice,
    totalPrice,

    status: ORDER_STATUS.CONFIRMED,
    paymentStatus: ORDER_PAYMENT_STATUS.PAID,
    paymentProvider: ORDER_PAYMENT_PROVIDER.MOLLIE,
    paymentProviderPaymentId: "pay_sql_doc_123",
    paymentCheckoutUrl: null,

    source: "public",
    confirmedAt: new Date(),
    expiresAt: null,

    createdByEventUserId: null,
    updatedByEventUserId: null,

    metadata: null,
  });

  await reserveTicketTypeStock({
    ticketTypeId: ticketType.id,
    eventId: event.id,
    quantity,
    updatedByEventUserId: null,
  });

  const tickets = await generateTicketsForOrderService(order.id, {
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

describe("Ticket documents SQL integration", () => {
  beforeAll(async () => {
    await loadTicketDocumentsSqlIntegrationModules();
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();

    TEST_FEATURES.ticketing = true;
    TEST_FEATURES.guestCheckout = true;
    TEST_FEATURES.depositTickets = false;
    TEST_FEATURES.ticketPdf = true;
    TEST_FEATURES.ticketQr = false;
    TEST_FEATURES.mail = false;
    TEST_FEATURES.mailOrderConfirmation = false;
    TEST_FEATURES.mailEventCancellation = false;
    TEST_FEATURES.mailEventReminder = false;
    TEST_FEATURES.media = false;
    TEST_FEATURES.reminders = false;

    uploadBufferMock?.mockClear();
    getBufferMock?.mockClear();
    deleteObjectMock?.mockClear();

    uploadBufferMock?.mockImplementation(async ({ key, storageTarget }) => ({
      key,
      bucket: "mock-storage",
      storageTarget: storageTarget || "local",
    }));

    getBufferMock?.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4 stored ticket pdf"),
      contentType: "application/pdf",
      contentLength: Buffer.byteLength("%PDF-1.4 stored ticket pdf"),
    });
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("skips ticket document generation when ticket PDF feature is disabled", async () => {
    TEST_FEATURES.ticketPdf = false;
    TEST_FEATURES.ticketQr = false;

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

    const ticketsInDb = await findTicketsByOrderId(order.id, {
      lean: true,
    });

    expect(ticketsInDb).toHaveLength(2);

    for (const ticket of ticketsInDb) {
      expect(ticket.ticketPdfStorageKey).toEqual(expect.any(String));
      expect(ticket.ticketPdfStorageKey).toMatch(
        new RegExp(
          `^tickets/${String(ticket.eventId)}/${String(ticket.id)}/ticket-v1-[0-9a-f-]{36}\\.pdf$`,
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

    await setTicketPdfDocument(tickets[0].id, {
      ticketPdfStorageKey: `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-existing.pdf`,
      ticketPdfStorageTarget: "local",
      ticketPdfGeneratedAt: new Date(),
      updatedByEventUserId: null,
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

    const ticketWithPdf = await setTicketPdfDocument(tickets[0].id, {
      ticketPdfStorageKey: oldKey,
      ticketPdfStorageTarget: "private",
      ticketPdfGeneratedAt: new Date(),
      updatedByEventUserId: null,
    });

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

    const ticketWithPdf = await setTicketPdfDocument(tickets[0].id, {
      ticketPdfStorageKey: `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-existing.pdf`,
      ticketPdfStorageTarget: "local",
      ticketPdfGeneratedAt: new Date(),
      updatedByEventUserId: null,
    });

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

    const ticketWithPdf = await setTicketPdfDocument(tickets[0].id, {
      ticketPdfStorageKey: `tickets/${tickets[0].eventId}/${tickets[0].id}/ticket-v1-existing.pdf`,
      ticketPdfStorageTarget: "local",
      ticketPdfGeneratedAt: new Date(),
      updatedByEventUserId: null,
    });

    const result = await getOwnTicketDocumentService({
      actor: buildExternalActor(),
      ticketId: ticketWithPdf.id,
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

    const ticketInDb = await findTicketById(tickets[0].id, {
      lean: true,
    });

    expect(ticketInDb.ticketPdfStorageKey).toEqual(expect.any(String));
    expect(ticketInDb.ticketPdfStorageTarget).toBe("local");
    expect(ticketInDb.ticketPdfGeneratedAt).toBeTruthy();
  });
});
