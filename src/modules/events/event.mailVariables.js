import { env } from "../../config/env.js";

import { getOrderBuyerSnapshot } from "../orders/order.buyerSnapshot.js";

import {
  formatEventDateTime,
  getEventLocation,
  getEventTimezone,
  getFirstEventSession,
} from "./event.schedule.js";

function getEventTitle(event) {
  return event?.title || event?.eventTitleSnapshot || "Event";
}

export function buildEventMailVariables({ event, order, session = null }) {
  const buyer = getOrderBuyerSnapshot(order);

  const effectiveSession = session || getFirstEventSession(event);

  const timezone = getEventTimezone(event, {
    session: effectiveSession,
  });

  const fullName =
    buyer.displayName ||
    [buyer.firstName, buyer.lastName].filter(Boolean).join(" ");

  return {
    firstName: buyer.firstName || buyer.displayName || "Hallo",

    lastName: buyer.lastName || "",

    displayName: fullName || "",

    fullName: fullName || "",

    buyerEmail: buyer.email || "",

    orderNumber: order?.orderNumber || "",

    eventTitle: getEventTitle(event),

    eventDate: formatEventDateTime(
      effectiveSession?.startAt ||
        event?.startAt ||
        event?.eventStartAt ||
        null,
      {
        timeZone: timezone,
        fallback: "-",
      },
    ),

    eventLocation: getEventLocation(event, {
      session: effectiveSession,
      fallback: "-",
    }),

    eventTeamName: env.branding?.appName || "Kiwi Events",
  };
}
