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

export function buildAllowedOrigins() {
  const configuredOrigins = env.corsOrigins
    .map(normalizeOrigin)
    .filter(Boolean);

  const appUrl = normalizeOrigin(env.appUrl);
  const adminFrontendUrl = normalizeOrigin(env.adminFrontendUrl);
  const publicFrontendUrl = normalizeOrigin(env.frontendUrl);

  const localServerOrigins = [
    `http://localhost:${env.port}`,
    `http://127.0.0.1:${env.port}`,
  ];

  return [
    ...configuredOrigins,
    appUrl,
    adminFrontendUrl,
    publicFrontendUrl,
    ...localServerOrigins,
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index);
}
