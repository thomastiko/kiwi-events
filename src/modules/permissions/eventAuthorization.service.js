import { EVENT_PERMISSIONS } from "./permission.constant.js";

import { getEventUserPermissions } from "./permission.service.js";

export const EVENT_MANAGEMENT_SCOPE = Object.freeze({
  NONE: "none",
  OWN: "own",
  ALL: "all",
});

function isSameId(a, b) {
  return String(a || "") === String(b || "");
}

export function isEventOwner(event, actor) {
  if (!event?.createdByEventUserId || !actor?.eventUserId) {
    return false;
  }

  return isSameId(event.createdByEventUserId, actor.eventUserId);
}

export async function getEventAuthorization(actor) {
  const eventUser = actor?.eventUser;

  if (!eventUser || eventUser.isActive === false) {
    return {
      manageOwn: false,
      manageAll: false,
      checkinAll: false,
    };
  }

  const permissions = await getEventUserPermissions(eventUser);

  const wildcard = permissions.includes("*");

  return {
    manageOwn: wildcard || permissions.includes(EVENT_PERMISSIONS.MANAGE_OWN),

    manageAll: wildcard || permissions.includes(EVENT_PERMISSIONS.MANAGE_ALL),

    checkinAll: wildcard || permissions.includes(EVENT_PERMISSIONS.CHECKIN_ALL),
  };
}

export async function getEventManagementScope(actor) {
  const authorization = await getEventAuthorization(actor);

  if (authorization.manageAll) {
    return EVENT_MANAGEMENT_SCOPE.ALL;
  }

  if (authorization.manageOwn) {
    return EVENT_MANAGEMENT_SCOPE.OWN;
  }

  return EVENT_MANAGEMENT_SCOPE.NONE;
}

export async function canCreateEvent(actor) {
  const authorization = await getEventAuthorization(actor);

  return authorization.manageOwn || authorization.manageAll;
}

export async function getEventAccess(actor, event) {
  const authorization = await getEventAuthorization(actor);

  const own = isEventOwner(event, actor);

  const manage = authorization.manageAll || (authorization.manageOwn && own);

  const checkIn = manage || authorization.checkinAll;

  return {
    own,
    manage,
    checkIn,
  };
}

export async function canManageEvent(actor, event) {
  const access = await getEventAccess(actor, event);

  return access.manage;
}
