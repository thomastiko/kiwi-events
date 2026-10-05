import {
  RESTART_REQUIRED_SECTIONS,
  SYSTEM_RESET_CONFIRMATION,
} from "./constants.js";

import { els } from "./elements.js";
import { apiRequest } from "./api.js";

export async function tryRestartIfNeeded(sectionName) {
  if (!RESTART_REQUIRED_SECTIONS.has(sectionName)) {
    return {
      attempted: false,
    };
  }

  try {
    await apiRequest("/api/admin/system/restart", {
      method: "POST",
    });

    return {
      attempted: true,
      success: true,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error.message,
    };
  }
}

function setSystemResetError(message = "") {
  if (!els.systemResetError) {
    return;
  }

  els.systemResetError.textContent = message;
  els.systemResetError.classList.toggle("hidden", !message);
}

function updateSystemResetConfirmationState() {
  if (!els.confirmSystemResetButton || !els.systemResetConfirmation) {
    return;
  }

  els.confirmSystemResetButton.disabled =
    els.systemResetConfirmation.value !== SYSTEM_RESET_CONFIRMATION;
}

function resetSystemResetDialogState() {
  if (els.systemResetConfirmation) {
    els.systemResetConfirmation.value = "";
    els.systemResetConfirmation.disabled = false;
  }

  if (els.confirmSystemResetButton) {
    els.confirmSystemResetButton.disabled = true;
    els.confirmSystemResetButton.textContent = "Kiwi Events zurücksetzen";
  }

  if (els.cancelSystemResetButton) {
    els.cancelSystemResetButton.disabled = false;
  }

  setSystemResetError("");
}

function openSystemResetDialog() {
  if (!els.systemResetDialog) {
    return;
  }

  resetSystemResetDialogState();

  els.systemResetDialog.showModal();
  els.systemResetConfirmation?.focus();
}

function closeSystemResetDialog() {
  if (!els.systemResetDialog) {
    return;
  }

  els.systemResetDialog.close();
}

async function resetSystem() {
  if (
    !els.systemResetConfirmation ||
    els.systemResetConfirmation.value !== SYSTEM_RESET_CONFIRMATION
  ) {
    return;
  }

  setSystemResetError("");

  if (els.confirmSystemResetButton) {
    els.confirmSystemResetButton.disabled = true;
    els.confirmSystemResetButton.textContent = "Wird zurückgesetzt...";
  }

  if (els.cancelSystemResetButton) {
    els.cancelSystemResetButton.disabled = true;
  }

  els.systemResetConfirmation.disabled = true;

  try {
    await apiRequest("/api/admin/system/reset", {
      method: "POST",
      body: JSON.stringify({
        confirmation: SYSTEM_RESET_CONFIRMATION,
      }),
    });

    window.location.reload();
  } catch (error) {
    setSystemResetError(
      error?.message || "Kiwi Events konnte nicht zurückgesetzt werden.",
    );

    if (els.confirmSystemResetButton) {
      els.confirmSystemResetButton.textContent = "Kiwi Events zurücksetzen";
    }

    if (els.cancelSystemResetButton) {
      els.cancelSystemResetButton.disabled = false;
    }

    els.systemResetConfirmation.disabled = false;

    updateSystemResetConfirmationState();
  }
}

export function registerSystemEventListeners() {
  els.openSystemResetDialogButton?.addEventListener(
    "click",
    openSystemResetDialog,
  );

  els.cancelSystemResetButton?.addEventListener(
    "click",
    closeSystemResetDialog,
  );

  els.systemResetConfirmation?.addEventListener("input", () => {
    setSystemResetError("");
    updateSystemResetConfirmationState();
  });

  els.systemResetConfirmation?.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      els.systemResetConfirmation.value === SYSTEM_RESET_CONFIRMATION
    ) {
      event.preventDefault();
      resetSystem();
    }
  });

  els.confirmSystemResetButton?.addEventListener("click", resetSystem);

  els.systemResetDialog?.addEventListener("close", () => {
    resetSystemResetDialogState();
  });

  els.systemResetDialog?.addEventListener("cancel", (event) => {
    if (els.cancelSystemResetButton?.disabled) {
      event.preventDefault();
    }
  });
}
