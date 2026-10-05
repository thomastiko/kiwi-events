import { state } from "./js/state.js";

import { els } from "./js/elements.js";

import { persistSession, restoreSession, token } from "./js/session.js";

import {
  apiRequest,
  publicApiRequest,
  setUnauthorizedHandler,
} from "./js/api.js";

import {
  clearMessages,
  setInputValue,
  setLoading,
  setSelectValue,
  setText,
  showMessage,
} from "./js/ui.js";

import {
  clearSession,
  closeAdminUserDropdown,
  handleUnauthorized,
  normalizeAdminUserFromMePayload,
  setSession,
  showCmsView,
  showLoginView,
  showSetupView,
  toggleAdminUserDropdown,
  updateLoginState,
} from "./js/auth.js";

import {
  loadSetupStatus,
  registerSetupEventListeners,
  setSetupResult,
  updateSetupDatabasePlaceholder,
} from "./js/setup.js";

import {
  registerDatabaseEventListeners,
  saveDatabase,
  updateDatabasePlaceholder,
} from "./js/database.js";

import {
  registerSystemEventListeners,
  tryRestartIfNeeded,
} from "./js/system.js";

import {
  ensureEventRolesLoaded,
  loadEventRoles,
  registerEventRoleEventListeners,
  setEventUsersReloadHandler,
} from "./js/event-roles.js";

import {
  loadEventUsers,
  registerEventUserEventListeners,
  updateEventUserFormVisibility,
} from "./js/event-users.js";

import {
  isLockedSecretInput,
  renderAllSecretInputs,
  renderMailSecretInputs,
  renderPaymentSecretInputs,
  renderStorageSecretInputs,
  setSecretSectionEditingResolver,
} from "./js/secrets.js";

import { renderPaymentConfig } from "./js/payments.js";

import { collectStoragePatch, renderStorageConfig } from "./js/storage.js";

import { collectMailingPatch, renderMailingConfig } from "./js/mailing.js";

import {
  clearMailTemplateEditor,
  loadMailTemplates,
  registerMailTemplateEventListeners,
} from "./js/mail-templates.js";

import { collectGeneralPatch, renderGeneralConfig } from "./js/general.js";

import {
  collectTicketingPatch,
  renderTicketingConfig,
} from "./js/ticketing.js";

import {
  setFeatureEditingResolver,
  updateFeatureDependencies,
} from "./js/feature-dependencies.js";

import { removeUndefinedDeep } from "./js/utils.js";

function setBadge(stateValue) {
  if (!els.connectionBadge) {
    return;
  }
  const normalized = String(stateValue || "").toLowerCase();
  els.connectionBadge.className = "badge";
  if (normalized === "connected") {
    els.connectionBadge.classList.add("badge-success");
    els.connectionBadge.textContent = "Connected";
    return;
  }
  if (["error", "disconnected", "failed"].includes(normalized)) {
    els.connectionBadge.classList.add("badge-danger");
    els.connectionBadge.textContent = stateValue || "Error";
    return;
  }
  els.connectionBadge.classList.add("badge-neutral");
  els.connectionBadge.textContent = stateValue || "Unknown";
}

function isEditing(sectionName) {
  return (
    document.querySelector(`[data-edit-button="${sectionName}"]`)?.dataset
      .editing === "true"
  );
}
function setEditMode(sectionName, enabled) {
  document
    .querySelectorAll(`[data-edit-section="${sectionName}"] [data-editable]`)
    .forEach((input) => {
      input.disabled = !enabled || isLockedSecretInput(input);
    });
  document
    .querySelectorAll(`[data-save-button="${sectionName}"]`)
    .forEach((button) => {
      button.disabled = !enabled;
    });
  document
    .querySelectorAll(`[data-edit-button="${sectionName}"]`)
    .forEach((button) => {
      button.textContent = enabled ? "Cancel" : "Edit";
      button.dataset.editing = enabled ? "true" : "false";
      button.classList.toggle("cancel-edit", enabled);
    });
  if (sectionName === "database" && els.testDatabaseButton) {
    els.testDatabaseButton.disabled = !enabled;
  }
  updateFeatureDependencies();
}
function setAllSectionsReadonly() {
  ["general", "database", "ticketing", "mailing", "storage"].forEach(
    (sectionName) => setEditMode(sectionName, false),
  );
}
function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

