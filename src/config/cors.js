import { env } from "./env.js";

export function normalizeOrigin(origin) {
  const candidate = String(origin || "").trim();

  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return candidate.replace(/\/$/, "");
  }
}
export function isSameHostOrigin(origin, host) {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedHost = String(host || "")
    .trim()
    .toLowerCase();

  if (!normalizedOrigin || !normalizedHost) {
    return false;
  }

  try {
    const originUrl = new URL(normalizedOrigin);

    if (!["http:", "https:"].includes(originUrl.protocol)) {
      return false;
    }

    return originUrl.host.toLowerCase() === normalizedHost;
  } catch {
    return false;
  }
}
export function buildAllowedOrigins() {
  const configuredOrigins = env.corsOrigins
    .map(normalizeOrigin)
    .filter(Boolean);

  const adminFrontendOrigin = normalizeOrigin(env.adminFrontendUrl);
  const publicFrontendOrigin = normalizeOrigin(env.frontendUrl);

  return [...configuredOrigins, adminFrontendOrigin, publicFrontendOrigin]
    .map(normalizeOrigin)
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index);
}
