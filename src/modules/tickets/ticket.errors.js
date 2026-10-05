import { AppError } from "../../core/errors/AppError.js";

export function ticketQrSecretMissingError() {
  return new AppError({
    code: "TICKET_QR_SECRET_MISSING",
    title: "Ticket QR secret missing",
    message: "Ticket QR secret is not configured.",
    statusCode: 500,
    expose: true,
    action:
      "Configure the Ticket QR secret in Kiwi Events or set KIWI_EVENTS_TICKET_QR_SECRET.",
  });
}

export function qrTokenRequiredError() {
  return AppError.badRequest("QR token is required.", {
    code: "QR_TOKEN_REQUIRED",
    title: "QR token required",
    action: "Provide a valid QR token.",
    fields: [
      {
        path: "body.token",
        message: "QR token is required.",
      },
    ],
  });
}

export function encryptedQrTokenMissingError() {
  return new AppError({
    code: "ENCRYPTED_QR_TOKEN_MISSING",
    title: "Encrypted QR token missing",
    message: "Encrypted QR token is missing.",
    statusCode: 500,
    expose: true,
    action: "Regenerate the ticket QR credential.",
  });
}

export function invalidQrTokenFormatError() {
  return new AppError({
    code: "INVALID_QR_TOKEN_FORMAT",
    title: "Invalid QR token format",
    message: "Invalid QR token format.",
    statusCode: 500,
    expose: true,
    action: "Regenerate the ticket QR credential.",
  });
}

export function emptyQrCodePayloadError() {
  return AppError.badRequest("QR code is empty.", {
    code: "QR_CODE_EMPTY",
    title: "QR code empty",
    action: "Scan a valid kiwi-events ticket QR code.",
    fields: [
      {
        path: "body.payload",
        message: "QR code payload is required.",
      },
    ],
  });
}

export function invalidQrCodePayloadError() {
  return AppError.badRequest("Invalid QR code.", {
    code: "INVALID_QR_CODE",
    title: "Invalid QR code",
    action: "Scan a valid kiwi-events ticket QR code.",
  });
}

export function externalTicketIdentityRequiredError() {
  return new AppError({
    code: "EXTERNAL_TICKET_IDENTITY_REQUIRED",
    title: "External user identity required",
    message: "External user identity is required.",
    statusCode: 401,
    expose: true,
    action: "Log in through the host application before accessing tickets.",
  });
}

export function ticketInternalAccessRequiredError() {
  return AppError.forbidden(
    "No active kiwi-events user was found for this ticket action.",
    {
      code: "TICKET_INTERNAL_ACCESS_REQUIRED",

      title: "Ticket access required",

      action: "Log in with an active kiwi-events user.",
    },
  );
}

export function ticketAccessForbiddenError() {
  return AppError.forbidden(
    "You do not have permission to access tickets for this event.",
    {
      code: "TICKET_ACCESS_FORBIDDEN",

      title: "Ticket access not allowed",

      action: "Ask an admin to grant event management or check-in access.",
    },
  );
}

export function ticketManageForbiddenError() {
  return AppError.forbidden(
    "You do not have permission to manage tickets for this event.",
    {
      code: "TICKET_MANAGE_FORBIDDEN",

      title: "Ticket management not allowed",

      action: "Ask an admin to grant event management access for this event.",
    },
  );
}

export function ticketCheckInForbiddenError() {
  return AppError.forbidden(
    "You do not have permission to manage check-in for this event.",
    {
      code: "TICKET_CHECKIN_FORBIDDEN",

      title: "Check-in not allowed",

      action:
        "Ask an admin to grant event management or global check-in access.",
    },
  );
}

export function ticketNotFoundError(ticketId = null) {
  return AppError.notFound("Ticket not found.", {
    code: "TICKET_NOT_FOUND",
    title: "Ticket not found",
    action: "Refresh the ticket list and try again.",
    details: {
      ticketId,
    },
  });
}

export function ticketPdfReadFailedError() {
  return new AppError({
    code: "TICKET_PDF_READ_FAILED",
    title: "Ticket PDF read failed",
    message: "Stored ticket PDF could not be read.",
    statusCode: 500,
    expose: true,
    action: "Check whether the ticket PDF still exists in storage.",
  });
}

export function guestTicketOrderNotFoundError(orderId = null) {
  return AppError.notFound("Order not found.", {
    code: "GUEST_TICKET_ORDER_NOT_FOUND",
    title: "Guest order not found",
    action: "Check the guest ticket link and try again.",
    details: {
      orderId,
    },
  });
}

export function ticketNotGuestOrderError(orderId = null) {
  return AppError.forbidden("This ticket does not belong to a guest order.", {
    code: "TICKET_NOT_GUEST_ORDER",
    title: "Not a guest ticket",
    action: "Use the normal ticket access flow for this ticket.",
    details: {
      orderId,
    },
  });
}

export function guestTicketAccessUnavailableError(orderId = null) {
  return AppError.forbidden("Guest access is not available for this order.", {
    code: "GUEST_TICKET_ACCESS_UNAVAILABLE",
    title: "Guest access unavailable",
    action: "Request a new guest access link.",
    details: {
      orderId,
    },
  });
}

