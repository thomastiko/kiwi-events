import { AppError } from "../../core/errors/AppError.js";

export function mailTemplateNotFoundError(details = {}) {
  return AppError.notFound("Mail template not found.", {
    code: "MAIL_TEMPLATE_NOT_FOUND",
    title: "Mail template not found",
    action: "Refresh the mail template list and try again.",
    details,
  });
}

export function mailTemplateKeyAlreadyExistsError(key) {
  return AppError.conflict("A mail template with this key already exists.", {
    code: "MAIL_TEMPLATE_KEY_ALREADY_EXISTS",
    title: "Mail template key already exists",
    action: "Choose another unique template key.",
    fields: [
      {
        path: "body.key",
        message: "This template key is already used.",
      },
    ],
    details: {
      key,
    },
  });
}

export function systemMailTemplateDeleteError(details = {}) {
  return AppError.badRequest("System templates cannot be deleted.", {
    code: "SYSTEM_MAIL_TEMPLATE_CANNOT_BE_DELETED",
    title: "System template protected",
    action:
      "System templates are required by kiwi-events. Disable or edit the template instead of deleting it.",
    details,
  });
}

export function mailLogNotFoundError(details = {}) {
  return AppError.notFound("Mail log not found.", {
    code: "MAIL_LOG_NOT_FOUND",
    title: "Mail log not found",
    action: "Refresh the mail log list and try again.",
    details,
  });
}
export function reservedSystemMailTemplateKeyError(key) {
  return AppError.conflict(
    "This mail template key is reserved for a system template.",
    {
      code: "SYSTEM_MAIL_TEMPLATE_KEY_RESERVED",

      title: "Mail template key reserved",

      action: "Choose another template key for custom mail templates.",

      fields: [
        {
          path: "body.key",
          message: "This key is reserved by kiwi-events.",
        },
      ],

      details: {
        key,
      },
    },
  );
}

export function systemMailTemplateIdentityUpdateError(details = {}) {
  return AppError.badRequest(
    "The technical identity of a system mail template cannot be changed.",
    {
      code: "SYSTEM_MAIL_TEMPLATE_IDENTITY_PROTECTED",

      title: "System template protected",

      action:
        "Edit the content, sender or status instead. The key and module of a system template are fixed.",

      details,
    },
  );
}
