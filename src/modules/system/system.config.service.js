import {
  loadKiwiEventsConfig,
  updateKiwiEventsConfig,
} from "../../config/kiwi-events/kiwi-events.config.store.js";

import { deepMerge } from "../../config/kiwi-events/kiwi-events.config.utils.js";

import {
  assertKiwiEventsSystemConfigSecretPath,
  KIWI_EVENTS_SECRET_PATHS,
  KIWI_EVENTS_SECRET_PATH_VALUES,
} from "../../config/kiwi-events/kiwi-events.secret.constants.js";

import {
  getKiwiEventsSecretStatuses,
  KIWI_EVENTS_SECRET_SOURCES,
  loadKiwiEventsSecrets,
  updateKiwiEventsSecrets,
} from "../../config/kiwi-events/kiwi-events.secret.store.js";

import { AppError } from "../../core/errors/AppError.js";

function buildSystemConfigSnapshot(
  config,
  secretStatuses = getKiwiEventsSecretStatuses(),
) {
  return {
    config,
    secretStatuses,
  };
}

function normalizeConfigString(value) {
  return String(value ?? "").trim();
}

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(normalizeConfigString(value));

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function collectStorageValidationErrors(config, secretStatuses) {
  const errors = [];

  const definitions = [
    {
      key: "public",
      config: config.storage?.public,
      accessKeyPath: KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID,
      secretAccessKeyPath:
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY,
      requiresPublicBaseUrl: true,
    },
    {
      key: "private",
      config: config.storage?.private,
      accessKeyPath: KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID,
      secretAccessKeyPath:
        KIWI_EVENTS_SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY,
      requiresPublicBaseUrl: false,
    },
  ];

  for (const definition of definitions) {
    if (definition.config?.enabled !== true) {
      continue;
    }

    if (!normalizeConfigString(definition.config.bucket)) {
      errors.push({
        path: `config.storage.${definition.key}.bucket`,
        message: `Bucket is required when ${definition.key} storage is enabled.`,
      });
    }

    const endpoint = normalizeConfigString(definition.config.endpoint);

    if (endpoint && !isAbsoluteHttpUrl(endpoint)) {
      errors.push({
        path: `config.storage.${definition.key}.endpoint`,
        message: "Endpoint must be an absolute HTTP(S) URL.",
      });
    }

    if (definition.requiresPublicBaseUrl) {
      const publicBaseUrl = normalizeConfigString(
        definition.config.publicBaseUrl,
      );

      if (!publicBaseUrl) {
        errors.push({
          path: "config.storage.public.publicBaseUrl",
          message:
            "Public base URL is required when public storage is enabled.",
        });
      } else if (!isAbsoluteHttpUrl(publicBaseUrl)) {
        errors.push({
          path: "config.storage.public.publicBaseUrl",
          message: "Public base URL must be an absolute HTTP(S) URL.",
        });
      }
    }

    if (!secretStatuses[definition.accessKeyPath]?.configured) {
      errors.push({
        path: `secrets["${definition.accessKeyPath}"]`,
        message: `Access key ID is required when ${definition.key} storage is enabled.`,
      });
    }

    if (!secretStatuses[definition.secretAccessKeyPath]?.configured) {
      errors.push({
        path: `secrets["${definition.secretAccessKeyPath}"]`,
        message: `Secret access key is required when ${definition.key} storage is enabled.`,
      });
    }
  }

  const ticketPdfTarget =
    normalizeConfigString(config.storage?.generated?.ticketPdfTarget) ||
    "local";

  if (
    ticketPdfTarget === "public" &&
    config.storage?.public?.enabled !== true
  ) {
    errors.push({
      path: "config.storage.generated.ticketPdfTarget",
      message:
        "Public storage must be enabled before it can be selected for generated ticket PDFs.",
    });
  }

  if (
    ticketPdfTarget === "private" &&
    config.storage?.private?.enabled !== true
  ) {
    errors.push({
      path: "config.storage.generated.ticketPdfTarget",
      message:
        "Private storage must be enabled before it can be selected for generated ticket PDFs.",
    });
  }

  return errors;
}

