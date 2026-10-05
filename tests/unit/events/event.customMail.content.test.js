import { describe, expect, it } from "vitest";

import {
  CUSTOM_EVENT_MAIL_VARIABLES,
  customEventMailHtmlToText,
  findUnsupportedCustomEventMailVariables,
  sanitizeCustomEventMailHtml,
} from "../../../src/modules/events/event.customMail.content.js";

describe("custom event mail content", () => {
  it("keeps safe editor markup and strips scripts and event handlers", () => {
    const result = sanitizeCustomEventMailHtml(`
      <p style="text-align:center" onclick="alert('x')">
        Hallo <strong>{{firstName}}</strong>
        <script>alert('bad')</script>
      </p>
      <a href="https://example.com" target="_blank" onclick="bad()">Link</a>
    `);

    expect(result).toContain('<p style="text-align:center">');
    expect(result).toContain("<strong>{{firstName}}</strong>");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onclick");
  });

  it("removes unsafe URL schemes", () => {
    const result = sanitizeCustomEventMailHtml(
      '<p><a href="javascript:alert(1)">Unsafe</a></p>',
    );

    expect(result).toContain("Unsafe");
    expect(result).not.toContain("javascript:");
  });

  it("creates a readable plain-text fallback", () => {
    const text = customEventMailHtmlToText(
      "<h2>Hallo</h2><p>Erste Zeile<br>Zweite Zeile</p><ul><li>A</li><li>B</li></ul>",
    );

    expect(text).toContain("Hallo");
    expect(text).toContain("Erste Zeile\nZweite Zeile");
    expect(text).toContain("A");
    expect(text).toContain("B");
    expect(text).not.toContain("<p>");
  });

  it("accepts only the supported participant/event variables", () => {
    expect(CUSTOM_EVENT_MAIL_VARIABLES).not.toContain("orderNumber");

    expect(
      findUnsupportedCustomEventMailVariables({
        subject: "Hallo {{firstName}}",
        html: "<p>{{eventTitle}} – {{eventDate}}</p>",
        text: "{{eventLocation}} {{buyerEmail}}",
      }),
    ).toEqual([]);

    expect(
      findUnsupportedCustomEventMailVariables({
        subject: "{{firstName}} {{password}}",
        html: "<p>{{orderNumber}}</p>",
        text: "{{unknownValue}}",
      }),
    ).toEqual(["password", "orderNumber", "unknownValue"]);
  });
});
