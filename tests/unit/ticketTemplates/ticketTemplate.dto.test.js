import { describe, expect, it } from "vitest";

import { toAdminTicketTemplateDto } from "../../../src/modules/ticketTemplates/ticketTemplate.dto.js";

describe("ticket template admin dto", () => {
  it("returns editor capabilities and hides media storage internals", () => {
    const dto = toAdminTicketTemplateDto({
      source: "custom",
      schemaVersion: 1,
      revision: 3,
      template: {
        page: {
          width: 595.28,
          height: 841.89,
          backgroundColor: "#ffffff",
        },
        elements: [],
      },
      images: [
        {
          id: "6a0000000000000000000001",
          kind: "ticket_template_image",
          folder: "media/ticket-templates/event-id",
          key: "media/ticket-templates/event-id/logo.png",
          storageTarget: "local",
          filenameOriginal: "logo.png",
          mimeType: "image/png",
          size: 1234,
          ownerEventId: "6a0000000000000000000002",
          createdByEventUserId: "6a0000000000000000000003",
          updatedByEventUserId: "6a0000000000000000000003",
        },
      ],
    });

    expect(dto).toMatchObject({
      source: "custom",
      schemaVersion: 1,
      revision: 3,
      template: {
        page: {
          width: 595.28,
          height: 841.89,
          backgroundColor: "#ffffff",
        },
        elements: [],
      },
      images: [
        {
          id: "6a0000000000000000000001",
          fileUrl: "/api/public/media-assets/6a0000000000000000000001/file",
          filenameOriginal: "logo.png",
          mimeType: "image/png",
          size: 1234,
        },
      ],
      capabilities: {
        fields: expect.any(Array),
        elementTypes: expect.arrayContaining([
          "text",
          "qr",
          "image",
          "line",
          "rect",
        ]),
        fonts: expect.any(Array),
        textAlignments: expect.any(Array),
        imageFits: expect.arrayContaining(["contain", "cover", "stretch"]),
        imageAlignments: expect.any(Array),
        imageVerticalAlignments: expect.any(Array),
        conditionOperators: expect.any(Array),
      },
    });

    const serialized = JSON.stringify(dto.images);

    expect(serialized).not.toContain('"key"');
    expect(serialized).not.toContain('"storageTarget"');
    expect(serialized).not.toContain('"folder"');
    expect(serialized).not.toContain('"ownerEventId"');
    expect(serialized).not.toContain('"createdByEventUserId"');
    expect(serialized).not.toContain('"updatedByEventUserId"');
  });
});
