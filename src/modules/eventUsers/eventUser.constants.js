export const EVENT_USER_ROLES = Object.freeze({
  ADMIN: "admin",
  EVENT_ADMIN: "event_admin",
  EVENT_MANAGER: "event_manager",
  CHECKIN_STAFF: "checkin_staff",
});

export const EVENT_USER_AUTH_PROVIDER = Object.freeze({
  LOCAL: "local",
  EXTERNAL: "external",
  HYBRID: "hybrid",
});

export const EVENT_USER_AUTH_PROVIDER_VALUES = Object.values(
  EVENT_USER_AUTH_PROVIDER,
);