export function invalidGuestTicketAccessTokenError(orderId = null) {
  return AppError.forbidden("Invalid guest access token.", {
    code: "INVALID_GUEST_TICKET_ACCESS_TOKEN",
    title: "Invalid guest access token",
    action: "Open the newest guest ticket link from your email.",
    details: {
      orderId,
    },
  });
}

export function expiredGuestTicketAccessTokenError(orderId = null) {
  return AppError.forbidden("Guest access token has expired.", {
    code: "GUEST_TICKET_ACCESS_TOKEN_EXPIRED",
    title: "Guest access token expired",
    action: "Request a new guest access link.",
    details: {
      orderId,
    },
  });
}

export function ticketOrderNotFoundError(orderId = null) {
  return AppError.notFound("Order not found.", {
    code: "TICKET_ORDER_NOT_FOUND",
    title: "Order not found",
    action: "Refresh the order and try again.",
    details: {
      orderId,
    },
  });
}

export function ticketsRequireConfirmedOrderError(orderId = null) {
  return AppError.badRequest(
    "Tickets can only be generated for confirmed orders.",
    {
      code: "TICKETS_REQUIRE_CONFIRMED_ORDER",
      title: "Order not confirmed",
      action: "Confirm the order before generating tickets.",
      details: {
        orderId,
      },
    },
  );
}

export function ticketQrDisabledError() {
  return AppError.forbidden("Ticket QR is not enabled.", {
    code: "TICKET_QR_DISABLED",
    title: "Ticket QR disabled",
    action: "Enable ticket QR codes in the kiwi-events settings.",
  });
}

export function ticketQrUnavailableError(ticketId = null) {
  return AppError.notFound("QR code is not available for this ticket.", {
    code: "TICKET_QR_UNAVAILABLE",
    title: "Ticket QR unavailable",
    action: "Regenerate the ticket QR credential or check QR settings.",
    details: {
      ticketId,
    },
  });
}

export function ticketPdfDisabledError() {
  return AppError.forbidden("Ticket PDF is not enabled.", {
    code: "TICKET_PDF_DISABLED",
    title: "Ticket PDF disabled",
    action: "Enable ticket PDFs in the kiwi-events settings.",
  });
}

export function ticketPdfGenerationFailedError(ticketId = null) {
  return new AppError({
    code: "TICKET_PDF_GENERATION_FAILED",
    title: "Ticket PDF generation failed",
    message: "Ticket PDF could not be generated.",
    statusCode: 500,
    expose: true,
    action: "Check ticket PDF generation and storage settings.",
    details: {
      ticketId,
    },
  });
}

export function cancelledTicketCheckInError(ticketId = null) {
  return AppError.badRequest("Cancelled tickets cannot be checked in.", {
    code: "CANCELLED_TICKET_CHECK_IN_FORBIDDEN",
    title: "Cancelled ticket",
    action: "Only active tickets can be checked in.",
    details: {
      ticketId,
    },
  });
}

export function depositTicketCheckoutForbiddenError(ticketId = null) {
  return AppError.badRequest(
    "Deposit tickets cannot be checked out after check-in.",
    {
      code: "DEPOSIT_TICKET_CHECKOUT_FORBIDDEN",
      title: "Deposit ticket cannot be checked out",
      action:
        "Deposit tickets trigger refund handling on check-in and cannot be reset afterwards.",
      details: {
        ticketId,
      },
    },
  );
}

export function ticketEventNotFoundError(eventId = null) {
  return AppError.notFound("Event not found.", {
    code: "TICKET_EVENT_NOT_FOUND",
    title: "Event not found",
    action: "Refresh the ticket list and try again.",
    details: {
      eventId,
    },
  });
}

export function ticketPdfGenerationDisabledError() {
  return AppError.forbidden("Ticket PDF generation is not enabled.", {
    code: "TICKET_PDF_GENERATION_DISABLED",
    title: "Ticket PDF generation disabled",
    action: "Enable ticket PDFs before generating official ticket documents.",
  });
}

export function ticketRequiredError() {
  return AppError.badRequest("Ticket is required.", {
    code: "TICKET_REQUIRED",
    title: "Ticket required",
    action: "Provide a valid ticket before generating a document.",
  });
}

export function ticketQrTokenMissingForDocumentError(ticketId = null) {
  return new AppError({
    code: "TICKET_QR_TOKEN_MISSING_FOR_DOCUMENT",
    title: "Ticket QR token missing",
    message: "Ticket has no QR token.",
    statusCode: 500,
    expose: true,
    action: "Regenerate the ticket QR credential before rendering the PDF.",
    details: {
      ticketId,
    },
  });
}

export function ticketDocumentEventNotFoundError(eventId = null) {
  return AppError.notFound("Event not found.", {
    code: "TICKET_DOCUMENT_EVENT_NOT_FOUND",
    title: "Event not found",
    action: "Make sure the ticket still belongs to an existing event.",
    details: {
      eventId,
    },
  });
}
