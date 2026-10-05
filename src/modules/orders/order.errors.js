import { AppError } from "../../core/errors/AppError.js";

export function orderAccessRequiredError() {
  return AppError.forbidden(
    "No active kiwi-events user was found for this order action.",
    {
      code: "ORDER_ACCESS_REQUIRED",

      title: "Order access required",

      action:
        "Log in with an active kiwi-events user that has event management access.",
    },
  );
}

export function orderManageForbiddenError() {
  return AppError.forbidden(
    "You do not have permission to manage orders for this event.",
    {
      code: "ORDER_MANAGE_FORBIDDEN",

      title: "Order management not allowed",

      action: "Ask an admin to grant event management access for this event.",
    },
  );
}

export function orderEventNotFoundError(eventId = null) {
  return AppError.notFound("Event not found.", {
    code: "ORDER_EVENT_NOT_FOUND",
    title: "Event not found",
    action: "Choose an existing event and try again.",
    details: {
      eventId,
    },
  });
}

export function eventNotBookableError(eventId = null) {
  return AppError.badRequest("This event is not bookable.", {
    code: "EVENT_NOT_BOOKABLE",
    title: "Event not bookable",
    action: "Only published events can receive orders.",
    details: {
      eventId,
    },
  });
}

export function archivedEventNotBookableError(eventId = null) {
  return AppError.badRequest("Archived events cannot be booked.", {
    code: "ARCHIVED_EVENT_NOT_BOOKABLE",
    title: "Archived event",
    action: "Choose a published non-archived event.",
    details: {
      eventId,
    },
  });
}

export function cancelledEventNotBookableError(eventId = null) {
  return AppError.badRequest("Cancelled events cannot be booked.", {
    code: "CANCELLED_EVENT_NOT_BOOKABLE",
    title: "Cancelled event",
    action: "Choose another event.",
    details: {
      eventId,
    },
  });
}

export function endedEventNotBookableError(eventId = null) {
  return AppError.badRequest("This event has already ended.", {
    code: "EVENT_ALREADY_ENDED",
    title: "Event already ended",
    action: "Choose an upcoming event.",
    details: {
      eventId,
    },
  });
}

export function orderTicketTypeNotFoundError(ticketTypeId = null) {
  return AppError.notFound("Ticket type not found.", {
    code: "ORDER_TICKET_TYPE_NOT_FOUND",
    title: "Ticket type not found",
    action: "Choose an existing ticket type and try again.",
    details: {
      ticketTypeId,
    },
  });
}

export function ticketTypeInactiveError(ticketTypeId = null) {
  return AppError.badRequest("Ticket type is not active.", {
    code: "ORDER_TICKET_TYPE_INACTIVE",
    title: "Ticket type inactive",
    action: "Only active ticket types can be ordered.",
    details: {
      ticketTypeId,
    },
  });
}

export function ticketTypeSalesClosedError(ticketTypeId = null) {
  return AppError.badRequest("Ticket type is currently not on sale.", {
    code: "ORDER_TICKET_TYPE_SALES_CLOSED",
    title: "Ticket type not on sale",
    action: "Choose a ticket type with an active sales window.",
    details: {
      ticketTypeId,
    },
  });
}

export function ticketQuantityBelowMinimumError({
  ticketTypeName,
  minPerOrder,
}) {
  return AppError.badRequest(
    `The minimum quantity for "${ticketTypeName}" is ${minPerOrder}.`,
    {
      code: "ORDER_TICKET_QUANTITY_BELOW_MINIMUM",
      title: "Minimum quantity not reached",
      action: "Increase the quantity for this ticket type.",
      fields: [
        {
          path: "body.items.quantity",
          message: `Minimum quantity is ${minPerOrder}.`,
        },
      ],
      details: {
        ticketTypeName,
        minPerOrder,
      },
    },
  );
}

