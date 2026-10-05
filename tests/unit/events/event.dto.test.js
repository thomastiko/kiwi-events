import { describe, expect, it } from "vitest";

import {
  toAdminEventDetailDto,
  toAdminEventListItemDto,
  toPublicEventDto,
} from "../../../src/modules/events/event.dto.js";

const NOW = new Date("2030-06-01T12:00:00.000Z");

const IDS = {
  event: "64f000000000000000000001",
  session: "64f000000000000000000002",
  faq: "64f000000000000000000003",
  asset: "64f000000000000000000004",
  ticketType: "64f000000000000000000005",
  eventUser: "64f000000000000000000006",
};

function buildEvent() {
  return {
    id: IDS.event,

    title: "DTO Event",
    slug: "dto-event",

    shortDescription: "Short description",

    description: "Long description",

    category: "event",
    status: "published",
    visibility: "public",
    location: "Vienna",

    imageAssetIds: [IDS.asset],

    tags: ["dto", "event"],

    sessions: [
      {
        id: IDS.session,

        startAt: "2030-06-10T10:00:00.000Z",

        endAt: "2030-06-10T12:00:00.000Z",

        timezone: "Europe/Vienna",

        locationLabel: "Main Hall",

        locationDetails: "Room 1",

        capacity: 100,
        status: "scheduled",
      },
    ],

    faqs: [
      {
        id: IDS.faq,

        question: "What is included?",

        answer: "Everything.",

        sortOrder: 0,
      },
    ],

    isFree: false,

    salesStartAt: "2030-05-01T10:00:00.000Z",

    salesEndAt: "2030-06-09T10:00:00.000Z",

    isFeatured: true,
    featuredOrder: 2,

    notesInternal: "Internal notes",

    createdByEventUserId: IDS.eventUser,

    updatedByEventUserId: IDS.eventUser,

    publishedAt: "2030-01-01T10:00:00.000Z",

    cancelledAt: null,

    cancellationReason: null,

    isCancellationFinalized: false,

    cancellationFinalizedAt: null,

    archivedAt: null,

    createdAt: "2029-01-01T10:00:00.000Z",

    updatedAt: "2029-02-01T10:00:00.000Z",
  };
}

function buildImageAsset() {
  return {
    id: IDS.asset,

    filenameOriginal: "event.png",

    mimeType: "image/png",

    size: 2048,

    key: "media/events/event.png",

    storageTarget: "local",
  };
}

function buildTicketType() {
  return {
    id: IDS.ticketType,

    eventId: IDS.event,

    name: "Internal Event - Ticket",

    displayName: "DTO Ticket",

    description: "Ticket description",

    status: "active",

    ticketKind: "normal",
    pricingMode: "fixed",
    priceGross: 2500,
    currency: "EUR",

    stockTotal: 10,
    stockSold: 2,

    minPerOrder: 1,
    maxPerOrder: 4,

    salesStartAt: "2030-05-01T10:00:00.000Z",

    salesEndAt: "2030-06-09T10:00:00.000Z",

    isPersonalized: false,

    sessionIds: [IDS.session],

    sortOrder: 0,

    createdByEventUserId: IDS.eventUser,

    updatedByEventUserId: IDS.eventUser,

    createdAt: "2029-01-01T10:00:00.000Z",

    updatedAt: "2029-02-01T10:00:00.000Z",
  };
}

describe("event DTO contract", () => {
  it("produces the canonical public event contract", () => {
    const result = toPublicEventDto(buildEvent(), {
      now: NOW,

      imageAssets: [buildImageAsset()],

      ticketTypes: [buildTicketType()],
    });

    expect(result).toMatchObject({
      id: IDS.event,

      startsAt: "2030-06-10T10:00:00.000Z",

      endsAt: "2030-06-10T12:00:00.000Z",

      isBookable: true,

      sessions: [
        {
          id: IDS.session,
          isCancelled: false,
        },
      ],

      faqs: [
        {
          id: IDS.faq,
        },
      ],

      imageAssets: [
        {
          id: IDS.asset,

          fileUrl: `/api/public/media-assets/${IDS.asset}/file`,
        },
      ],

      ticketTypes: [
        {
          id: IDS.ticketType,
          stockRemaining: 8,
          isSalesOpen: true,
        },
      ],
    });

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('"_id"');

    expect(serialized).not.toContain('"notesInternal"');

    expect(serialized).not.toContain('"imageAssetIds"');

    expect(serialized).not.toContain('"key"');

    expect(serialized).not.toContain('\"storageTarget\"');
  });

  it("produces the admin list contract with nested stats", () => {
    const result = toAdminEventListItemDto(buildEvent(), {
      imageAssets: [buildImageAsset()],

      stats: {
        ordersCount: 10,
        paidOrdersCount: 8,
        ticketsSold: 12,
      },
    });

    expect(result).toMatchObject({
      id: IDS.event,

      imageAssetIds: [IDS.asset],

      notesInternal: "Internal notes",

      stats: {
        ordersCount: 10,
        paidOrdersCount: 8,
        ticketsSold: 12,
      },
    });

    expect(result).not.toHaveProperty("_id");

    expect(result).not.toHaveProperty("ordersCount");

    expect(result).not.toHaveProperty("paidOrdersCount");

    expect(result).not.toHaveProperty("ticketsSold");
  });

  it("produces the admin detail contract with admin ticket types", () => {
    const result = toAdminEventDetailDto(buildEvent(), {
      imageAssets: [buildImageAsset()],

      ticketTypes: [buildTicketType()],

      now: NOW,
    });

    expect(result.ticketTypes).toHaveLength(1);

    expect(result.ticketTypes[0]).toMatchObject({
      id: IDS.ticketType,
      stockTotal: 10,
      stockSold: 2,
      stockRemaining: 8,
    });

    expect(result.ticketTypes[0]).not.toHaveProperty("_id");

    expect(result.ticketTypes[0]).not.toHaveProperty("name");
  });

  it("rejects an invalid persisted session time window", () => {
    const event = buildEvent();

    event.sessions[0].endAt = "2030-06-10T09:00:00.000Z";

    expect(() => toPublicEventDto(event)).toThrow(
      "Cannot serialize an invalid event session time window.",
    );
  });
});
