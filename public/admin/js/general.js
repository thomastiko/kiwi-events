import { SECRET_PATHS } from "./constants.js";
import { els } from "./elements.js";
import { setInputValue } from "./ui.js";
import { collectSecretInput } from "./secrets.js";
import { valueOrUndefined } from "./utils.js";

function updateDocumentTitle(appName) {
  document.title = `${String(appName || "Kiwi Events").trim()} Admin`;
}

export function renderGeneralConfig(config = {}) {
  const appName = config.branding?.appName;

  setInputValue(els.brandingAppName, appName);

  updateDocumentTitle(appName);
}

export function collectGeneralPatch() {
  return {
    config: {
      branding: {
        appName: valueOrUndefined(els.brandingAppName?.value),
      },
    },

    secrets: collectSecretInput(
      els.externalJwtSecret,
      SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
    ),
  };
}