function renderStatus(payload) {
  const database = payload?.data?.database || {};

  setBadge(database.state);

  if (database.provider) {
    setSelectValue(els.databaseProvider, database.provider);
  }

  updateDatabasePlaceholder();
}
function renderConfig(payload) {
  const config = payload.data?.config || payload.config || {};

  const secretStatuses =
    payload.data?.secretStatuses ??
    payload.secretStatuses ??
    state.secretStatuses ??
    {};

  state.config = config;

  state.pendingSecretRemovals.clear();
  state.secretStatuses = secretStatuses;

  setSelectValue(els.databaseProvider, config.database?.provider);

  setInputValue(els.databaseUri, "");

  renderGeneralConfig(config);
  renderTicketingConfig(config);
  renderPaymentConfig(config);
  renderMailingConfig(config);
  renderStorageConfig(config);

  setInputValue(els.databaseSwitchAdminEmail, "admin@admin");

  setInputValue(els.databaseSwitchAdminPassword, "");

  setInputValue(els.confirmation, "");

  updateDatabasePlaceholder();
  updateFeatureDependencies();
  renderAllSecretInputs();
  setAllSectionsReadonly();
}

function buildConfigUpdate({ config, secrets = {} }) {
  const cleanConfig = removeUndefinedDeep(config || {});

  const cleanSecrets = Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => value !== undefined),
  );

  return {
    config: cleanConfig,

    ...(Object.keys(cleanSecrets).length > 0
      ? {
          secrets: cleanSecrets,
        }
      : {}),
  };
}

function collectPatch(sectionName) {
  switch (sectionName) {
    case "general":
      return buildConfigUpdate(collectGeneralPatch());

    case "ticketing":
      return buildConfigUpdate(collectTicketingPatch());

    case "mailing":
      return buildConfigUpdate(collectMailingPatch());

    case "storage":
      return buildConfigUpdate(collectStoragePatch());

    default:
      return {
        config: {},
      };
  }
}

async function loginAdmin() {
  setLoading(els.adminLoginButton, true);
  try {
    const payload = await publicApiRequest("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: els.adminLoginEmail?.value.trim(),
        password: els.adminLoginPassword?.value,
      }),
    });
    const data = payload.data || {};
    if (!data.accessToken) {
      throw new Error("Login response did not include accessToken.");
    }
    setSession({ accessToken: data.accessToken, user: data.user });
    setInputValue(els.adminLoginPassword, "");
    showCmsView();
    showMessage("Login successful", "Admin session loaded.", "success");
    await loadAdminSystem();
  } catch (error) {
    clearSession();
    showLoginView();
    setText(els.adminLoginState, error.message);
    showMessage("Login failed", error.message, "error");
  } finally {
    setLoading(els.adminLoginButton, false);
  }
}
function logoutAdmin() {
  closeAdminUserDropdown();
  clearSession();
  showLoginView();
  showMessage(
    "Logged out",
    "Your admin session was removed from this browser.",
    "neutral",
  );
}
async function loadStatus() {
  const payload = await apiRequest("/api/admin/system/database/status");
  renderStatus(payload);
  return payload;
}
async function loadCurrentAdmin() {
  const payload = await apiRequest("/api/admin/auth/me");
  const user = normalizeAdminUserFromMePayload(payload);

  state.user = user;
  persistSession();
  updateLoginState();

  return user;
}
async function loadConfig() {
  const payload = await apiRequest("/api/admin/system/config");
  renderConfig(payload);
  return payload;
}
async function loadAdminSystem() {
  try {
    await loadCurrentAdmin();
    await loadConfig();
    await loadEventUsers({ silent: true });
    await loadStatus();
  } catch (error) {
    setBadge("error");
    showMessage("Loading system failed", error.message, "error");
  }
}

async function saveConfigSection(sectionName) {
  const saveButton = document.querySelector(
    `[data-save-button="${sectionName}"]`,
  );
  setLoading(saveButton, true);
  try {
    const payload = await apiRequest("/api/admin/system/config", {
      method: "PATCH",
      body: JSON.stringify(collectPatch(sectionName)),
    });
    const restart = await tryRestartIfNeeded(sectionName);
    renderConfig(payload);
    setEditMode(sectionName, false);
    showMessage(
      "Settings saved",
      restart.attempted && !restart.success
        ? "Settings were saved. Restart manually if the change does not apply immediately."
        : "Settings were saved successfully.",
      restart.attempted && !restart.success ? "warning" : "success",
    );
  } catch (error) {
    showMessage("Save failed", error.message, "error");
  } finally {
    setLoading(saveButton, false);
  }
}

