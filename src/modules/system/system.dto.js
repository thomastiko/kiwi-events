function cleanString(value) {
  return String(value ?? "").trim();
}

function toMigrationSummaryDto(migrations) {
  if (!migrations || typeof migrations !== "object") {
    return null;
  }

  if (migrations.skipped === true) {
    return {
      skipped: true,
    };
  }

  return {
    skipped: false,

    batchNo:
      migrations.batchNo === null || migrations.batchNo === undefined
        ? null
        : Number(migrations.batchNo),

    appliedCount: Array.isArray(migrations.migrations)
      ? migrations.migrations.length
      : 0,
  };
}

export function toSystemDatabaseStatusDto(database) {
  if (!database || typeof database !== "object") {
    return {
      provider: "",
      configured: false,
      source: "none",
      providerSource: "none",
      managedByEnvironment: false,
      state: "not_configured",
    };
  }

  return {
    provider: cleanString(database.provider),

    configured: database.configured === true,

    source: cleanString(database.source) || "none",

    providerSource: cleanString(database.providerSource) || "none",

    managedByEnvironment: database.managedByEnvironment === true,

    state: cleanString(database.state),
  };
}

export function toMaintenanceStateDto(maintenance) {
  return {
    enabled: maintenance?.enabled === true,

    reason: maintenance?.enabled ? cleanString(maintenance.reason) : null,
  };
}

export function toDatabaseTestResultDto(result) {
  return {
    provider: cleanString(result?.provider),
  };
}

export function toDatabaseSwitchResultDto(result) {
  return {
    provider: cleanString(result?.provider),

    migrations: toMigrationSummaryDto(result?.data?.migrations),

    admin: {
      created: result?.data?.admin?.created === true,

      passwordUpdated: result?.data?.admin?.passwordUpdated === true,

      email: cleanString(result?.data?.admin?.email),
    },

    restart: {
      scheduled: true,
      reason: "database_switch",
      mode: "graceful-process-exit",
      requiresProcessManager: true,
    },
  };
}

export function toManualRestartDto() {
  return {
    restart: {
      scheduled: true,
      reason: "manual_restart",
      mode: "graceful-process-exit",
      requiresProcessManager: true,
    },
  };
}
export function toSystemResetDto() {
  return {
    reset: {
      completed: true,
    },

    restart: {
      scheduled: true,
      reason: "system_reset",
      mode: "graceful-process-exit",
      requiresProcessManager: true,
    },
  };
}
