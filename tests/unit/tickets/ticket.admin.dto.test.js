import { describe, expect, it } from "vitest";

import {
  toAdminTicketCheckInConfirmDto,
  toAdminTicketCheckInLookupDto,
  toAdminTicketDto,
  toAdminTicketListMetaDto,
} from "../../../src/modules/tickets/ticket.dto.js";

import {
  TICKET_CHECK_IN_STATE,
  TICKET_STATUS,
} from "../../../src/modules/tickets/ticket.constants.js";

const IDS = {
  ticket: "64f400000000000000000001",

  order: "64f400000000000000000002",

  event: "64f400000000000000000003",

  ticketType: "64f400000000000000000004",

  checkInUser: "64f400000000000000000005",

  refundUser: "64f400000000000000000006",

  createdBy: "64f400000000000000000007",

  updatedBy: "64f400000000000000000008",
};

function buildTicket() {
  return {
    id: IDS.ticket,

    ticketCode: "TKT-ADMIN-1234",

    orderId: IDS.order,
    eventId: IDS.event,
    ticketTypeId: IDS.ticketType,

    buyerType: "external_user",

    buyerExternalProvider: "host-system",

    buyerExternalUserId: "external-user-123",

    buyerEmailSnapshot: "BUYER@EXAMPLE.COM",

    buyerFirstNameSnapshot: "Ada",

    buyerLastNameSnapshot: "Lovelace",

    buyerDisplayNameSnapshot: "",

    holderType: "buyer",

    holderExternalProvider: "host-system",

    holderExternalUserId: "external-user-123",

    holderEmailSnapshot: "HOLDER@EXAMPLE.COM",

    holderFirstNameSnapshot: "Grace",

    holderLastNameSnapshot: "Hopper",

    holderDisplayNameSnapshot: "",

    eventTitleSnapshot: "Admin DTO Event",

    eventSlugSnapshot: "admin-dto-event",

    eventCategorySnapshot: "event",

    eventStartsAtSnapshot: "2030-07-10T10:00:00.000Z",

    ticketTypeNameSnapshot: "Deposit Ticket",

    ticketTypeDescriptionSnapshot: "Refundable ticket",

    ticketKind: "deposit",

    unitPrice: 2500,

    currency: "eur",

    status: "checked_in",

    checkedInAt: "2030-07-10T10:05:00.000Z",

    checkedInByEventUserId: IDS.checkInUser,

    cancelledAt: null,

    cancellationReason: null,

    checkInTokenHash: "must-not-leak",

    encryptedCheckInToken: "must-not-leak",

    checkInPayloadVersion: 1,

    checkInTokenCreatedAt: "2030-07-01T10:00:00.000Z",

    checkInTokenRotatedAt: null,

    checkInTokenLastUsedAt: "2030-07-10T10:05:00.000Z",

    ticketPdfStorageKey: "private/tickets/ticket.pdf",
    ticketPdfStorageTarget: "private",

    ticketPdfGeneratedAt: "2030-07-01T10:10:00.000Z",

    depositRefundStatus: "refunded",

    depositRefundAmount: 2500,

    depositRefundCurrency: "eur",

    depositRefundProviderRefundId: "refund-provider-123",

    depositRefundTriggeredAt: "2030-07-10T10:06:00.000Z",

    depositRefundTriggeredByEventUserId: IDS.refundUser,

    depositRefundFailureReason: null,

    metadata: {
      internal: true,
    },

    createdByEventUserId: IDS.createdBy,

    updatedByEventUserId: IDS.updatedBy,

    createdAt: "2030-07-01T10:00:00.000Z",

    updatedAt: "2030-07-10T10:06:00.000Z",
  };
}
function buildNormalTicketForStatus(status) {
  const ticket = buildTicket();

  ticket.ticketKind = "normal";

  ticket.depositRefundStatus = "not_required";
  ticket.depositRefundAmount = 0;
  ticket.depositRefundProviderRefundId = null;
  ticket.depositRefundTriggeredAt = null;
  ticket.depositRefundTriggeredByEventUserId = null;
  ticket.depositRefundFailureReason = null;

  ticket.status = status;

  if (status === TICKET_STATUS.CHECKED_IN) {
    ticket.checkedInAt = "2030-07-10T10:05:00.000Z";

    ticket.checkedInByEventUserId = IDS.checkInUser;
  } else {
    ticket.checkedInAt = null;
    ticket.checkedInByEventUserId = null;
  }

  if (status === TICKET_STATUS.CANCELLED) {
    ticket.cancelledAt = "2030-07-09T10:00:00.000Z";

    ticket.cancellationReason = "Ticket cancelled";
  } else {
    ticket.cancelledAt = null;
    ticket.cancellationReason = null;
  }

  return ticket;
}
describe("admin ticket DTO contract", () => {
  it("serializes the canonical admin ticket contract", () => {
    const result = toAdminTicketDto(buildTicket());

    expect(result).toMatchObject({
      id: IDS.ticket,

      orderId: IDS.order,

      status: "checked_in",

      checkIn: {
        checkedInAt: "2030-07-10T10:05:00.000Z",

        checkedInByEventUserId: IDS.checkInUser,
      },

      document: {
        available: true,

        generatedAt: "2030-07-01T10:10:00.000Z",
      },

      depositRefund: {
        status: "refunded",

        amount: 2500,

        currency: "EUR",

        providerRefundId: "refund-provider-123",

        triggeredAt: "2030-07-10T10:06:00.000Z",

        triggeredByEventUserId: IDS.refundUser,

        failureReason: null,
      },

      audit: {
        createdByEventUserId: IDS.createdBy,

        updatedByEventUserId: IDS.updatedBy,
      },
    });
  });

  it("does not expose secrets, storage keys or raw persistence fields", () => {
    const result = toAdminTicketDto(buildTicket());

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",

      "buyerEmailSnapshot",
      "holderEmailSnapshot",
      "eventTitleSnapshot",
      "ticketTypeNameSnapshot",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "checkInPayloadVersion",
      "checkInTokenCreatedAt",
      "checkInTokenRotatedAt",
      "checkInTokenLastUsedAt",

      "ticketPdfStorageKey",
      "ticketPdfStorageTarget",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }

    expect(result.document.available).toBe(true);

    expect(result.depositRefund.providerRefundId).toBe("refund-provider-123");
  });

  it("does not use _id as an id fallback", () => {
    const ticket = buildTicket();

    ticket._id = IDS.ticket;

    ticket.id = null;

    expect(() => toAdminTicketDto(ticket)).toThrow(
      "Cannot serialize a ticket without id.",
    );
  });

  it("reports document availability without exposing its storage key", () => {
    const ticket = buildTicket();

    ticket.ticketPdfStorageKey = null;

    ticket.ticketPdfGeneratedAt = null;

    const result = toAdminTicketDto(ticket);

    expect(result.document).toEqual({
      available: false,

      generatedAt: null,
    });

    expect(JSON.stringify(result)).not.toContain("private/tickets");
  });
  it("serializes consistent admin ticket list metadata", () => {
    const result = toAdminTicketListMetaDto({
      event: {
        id: IDS.event,

        title: "Admin DTO Event",

        status: "published",
      },

      pagination: {
        page: 1,
        limit: 20,
        total: 4,
        pages: 1,
      },

      summary: {
        total: 4,
        active: 1,
        checkedIn: 1,
        cancelled: 1,
        refunded: 1,
      },
    });

    expect(result).toEqual({
      event: {
        id: IDS.event,

        title: "Admin DTO Event",

        status: "published",
      },

      pagination: {
        page: 1,
        limit: 20,
        total: 4,
        pages: 1,
      },

      summary: {
        total: 4,
        active: 1,
        checkedIn: 1,
        cancelled: 1,
        refunded: 1,
      },
    });
  });
  it.each([
    {
      status: TICKET_STATUS.ACTIVE,

      expectedAllowed: true,

      expectedState: TICKET_CHECK_IN_STATE.ALLOWED,
    },

    {
      status: TICKET_STATUS.CHECKED_IN,

      expectedAllowed: false,

      expectedState: TICKET_CHECK_IN_STATE.ALREADY_CHECKED_IN,
    },

    {
      status: TICKET_STATUS.CANCELLED,

      expectedAllowed: false,

      expectedState: TICKET_CHECK_IN_STATE.CANCELLED,
    },

    {
      status: TICKET_STATUS.REFUNDED,

      expectedAllowed: false,

      expectedState: TICKET_CHECK_IN_STATE.REFUNDED,
    },
  ])(
    "serializes check-in lookup state $expectedState",
    ({ status, expectedAllowed, expectedState }) => {
      const result = toAdminTicketCheckInLookupDto(
        buildNormalTicketForStatus(status),
      );

      expect(result).toMatchObject({
        ticket: {
          id: IDS.ticket,

          status,
        },

        checkIn: {
          allowed: expectedAllowed,

          state: expectedState,
        },
      });
    },
  );
  it("does not expose internal ticket fields through the check-in lookup DTO", () => {
    const result = toAdminTicketCheckInLookupDto(
      buildNormalTicketForStatus(TICKET_STATUS.ACTIVE),
    );

    const serialized = JSON.stringify(result);

    for (const field of [
      "_id",
      "__v",

      "checkInTokenHash",
      "encryptedCheckInToken",
      "checkInPayloadVersion",
      "checkInTokenCreatedAt",
      "checkInTokenRotatedAt",
      "checkInTokenLastUsedAt",

      "ticketPdfStorageKey",
      "ticketPdfStorageTarget",

      "metadata",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
  it("serializes a successful check-in confirmation", () => {
    const ticket = buildNormalTicketForStatus(TICKET_STATUS.CHECKED_IN);

    const result = toAdminTicketCheckInConfirmDto({
      ticketDto: toAdminTicketDto(ticket),

      statusChanged: true,
    });

    expect(result).toMatchObject({
      ticket: {
        id: IDS.ticket,

        status: TICKET_STATUS.CHECKED_IN,

        checkIn: {
          checkedInAt: "2030-07-10T10:05:00.000Z",

          checkedInByEventUserId: IDS.checkInUser,
        },
      },

      checkIn: {
        requestedCheckedIn: true,

        statusChanged: true,
      },
    });
  });
  it("serializes an idempotent repeated check-in confirmation", () => {
    const result = toAdminTicketCheckInConfirmDto({
      ticketDto: toAdminTicketDto(
        buildNormalTicketForStatus(TICKET_STATUS.CHECKED_IN),
      ),

      statusChanged: false,
    });

    expect(result.checkIn).toEqual({
      requestedCheckedIn: true,

      statusChanged: false,
    });
  });
  it("rejects a check-in confirmation without an explicit statusChanged value", () => {
    const ticket = buildNormalTicketForStatus(TICKET_STATUS.CHECKED_IN);

    expect(() =>
      toAdminTicketCheckInConfirmDto({
        ticketDto: toAdminTicketDto(ticket),
      }),
    ).toThrow(
      "Cannot serialize ticket check-in confirmation without statusChanged.",
    );

    expect(() =>
      toAdminTicketCheckInConfirmDto({
        ticketDto: toAdminTicketDto(ticket),

        statusChanged: "true",
      }),
    ).toThrow(
      "Cannot serialize ticket check-in confirmation without statusChanged.",
    );
  });
  it("rejects a check-in confirmation without an admin ticket DTO", () => {
    expect(() =>
      toAdminTicketCheckInConfirmDto({
        statusChanged: true,
      }),
    ).toThrow(
      "Cannot serialize ticket check-in confirmation without an admin ticket DTO.",
    );
  });
});