function registerEventListeners() {
  els.adminLoginButton?.addEventListener("click", loginAdmin);
  els.adminLoginPassword?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loginAdmin();
    }
  });
  els.adminLogoutButton?.addEventListener("click", logoutAdmin);
  els.adminUserMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAdminUserDropdown();
  });

  document.addEventListener("click", (event) => {
    if (!els.adminUserDropdown || !els.adminUserMenuButton) {
      return;
    }

    const clickedInsideMenu =
      els.adminUserDropdown.contains(event.target) ||
      els.adminUserMenuButton.contains(event.target);

    if (!clickedInsideMenu) {
      closeAdminUserDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAdminUserDropdown();
    }
  });
  document.querySelectorAll("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.tabTarget;
      activateTab(tabName);

      if (tabName === "user-management") {
        if (!state.eventRolesLoaded) {
          loadEventRoles({ silent: true }).catch((error) => {
            showMessage("Loading roles failed", error.message, "error");
          });
        }

        if (!state.eventUsersLoaded) {
          ensureEventRolesLoaded()
            .then(() => loadEventUsers())
            .catch((error) => {
              showMessage("Loading users failed", error.message, "error");
            });
        }
      }

      if (
        tabName === "mailing" &&
        els.featureMail?.checked &&
        !state.mailTemplates.length
      ) {
        loadMailTemplates();
      }
    });
  });
  document.querySelectorAll("[data-edit-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const sectionName = button.dataset.editButton;
      const editing = button.dataset.editing === "true";
      if (editing) {
        renderConfig({ config: state.config });
      }
      setEditMode(sectionName, !editing);
    });
  });
  document.querySelectorAll("[data-save-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const sectionName = button.dataset.saveButton;
      if (sectionName === "database") {
        saveDatabase();
        return;
      }
      saveConfigSection(sectionName);
    });
  });
  els.paymentProvider?.addEventListener("change", () => {
    updateFeatureDependencies();
    renderPaymentSecretInputs();
  });

  els.mailProvider?.addEventListener("change", () => {
    updateFeatureDependencies();
    renderMailSecretInputs();
  });

  [els.storagePublicEnabled, els.storagePrivateEnabled].forEach((input) => {
    input?.addEventListener("change", () => {
      updateFeatureDependencies();
      renderStorageSecretInputs();
    });
  });

  [
    els.featureTicketing,
    els.featureDepositTickets,
    els.featureTicketQr,
    els.featureTicketPdf,
    els.featureGuestCheckout,
    els.featureDiscountCodes,
    els.customerSelfServiceCancellationEnabled,

    els.featureMail,
    els.featureMailOrderConfirmation,
    els.featureMailOrderRefunded,
    els.featureMailEventCancellation,
    els.featureMailEventReminder,
  ].forEach((input) => {
    input?.addEventListener("change", updateFeatureDependencies);
  });
}
async function bootAdminUi() {
  try {
    const setup = await loadSetupStatus();
    if (!setup.initialized) {
      showSetupView();
      updateSetupDatabasePlaceholder();
      if (els.setupInitializeButton) {
        els.setupInitializeButton.disabled = !setup.databaseConfigured;
      }
      return;
    }
    restoreSession();
    if (!token()) {
      showLoginView();
      updateLoginState();
      return;
    }
    showCmsView();
    updateLoginState();
    await loadAdminSystem();
  } catch (error) {
    showSetupView();
    setText(
      els.setupState,
      "Could not load setup status. Check if the kiwi-events API is running.",
    );
    setSetupResult({ success: false, message: error.message }, "error");
  }
}
function init() {
  setUnauthorizedHandler(handleUnauthorized);

  setSecretSectionEditingResolver(isEditing);

  setFeatureEditingResolver(isEditing);

  setEventUsersReloadHandler(() =>
    loadEventUsers({
      silent: true,
    }),
  );

  clearMessages();
  clearMailTemplateEditor();
  setAllSectionsReadonly();

  updateDatabasePlaceholder();
  updateEventUserFormVisibility();

  registerSetupEventListeners();
  registerDatabaseEventListeners();
  registerSystemEventListeners();
  registerEventRoleEventListeners();
  registerEventUserEventListeners();
  registerMailTemplateEventListeners();
  registerEventListeners();

  updateFeatureDependencies();
  bootAdminUi();
}
init();
