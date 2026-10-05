import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadKiwiEventsConfigMock,
  findEventByIdMock,
  findTicketTypeByIdMock,
  findTicketsByOrderIdMock,
} = vi.hoisted(() => ({
  loadKiwiEventsConfigMock: vi.fn(),
  findEventByIdMock: vi.fn(),
  findTicketTypeByIdMock: vi.fn(),
  findTicketsByOrderIdMock: vi.fn(),
}));

vi.mock("../../../src/config/kiwi-events/kiwi-events.config.store.js", () => ({
  loadKiwiEventsConfig: loadKiwiEventsConfigMock,
}));

vi.mock("../../../src/modules/events/repositories/event.repository.js", () => ({
  findEventById: findEventByIdMock,
}));

vi.mock(
  "../../../src/modules/ticketTypes/repositories/ticketType.repository.js",
  () => ({
    findTicketTypeById: findTicketTypeByIdMock,
  }),
);

vi.mock(
  "../../../src/modules/tickets/repositories/ticket.repository.js",
  () => ({
    findTicketsByOrderId: findTicketsByOrderIdMock,
  }),
);

import {
  CUSTOMER_ORDER_CANCELLATION_ACTION,
  CUSTOMER_ORDER_CANCELLATION_REASON,
  getCustomerOrderCancellationEligibilityService,
} from "../../../src/modules/orders/order.customerCancellation.service.js";

import {
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "../../../src/modules/orders/order.constants.js";

import { EVENT_STATUSES } from "../../../src/modules/events/event.constants.js";

import { TICKET_STATUS } from "../../../src/modules/tickets/ticket.constants.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");

function buildConfig({ enabled = true, deadlineDays = null } = {}) {
  return {
    orders: {
      customerSelfServiceCancellation: {
        enabled,
        refundDeadlineDaysBeforeSession: deadlineDays,
      },
    },
  };
}

function buildOrder(overrides = {}) {
  return {
    id: "order-1",
    eventId: "event-1",

    status: ORDER_STATUS.CONFIRMED,

    paymentStatus: ORDER_PAYMENT_STATUS.PAID,

    refundStatus: ORDER_REFUND_STATUS.NONE,

    items: [
      {
        ticketTypeId: "ticket-type-1",
        quantity: 1,
      },
    ],

    ...overrides,
  };
}

function buildEvent(overrides = {}) {
  return {
    id: "event-1",

    status: EVENT_STATUSES.PUBLISHED,

    sessions: [
      {
        id: "session-1",
        startAt: "2026-10-10T10:00:00.000Z",
      },
    ],

    ...overrides,
  };
}

function buildTicketType(overrides = {}) {
  return {
    id: "ticket-type-1",

    sessionIds: ["session-1"],

    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  loadKiwiEventsConfigMock.mockReturnValue(buildConfig());

  findEventByIdMock.mockResolvedValue(buildEvent());

  findTicketTypeByIdMock.mockResolvedValue(buildTicketType());

  findTicketsByOrderIdMock.mockResolvedValue([]);
});

