import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMailVariables() {
  vi.resetModules();
  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      branding: {
        appName: "Kiwi Events Test",
      },
    },
  }));

  return import("../../../src/modules/events/event.mailVariables.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("event mail variables", () => {
  it("uses the selected session timezone and location", async () => {
    const { buildEventMailVariables } = await loadMailVariables();

    const session = {
      startAt: "2030-06-01T10:00:00.000Z",
      timezone: "Europe/Vienna",
      locationLabel: "Audimax",
      locationDetails: "Room 1",
      status: "scheduled",
    };

    const variables = buildEventMailVariables({
      event: {
        id: "event-1",
        title: "Demo Event",
        location: "Fallback location",
        sessions: [session],
      },
      order: {
        orderNumber: "ORD-1",
        buyerEmailSnapshot: "max@example.test",
        buyerFirstNameSnapshot: "Max",
        buyerLastNameSnapshot: "Mustermann",
        buyerDisplayNameSnapshot: "Max Mustermann",
      },
      session,
    });

    expect(variables).toMatchObject({
      firstName: "Max",
      lastName: "Mustermann",
      displayName: "Max Mustermann",
      fullName: "Max Mustermann",
      buyerEmail: "max@example.test",
      orderNumber: "ORD-1",
      eventTitle: "Demo Event",
      eventDate: "01.06.2030, 12:00",
      eventLocation: "Audimax – Room 1",
      eventTeamName: "Kiwi Events Test",
    });
  });

  it("never uses event.createdAt as the event date fallback", async () => {
    const { buildEventMailVariables } = await loadMailVariables();

    const variables = buildEventMailVariables({
      event: {
        id: "event-1",
        title: "No Date Event",
        createdAt: "2030-01-01T12:00:00.000Z",
        sessions: [],
      },
      order: {
        orderNumber: "ORD-1",
        buyerEmailSnapshot: "max@example.test",
        buyerFirstNameSnapshot: "Max",
      },
    });

    expect(variables.eventDate).toBe("-");
  });
});
