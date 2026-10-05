import { describe, expect, it } from "vitest";

import {
  createEventSchema,
  sendCustomEventMailSchema,
  updateEventSchema,
  uploadEventImagesSchema,
} from "../../../src/modules/events/internal/event.internal.validation.js";
import {
  createTicketTypeSchema,
  updateTicketTypeSchema,
} from "../../../src/modules/ticketTypes/internal/ticketType.internal.validation.js";
import {
  createEventUserSchema,
  updateEventUserSchema,
  uploadEventUserProfileImageSchema,
} from "../../../src/modules/eventUsers/eventUser.validation.js";

const emptyParams = {};
const emptyQuery = {};

function expectInvalidField(result, { path, key, messageIncludes }) {
  expect(result.success).toBe(false);

  const matchingIssue = result.error.issues.find((issue) => {
    const pathMatches = issue.path.join(".") === path;
    const keyMatches = !key || issue.keys?.includes(key);
    const messageMatches =
      !messageIncludes || issue.message.includes(messageIncludes);

    return pathMatches && keyMatches && messageMatches;
  });

  expect(matchingIssue).toBeTruthy();
}

function buildEventRequest(overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    body: {
      title: "Validation Test Event",
      slug: "validation-test-event",
      shortDescription: "Validation test event",
      description: "Created by a validation unit test.",
      category: "event",
      visibility: "public",
      sessions: [
        {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          timezone: "Europe/Vienna",
          locationLabel: "Audimax",
          capacity: 100,
        },
      ],
      isFree: true,
      ...overrides,
    },
    params: emptyParams,
    query: emptyQuery,
  };
}

function buildTicketTypeRequest(overrides = {}) {
  return {
    body: {
      eventId: "64f000000000000000000001",
      displayName: "Free Entry",
      description: "Free validation test ticket.",
      status: "active",
      ticketKind: "normal",
      pricingMode: "free",
      priceGross: 0,
      currency: "EUR",
      stockTotal: 100,
      minPerOrder: 1,
      maxPerOrder: 10,
      isPersonalized: false,
      sortOrder: 0,
      ...overrides,
    },
    params: emptyParams,
    query: emptyQuery,
  };
}

function buildExternalEventUserRequest(overrides = {}) {
  return {
    body: {
      authProvider: "external",
      externalProvider: "oeh-wu-webapp",
      externalUserId: "Host-User-123",
      emailSnapshot: "host-user@example.com",
      firstNameSnapshot: "Host",
      lastNameSnapshot: "User",
      role: "event_manager",
      ...overrides,
    },
    params: emptyParams,
    query: emptyQuery,
  };
}

describe("hard-cut validation schemas", () => {
  it("rejects legacy price and stockSold in embedded event ticketTypes", () => {
    const priceResult = createEventSchema.safeParse(
      buildEventRequest({
        ticketTypes: [
          {
            displayName: "Free Entry",
            price: 0,
            priceGross: 0,
            stockTotal: 100,
          },
        ],
      }),
    );

    expectInvalidField(priceResult, {
      path: "body.ticketTypes.0",
      key: "price",
    });

    const stockSoldResult = updateEventSchema.safeParse({
      body: {
        ticketTypes: [
          {
            displayName: "Free Entry",
            priceGross: 0,
            stockTotal: 100,
            stockSold: 1,
          },
        ],
      },
      params: {
        id: "64f000000000000000000002",
      },
      query: emptyQuery,
    });

    expectInvalidField(stockSoldResult, {
      path: "body.ticketTypes.0",
      key: "stockSold",
    });
  });

  it("rejects legacy price and stockSold on ticket type create/update", () => {
    const priceResult = createTicketTypeSchema.safeParse(
      buildTicketTypeRequest({
        price: 0,
      }),
    );

    expectInvalidField(priceResult, {
      path: "body",
      key: "price",
    });

    const stockSoldResult = updateTicketTypeSchema.safeParse({
      body: {
        stockSold: 1,
      },
      params: {
        id: "64f000000000000000000003",
      },
      query: emptyQuery,
    });

    expectInvalidField(stockSoldResult, {
      path: "body",
      key: "stockSold",
    });
  });

  it("requires priceGross to be a non-negative integer", () => {
    const negativeResult = createTicketTypeSchema.safeParse(
      buildTicketTypeRequest({
        priceGross: -1,
      }),
    );

    expectInvalidField(negativeResult, {
      path: "body.priceGross",
      messageIncludes: "greater than or equal to 0",
    });

    const decimalResult = createTicketTypeSchema.safeParse(
      buildTicketTypeRequest({
        priceGross: 12.5,
      }),
    );

    expectInvalidField(decimalResult, {
      path: "body.priceGross",
      messageIncludes: "must be an integer",
    });
  });

  it("allows stockTotal null but rejects negative and decimal stockTotal", () => {
    const unlimitedResult = createTicketTypeSchema.safeParse(
      buildTicketTypeRequest({
        stockTotal: null,
      }),
    );

    expect(unlimitedResult.success).toBe(true);

    const negativeResult = createTicketTypeSchema.safeParse(
      buildTicketTypeRequest({
        stockTotal: -1,
      }),
    );

    expectInvalidField(negativeResult, {
      path: "body.stockTotal",
      messageIncludes: "greater than or equal to 0",
    });

    const decimalResult = createTicketTypeSchema.safeParse(
      buildTicketTypeRequest({
        stockTotal: 1.5,
      }),
    );

    expectInvalidField(decimalResult, {
      path: "body.stockTotal",
      messageIncludes: "must be an integer",
    });
  });

  it("rejects legacy EventUser request fields", () => {
    const mainUserIdResult = createEventUserSchema.safeParse(
      buildExternalEventUserRequest({
        mainUserId: "legacy-main-user-id",
      }),
    );

    expectInvalidField(mainUserIdResult, {
      path: "body",
      key: "mainUserId",
    });

    const systemRolesResult = updateEventUserSchema.safeParse({
      body: {
        systemRoles: ["admin"],
      },
      params: {
        id: "64f000000000000000000004",
      },
      query: emptyQuery,
    });

    expectInvalidField(systemRolesResult, {
      path: "body",
      key: "systemRoles",
    });

    const eventRoleResult = updateEventUserSchema.safeParse({
      body: {
        eventRole: "event_admin",
      },
      params: {
        id: "64f000000000000000000005",
      },
      query: emptyQuery,
    });

    expectInvalidField(eventRoleResult, {
      path: "body",
      key: "eventRole",
    });
  });

  it("normalizes externalProvider lowercase and keeps externalUserId case-sensitive", () => {
    const result = createEventUserSchema.safeParse(
      buildExternalEventUserRequest({
        externalProvider: "OEH-WU-WebApp",
        externalUserId: "Host-User-ABC",
      }),
    );

    expect(result.success).toBe(true);
    expect(result.data.body.externalProvider).toBe("oeh-wu-webapp");
    expect(result.data.body.externalUserId).toBe("Host-User-ABC");
  });
});

