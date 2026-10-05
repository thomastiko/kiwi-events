import { describe, expect, it } from "vitest";

import { toPublicTicketDto } from "../../../src/modules/tickets/ticket.dto.js";

const IDS = {
  ticket: "64f100000000000000000001",
  order: "64f100000000000000000002",
  event: "64f100000000000000000003",
  ticketType: "64f100000000000000000004",
};

function buildTicket() {
  return {
    id: IDS.ticket,

    ticketCode: "TKT-ABC12345",

    orderId: IDS.order,
    eventId: IDS.event,
    ticketTypeId: IDS.ticketType,

    buyerType: "external_user",

    buyerExternalProvider: "host-system",

    buyerExternalUserId: "user-123",

    buyerEmailSnapshot: "BUYER@EXAMPLE.COM",

    buyerFirstNameSnapshot: "Ada",

    buyerLastNameSnapshot: "Lovelace",

    buyerDisplayNameSnapshot: "",

    holderType: "buyer",

    holderExternalProvider: "host-system",

    holderExternalUserId: "user-123",

    holderEmailSnapshot: "HOLDER@EXAMPLE.COM",

    holderFirstNameSnapshot: "Grace",

    holderLastNameSnapshot: "Hopper",

    holderDisplayNameSnapshot: "",

    eventTitleSnapshot: "DTO Event",

    eventSlugSnapshot: "dto-event",

    eventCategorySnapshot: "event",

    eventStartsAtSnapshot: "2030-06-10T10:00:00.000Z",

    ticketTypeNameSnapshot: "Deposit Ticket",

    ticketTypeDescriptionSnapshot: "Refundable deposit ticket",

    ticketKind: "deposit",

    unitPrice: 2500,

    currency: "eur",

    status: "active",

    checkedInAt: null,

    checkedInByEventUserId: "64f100000000000000000005",

    cancelledAt: null,

    cancellationReason: null,

    checkInTokenHash: "must-not-leak",

    encryptedCheckInToken: "must-not-leak",

    checkInPayloadVersion: 1,

    checkInTokenCreatedAt: "2030-06-01T10:00:00.000Z",

    checkInTokenRotatedAt: null,

    checkInTokenLastUsedAt: null,

    ticketPdfStorageKey: "tickets/private.pdf",
    ticketPdfStorageTarget: "private",

    ticketPdfGeneratedAt: "2030-06-01T10:05:00.000Z",

    depositRefundStatus: "eligible",

    depositRefundAmount: 2500,

    depositRefundCurrency: "eur",

    depositRefundProviderRefundId: "must-not-leak",

    depositRefundTriggeredAt: null,

    depositRefundTriggeredByEventUserId: "64f100000000000000000006",

    depositRefundFailureReason: "must-not-leak",

    metadata: {
      internal: true,
    },

    createdByEventUserId: "64f100000000000000000007",

    updatedByEventUserId: "64f100000000000000000008",

    createdAt: "2030-06-01T10:00:00.000Z",

    updatedAt: "2030-06-01T10:05:00.000Z",
  };
}

describe("public ticket DTO contract", () => {
  it("serializes the canonical public ticket contract", () => {
    const result = toPublicTicketDto(buildTicket());

    expect(result).toEqual({
      id: IDS.ticket,

      ticketCode: "TKT-ABC12345",

      orderId: IDS.order,

      buyer: {
        type: "external_user",

        email: "buyer@example.com",

        firstName: "Ada",

        lastName: "Lovelace",

        displayName: "Ada Lovelace",
      },

      holder: {
        type: "buyer",

        email: "holder@example.com",

        firstName: "Grace",

        lastName: "Hopper",

        displayName: "Grace Hopper",
      },

      event: {
        id: IDS.event,

        title: "DTO Event",

        slug: "dto-event",

        category: "event",

        startsAt: "2030-06-10T10:00:00.000Z",
      },

      ticketType: {
        id: IDS.ticketType,

        displayName: "Deposit Ticket",

        description: "Refundable deposit ticket",

        kind: "deposit",
      },

      pricing: {
        currency: "EUR",

        unitPrice: 2500,
      },

      status: "active",

      checkIn: {
        checkedInAt: null,
      },

      cancellation: {
        cancelledAt: null,

        reason: null,
      },

      depositRefund: {
        status: "eligible",

        amount: 2500,

        currency: "EUR",

        triggeredAt: null,
      },

      createdAt: "2030-06-01T10:00:00.000Z",

      updatedAt: "2030-06-01T10:05:00.000Z",
    });
  });

  it("does not expose persistence, credential or operational internals", () => {
    const serialized = JSON.stringify(toPublicTicketDto(buildTicket()));

    for (const field of [
      "_id",
      "__v",
      "buyerExternalProvider",
      "buyerExternalUserId",
      "holderExternalProvider",
      "holderExternalUserId",
      "buyerEmailSnapshot",
      "holderEmailSnapshot",
      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",
      "checkedInByEventUserId",
      "checkInTokenHash",
      "encryptedCheckInToken",
      "checkInPayloadVersion",
      "checkInTokenCreatedAt",
      "checkInTokenRotatedAt",
      "checkInTokenLastUsedAt",
      "ticketPdfStorageKey",
      "ticketPdfStorageTarget",
      "ticketPdfGeneratedAt",
      "depositRefundProviderRefundId",
      "depositRefundTriggeredByEventUserId",
      "depositRefundFailureReason",
      "metadata",
      "createdByEventUserId",
      "updatedByEventUserId",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("does not use _id as a compatibility fallback", () => {
    const ticket = buildTicket();

    ticket._id = IDS.ticket;

    ticket.id = null;

    expect(() => toPublicTicketDto(ticket)).toThrow(
      "Cannot serialize a ticket without id.",
    );
  });

  it("rejects inconsistent deposit refund states", () => {
    const invalidAmount = buildTicket();

    invalidAmount.depositRefundAmount = 2000;

    expect(() => toPublicTicketDto(invalidAmount)).toThrow(
      "Cannot serialize a deposit ticket with an inconsistent refund amount.",
    );

    const missingState = buildTicket();

    missingState.depositRefundStatus = "not_required";

    expect(() => toPublicTicketDto(missingState)).toThrow(
      "Cannot serialize a deposit ticket without a deposit refund state.",
    );

    const normalTicket = buildTicket();

    normalTicket.ticketKind = "normal";

    expect(() => toPublicTicketDto(normalTicket)).toThrow(
      "Cannot serialize a normal ticket with a deposit refund.",
    );
  });

  it("rejects ambiguous dates and incomplete external identities", () => {
    const invalidDate = buildTicket();

    invalidDate.createdAt = "2030-06-01 10:00:00";

    expect(() => toPublicTicketDto(invalidDate)).toThrow(
      "Cannot serialize an API date without an explicit timezone.",
    );

    const invalidBuyer = buildTicket();

    invalidBuyer.buyerExternalUserId = null;

    expect(() => toPublicTicketDto(invalidBuyer)).toThrow(
      "Cannot serialize an external ticket buyer without provider and user id.",
    );
  });
});
