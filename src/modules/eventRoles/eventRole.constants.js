import { EVENT_PERMISSIONS } from "../permissions/permission.constant.js";

export const EVENT_ROLE_KEYS = Object.freeze({
  ADMIN: "admin",
  EVENT_ADMIN: "event_admin",
  EVENT_MANAGER: "event_manager",
  CHECKIN_STAFF: "checkin_staff",
});

export const EVENT_ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export const DEFAULT_EVENT_ROLE_DEFINITIONS = Object.freeze([
  {
    key: EVENT_ROLE_KEYS.ADMIN,
    name: "Admin",
    description:
      "Full kiwi-events system access. This role can access the Admin UI.",
    permissions: ["*"],
    isProtected: true,
    sortOrder: 10,
  },
  {
    key: EVENT_ROLE_KEYS.EVENT_ADMIN,
    name: "Event Admin",
    description:
      "Can fully manage all events, including ticket types, orders, refunds, tickets and check-in.",
    permissions: [EVENT_PERMISSIONS.MANAGE_ALL],
    isProtected: false,
    sortOrder: 20,
  },
  {
    key: EVENT_ROLE_KEYS.EVENT_MANAGER,
    name: "Event Manager",
    description:
      "Can create events and fully manage events created by this user.",
    permissions: [EVENT_PERMISSIONS.MANAGE_OWN],
    isProtected: false,
    sortOrder: 30,
  },
  {
    key: EVENT_ROLE_KEYS.CHECKIN_STAFF,
    name: "Check-in Staff",
    description:
      "Can manage attendee check-in for all events without access to event management.",
    permissions: [EVENT_PERMISSIONS.CHECKIN_ALL],
    isProtected: false,
    sortOrder: 40,
  },
]);

export const EVENT_ROLE_PERMISSION_GROUPS = Object.freeze([
  {
    key: EVENT_PERMISSIONS.MANAGE_OWN,
    label: "Manage own events",
    description:
      "Can create events and fully manage events created by this user, including ticket types, orders, refunds, tickets and check-in.",
    permissions: [EVENT_PERMISSIONS.MANAGE_OWN],
  },
  {
    key: EVENT_PERMISSIONS.MANAGE_ALL,
    label: "Manage all events",
    description:
      "Can fully manage all events, including ticket types, orders, refunds, tickets and check-in.",
    permissions: [EVENT_PERMISSIONS.MANAGE_ALL],
  },
  {
    key: EVENT_PERMISSIONS.CHECKIN_ALL,
    label: "Manage check-in",
    description:
      "Can view check-in ticket information and manage attendee check-in for all events.",
    permissions: [EVENT_PERMISSIONS.CHECKIN_ALL],
  },
]);

export const ALLOWED_EVENT_ROLE_PERMISSIONS = Object.freeze(
  Object.values(EVENT_PERMISSIONS),
);
