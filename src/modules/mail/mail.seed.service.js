import {
  createEmailTemplate,
  findEmailTemplateByKey,
  updateEmailTemplateById,
} from "./repositories/mail.repository.js";

import { EMAIL_TEMPLATE_STATUS, MAIL_TEMPLATE_KEYS } from "./mail.constants.js";

export const DEFAULT_EVENT_EMAIL_TEMPLATES = [
  {
    key: MAIL_TEMPLATE_KEYS.ORDER_CONFIRMED,
    module: "orders",
    category: "confirmation",
    name: "Ticket purchase: Confirmation",
    description:
      "Sent after an order has been successfully confirmed and tickets have been created.",
    subject: "Your ticket confirmation for {{eventTitle}}",
    html: `
      <p>Hello {{firstName}},</p>

      <p>Your order has been successfully confirmed.</p>

      <p>
        <strong>Event:</strong> {{eventTitle}}<br>
        <strong>Date:</strong> {{eventDate}}<br>
        <strong>Location:</strong> {{eventLocation}}<br>
        <strong>Order number:</strong> {{orderNumber}}
      </p>

      <p>
        <strong>Tickets:</strong><br>
        {{ticketSummary}}
      </p>

      <p>
        If ticket PDFs or QR codes are enabled in kiwi-events,
        they may be attached to this email or included directly on your ticket.
      </p>

      <p>Best regards,<br>{{eventTeamName}}</p>
    `,
    text:
      "Hello {{firstName}},\n\n" +
      "Your order has been successfully confirmed.\n\n" +
      "Event: {{eventTitle}}\n" +
      "Date: {{eventDate}}\n" +
      "Location: {{eventLocation}}\n" +
      "Order number: {{orderNumber}}\n\n" +
      "Tickets:\n{{ticketSummary}}\n\n" +
      "If ticket PDFs or QR codes are enabled in kiwi-events, they may be attached to this email or included directly on your ticket.\n\n" +
      "Best regards,\n{{eventTeamName}}",
    variables: [
      "firstName",
      "eventTitle",
      "eventDate",
      "eventLocation",
      "orderNumber",
      "ticketSummary",
      "eventTeamName",
    ],
    status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    isSystem: true,
  },
  {
    key: MAIL_TEMPLATE_KEYS.ORDER_CANCELLED,
    module: "orders",
    category: "cancellation",
    name: "Order: Cancellation",
    description:
      "Sent when an individual order is cancelled by an admin or event organizer.",
    subject: "Your order {{orderNumber}} has been cancelled",
    html: `
    <p>Hello {{firstName}},</p>

    <p>Your order has been cancelled.</p>

    <p>
      <strong>Event:</strong> {{eventTitle}}<br>
      <strong>Order number:</strong> {{orderNumber}}
    </p>

    <p>
      <strong>Reason:</strong><br>
      {{cancellationReason}}
    </p>

    <p>Best regards,<br>{{eventTeamName}}</p>
  `,
    text:
      "Hello {{firstName}},\n\n" +
      "Your order has been cancelled.\n\n" +
      "Event: {{eventTitle}}\n" +
      "Order number: {{orderNumber}}\n\n" +
      "Reason:\n{{cancellationReason}}\n\n" +
      "Best regards,\n{{eventTeamName}}",
    variables: [
      "firstName",
      "eventTitle",
      "orderNumber",
      "cancellationReason",
      "eventTeamName",
    ],
    status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    isSystem: true,
  },
  {
    key: MAIL_TEMPLATE_KEYS.ORDER_REFUNDED,
    module: "orders",
    category: "refund",
    name: "Order: Refund completed",
    description: "Sent after a payment refund has been successfully completed.",
    subject: "Your refund for order {{orderNumber}} has been completed",
    html: `
    <p>Hello {{firstName}},</p>

    <p>
      A refund for your order has been successfully completed.
    </p>

    <p>
      <strong>Event:</strong> {{eventTitle}}<br>
      <strong>Order number:</strong> {{orderNumber}}<br>
      <strong>Refund amount:</strong> {{refundAmount}}
    </p>

    <p>
      Depending on your payment provider, it may take some time
      for the refunded amount to appear in your account.
    </p>

    <p>Best regards,<br>{{eventTeamName}}</p>
  `,
    text:
      "Hello {{firstName}},\n\n" +
      "A refund for your order has been successfully completed.\n\n" +
      "Event: {{eventTitle}}\n" +
      "Order number: {{orderNumber}}\n" +
      "Refund amount: {{refundAmount}}\n\n" +
      "Depending on your payment provider, it may take some time for the refunded amount to appear in your account.\n\n" +
      "Best regards,\n{{eventTeamName}}",
    variables: [
      "firstName",
      "eventTitle",
      "orderNumber",
      "refundAmount",
      "eventTeamName",
    ],
    status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    isSystem: true,
  },
  {
    key: MAIL_TEMPLATE_KEYS.EVENT_CANCELLED,
    module: "events",
    category: "cancellation",
    name: "Event: Cancellation",
    description:
      "Sent when an event is cancelled by an admin or event organizer.",
    subject: "{{eventTitle}} has been cancelled",
    html: `
      <p>Hello {{firstName}},</p>

      <p>Unfortunately, the following event has been cancelled:</p>

      <p>
        <strong>Event:</strong> {{eventTitle}}<br>
        <strong>Date:</strong> {{eventDate}}<br>
        <strong>Location:</strong> {{eventLocation}}
      </p>

      <p><strong>Message:</strong><br>{{cancellationReason}}</p>

      <p>
        If a refund is required, you will receive further information from the organizer.
      </p>

      <p>Best regards,<br>{{eventTeamName}}</p>
    `,
    text:
      "Hello {{firstName}},\n\n" +
      "Unfortunately, the following event has been cancelled:\n\n" +
      "Event: {{eventTitle}}\n" +
      "Date: {{eventDate}}\n" +
      "Location: {{eventLocation}}\n\n" +
      "Message:\n{{cancellationReason}}\n\n" +
      "If a refund is required, you will receive further information from the organizer.\n\n" +
      "Best regards,\n{{eventTeamName}}",
    variables: [
      "firstName",
      "eventTitle",
      "eventDate",
      "eventLocation",
      "cancellationReason",
      "eventTeamName",
    ],
    status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    isSystem: true,
  },

  {
    key: MAIL_TEMPLATE_KEYS.EVENT_REMINDER_TOMORROW,
    module: "events",
    category: "reminder",
    name: "Event: Reminder 1 day before",
    description:
      "Sent one day before the event starts to people with a valid ticket.",
    subject: "Reminder: {{eventTitle}} starts tomorrow",
    html: `
      <p>Hello {{firstName}},</p>

      <p>This is a quick reminder that your event starts tomorrow.</p>

      <p>
        <strong>Event:</strong> {{eventTitle}}<br>
        <strong>Date:</strong> {{eventDate}}<br>
        <strong>Location:</strong> {{eventLocation}}
      </p>

      <p>Please bring your ticket and check any additional information from the organizer.</p>

      <p>Best regards,<br>{{eventTeamName}}</p>
    `,
    text:
      "Hello {{firstName}},\n\n" +
      "This is a quick reminder that your event starts tomorrow.\n\n" +
      "Event: {{eventTitle}}\n" +
      "Date: {{eventDate}}\n" +
      "Location: {{eventLocation}}\n\n" +
      "Please bring your ticket and check any additional information from the organizer.\n\n" +
      "Best regards,\n{{eventTeamName}}",
    variables: [
      "firstName",
      "eventTitle",
      "eventDate",
      "eventLocation",
      "eventTeamName",
    ],
    status: EMAIL_TEMPLATE_STATUS.ACTIVE,
    isSystem: true,
  },
];

export async function seedDefaultEventEmailTemplates() {
  let created = 0;
  let existing = 0;
  let repaired = 0;

  for (const template of DEFAULT_EVENT_EMAIL_TEMPLATES) {
    const current = await findEmailTemplateByKey(template.key, {
      lean: true,
    });

    if (!current) {
      await createEmailTemplate(template, {
        lean: true,
      });

      created += 1;
      continue;
    }

    const identityUpdate = {};

    if (current.module !== template.module) {
      identityUpdate.module = template.module;
    }

    if (current.isSystem !== true) {
      identityUpdate.isSystem = true;
    }

    if (Object.keys(identityUpdate).length > 0) {
      await updateEmailTemplateById(current.id, identityUpdate, {
        lean: true,
      });

      repaired += 1;
    }

    existing += 1;
  }

  return {
    success: true,
    created,
    existing,
    repaired,
    total: DEFAULT_EVENT_EMAIL_TEMPLATES.length,
  };
}
