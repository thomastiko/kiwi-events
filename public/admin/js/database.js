import { DATABASE_EXAMPLES } from "./constants.js";
import { els } from "./elements.js";
import { apiRequest } from "./api.js";
import { setInputValue, setLoading, setText, showMessage } from "./ui.js";
import { clearSession, showLoginView } from "./auth.js";

export function updateDatabasePlaceholder() {
  const provider = els.databaseProvider?.value || "mongodb";
  const example = DATABASE_EXAMPLES[provider] || DATABASE_EXAMPLES.mongodb;

  if (els.databaseUri) {
    els.databaseUri.removeAttribute("placeholder");
  }

  setText(els.databaseUriHint, example.hint, "");
  setText(els.databaseProviderHint, example.setupHint, "");
}

async function testDatabase() {
  setLoading(els.testDatabaseButton, true);

  try {
    const payload = await apiRequest("/api/admin/system/database/test", {
      method: "POST",
      body: JSON.stringify({
        provider: els.databaseProvider?.value,
        uri: els.databaseUri?.value.trim(),
      }),
    });

    showMessage(
      payload.success ? "Connection works" : "Connection failed",
      payload.message || "Database test finished.",
      payload.success ? "success" : "error",
    );
  } catch (error) {
    showMessage("Connection failed", error.message, "error");
  } finally {
    setLoading(els.testDatabaseButton, false);
  }
}

export async function saveDatabase() {
  const saveButton = document.querySelector('[data-save-button="database"]');

  const password = String(els.databaseSwitchAdminPassword?.value || "");

  if (!password.trim()) {
    showMessage(
      "Database switch blocked",
      "Please choose a password for the new admin@admin account.",
      "error",
    );
    return;
  }

  if (els.confirmation?.value.trim() !== "SWITCH DATABASE") {
    showMessage(
      "Database switch blocked",
      'Type "SWITCH DATABASE" before switching.',
      "error",
    );
    return;
  }

  const confirmed = window.confirm(
    "This switches kiwi-events to the selected database without migrating data. You will be logged out. Continue?",
  );

  if (!confirmed) {
    return;
  }

  setLoading(saveButton, true);

  try {
    await apiRequest("/api/admin/system/database/switch", {
      method: "POST",
      body: JSON.stringify({
        provider: els.databaseProvider?.value,
        uri: els.databaseUri?.value.trim(),
        confirmation: els.confirmation?.value.trim(),
        setupAdmin: {
          email: els.databaseSwitchAdminEmail?.value?.trim() || "admin@admin",
          password,
        },
      }),
    });

    clearSession();

    setInputValue(els.adminLoginEmail, "admin@admin");

    setInputValue(els.adminLoginPassword, "");

    setText(
      els.adminLoginState,
      "Database switched. Log in with the new admin password.",
    );

    showLoginView();
  } catch (error) {
    showMessage("Database switch failed", error.message, "error");
  } finally {
    setLoading(saveButton, false);
  }
}

export function registerDatabaseEventListeners() {
  els.testDatabaseButton?.addEventListener("click", testDatabase);

  els.databaseProvider?.addEventListener("change", updateDatabasePlaceholder);
}
