const DEFAULT_MAIL_BATCH_CONCURRENCY = 5;

const MAX_MAIL_BATCH_CONCURRENCY = 20;

function normalizeConcurrency(value, itemCount) {
  const parsed = Number(value);

  const concurrency =
    Number.isSafeInteger(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MAIL_BATCH_CONCURRENCY;

  return Math.max(
    1,
    Math.min(concurrency, MAX_MAIL_BATCH_CONCURRENCY, Math.max(1, itemCount)),
  );
}

function normalizeWorkerError(error) {
  return {
    success: false,
    skipped: false,
    reason: "mail_batch_worker_error",
    error: error?.message || String(error) || "Mail batch worker failed",
  };
}

function classifyResult(result) {
  if (result?.skipped) {
    return "skipped";
  }

  if (result?.success) {
    return "sent";
  }

  return "failed";
}

export async function executeMailBatch({
  items = [],
  worker,
  getMetadata = () => ({}),
  concurrency = DEFAULT_MAIL_BATCH_CONCURRENCY,
}) {
  if (!Array.isArray(items)) {
    throw new TypeError("Mail batch items must be an array.");
  }

  if (typeof worker !== "function") {
    throw new TypeError("Mail batch worker must be a function.");
  }

  if (typeof getMetadata !== "function") {
    throw new TypeError("Mail batch metadata mapper must be a function.");
  }

  if (items.length === 0) {
    return {
      totalCount: 0,

      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,

      sent: [],
      skipped: [],
      failed: [],
    };
  }

  const results = new Array(items.length);

  let nextIndex = 0;

  const workerCount = normalizeConcurrency(concurrency, items.length);

  async function runWorker() {
    while (true) {
      const index = nextIndex;

      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      const item = items[index];

      let result;

      try {
        result = await worker(item, index);

        if (!result) {
          result = {
            success: false,
            skipped: false,
            reason: "mail_batch_empty_result",
            error: "Mail worker returned no result.",
          };
        }
      } catch (error) {
        result = normalizeWorkerError(error);
      }

      const metadata = getMetadata(item, index) || {};

      results[index] = {
        ...result,
        ...metadata,
      };
    }
  }

  await Promise.all(
    Array.from(
      {
        length: workerCount,
      },
      () => runWorker(),
    ),
  );

  const sent = [];
  const skipped = [];
  const failed = [];

  for (const result of results) {
    const classification = classifyResult(result);

    if (classification === "sent") {
      sent.push(result);
      continue;
    }

    if (classification === "skipped") {
      skipped.push(result);
      continue;
    }

    failed.push(result);
  }

  return {
    totalCount: results.length,

    sentCount: sent.length,

    skippedCount: skipped.length,

    failedCount: failed.length,

    sent,
    skipped,
    failed,
  };
}