export function ticketQuantityAboveMaximumError({
  ticketTypeName,
  maxPerOrder,
}) {
  return AppError.badRequest(
    `The maximum quantity for "${ticketTypeName}" is ${maxPerOrder}.`,
    {
      code: "ORDER_TICKET_QUANTITY_ABOVE_MAXIMUM",
      title: "Maximum quantity exceeded",
      action: "Reduce the quantity for this ticket type.",
      fields: [
        {
          path: "body.items.quantity",
          message: `Maximum quantity is ${maxPerOrder}.`,
        },
      ],
      details: {
        ticketTypeName,
        maxPerOrder,
      },
    },
  );
}

export function buyerEmailRequiredError() {
  return AppError.badRequest("Buyer email is required.", {
    code: "BUYER_EMAIL_REQUIRED",
    title: "Buyer email required",
    action: "Provide a valid buyer email address.",
    fields: [
      {
        path: "body.email",
        message: "Buyer email is required.",
      },
    ],
  });
}

export function ticketStockChangedError() {
  return AppError.conflict("Ticket stock changed. Please try again.", {
    code: "TICKET_STOCK_CHANGED",
    title: "Ticket stock changed",
    action: "Refresh the ticket selection and try again.",
  });
}

export function orderNotFoundError(orderId = null) {
  return AppError.notFound("Order not found.", {
    code: "ORDER_NOT_FOUND",
    title: "Order not found",
    action: "Refresh the order list and try again.",
    details: {
      orderId,
    },
  });
}
export function orderCancellationNotAllowedError({
  orderId = null,
  reason = null,
  status = null,
} = {}) {
  return AppError.conflict("This order cannot be cancelled.", {
    code: "ORDER_CANCELLATION_NOT_ALLOWED",

    title: "Order cancellation not allowed",

    action:
      "Refresh the order and check its current status before trying again.",

    details: {
      orderId,
      reason,
      status,
    },
  });
}
export function orderItemsRequiredError() {
  return AppError.badRequest("At least one order item is required.", {
    code: "ORDER_ITEMS_REQUIRED",
    title: "Order item required",
    action: "Add at least one ticket type to the order.",
    fields: [
      {
        path: "body.items",
        message: "At least one order item is required.",
      },
    ],
  });
}
export function orderBuyerUpdateNotAllowedError({
  orderId = null,
  buyerType = null,
  status = null,
  reason = null,
} = {}) {
  return AppError.conflict("Buyer data cannot be changed for this order.", {
    code: "ORDER_BUYER_UPDATE_NOT_ALLOWED",

    title: "Buyer update not allowed",

    action:
      "Refresh the order and check its buyer type, status and ticket state.",

    details: {
      orderId,
      buyerType,
      status,
      reason,
    },
  });
}
export function orderMailResendNotAllowedError({
  orderId = null,
  type = null,
  reason = null,
  status = null,
  refundStatus = null,
  eventStatus = null,
} = {}) {
  return AppError.conflict(
    "This mail cannot be resent for the current order state.",
    {
      code: "ORDER_MAIL_RESEND_NOT_ALLOWED",
      title: "Mail resend not allowed",
      action: "Refresh the order and check whether this mail is available.",
      details: {
        orderId,
        type,
        reason,
        status,
        refundStatus,
        eventStatus,
      },
    },
  );
}

export function orderMailResendFailedError({
  orderId = null,
  type = null,
  reason = null,
} = {}) {
  return AppError.serviceUnavailable("The mail could not be sent.", {
    code: "ORDER_MAIL_RESEND_FAILED",
    title: "Mail resend failed",
    action: "Try sending the mail again.",
    details: {
      orderId,
      type,
      reason,
    },
  });
}
export function externalBuyerIdentityRequiredError() {
  return new AppError({
    code: "EXTERNAL_BUYER_IDENTITY_REQUIRED",
    title: "External buyer identity required",
    message: "External user identity is required to access own orders.",
    statusCode: 401,
    expose: true,
    action: "Log in through the host application before accessing your orders.",
  });
}

export function ticketingDisabledError() {
  return AppError.forbidden("Ticketing is not enabled.", {
    code: "TICKETING_DISABLED",
    title: "Ticketing disabled",
    action: "Enable ticketing in the kiwi-events settings.",
  });
}

