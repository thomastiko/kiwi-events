import { describe, expect, it } from "vitest";

import {
  toAdminTicketTypeDto,
  toPublicTicketTypeDto,
} from "../../../src/modules/ticketTypes/ticketType.dto.js";

const NOW = new Date("2030-06-01T12:00:00.000Z");

function buildMongoTicketType() {
  return {
    id: "64f000000000000000000001",

    eventId: "64f000000000000000000002",

    name: "Internal Event - Public Ticket",
    displayName: "Public Ticket",
    description: "Ticket description",
    status: "active",
    ticketKind: "normal",
    pricingMode: "fixed",
    priceGross: 2500,
    currency: "eur",
    stockTotal: 10,
    stockSold: 3,
    minPerOrder: 1,
    maxPerOrder: 4,

    salesStartAt: new Date("2030-05-01T10:00:00.000Z"),

    salesEndAt: new Date("2030-07-01T10:00:00.000Z"),

    isPersonalized: true,

    sessionIds: ["64f000000000000000000003"],

    sortOrder: 2,

    createdByEventUserId: "64f000000000000000000004",

    updatedByEventUserId: "64f000000000000000000005",

    createdAt: new Date("2030-01-01T10:00:00.000Z"),

    updatedAt: new Date("2030-02-01T10:00:00.000Z"),
  };
}

function buildSqlTicketType() {
  return {
    id: "64f000000000000000000001",
    eventId: "64f000000000000000000002",
    name: "Internal Event - Public Ticket",
    displayName: "Public Ticket",
    description: "Ticket description",
    status: "active",
    ticketKind: "normal",
    pricingMode: "fixed",
    priceGross: 2500,
    currency: "EUR",
    stockTotal: 10,
    stockSold: 3,
    minPerOrder: 1,
    maxPerOrder: 4,
    salesStartAt: "2030-05-01T10:00:00.000Z",
    salesEndAt: "2030-07-01T10:00:00.000Z",
    isPersonalized: true,
    sessionIds: ["64f000000000000000000003"],
    sortOrder: 2,
    createdByEventUserId: "64f000000000000000000004",
    updatedByEventUserId: "64f000000000000000000005",
    createdAt: "2030-01-01T10:00:00.000Z",
    updatedAt: "2030-02-01T10:00:00.000Z",
  };
}

describe("ticket type DTO contract", () => {
  it("produces the same public contract for MongoDB and SQL", () => {
    const mongoResult = toPublicTicketTypeDto(buildMongoTicketType(), {
      now: NOW,
    });

    const sqlResult = toPublicTicketTypeDto(buildSqlTicketType(), {
      now: NOW,
    });

    expect(mongoResult).toEqual(sqlResult);

    expect(mongoResult).toEqual({
      id: "64f000000000000000000001",
      eventId: "64f000000000000000000002",
      displayName: "Public Ticket",
      description: "Ticket description",
      status: "active",
      ticketKind: "normal",
      pricingMode: "fixed",
      priceGross: 2500,
      currency: "EUR",
      stockRemaining: 7,
      minPerOrder: 1,
      maxPerOrder: 4,
      salesStartAt: "2030-05-01T10:00:00.000Z",
      salesEndAt: "2030-07-01T10:00:00.000Z",
      isPersonalized: true,
      sessionIds: ["64f000000000000000000003"],
      sortOrder: 2,
      isSoldOut: false,
      isSalesOpen: true,
    });

    expect(mongoResult).not.toHaveProperty("_id");
    expect(mongoResult).not.toHaveProperty("name");
    expect(mongoResult).not.toHaveProperty("stockSold");
    expect(mongoResult).not.toHaveProperty("stockTotal");
  });

  it("produces the complete admin contract", () => {
    const result = toAdminTicketTypeDto(buildSqlTicketType(), {
      now: NOW,
    });

    expect(result).toMatchObject({
      id: "64f000000000000000000001",
      eventId: "64f000000000000000000002",
      stockTotal: 10,
      stockSold: 3,
      stockRemaining: 7,
      createdByEventUserId: "64f000000000000000000004",
      updatedByEventUserId: "64f000000000000000000005",
      createdAt: "2030-01-01T10:00:00.000Z",
      updatedAt: "2030-02-01T10:00:00.000Z",
    });

    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("name");
  });

  it("marks a depleted ticket type as sold out", () => {
    const result = toPublicTicketTypeDto(
      {
        ...buildSqlTicketType(),
        stockTotal: 3,
        stockSold: 3,
      },
      {
        now: NOW,
      },
    );

    expect(result).toMatchObject({
      stockRemaining: 0,
      isSoldOut: true,
      isSalesOpen: false,
    });
  });

  it("marks a ticket type outside its sales window as closed", () => {
    const result = toPublicTicketTypeDto(buildSqlTicketType(), {
      now: new Date("2030-08-01T12:00:00.000Z"),
    });

    expect(result.isSoldOut).toBe(false);
    expect(result.isSalesOpen).toBe(false);
  });

  it("supports unlimited stock", () => {
    const result = toPublicTicketTypeDto(
      {
        ...buildSqlTicketType(),
        stockTotal: null,
        stockSold: 500,
      },
      {
        now: NOW,
      },
    );

    expect(result).toMatchObject({
      stockRemaining: null,
      isSoldOut: false,
      isSalesOpen: true,
    });
  });

  it("rejects inconsistent persisted stock", () => {
    expect(() =>
      toPublicTicketTypeDto(
        {
          ...buildSqlTicketType(),
          stockTotal: 2,
          stockSold: 3,
        },
        {
          now: NOW,
        },
      ),
    ).toThrow(
      "Cannot derive ticket type availability when stockSold exceeds stockTotal.",
    );
  });
});
