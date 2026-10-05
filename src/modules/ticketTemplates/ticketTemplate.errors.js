import { AppError } from "../../core/errors/AppError.js";

export function ticketTemplateImageNotFoundError(assetId) {
  return AppError.notFound("Ticket template image not found.", {
    code: "TICKET_TEMPLATE_IMAGE_NOT_FOUND",
    title: "Ticket template image not found",
    action: "Refresh the ticket template images and try again.",
    details: {
      assetId,
    },
  });
}

export function ticketTemplateImageNotOwnedByEventError({ eventId, assetId }) {
  return AppError.badRequest(
    "Ticket template image does not belong to this event.",
    {
      code: "TICKET_TEMPLATE_IMAGE_NOT_OWNED_BY_EVENT",

      title: "Invalid ticket template image",

      action: "Use an image uploaded for this event ticket template.",

      details: {
        eventId,
        assetId,
      },
    },
  );
}

export function ticketTemplateImageInUseError({ eventId, assetId }) {
  return AppError.conflict(
    "Ticket template image is still used by the custom template.",
    {
      code: "TICKET_TEMPLATE_IMAGE_IN_USE",

      title: "Ticket template image is in use",

      action: "Remove the image element from the template before deleting it.",

      details: {
        eventId,
        assetId,
      },
    },
  );
}

export function ticketTemplateRenderAssetMissingError({ eventId, assetId }) {
  return AppError.internal("Ticket template image asset is unavailable.", {
    code: "TICKET_TEMPLATE_RENDER_ASSET_MISSING",

    title: "Ticket template image unavailable",

    details: {
      eventId,
      assetId,
    },
  });
}