export function guestCheckoutDisabledError() {
  return AppError.forbidden("Guest checkout is not enabled.", {
    code: "GUEST_CHECKOUT_DISABLED",
    title: "Guest checkout disabled",
    action: "Enable guest checkout in the kiwi-events settings.",
  });
}

export function guestCheckoutHostServiceRequiredError() {
  return AppError.forbidden("Guest checkout requires host service identity.", {
    code: "GUEST_CHECKOUT_HOST_SERVICE_REQUIRED",
    title: "Host service identity required",
    action: "Call guest checkout with a valid host service identity.",
  });
}

export function guestDataRequiredError() {
  return AppError.badRequest("Guest data is required for guest checkout.", {
    code: "GUEST_DATA_REQUIRED",
    title: "Guest data required",
    action: "Provide guest first name, last name and email.",
    fields: [
      {
        path: "body.guest",
        message: "Guest data is required.",
      },
    ],
  });
}

export function ownOrderNotFoundError(orderId = null) {
  return AppError.notFound("Order not found.", {
    code: "OWN_ORDER_NOT_FOUND",
    title: "Order not found",
    action: "Check the order id and try again.",
    details: {
      orderId,
    },
  });
}

export function orderCannotBeCancelledError(orderId = null) {
  return AppError.badRequest("Order cannot be cancelled.", {
    code: "ORDER_CANNOT_BE_CANCELLED",
    title: "Order cannot be cancelled",
    action: "Only pending or confirmed orders can be cancelled.",
    details: {
      orderId,
    },
  });
}
export function customerOrderCancellationNotAllowedError({
  orderId = null,
  reason = null,
  details = {},
} = {}) {
  return AppError.conflict(
    "This order cannot currently be cancelled through customer self-service.",
    {
      code: "CUSTOMER_ORDER_CANCELLATION_NOT_ALLOWED",

      title: "Order cancellation not available",

      action:
        "Check whether the order still satisfies the customer cancellation rules.",

      details: {
        orderId,
        reason,
        ...details,
      },
    },
  );
}
export function providerPaymentIdMissingError() {
  return AppError.badRequest("Missing provider payment id.", {
    code: "PROVIDER_PAYMENT_ID_MISSING",
    title: "Provider payment id missing",
    action: "Make sure the payment provider webhook includes a payment id.",
    fields: [
      {
        path: "body.id",
        message: "Provider payment id is required.",
      },
    ],
  });
}

export function guestOrderNotFoundError(orderId = null) {
  return AppError.notFound("Order not found.", {
    code: "GUEST_ORDER_NOT_FOUND",
    title: "Guest order not found",
    action: "Check the guest order link and try again.",
    details: {
      orderId,
    },
  });
}

export function notGuestOrderError(orderId = null) {
  return AppError.forbidden("This order is not a guest order.", {
    code: "ORDER_NOT_GUEST_ORDER",
    title: "Not a guest order",
    action: "Use the normal order access flow for this order.",
    details: {
      orderId,
    },
  });
}

export function guestAccessUnavailableError(orderId = null) {
  return AppError.forbidden("Guest access is not available for this order.", {
    code: "GUEST_ACCESS_UNAVAILABLE",
    title: "Guest access unavailable",
    action: "Request a new guest access link.",
    details: {
      orderId,
    },
  });
}
export function guestAccessIssuanceFailedError(orderId = null) {
  return AppError.internal("Guest access could not be issued.", {
    code: "GUEST_ACCESS_ISSUANCE_FAILED",
    title: "Guest access issuance failed",
    details: {
      orderId,
    },
  });
}
export function invalidGuestAccessTokenError(orderId = null) {
  return AppError.forbidden("Invalid guest access token.", {
    code: "INVALID_GUEST_ACCESS_TOKEN",
    title: "Invalid guest access token",
    action: "Open the newest guest access link from your email.",
    details: {
      orderId,
    },
  });
}

