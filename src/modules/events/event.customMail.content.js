import sanitizeHtml from "sanitize-html";

import { getTemplateVariableKeys } from "../mail/mail.render.service.js";

export const CUSTOM_EVENT_MAIL_VARIABLES = Object.freeze([
  "firstName",
  "lastName",
  "displayName",
  "fullName",
  "buyerEmail",
  "eventTitle",
  "eventDate",
  "eventLocation",
  "eventTeamName",
]);

const CUSTOM_EVENT_MAIL_VARIABLE_SET = new Set(CUSTOM_EVENT_MAIL_VARIABLES);

export function sanitizeCustomEventMailHtml(value) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [
      "p",
      "div",
      "br",

      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",

      "h1",
      "h2",
      "h3",
      "h4",

      "ul",
      "ol",
      "li",

      "blockquote",
      "hr",

      "span",
      "a",
    ],

    allowedAttributes: {
      a: ["href", "target", "rel"],

      p: ["style"],
      div: ["style"],
      span: ["style"],
    },

    allowedStyles: {
      p: {
        "text-align": [/^(left|right|center|justify)$/],
      },

      div: {
        "text-align": [/^(left|right|center|justify)$/],
      },

      span: {
        "text-align": [/^(left|right|center|justify)$/],
      },
    },

    allowedSchemes: ["http", "https", "mailto"],

    allowProtocolRelative: false,

    transformTags: {
      a: (tagName, attribs) => ({
        tagName,

        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
        },
      }),
    },
  }).trim();
}

export function customEventMailHtmlToText(html) {
  const withLineBreaks = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, "\n");

  return sanitizeHtml(withLineBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findUnsupportedCustomEventMailVariables({
  subject,
  html,
  text,
}) {
  const variables = getTemplateVariableKeys({
    subject,
    html,
    text,
  });

  return variables.filter(
    (variable) => !CUSTOM_EVENT_MAIL_VARIABLE_SET.has(variable),
  );
}
