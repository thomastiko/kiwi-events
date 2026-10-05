import { describe, expect, it, vi } from "vitest";

import { executeMailBatch } from "../../../src/modules/mail/mail.batch.service.js";

describe("mail batch service", () => {
  it("classifies sent, skipped and failed results while preserving input order", async () => {
    const items = ["sent", "skipped", "failed"];

    const result = await executeMailBatch({
      items,
      concurrency: 2,
      getMetadata: (item, index) => ({ item, index }),
      worker: async (item) => {
        if (item === "sent") {
          return { success: true, skipped: false };
        }

        if (item === "skipped") {
          return {
            success: false,
            skipped: true,
            reason: "disabled",
          };
        }

        return {
          success: false,
          skipped: false,
          reason: "provider_error",
        };
      },
    });

    expect(result).toEqual({
      totalCount: 3,
      sentCount: 1,
      skippedCount: 1,
      failedCount: 1,
      sent: [
        {
          success: true,
          skipped: false,
          item: "sent",
          index: 0,
        },
      ],
      skipped: [
        {
          success: false,
          skipped: true,
          reason: "disabled",
          item: "skipped",
          index: 1,
        },
      ],
      failed: [
        {
          success: false,
          skipped: false,
          reason: "provider_error",
          item: "failed",
          index: 2,
        },
      ],
    });
  });

  it("converts thrown worker errors into failed results", async () => {
    const result = await executeMailBatch({
      items: ["a"],
      worker: async () => {
        throw new Error("boom");
      },
    });

    expect(result.failedCount).toBe(1);
    expect(result.failed[0]).toMatchObject({
      success: false,
      skipped: false,
      reason: "mail_batch_worker_error",
      error: "boom",
    });
  });

  it("treats an empty worker result as a failure", async () => {
    const result = await executeMailBatch({
      items: [1],
      worker: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      reason: "mail_batch_empty_result",
    });
  });

  it("limits active workers to the requested concurrency", async () => {
    let active = 0;
    let peak = 0;

    await executeMailBatch({
      items: Array.from({ length: 8 }, (_, index) => index),
      concurrency: 2,
      worker: async () => {
        active += 1;
        peak = Math.max(peak, active);

        await new Promise((resolve) => setTimeout(resolve, 5));

        active -= 1;

        return {
          success: true,
          skipped: false,
        };
      },
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("returns an empty canonical result for an empty item list", async () => {
    await expect(
      executeMailBatch({
        items: [],
        worker: vi.fn(),
      }),
    ).resolves.toEqual({
      totalCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      sent: [],
      skipped: [],
      failed: [],
    });
  });

  it("rejects invalid batch arguments", async () => {
    await expect(
      executeMailBatch({
        items: null,
        worker: vi.fn(),
      }),
    ).rejects.toThrow("Mail batch items must be an array.");

    await expect(
      executeMailBatch({
        items: [],
      }),
    ).rejects.toThrow("Mail batch worker must be a function.");
  });
});