function assertValidSystemConfig(config, secretStatuses) {
  const fields = collectStorageValidationErrors(config, secretStatuses);

  if (config.features?.ticketQr === true) {
    const ticketQrSecretStatus =
      secretStatuses[KIWI_EVENTS_SECRET_PATHS.SECURITY_TICKET_QR_SECRET];

    if (!ticketQrSecretStatus?.configured) {
      fields.push({
        path: 'secrets["security.ticketQrSecret"]',
        message:
          "A Ticket QR secret is required when features.ticketQr is enabled.",
      });
    }
  }

  if (
    config.features?.discountCodes === true &&
    config.features?.ticketing !== true
  ) {
    fields.push({
      path: "config.features.discountCodes",
      message: "Discount codes require ticketing to be enabled.",
    });
  }

  if (fields.length === 0) {
    return;
  }

  throw AppError.badRequest("System configuration is invalid.", {
    code: "SYSTEM_CONFIG_INVALID",
    title: "Invalid system configuration",
    action: "Fix the highlighted configuration fields and try again.",
    fields,
  });
}

function assertSecretIsNotEnvironmentManaged(secretPath, currentStatus) {
  if (currentStatus?.source !== KIWI_EVENTS_SECRET_SOURCES.ENVIRONMENT) {
    return;
  }

  throw AppError.conflict(
    `Secret "${secretPath}" is managed by an environment variable.`,
    {
      code: "SECRET_MANAGED_BY_ENVIRONMENT",
      title: "Secret managed by environment",
      action:
        "Change or remove the corresponding environment variable and restart Kiwi Events.",
      fields: [
        {
          path: `secrets["${secretPath}"]`,
          message:
            "This secret cannot be changed through the API because an environment variable currently controls it.",
        },
      ],
    },
  );
}

function buildSecretMutationPlan(secretsPatch, currentStatuses) {
  const set = {};
  const remove = [];

  const candidateStatuses = structuredClone(currentStatuses);

  for (const [rawSecretPath, value] of Object.entries(secretsPatch || {})) {
    const secretPath = assertKiwiEventsSystemConfigSecretPath(rawSecretPath);

    assertSecretIsNotEnvironmentManaged(
      secretPath,
      currentStatuses[secretPath],
    );

    if (value === null) {
      remove.push(secretPath);

      candidateStatuses[secretPath] = {
        configured: false,
        source: KIWI_EVENTS_SECRET_SOURCES.NONE,
        deletable: false,
      };

      continue;
    }

    set[secretPath] = value;

    candidateStatuses[secretPath] = {
      configured: true,
      source: KIWI_EVENTS_SECRET_SOURCES.ENCRYPTED_STORE,
      deletable: true,
    };
  }

  return {
    set,
    remove,
    candidateStatuses,
    hasChanges: Object.keys(set).length > 0 || remove.length > 0,
  };
}

function restoreStoredSecrets(previousSecrets) {
  const pathsToRemove = KIWI_EVENTS_SECRET_PATH_VALUES.filter(
    (secretPath) => !Object.hasOwn(previousSecrets, secretPath),
  );

  updateKiwiEventsSecrets({
    set: previousSecrets,
    remove: pathsToRemove,
  });
}

export function getSystemConfigService() {
  const config = loadKiwiEventsConfig();

  return buildSystemConfigSnapshot(config);
}

export function updateSystemConfigService({
  config: configPatch = {},
  secrets: secretsPatch = {},
} = {}) {
  const safeConfigPatch = structuredClone(configPatch);

  const safeSecretsPatch = structuredClone(secretsPatch);

  const currentConfig = loadKiwiEventsConfig();

  const currentSecretStatuses = getKiwiEventsSecretStatuses();

  const secretMutationPlan = buildSecretMutationPlan(
    safeSecretsPatch,
    currentSecretStatuses,
  );

  const candidateConfig = deepMerge(currentConfig, safeConfigPatch);

  assertValidSystemConfig(
    candidateConfig,
    secretMutationPlan.candidateStatuses,
  );

  const previousStoredSecrets = secretMutationPlan.hasChanges
    ? loadKiwiEventsSecrets()
    : null;

  if (secretMutationPlan.hasChanges) {
    updateKiwiEventsSecrets({
      set: secretMutationPlan.set,
      remove: secretMutationPlan.remove,
    });
  }

  let nextConfig;

  try {
    nextConfig =
      Object.keys(safeConfigPatch).length > 0
        ? updateKiwiEventsConfig(safeConfigPatch)
        : currentConfig;
  } catch (error) {
    if (!secretMutationPlan.hasChanges) {
      throw error;
    }

    try {
      restoreStoredSecrets(previousStoredSecrets);
    } catch (rollbackError) {
      throw AppError.internal(
        "System configuration could not be saved or safely rolled back.",
        {
          code: "SYSTEM_CONFIG_ROLLBACK_FAILED",
          cause: new AggregateError(
            [error, rollbackError],
            "Config update and secret rollback both failed.",
          ),
        },
      );
    }

    throw error;
  }

  return {
    success: true,
    message: "Configuration saved.",
    data: buildSystemConfigSnapshot(nextConfig),
  };
}