export function expiredGuestAccessTokenError(orderId = null) {
  return AppError.forbidden("Guest access token has expired.", {
    code: "GUEST_ACCESS_TOKEN_EXPIRED",
    title: "Guest access token expired",
    action: "Request a new guest access link.",
    details: {
      orderId,
    },
  });
}
export function guestAccessRecoveryHostServiceRequiredError() {
  return AppError.forbidden(
    "Guest access recovery requires host service identity.",
    {
      code: "GUEST_ACCESS_RECOVERY_HOST_SERVICE_REQUIRED",
      title: "Host service identity required",
      action: "Request guest access recovery through the host application.",
    },
  );
}

export function guestAccessRecoveryNotFoundError() {
  return AppError.notFound("Guest order could not be found.", {
    code: "GUEST_ACCESS_RECOVERY_NOT_FOUND",
    title: "Guest order not found",
    action: "Check the order number and email address and try again.",
  });
}

export function guestAccessWindowExpiredError(
  orderId = null,
  expiresAt = null,
) {
  return AppError.forbidden(
    "Guest access can no longer be issued for this order.",
    {
      code: "GUEST_ACCESS_WINDOW_EXPIRED",
      title: "Guest access window expired",
      action:
        "Guest access can only be issued while the order access window is active.",
      details: {
        orderId,
        expiresAt,
      },
    },
  );
}
export function customerCheckoutHostServiceRequiredError() {
  return AppError.forbidden(
    "Customer checkout requires host service identity.",
    {
      code: "CUSTOMER_CHECKOUT_HOST_SERVICE_REQUIRED",
      title: "Host service identity required",
      action:
        "Call customer checkout with a valid host service identity or use the buyer external JWT directly.",
    },
  );
}
export function checkoutIdempotencyKeyRequiredError() {
  return AppError.badRequest(
    "Idempotency-Key header is required for checkout.",
    {
      code: "ORDER_IDEMPOTENCY_KEY_REQUIRED",
      title: "Idempotency key required",
      action:
        "Send a unique Idempotency-Key header with every new checkout attempt.",
      fields: [
        {
          path: "headers.idempotency-key",
          message: "Idempotency-Key header is required.",
        },
      ],
    },
  );
}

export function checkoutIdempotencyKeyInvalidError() {
  return AppError.badRequest("Idempotency-Key header is invalid.", {
    code: "ORDER_IDEMPOTENCY_KEY_INVALID",
    title: "Invalid idempotency key",
    action:
      "Use 16 to 200 characters containing only letters, numbers, dots, underscores, colons or hyphens.",
    fields: [
      {
        path: "headers.idempotency-key",
        message: "Idempotency-Key must contain 16 to 200 valid characters.",
      },
    ],
  });
}

export function checkoutIdempotencyScopeUnavailableError() {
  return AppError.unauthorized(
    "The authenticated caller cannot be used for idempotent checkout.",
    {
      code: "ORDER_IDEMPOTENCY_SCOPE_UNAVAILABLE",
      title: "Idempotency scope unavailable",
      action:
        "Use either a host-service identity with externalProvider or an external user identity.",
    },
  );
}
export function checkoutIdempotencyKeyReusedError() {
  return AppError.conflict(
    "Idempotency-Key was already used for a different checkout request.",
    {
      code: "ORDER_IDEMPOTENCY_KEY_REUSED",
      title: "Idempotency key already used",
      action: "Use a new Idempotency-Key for a different checkout request.",
      fields: [
        {
          path: "headers.idempotency-key",
          message:
            "This Idempotency-Key belongs to a different request payload.",
        },
      ],
    },
  );
}

export function checkoutIdempotencyInProgressError() {
  return AppError.conflict(
    "A checkout with this Idempotency-Key is still being processed.",
    {
      code: "ORDER_IDEMPOTENCY_IN_PROGRESS",
      title: "Checkout still processing",
      action: "Retry the same request with the same Idempotency-Key shortly.",
    },
  );
}
export function orderCurrencyMismatchError() {
  return AppError.badRequest(
    "All ticket types in one order must use the same currency.",
    {
      code: "ORDER_CURRENCY_MISMATCH",
      title: "Order currency mismatch",
      action: "Create the order using ticket types with the same currency.",
      fields: [
        {
          path: "body.items",
          message: "All ticket types in one order must use the same currency.",
        },
      ],
    },
  );
}
