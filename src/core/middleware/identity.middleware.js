import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../errors/AppError.js";

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
}

function getAuthProvider() {
  return String(env.auth?.provider || "local")
    .trim()
    .toLowerCase();
}

function getLocalJwtSecret() {
  return env.auth?.localJwtSecret || "";
}

function getExternalJwtSecret() {
  return env.auth?.externalJwtSecret || "";
}

function getJwtVerificationCandidates() {
  const provider = getAuthProvider();

  if (provider === "external-jwt") {
    return [
      {
        verifiedProvider: "external-jwt",
        secret: getExternalJwtSecret(),
      },
    ];
  }

  if (provider === "hybrid") {
    return [
      {
        verifiedProvider: "local",
        secret: getLocalJwtSecret(),
      },
      {
        verifiedProvider: "external-jwt",
        secret: getExternalJwtSecret(),
      },
    ];
  }

  return [
    {
      verifiedProvider: "local",
      secret: getLocalJwtSecret(),
    },
  ];
}

function verifyJwtToken(token) {
  const candidates = getJwtVerificationCandidates().filter(
    (candidate) => candidate.secret,
  );

  if (candidates.length === 0) {
    throw new Error("JWT verification secret is missing");
  }

  let lastError = null;

  for (const candidate of candidates) {
    try {
      const payload = jwt.verify(token, candidate.secret);

      return {
        payload,
        verifiedProvider: candidate.verifiedProvider,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("JWT verification failed");
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanLower(value) {
  return cleanString(value).toLowerCase();
}

function normalizeRoles(payload = {}) {
  if (Array.isArray(payload.roles)) {
    return payload.roles
      .map(String)
      .map((role) => role.trim())
      .filter(Boolean);
  }

  if (payload.role) {
    return [String(payload.role).trim()].filter(Boolean);
  }

  return [];
}

function getExplicitLocalEventUserId(payload = {}) {
  return cleanString(payload.eventUserId) || null;
}

function getExplicitExternalProvider(payload = {}) {
  return cleanLower(payload.externalProvider) || null;
}

function getExplicitExternalUserId(payload = {}) {
  return cleanString(payload.externalUserId) || null;
}

function getExplicitTokenType(payload = {}) {
  return cleanString(payload.tokenType) || null;
}

function buildIdentityFromPayload(payload = {}, verifiedProvider = "local") {
  const roles = normalizeRoles(payload);
  const role = payload.role ? cleanString(payload.role) : roles[0] || null;
  const tokenType = getExplicitTokenType(payload);
  const isHostService = tokenType === "host-service";

  const hostServiceId =
    verifiedProvider === "external-jwt" && isHostService
      ? cleanString(payload.sub) || null
      : null;
  const eventUserId =
    verifiedProvider === "local" ? getExplicitLocalEventUserId(payload) : null;

  const externalProvider =
    verifiedProvider === "external-jwt"
      ? getExplicitExternalProvider(payload)
      : null;

  const externalUserId =
    verifiedProvider === "external-jwt"
      ? getExplicitExternalUserId(payload)
      : null;

  return {
    eventUserId,

    externalProvider,
    externalUserId,

    email: payload.email ? cleanLower(payload.email) : null,

    role,
    roles,
    tokenType,
    hostServiceId,

    authProvider: verifiedProvider,
    verifiedProvider,

    isSetupAdmin: Boolean(payload.isSetupAdmin),
    setupMode: Boolean(payload.setupMode),
    isHostService,

    rawClaims: payload,
  };
}

function isValidIdentity(identity) {
  if (!identity) {
    return false;
  }

  if (identity.verifiedProvider === "local") {
    return Boolean(identity.eventUserId);
  }

  if (identity.verifiedProvider === "external-jwt") {
    if (identity.isHostService) {
      return Boolean(identity.externalProvider && identity.hostServiceId);
    }

    return Boolean(identity.externalProvider && identity.externalUserId);
  }

  return false;
}

function invalidTokenError() {
  return AppError.unauthorized("Authentication token is invalid.", {
    code: "AUTH_TOKEN_INVALID",
    title: "Invalid authentication token",
    action: "Log in again and retry the request.",
  });
}

export const optionalIdentity = (req, _res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      req.identity = null;
      return next();
    }

    const { payload, verifiedProvider } = verifyJwtToken(token);
    const identity = buildIdentityFromPayload(payload, verifiedProvider);

    req.identity = isValidIdentity(identity) ? identity : null;

    return next();
  } catch (_error) {
    req.identity = null;
    return next();
  }
};

export const requireIdentity = (req, _res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return next(
        AppError.unauthorized("Authentication token is required.", {
          code: "AUTH_TOKEN_REQUIRED",
          title: "Authentication required",
          action: "Send a valid Bearer token with the request.",
        }),
      );
    }

    const { payload, verifiedProvider } = verifyJwtToken(token);
    const identity = buildIdentityFromPayload(payload, verifiedProvider);

    if (!isValidIdentity(identity)) {
      return next(invalidTokenError());
    }

    req.identity = identity;
    return next();
  } catch (_error) {
    return next(invalidTokenError());
  }
};
export const requireHostServiceIdentity = (req, _res, next) => {
  const identity = req.identity;

  if (
    !identity?.isHostService ||
    identity.verifiedProvider !== "external-jwt" ||
    !identity.externalProvider ||
    !identity.hostServiceId
  ) {
    return next(
      AppError.forbidden("Host service identity is required.", {
        code: "HOST_SERVICE_IDENTITY_REQUIRED",
        title: "Host service identity required",
        action: "Send a valid host-service Bearer token.",
      }),
    );
  }

  return next();
};
