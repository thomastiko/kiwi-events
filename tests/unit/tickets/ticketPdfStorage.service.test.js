import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteObjectMock, loggerWarnMock } = vi.hoisted(() => ({
  deleteObjectMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("../../../src/modules/storage/storage.service.js", () => ({
  deleteObject: deleteObjectMock,
}));

vi.mock("../../../src/config/logger.js", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

import {
  collectTicketPdfStorageReferences,
  deleteTicketPdfStorageReferencesSafe,
  getTicketPdfStorageReference,
} from "../../../src/modules/tickets/ticketPdfStorage.service.js";

describe("ticketPdfStorage.service", () => {
  beforeEach(() => {
    deleteObjectMock.mockReset();
    deleteObjectMock.mockResolvedValue({ success: true });
    loggerWarnMock.mockReset();
  });

  it("returns null when a ticket has no stored PDF reference", () => {
    expect(getTicketPdfStorageReference(null)).toBeNull();
    expect(
      getTicketPdfStorageReference({
        ticketPdfStorageKey: null,
        ticketPdfStorageTarget: null,
      }),
    ).toBeNull();
  });

  it("normalizes and returns a complete ticket PDF storage reference", () => {
    expect(
      getTicketPdfStorageReference({
        ticketPdfStorageKey: " tickets/event/ticket/document.pdf ",
        ticketPdfStorageTarget: " PRIVATE ",
      }),
    ).toEqual({
      key: "tickets/event/ticket/document.pdf",
      storageTarget: "private",
    });
  });

  it("rejects incomplete or unsupported ticket PDF storage references", () => {
    expect(() =>
      getTicketPdfStorageReference({
        ticketPdfStorageKey: "tickets/document.pdf",
        ticketPdfStorageTarget: null,
      }),
    ).toThrow(/both key and storageTarget/i);

    expect(() =>
      getTicketPdfStorageReference({
        ticketPdfStorageKey: null,
        ticketPdfStorageTarget: "private",
      }),
    ).toThrow(/both key and storageTarget/i);

    expect(() =>
      getTicketPdfStorageReference({
        ticketPdfStorageKey: "tickets/document.pdf",
        ticketPdfStorageTarget: "unknown",
      }),
    ).toThrow(/unsupported ticket pdf storage target/i);
  });

  it("collects unique references across local, public and private storage", () => {
    const references = collectTicketPdfStorageReferences([
      {
        ticketPdfStorageKey: "tickets/a.pdf",
        ticketPdfStorageTarget: "local",
      },
      {
        ticketPdfStorageKey: "tickets/a.pdf",
        ticketPdfStorageTarget: "local",
      },
      {
        ticketPdfStorageKey: "tickets/a.pdf",
        ticketPdfStorageTarget: "private",
      },
      {
        ticketPdfStorageKey: "tickets/b.pdf",
        ticketPdfStorageTarget: "public",
      },
      {
        ticketPdfStorageKey: null,
        ticketPdfStorageTarget: null,
      },
    ]);

    expect(references).toEqual([
      {
        key: "tickets/a.pdf",
        storageTarget: "local",
      },
      {
        key: "tickets/a.pdf",
        storageTarget: "private",
      },
      {
        key: "tickets/b.pdf",
        storageTarget: "public",
      },
    ]);
  });

  it("deletes every reference through its recorded storage target", async () => {
    await deleteTicketPdfStorageReferencesSafe(
      [
        {
          key: "tickets/local.pdf",
          storageTarget: "local",
        },
        {
          key: "tickets/private.pdf",
          storageTarget: "private",
        },
      ],
      {
        ticketId: "ticket-1",
        reason: "test_cleanup",
      },
    );

    expect(deleteObjectMock).toHaveBeenCalledTimes(2);
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "tickets/local.pdf",
      storageTarget: "local",
    });
    expect(deleteObjectMock).toHaveBeenCalledWith({
      key: "tickets/private.pdf",
      storageTarget: "private",
    });
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("logs a failed delete and continues cleaning the remaining references", async () => {
    const storageError = new Error("delete failed");

    deleteObjectMock
      .mockRejectedValueOnce(storageError)
      .mockResolvedValueOnce({ success: true });

    await expect(
      deleteTicketPdfStorageReferencesSafe(
        [
          {
            key: "tickets/failing.pdf",
            storageTarget: "private",
          },
          {
            key: "tickets/remaining.pdf",
            storageTarget: "public",
          },
        ],
        {
          eventId: "event-1",
          reason: "test_cleanup",
        },
      ),
    ).resolves.toBeUndefined();

    expect(deleteObjectMock).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket.pdf_storage_delete_failed",
      expect.objectContaining({
        key: "tickets/failing.pdf",
        storageTarget: "private",
        eventId: "event-1",
        reason: "test_cleanup",
        error: storageError,
      }),
    );
  });
});
