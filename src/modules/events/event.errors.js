import { AppError } from "../../core/errors/AppError.js";

export function eventNotFoundError(eventId = null) {
  return AppError.notFound("Event not found.", {
    code: "EVENT_NOT_FOUND",
    title: "Event not found",
    action: "Refresh the event list and try again.",
    details: {
      eventId,
    },
  });
}

export function publicEventNotFoundError(identifier = null) {
  return AppError.notFound("Event not found.", {
    code: "PUBLIC_EVENT_NOT_FOUND",
    title: "Event not found",
    action: "Check the event link and try again.",
    details: {
      identifier,
    },
  });
}

export function eventSlugAlreadyExistsError(slug) {
  return AppError.conflict("An event with this slug already exists.", {
    code: "EVENT_SLUG_ALREADY_EXISTS",
    title: "Event slug already exists",
    action: "Choose another unique event slug.",
    fields: [
      {
        path: "body.slug",
        message: "This slug is already used by another event.",
      },
    ],
    details: {
      slug,
    },
  });
}

export function eventAccessRequiredError() {
  return AppError.forbidden(
    "No active kiwi-events user was found for this event action.",
    {
      code: "EVENT_ACCESS_REQUIRED",
      title: "Event access required",
      action:
        "Log in with an active kiwi-events staff user that has event permissions.",
    },
  );
}

export function eventManageForbiddenError() {
  return AppError.forbidden("You do not have permission for this event.", {
    code: "EVENT_MANAGE_FORBIDDEN",
    title: "Event permission missing",
    action: "Ask an admin to assign the required permission for this event.",
  });
}

export function eventCancellationFinalizedError() {
  return AppError.conflict(
    "This event has been finally cancelled and cannot be changed anymore.",
    {
      code: "EVENT_CANCELLATION_FINALIZED",
      title: "Event cancellation finalized",
      action:
        "This event is locked after cancellation. Create a new event instead of changing this one.",
    },
  );
}
export function eventDeleteBlockedByUsageError({
  eventId,
  ordersCount = 0,
  ticketsCount = 0,
  ticketsSold = 0,
} = {}) {
  return AppError.conflict(
    "Event cannot be deleted because it already has orders, tickets or ticket sales.",
    {
      code: "EVENT_DELETE_BLOCKED_BY_USAGE",
      title: "Event cannot be deleted",
      action:
        "Archive or cancel the event instead of deleting it. Hard delete is only allowed for unused events.",
      fields: [
        {
          path: "params.id",
          message:
            "This event already has related orders, tickets or ticket sales.",
        },
      ],
      details: {
        eventId,
        ordersCount: Number(ordersCount || 0),
        ticketsCount: Number(ticketsCount || 0),
        ticketsSold: Number(ticketsSold || 0),
      },
    },
  );
}
export function eventImagesRequiredError() {
  return AppError.badRequest("At least one image must be uploaded.", {
    code: "EVENT_IMAGES_REQUIRED",
    title: "Event image required",
    action: "Choose at least one image file and upload it again.",
    fields: [
      {
        path: "body.images",
        message: "At least one image is required.",
      },
    ],
  });
}

export function eventImageUploadMissingAssetIdsError() {
  return new AppError({
    code: "EVENT_IMAGE_UPLOAD_MISSING_ASSET_IDS",
    title: "Event image upload failed",
    message: "Image upload did not return asset ids.",
    statusCode: 500,
    expose: true,
    action: "Check the media asset upload flow and try again.",
  });
}

export function eventImageAssetIdRequiredError() {
  return AppError.badRequest("Image asset id is required.", {
    code: "EVENT_IMAGE_ASSET_ID_REQUIRED",
    title: "Image asset id required",
    action: "Provide the image asset id that should be removed from the event.",
    fields: [
      {
        path: "params.assetId",
        message: "Image asset id is required.",
      },
    ],
  });
}

export function eventImageAssetNotAssignedError({ eventId, assetId } = {}) {
  return AppError.notFound("Image asset is not assigned to this event.", {
    code: "EVENT_IMAGE_ASSET_NOT_ASSIGNED",
    title: "Image asset not assigned",
    action: "Refresh the event images and try again.",
    details: {
      eventId,
      assetId,
    },
  });
}
export function customEventMailUnavailableError() {
  return AppError.serviceUnavailable("Custom event mail is disabled.", {
    code: "CUSTOM_EVENT_MAIL_DISABLED",

    title: "Custom event mail disabled",

    action: "Enable mail and custom event mail in the system configuration.",
  });
}

export function customEventMailInvalidAudienceError(orderIds = []) {
  return AppError.badRequest(
    "Some selected orders are not valid participants of this event.",
    {
      code: "CUSTOM_EVENT_MAIL_INVALID_AUDIENCE",

      title: "Invalid mail recipients",

      action:
        "Refresh the participant list and select valid event participants.",

      fields: [
        {
          path: "body.orderIds",

          message:
            "One or more selected orders cannot receive this participant mail.",
        },
      ],

      details: {
        orderIds,
      },
    },
  );
}

export function customEventMailUnsupportedVariablesError(variables = []) {
  return AppError.badRequest(
    "The custom mail contains unsupported variables.",
    {
      code: "CUSTOM_EVENT_MAIL_VARIABLE_INVALID",

      title: "Unsupported mail variable",

      action: "Use only the supported event and participant mail variables.",

      details: {
        variables,
      },
    },
  );
}

export function customEventMailEmptyBodyError() {
  return AppError.badRequest(
    "The custom mail body is empty after sanitization.",
    {
      code: "CUSTOM_EVENT_MAIL_BODY_EMPTY",

      title: "Mail body required",

      action: "Enter valid mail content and try again.",

      fields: [
        {
          path: "body.html",

          message: "Mail content is required.",
        },
      ],
    },
  );
}
