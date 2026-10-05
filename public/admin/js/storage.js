import { SECRET_PATHS } from "./constants.js";
import { els } from "./elements.js";

import { setCheckboxValue, setInputValue, setSelectValue } from "./ui.js";

import { collectSecretInput } from "./secrets.js";

import { valueOrUndefined } from "./utils.js";

export function updateStorageFields() {
  const publicEnabled = Boolean(els.storagePublicEnabled?.checked);

  const privateEnabled = Boolean(els.storagePrivateEnabled?.checked);

  els.storagePublicFields?.classList.toggle("hidden", !publicEnabled);

  els.storagePrivateFields?.classList.toggle("hidden", !privateEnabled);

  const publicOption = els.storageTicketPdfTarget?.querySelector(
    'option[value="public"]',
  );

  const privateOption = els.storageTicketPdfTarget?.querySelector(
    'option[value="private"]',
  );

  if (publicOption) {
    publicOption.disabled = !publicEnabled;
  }

  if (privateOption) {
    privateOption.disabled = !privateEnabled;
  }

  const selectedTarget = els.storageTicketPdfTarget?.value;

  if (
    (selectedTarget === "public" && !publicEnabled) ||
    (selectedTarget === "private" && !privateEnabled)
  ) {
    setSelectValue(els.storageTicketPdfTarget, "local");
  }
}

export function renderStorageConfig(config = {}) {
  const publicStorage = config.storage?.public || {};

  const privateStorage = config.storage?.private || {};

  setInputValue(els.storageLocalDir, config.storage?.local?.dir);

  setCheckboxValue(els.storagePublicEnabled, publicStorage.enabled);

  setInputValue(els.storagePublicEndpoint, publicStorage.endpoint);

  setInputValue(els.storagePublicBucket, publicStorage.bucket);

  setInputValue(els.storagePublicRegion, publicStorage.region);

  setInputValue(els.storagePublicBaseUrl, publicStorage.publicBaseUrl);

  setCheckboxValue(
    els.storagePublicForcePathStyle,
    publicStorage.forcePathStyle,
  );

  setCheckboxValue(els.storagePrivateEnabled, privateStorage.enabled);

  setInputValue(els.storagePrivateEndpoint, privateStorage.endpoint);

  setInputValue(els.storagePrivateBucket, privateStorage.bucket);

  setInputValue(els.storagePrivateRegion, privateStorage.region);

  setCheckboxValue(
    els.storagePrivateForcePathStyle,
    privateStorage.forcePathStyle,
  );

  setSelectValue(
    els.storageTicketPdfTarget,
    config.storage?.generated?.ticketPdfTarget || "local",
  );
}

export function collectStoragePatch() {
  const publicEnabled = Boolean(els.storagePublicEnabled?.checked);

  const privateEnabled = Boolean(els.storagePrivateEnabled?.checked);

  const secrets = {
    ...collectSecretInput(
      els.storagePublicAccessKeyId,
      SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID,
    ),

    ...collectSecretInput(
      els.storagePublicSecretAccessKey,
      SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY,
    ),

    ...collectSecretInput(
      els.storagePrivateAccessKeyId,
      SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID,
    ),

    ...collectSecretInput(
      els.storagePrivateSecretAccessKey,
      SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY,
    ),
  };

  return {
    config: {
      storage: {
        local: {
          dir: valueOrUndefined(els.storageLocalDir?.value),
        },

        public: {
          enabled: publicEnabled,

          endpoint: valueOrUndefined(els.storagePublicEndpoint?.value),

          bucket: valueOrUndefined(els.storagePublicBucket?.value),

          region: valueOrUndefined(els.storagePublicRegion?.value),

          publicBaseUrl: valueOrUndefined(els.storagePublicBaseUrl?.value),

          forcePathStyle: Boolean(els.storagePublicForcePathStyle?.checked),
        },

        private: {
          enabled: privateEnabled,

          endpoint: valueOrUndefined(els.storagePrivateEndpoint?.value),

          bucket: valueOrUndefined(els.storagePrivateBucket?.value),

          region: valueOrUndefined(els.storagePrivateRegion?.value),

          forcePathStyle: Boolean(els.storagePrivateForcePathStyle?.checked),
        },

        generated: {
          ticketPdfTarget: els.storageTicketPdfTarget?.value || "local",
        },
      },
    },

    secrets,
  };
}
