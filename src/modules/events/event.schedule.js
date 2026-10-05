const DEFAULT_EVENT_TIMEZONE = "Europe/Vienna";
import { SESSION_STATUSES } from "./event.constants.js";
function cleanString(value) {
  return String(value ?? "").trim();
}

function toValidDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeEventTimezone(value) {
  const timezone = cleanString(value) || DEFAULT_EVENT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    }).format(new Date(0));

    return timezone;
  } catch {
    return DEFAULT_EVENT_TIMEZONE;
  }
}

export function getFirstEventSession(event) {
  if (!Array.isArray(event?.sessions)) {
    return null;
  }

  return (
    [...event.sessions]
      .filter((session) => toValidDate(session?.startAt))
      .sort(
        (left, right) =>
          toValidDate(left.startAt).getTime() -
          toValidDate(right.startAt).getTime(),
      )[0] || null
  );
}
export function getEventReminderSession(event) {
  if (!Array.isArray(event?.sessions)) {
    return null;
  }

  return (
    [...event.sessions]
      .filter((session) => {
        if (!toValidDate(session?.startAt)) {
          return false;
        }

        return session?.status !== SESSION_STATUSES.CANCELLED;
      })
      .sort(
        (left, right) =>
          toValidDate(left.startAt).getTime() -
          toValidDate(right.startAt).getTime(),
      )[0] || null
  );
}

function getCalendarDateParts(value, timeZone) {
  const date = toValidDate(value);

  if (!date) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeEventTimezone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function addCalendarDays(parts, days) {
  if (!parts) {
    return null;
  }

  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function calendarDateKey(parts) {
  if (!parts) {
    return null;
  }

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function isTomorrowInTimezone(
  value,
  { now = new Date(), timeZone = DEFAULT_EVENT_TIMEZONE } = {},
) {
  const normalizedTimezone = normalizeEventTimezone(timeZone);

  const currentDate = getCalendarDateParts(now, normalizedTimezone);

  const targetDate = getCalendarDateParts(value, normalizedTimezone);

  if (!currentDate || !targetDate) {
    return false;
  }

  const tomorrow = addCalendarDays(currentDate, 1);

  return calendarDateKey(targetDate) === calendarDateKey(tomorrow);
}
export function getEventTimezone(event, { session = null } = {}) {
  const effectiveSession = session || getFirstEventSession(event);

  return normalizeEventTimezone(effectiveSession?.timezone);
}

export function getEventLocation(
  event,
  { session = null, fallback = "" } = {},
) {
  const effectiveSession = session || getFirstEventSession(event);

  const sessionLocation = [
    cleanString(effectiveSession?.locationLabel),
    cleanString(effectiveSession?.locationDetails),
  ]
    .filter(Boolean)
    .join(" – ");

  if (sessionLocation) {
    return sessionLocation;
  }

  const eventLocation = cleanString(event?.location);

  return eventLocation || fallback;
}

export function formatEventDateTime(
  value,
  { timeZone = DEFAULT_EVENT_TIMEZONE, locale = "de-AT", fallback = "-" } = {},
) {
  const date = toValidDate(value);

  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: normalizeEventTimezone(timeZone),
  }).format(date);
}
