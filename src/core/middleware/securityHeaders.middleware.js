import helmet from "helmet";
import { env } from "../../config/env.js";
import { buildAllowedOrigins } from "../../config/cors.js";

function buildCspConnectSources() {
  return ["'self'", ...buildAllowedOrigins()].filter(Boolean);
}

function buildContentSecurityPolicy() {
  return {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],

      styleSrc: ["'self'"],
      styleSrcAttr: ["'none'"],

      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],

      connectSrc: buildCspConnectSources(),

      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],

      baseUri: ["'self'"],
      formAction: ["'self'"],
      manifestSrc: ["'self'"],

      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],

      upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null,
    },
  };
}

export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: buildContentSecurityPolicy(),

  crossOriginEmbedderPolicy: false,

  crossOriginOpenerPolicy: {
    policy: "same-origin",
  },

  crossOriginResourcePolicy: {
    policy: "same-origin",
  },

  referrerPolicy: {
    policy: "no-referrer",
  },

  hsts:
    env.nodeEnv === "production"
      ? {
          maxAge: 15552000,
          includeSubDomains: true,
          preload: false,
        }
      : false,

  noSniff: true,

  frameguard: {
    action: "deny",
  },
});
