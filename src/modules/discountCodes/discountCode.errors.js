import { AppError } from "../../core/errors/AppError.js";

export function discountCodeAccessRequiredError() {
  return AppError.forbidden(
    "No active kiwi-events user was found for this discount code action.",
    {
      code: "DISCOUNT_CODE_ACCESS_REQUIRED",
      title: "Discount code access required",
      action:
        "Log in with an active kiwi-events user that has event management access.",
    },
  );
}

export function discountCodeManageForbiddenError() {
  return AppError.forbidden(
    "You do not have permission to manage discount codes for this event.",
    {
      code: "DISCOUNT_CODE_MANAGE_FORBIDDEN",
      title: "Discount code management not allowed",
      action: "Ask an admin to grant event management access for this event.",
    },
  );
}

export function discountCodeEventNotFoundError(eventId) {
  return AppError.notFound("Related event not found.", {
    code: "DISCOUNT_CODE_EVENT_NOT_FOUND",
    title: "Related event not found",
    action: "Choose an existing event and try again.",
    details: {
      eventId,
    },
  });
}

export function discountCodeGroupNotFoundError(groupId) {
  return AppError.notFound("Discount code group not found.", {
    code: "DISCOUNT_CODE_GROUP_NOT_FOUND",
    title: "Discount code group not found",
    action: "Refresh the discount code groups and try again.",
    details: {
      groupId,
    },
  });
}

export function discountCodeNotFoundError(codeId) {
  return AppError.notFound("Discount code not found.", {
    code: "DISCOUNT_CODE_NOT_FOUND",
    title: "Discount code not found",
    action: "Refresh the discount codes and try again.",
    details: {
      codeId,
    },
  });
}

export function discountCodeAlreadyExistsError({ eventId, code = null } = {}) {
  return AppError.conflict(
    code
      ? `Discount code "${code}" already exists for this event.`
      : "One or more discount codes already exist for this event.",
    {
      code: "DISCOUNT_CODE_ALREADY_EXISTS",
      title: "Discount code already exists",
      action: "Use a different code and try again.",
      details: {
        eventId,
        code,
      },
    },
  );
}
export function discountCodesDisabledError() {
  return AppError.forbidden("Discount codes are not enabled.", {
    code: "DISCOUNT_CODES_DISABLED",
    title: "Discount codes disabled",
    action:
      "Enable discount codes in the kiwi-events settings before using a discount code.",
  });
}

export function invalidDiscountCodeError() {
  return AppError.badRequest("The discount code is invalid or inactive.", {
    code: "DISCOUNT_CODE_INVALID",
    title: "Invalid discount code",
    action: "Check the discount code and try again.",
    fields: [
      {
        path: "body.discountCode",
        message: "The discount code is invalid or inactive.",
      },
    ],
  });
}

export function discountCodeNotApplicableError() {
  return AppError.badRequest(
    "The discount code cannot be applied to this order.",
    {
      code: "DISCOUNT_CODE_NOT_APPLICABLE",
      title: "Discount code not applicable",
      action:
        "Discount codes require at least one paid fixed-price normal ticket.",
      fields: [
        {
          path: "body.discountCode",
          message: "This order contains no discountable amount.",
        },
      ],
    },
  );
}
