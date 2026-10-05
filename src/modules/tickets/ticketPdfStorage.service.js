import { logger } from "../../config/logger.js";

import { deleteObject } from "../storage/storage.service.js";

import { STORAGE_TARGET_VALUES } from "../storage/storage.constants.js";

const DELETE_BATCH_SIZE = 10;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeStorageReference({ key, storageTarget }) {
  const normalizedKey = normalizeString(key);

  const normalizedTarget = normalizeString(storageTarget).toLowerCase();

  if (!normalizedKey && !normalizedTarget) {
    return null;
  }

  if (!normalizedKey || !normalizedTarget) {
    throw new TypeError(
      "Ticket PDF storage reference must contain both key and storageTarget.",
    );
  }

  if (!STORAGE_TARGET_VALUES.includes(normalizedTarget)) {
    throw new TypeError(
      `Unsupported ticket PDF storage target "${normalizedTarget}".`,
    );
  }

  return {
    key: normalizedKey,
    storageTarget: normalizedTarget,
  };
}

export function getTicketPdfStorageReference(ticket) {
  if (!ticket) {
    return null;
  }

  return normalizeStorageReference({
    key: ticket.ticketPdfStorageKey,

    storageTarget: ticket.ticketPdfStorageTarget,
  });
}

export function collectTicketPdfStorageReferences(tickets = []) {
  const references = new Map();

  for (const ticket of tickets) {
    const reference = getTicketPdfStorageReference(ticket);

    if (!reference) {
      continue;
    }

    const id = `${reference.storageTarget}:${reference.key}`;

    references.set(id, reference);
  }

  return [...references.values()];
}

export async function deleteTicketPdfStorageReferencesSafe(
  references = [],
  context = {},
) {
  for (
    let offset = 0;
    offset < references.length;
    offset += DELETE_BATCH_SIZE
  ) {
    const batch = references.slice(offset, offset + DELETE_BATCH_SIZE);

    await Promise.all(
      batch.map(async (reference) => {
        try {
          await deleteObject({
            key: reference.key,

            storageTarget: reference.storageTarget,
          });
        } catch (error) {
          logger.warn("ticket.pdf_storage_delete_failed", {
            key: reference.key,

            storageTarget: reference.storageTarget,

            ...context,

            error,
          });
        }
      }),
    );
  }
}
