import morgan from "morgan";
import { env } from "../../config/env.js";

function redactSensitiveUrl(originalUrl = "") {
  try {
    const url = new URL(originalUrl, "http://kiwi-events.local");

    for (const key of ["accessToken", "token", "authorization", "password"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return String(originalUrl).replace(
      /(accessToken|token|authorization|password)=([^&]+)/gi,
      "$1=[redacted]",
    );
  }
}

morgan.token("safe-url", (req) => redactSensitiveUrl(req.originalUrl));

export const requestLoggingMiddleware =
  env.nodeEnv === "production"
    ? morgan(
        ":remote-addr - :method :safe-url :status :res[content-length] - :response-time ms",
      )
    : morgan(":method :safe-url :status :response-time ms");