describe("customer order cancellation eligibility", () => {
  it("denies self-service cancellation when the feature is disabled", async () => {
    loadKiwiEventsConfigMock.mockReturnValue(
      buildConfig({
        enabled: false,
      }),
    );

    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder(),
      now: NOW,
    });

    expect(result).toEqual({
      allowed: false,
      action: null,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.DISABLED,

      deadlineAt: null,
      earliestRelevantSessionStartAt: null,
    });

    expect(findEventByIdMock).not.toHaveBeenCalled();
  });

  it("allows cancelling an unpaid pending checkout", async () => {
    const order = buildOrder({
      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    });

    const result = await getCustomerOrderCancellationEligibilityService({
      order,
      now: NOW,
    });

    expect(result).toMatchObject({
      allowed: true,

      action: CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_PENDING,

      reason: null,

      deadlineAt: null,
      earliestRelevantSessionStartAt: null,
    });
  });

  it("allows full refund of a confirmed paid order when no deadline is configured", async () => {
    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder(),
      now: NOW,
    });

    expect(result).toMatchObject({
      allowed: true,

      action: CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED,

      reason: null,

      deadlineAt: null,
      earliestRelevantSessionStartAt: null,
    });
  });

  it("allows cancelling a confirmed free order without a refund", async () => {
    const order = buildOrder({
      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,
    });

    const result = await getCustomerOrderCancellationEligibilityService({
      order,
      now: NOW,
    });

    expect(result).toMatchObject({
      allowed: true,

      action: CUSTOMER_ORDER_CANCELLATION_ACTION.CANCEL_CONFIRMED,

      reason: null,
    });
  });

  it("denies cancellation when a ticket has already been checked in", async () => {
    findTicketsByOrderIdMock.mockResolvedValue([
      {
        id: "ticket-1",

        status: TICKET_STATUS.CHECKED_IN,
      },
    ]);

    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder(),
      now: NOW,
    });

    expect(result).toMatchObject({
      allowed: false,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.TICKET_ALREADY_CHECKED_IN,
    });
  });

  it("denies cancellation when a refund lifecycle already exists", async () => {
    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder({
        refundStatus: ORDER_REFUND_STATUS.FAILED,
      }),

      now: NOW,
    });

    expect(result).toMatchObject({
      allowed: false,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.REFUND_ALREADY_EXISTS,
    });
  });

  it("denies self-service cancellation when the event is already cancelled", async () => {
    findEventByIdMock.mockResolvedValue(
      buildEvent({
        status: EVENT_STATUSES.CANCELLED,
      }),
    );

    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder(),
      now: NOW,
    });

    expect(result).toMatchObject({
      allowed: false,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.EVENT_CANCELLED,
    });
  });

  it("uses the earliest relevant session across all order items for the deadline", async () => {
    loadKiwiEventsConfigMock.mockReturnValue(
      buildConfig({
        deadlineDays: 3,
      }),
    );

    findEventByIdMock.mockResolvedValue({
      id: "event-1",

      status: EVENT_STATUSES.PUBLISHED,

      sessions: [
        {
          id: "session-early",
          startAt: "2026-10-10T10:00:00.000Z",
        },

        {
          id: "session-late",
          startAt: "2026-10-20T10:00:00.000Z",
        },
      ],
    });

    findTicketTypeByIdMock.mockImplementation(async (ticketTypeId) => {
      if (ticketTypeId === "ticket-type-late") {
        return {
          id: ticketTypeId,
          sessionIds: ["session-late"],
        };
      }

      if (ticketTypeId === "ticket-type-early") {
        return {
          id: ticketTypeId,
          sessionIds: ["session-early"],
        };
      }

      return null;
    });

    const order = buildOrder({
      items: [
        {
          ticketTypeId: "ticket-type-late",
          quantity: 1,
        },

        {
          ticketTypeId: "ticket-type-early",
          quantity: 1,
        },
      ],
    });

    const result = await getCustomerOrderCancellationEligibilityService({
      order,

      now: new Date("2026-10-06T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      allowed: true,

      action: CUSTOMER_ORDER_CANCELLATION_ACTION.REFUND_CONFIRMED,
    });

    expect(result.earliestRelevantSessionStartAt).toEqual(
      new Date("2026-10-10T10:00:00.000Z"),
    );

    expect(result.deadlineAt).toEqual(new Date("2026-10-07T10:00:00.000Z"));
  });

  it("denies cancellation when the configured deadline has been reached", async () => {
    loadKiwiEventsConfigMock.mockReturnValue(
      buildConfig({
        deadlineDays: 3,
      }),
    );

    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder(),

      now: new Date("2026-10-07T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      allowed: false,

      reason: CUSTOMER_ORDER_CANCELLATION_REASON.DEADLINE_PASSED,

      deadlineAt: new Date("2026-10-07T10:00:00.000Z"),

      earliestRelevantSessionStartAt: new Date("2026-10-10T10:00:00.000Z"),
    });
  });

  it("treats an empty ticket type session assignment as all event sessions", async () => {
    loadKiwiEventsConfigMock.mockReturnValue(
      buildConfig({
        deadlineDays: 2,
      }),
    );

    findEventByIdMock.mockResolvedValue({
      id: "event-1",

      status: EVENT_STATUSES.PUBLISHED,

      sessions: [
        {
          id: "session-late",
          startAt: "2026-10-20T10:00:00.000Z",
        },

        {
          id: "session-early",
          startAt: "2026-10-10T10:00:00.000Z",
        },
      ],
    });

    findTicketTypeByIdMock.mockResolvedValue({
      id: "ticket-type-1",
      sessionIds: [],
    });

    const result = await getCustomerOrderCancellationEligibilityService({
      order: buildOrder(),

      now: new Date("2026-10-07T10:00:00.000Z"),
    });

    expect(result.allowed).toBe(true);

    expect(result.earliestRelevantSessionStartAt).toEqual(
      new Date("2026-10-10T10:00:00.000Z"),
    );

    expect(result.deadlineAt).toEqual(new Date("2026-10-08T10:00:00.000Z"));
  });
});