describe("custom event mail validation", () => {
  const eventId = "64f000000000000000000010";
  const orderIdA = "64f000000000000000000011";
  const orderIdB = "64f000000000000000000012";

  function buildRequest(body) {
    return {
      params: { id: eventId },
      query: {},
      body: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        audience: "all",
        subject: "Information",
        html: "<p>Hallo {{firstName}}</p>",
        text: "",
        ...body,
      },
    };
  }

  it("accepts ALL without orderIds", () => {
    const result = sendCustomEventMailSchema.safeParse(buildRequest());

    expect(result.success).toBe(true);
  });

  it("requires orderIds for SELECTED and forbids them for ALL", () => {
    const selectedMissing = sendCustomEventMailSchema.safeParse(
      buildRequest({ audience: "selected" }),
    );

    expectInvalidField(selectedMissing, {
      path: "body.orderIds",
      messageIncludes: "required",
    });

    const allWithIds = sendCustomEventMailSchema.safeParse(
      buildRequest({
        audience: "all",
        orderIds: [orderIdA],
      }),
    );

    expectInvalidField(allWithIds, {
      path: "body.orderIds",
      messageIncludes: "only allowed",
    });
  });

  it("accepts unique selected order ids and rejects duplicates", () => {
    const valid = sendCustomEventMailSchema.safeParse(
      buildRequest({
        audience: "selected",
        orderIds: [orderIdA, orderIdB],
      }),
    );

    expect(valid.success).toBe(true);

    const duplicate = sendCustomEventMailSchema.safeParse(
      buildRequest({
        audience: "selected",
        orderIds: [orderIdA, orderIdA],
      }),
    );

    expectInvalidField(duplicate, {
      path: "body.orderIds",
      messageIncludes: "duplicates",
    });
  });

  it("accepts local, public and private storage targets for event image uploads", () => {
    for (const storageTarget of ["local", "public", "private"]) {
      const result = uploadEventImagesSchema.safeParse({
        body: undefined,
        params: {
          id: "64f000000000000000000006",
        },
        query: {
          storageTarget,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.query.storageTarget).toBe(storageTarget);
    }
  });

  it("defaults an omitted upload storage target to the service layer and rejects unknown targets", () => {
    const omittedResult = uploadEventImagesSchema.safeParse({
      body: undefined,
      params: {
        id: "64f000000000000000000007",
      },
      query: {},
    });

    expect(omittedResult.success).toBe(true);
    expect(omittedResult.data.query.storageTarget).toBeUndefined();

    const invalidResult = uploadEventImagesSchema.safeParse({
      body: undefined,
      params: {
        id: "64f000000000000000000007",
      },
      query: {
        storageTarget: "archive",
      },
    });

    expectInvalidField(invalidResult, {
      path: "query.storageTarget",
    });
  });

  it("accepts storageTarget on multipart EventUser profile image requests", () => {
    const result = uploadEventUserProfileImageSchema.safeParse({
      body: undefined,
      params: {
        id: "64f000000000000000000008",
      },
      query: {
        storageTarget: "private",
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.query.storageTarget).toBe("private");
  });
});
