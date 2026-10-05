import { describe, expect, it } from "vitest";

import {
  findMissingTemplateVariables,
  getTemplateVariableKeys,
  renderEmailTemplate,
} from "../../../src/modules/mail/mail.render.service.js";

describe("mail render service", () => {
  it("renders subject, html and text variables", () => {
    const result = renderEmailTemplate(
      {
        subject: "Hallo {{ firstName }}",
        html: "<p>Dein Event: {{eventTitle}}</p>",
        text: "Ticket: {{ ticketName }}",
      },
      {
        firstName: "Thomas",
        eventTitle: "kiwi-events Launch",
        ticketName: "VIP Ticket",
      },
    );

    expect(result).toEqual({
      subject: "Hallo Thomas",
      html: "<p>Dein Event: kiwi-events Launch</p>",
      text: "Ticket: VIP Ticket",
    });
  });

  it("escapes html variables while leaving text variables as text", () => {
    const result = renderEmailTemplate(
      {
        subject: "Hallo {{firstName}}",
        html: "<p>{{message}}</p>",
        text: "{{message}}",
      },
      {
        firstName: "<Admin>",
        message: '<script>alert("x")</script>\nSecond line & more',
      },
    );

    expect(result.subject).toBe("Hallo <Admin>");
    expect(result.html).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Second line &amp; more</p>",
    );
    expect(result.text).toBe('<script>alert("x")</script>\nSecond line & more');
  });

  it("renders repeated variables multiple times", () => {
    const result = renderEmailTemplate(
      {
        subject: "{{eventTitle}} - {{eventTitle}}",
        html: "<p>{{eventTitle}}</p><strong>{{eventTitle}}</strong>",
        text: "{{eventTitle}} / {{eventTitle}}",
      },
      {
        eventTitle: "Demo Event",
      },
    );

    expect(result).toEqual({
      subject: "Demo Event - Demo Event",
      html: "<p>Demo Event</p><strong>Demo Event</strong>",
      text: "Demo Event / Demo Event",
    });
  });

  it("leaves missing variables unchanged during rendering", () => {
    const result = renderEmailTemplate(
      {
        subject: "Hallo {{firstName}} {{lastName}}",
        html: "<p>{{eventTitle}}</p><p>{{missingValue}}</p>",
        text: "{{ticketName}} {{unknown}}",
      },
      {
        firstName: "Thomas",
        eventTitle: "kiwi-events Launch",
        ticketName: "VIP Ticket",
      },
    );

    expect(result).toEqual({
      subject: "Hallo Thomas {{lastName}}",
      html: "<p>kiwi-events Launch</p><p>{{missingValue}}</p>",
      text: "VIP Ticket {{unknown}}",
    });
  });

  it("renders falsy but defined values", () => {
    const result = renderEmailTemplate(
      {
        subject: "Count {{count}}",
        html: "<p>Enabled: {{enabled}}</p>",
        text: "Zero {{zero}} False {{falseValue}}",
      },
      {
        count: 0,
        enabled: false,
        zero: 0,
        falseValue: false,
      },
    );

    expect(result).toEqual({
      subject: "Count 0",
      html: "<p>Enabled: false</p>",
      text: "Zero 0 False false",
    });
  });

  it("collects declared and actually used template variables without duplicates", () => {
    expect(
      getTemplateVariableKeys({
        variables: ["firstName", "declaredOnly", "firstName"],
        subject: "Hello {{ firstName }}",
        html: "<p>{{eventTitle}}</p>",
        text: "{{eventTitle}} / {{orderNumber}}",
      }),
    ).toEqual(["firstName", "declaredOnly", "eventTitle", "orderNumber"]);
  });

  it("finds missing variables from declared and actual template usage", () => {
    const missing = findMissingTemplateVariables(
      {
        variables: ["firstName", "lastName"],
        subject: "{{firstName}} {{email}}",
        html: "<p>{{eventTitle}}</p>",
        text: "{{ticketName}}",
      },
      {
        firstName: "Thomas",
        lastName: "",
        email: null,
        ticketName: undefined,
        eventTitle: "kiwi-events Launch",
      },
    );

    expect(missing).toEqual(["lastName", "email", "ticketName"]);
  });

  it("does not mark zero or false values as missing", () => {
    expect(
      findMissingTemplateVariables(
        {
          variables: ["count", "enabled", "name"],
        },
        {
          count: 0,
          enabled: false,
          name: "Thomas",
        },
      ),
    ).toEqual([]);
  });

  it("marks empty arrays as missing but accepts non-empty arrays and objects", () => {
    expect(
      findMissingTemplateVariables(
        {
          variables: ["empty", "items", "metadata"],
        },
        {
          empty: [],
          items: ["A"],
          metadata: {},
        },
      ),
    ).toEqual(["empty"]);
  });

  it("handles missing template and variables safely", () => {
    expect(getTemplateVariableKeys()).toEqual([]);
    expect(findMissingTemplateVariables()).toEqual([]);
    expect(findMissingTemplateVariables({}, null)).toEqual([]);
    expect(renderEmailTemplate({}, null)).toEqual({
      subject: "",
      html: "",
      text: "",
    });
  });
});
