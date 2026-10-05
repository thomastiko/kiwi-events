import { features } from "../../config/features.js";

import { KIWI_EVENTS_SECRET_PATHS } from "../../config/kiwi-events/kiwi-events.secret.constants.js";

import { resolveKiwiEventsSecret } from "../../config/kiwi-events/kiwi-events.secret.store.js";

import {
  ticketQrDisabledError,
  ticketQrSecretMissingError,
} from "./ticket.errors.js";

export function assertTicketQrEnabled() {
  if (!features.ticketQr) {
    throw ticketQrDisabledError();
  }
}

export function getTicketQrSecret() {
  assertTicketQrEnabled();

  const secret = String(
    resolveKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET),
  ).trim();

  if (!secret) {
    throw ticketQrSecretMissingError();
  }

  return secret;
}
