import { describe, expect, it } from "vitest";

import { SESSION_STATUSES } from "../../../src/modules/events/event.constants.js";
import {
  formatEventDateTime,
  getEventLocation,
  getEventReminderSession,
  getEventTimezone,
  isTomorrowInTimezone,
  normalizeEventTimezone,
} from "../../../src/modules/events/event.schedule.js";

describe("event schedule helpers", () => {
  it("selects the earliest non-cancelled session for reminders", () => {
    const event = {
      sessions: [
        {
          startAt: "2030-06-02T10:00:00.000Z",
          timezone: "Europe/Vienna",
          status: SESSION_STATUSES.SCHEDULED,
        },
        {
          startAt: "2030-06-01T10:00:00.000Z",
          timezone: "Europe/Vienna",
          status: SESSION_STATUSES.CANCELLED,
        },
        {
          startAt: "2030-06-03T10:00:00.000Z",
          timezone: "Europe/Vienna",
          status: SESSION_STATUSES.SCHEDULED,
        },
      ],
    };

    expect(getEventReminderSession(event)?.startAt).toBe(
      "2030-06-02T10:00:00.000Z",
    );
  });

  it("compares tomorrow by calendar date in the event timezone", () => {
    const now = new Date("2026-03-28T23:30:00.000Z");

    expect(
      isTomorrowInTimezone("2026-03-29T22:30:00.000Z", {
        now,
        timeZone: "Europe/Vienna",
      }),
    ).toBe(true);

    expect(
      isTomorrowInTimezone("2026-03-30T22:30:00.000Z", {
        now,
        timeZone: "Europe/Vienna",
      }),
    ).toBe(false);
  });

  it("falls back to Europe/Vienna for invalid timezones", () => {
    expect(normalizeEventTimezone("Not/A-Timezone")).toBe("Europe/Vienna");
    expect(normalizeEventTimezone("")).toBe("Europe/Vienna");
  });

  it("uses session timezone and session location details", () => {
    const session = {
      startAt: "2030-06-01T10:00:00.000Z",
      timezone: "Europe/Berlin",
      locationLabel: "Audimax",
      locationDetails: "Room 1",
    };

    const event = {
      location: "Fallback venue",
      sessions: [session],
    };

    expect(getEventTimezone(event, { session })).toBe("Europe/Berlin");
    expect(getEventLocation(event, { session })).toBe("Audimax – Room 1");
  });

  it("returns the configured fallback instead of inventing an event date", () => {
    expect(
      formatEventDateTime(null, {
        timeZone: "Europe/Vienna",
        fallback: "-",
      }),
    ).toBe("-");
  });
});
