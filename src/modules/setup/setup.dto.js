function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => cleanString(entry)).filter(Boolean);
}

function getAppliedMigrationCount(migrations) {
  if (!migrations || typeof migrations !== "object") {
    return 0;
  }

  if (Array.isArray(migrations.migrations)) {
    return migrations.migrations.length;
  }

  if (Array.isArray(migrations.executed)) {
    return migrations.executed.length;
  }

  return 0;
}

export function toSetupStatusDto(status) {
  return {
    initialized: status?.initialized === true,

    databaseConfigured: status?.databaseConfigured === true,

    databaseProvider: cleanString(status?.databaseProvider),

    appName: cleanString(status?.appName) || "Kiwi Events",
  };
}

export function toSetupConfigDto(config) {
  return {
    setup: toSetupStatusDto(config?.setup),

    database: {
      provider: cleanString(config?.database?.provider),

      configured: config?.database?.configured === true,

      supportedProviders: normalizeStringArray(
        config?.database?.supportedProviders,
      ),
    },

    server: {
      appUrl: cleanString(config?.server?.appUrl),

      adminFrontendUrl: cleanString(config?.server?.adminFrontendUrl),

      publicFrontendUrl: cleanString(config?.server?.publicFrontendUrl),
    },

    branding: {
      appName: cleanString(config?.branding?.appName) || "Kiwi Events",
    },

    auth: {
      externalJwtSecretConfigured:
        config?.auth?.externalJwtSecretConfigured === true,
    },

    security: {
      ticketQrSecretConfigured:
        config?.security?.ticketQrSecretConfigured === true,
    },
  };
}

export function toSetupDatabaseTestDto(data) {
  return {
    provider: cleanString(data?.provider),
  };
}

export function toSetupDatabaseSaveDto(data) {
  return {
    provider: cleanString(data?.provider),

    configured: data?.configured === true,
  };
}

export function toSetupInitializationDto(data) {
  return {
    initialized: data?.initialized === true,

    initializedAt: cleanString(data?.initializedAt),

    databaseProvider: cleanString(data?.databaseProvider),

    admin: {
      created: data?.admin?.created === true,

      email: cleanString(data?.admin?.email),
    },

    migrations: {
      skipped: data?.migrations?.skipped === true,

      appliedCount: getAppliedMigrationCount(data?.migrations),
    },
  };
}
