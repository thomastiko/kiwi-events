import { AppError } from "../errors/AppError.js";

function defaultKeyGenerator(req) {
  return req.ip || req.headers["x-forwarded-for"] || "unknown";
}

function cleanupStore(store, now) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function createRateLimit({
  windowMs,
  max,
  keyPrefix,
  keyGenerator = defaultKeyGenerator,
  code = "RATE_LIMIT_EXCEEDED",
  title = "Too many requests",
  message = "Too many requests. Please try again later.",
  action = "Wait a moment and try again.",
}) {
  const store = new Map();
  let lastCleanupAt = 0;

  return (req, res, next) => {
    const now = Date.now();

    if (now - lastCleanupAt > windowMs) {
      cleanupStore(store, now);
      lastCleanupAt = now;
    }

    const key = `${keyPrefix}:${keyGenerator(req)}`;
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      return next();
    }

    current.count += 1;

    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);

    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, max - current.count)),
    );
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(current.resetAt / 1000)),
    );

    if (current.count > max) {
      return next(
        new AppError({
          code,
          title,
          message,
          statusCode: 429,
          expose: true,
          action,
          details: {
            retryAfterSeconds,
          },
        }),
      );
    }

    return next();
  };
}
