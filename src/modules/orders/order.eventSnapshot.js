import {
  getEventLocation,
  getEventTimezone,
  getFirstEventSession,
} from "../events/event.schedule.js";

export function buildOrderEventSnapshot(event) {
  const firstSession = getFirstEventSession(event);

  return {
    eventLocationSnapshot: getEventLocation(event, {
      session: firstSession,
      fallback: "",
    }),

    eventStartsAtSnapshot: firstSession?.startAt || null,

    eventTimezoneSnapshot: getEventTimezone(event, {
      session: firstSession,
    }),
  };
}
