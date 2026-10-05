import { isFeatureEnabled } from "../../config/features.js";
import { AppError } from "../errors/AppError.js";

/**
 * Requires a feature to be enabled before a route can be accessed.
 *
 * @param {string} featureName
 * @returns {import("express").RequestHandler}
 */
export function requireFeature(featureName) {
  return (_req, _res, next) => {
    if (!isFeatureEnabled(featureName)) {
      return next(
        AppError.forbidden(`Feature "${featureName}" is not enabled.`, {
          code: "FEATURE_DISABLED",
          title: "Feature disabled",
          action:
            "Enable this feature in the kiwi-events settings before using this endpoint.",
          details: {
            featureName,
          },
        }),
      );
    }

    return next();
  };
}

/**
 * Runs a function only when a feature is enabled.
 *
 * This helper is useful for service-level optional behavior such as sending
 * emails, generating PDFs or starting background jobs.
 *
 * @param {string} featureName
 * @param {Function} callback
 * @returns {Promise<unknown|null>}
 */
export async function runIfFeatureEnabled(featureName, callback) {
  if (!isFeatureEnabled(featureName)) {
    return null;
  }

  return callback();
}

export { isFeatureEnabled };
