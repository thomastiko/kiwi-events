import { DATABASE_EXAMPLES } from "./constants.js";
import { els } from "./elements.js";
import { publicApiRequest } from "./api.js";
import { setInputValue, setLoading, setText } from "./ui.js";
import { showLoginView } from "./auth.js";

export function updateSetupDatabasePlaceholder() {
  const provider = els.setupDatabaseProvider?.value || "mongodb";
  const example = DATABASE_EXAMPLES[provider] || DATABASE_EXAMPLES.mongodb;

  if (els.setupDatabaseUri) {
    els.setupDatabaseUri.removeAttribute("placeholder");
  }

  setText(els.setupDatabaseUriHint, example.hint, "");
  setText(els.setupDatabaseProviderHint, example.setupHint, "");

  if (els.setupInitializeButton) {
    els.setupInitializeButton.disabled = true;
  }
}

export async function loadSetupStatus() {
  const payload = await publicApiRequest("/api/setup/status");
  const setup = payload.data || payload.setup || payload;

  setText(
    els.setupState,
    setup.initialized
      ? "kiwi-events is initialized."
      : "kiwi-events setup is required.",
  );

  return setup;
}

export function setSetupResult(payload, type = "neutral") {
  if (!els.setupDatabaseResult) {
    return;
  }

  els.setupDatabaseResult.className = `info-box ${
    type === "success" ? "success-box" : type === "error" ? "error-box" : ""
  }`;

  els.setupDatabaseResult.innerHTML = `
    <h3>${payload.success ? "Success" : "Error"}</h3>
    <p>${payload.message || JSON.stringify(payload)}</p>
  `;
}

async function testAndSaveSetupDatabase() {
  const provider = els.setupDatabaseProvider?.value;
  const uri = String(els.setupDatabaseUri?.value || "").trim();

  if (!uri) {
    setSetupResult(
      {
        success: false,
        message: "Please enter a database URI before continuing.",
      },
      "error",
    );
    return;
  }

  setLoading(els.setupSaveDatabaseButton, true);

  try {
    const testPayload = await publicApiRequest("/api/setup/database/test", {
      method: "POST",
      body: JSON.stringify({
        provider,
        uri,
      }),
    });

    if (!testPayload.success) {
      setSetupResult(testPayload, "error");

      if (els.setupInitializeButton) {
        els.setupInitializeButton.disabled = true;
      }

      return;
    }

    const savePayload = await publicApiRequest("/api/setup/database/save", {
      method: "POST",
      body: JSON.stringify({
        provider,
        uri,
      }),
    });

    setSetupResult(
      {
        success: true,
        message:
          savePayload.message ||
          "Database connection tested and saved successfully.",
      },
      "success",
    );

    const setup = await loadSetupStatus();

    if (els.setupInitializeButton) {
      els.setupInitializeButton.disabled = !setup.databaseConfigured;
    }
  } catch (error) {
    setSetupResult(
      {
        success: false,
        message: error.message,
      },
      "error",
    );

    if (els.setupInitializeButton) {
      els.setupInitializeButton.disabled = true;
    }
  } finally {
    setLoading(els.setupSaveDatabaseButton, false);
  }
}

async function initializeSetup() {
  const password = String(els.setupAdminPassword?.value || "");

  if (!password.trim()) {
    setSetupResult(
      {
        success: false,
        message: "Please choose an initial admin password.",
      },
      "error",
    );
    return;
  }

  const externalJwtSecret = String(
    els.setupExternalJwtSecret?.value || "",
  ).trim();

  if (!externalJwtSecret) {
    setSetupResult(
      {
        success: false,
        message: "Please choose an external JWT secret.",
      },
      "error",
    );
    return;
  }

  if (externalJwtSecret.length < 32) {
    setSetupResult(
      {
        success: false,
        message: "External JWT secret must be at least 32 characters long.",
      },
      "error",
    );
    return;
  }

  setLoading(els.setupInitializeButton, true);

  try {
    const payload = await publicApiRequest("/api/setup/initialize", {
      method: "POST",
      body: JSON.stringify({
        setupAdmin: {
          email: els.setupAdminEmail?.value?.trim() || "admin@admin",
          password,
        },
        auth: {
          externalJwtSecret,
        },
      }),
    });

    setSetupResult(payload, "success");

    showLoginView();

    setInputValue(
      els.adminLoginEmail,
      els.setupAdminEmail?.value?.trim() || "admin@admin",
    );

    setInputValue(els.adminLoginPassword, "");

    setText(
      els.adminLoginState,
      "Setup completed. Log in with admin@admin and the password you chose.",
    );
  } catch (error) {
    setSetupResult(
      {
        success: false,
        message: error.message,
      },
      "error",
    );
  } finally {
    setLoading(els.setupInitializeButton, false);
  }
}

export function registerSetupEventListeners() {
  els.setupDatabaseProvider?.addEventListener(
    "change",
    updateSetupDatabasePlaceholder,
  );

  els.setupDatabaseUri?.addEventListener("input", () => {
    if (els.setupInitializeButton) {
      els.setupInitializeButton.disabled = true;
    }
  });

  els.setupSaveDatabaseButton?.addEventListener(
    "click",
    testAndSaveSetupDatabase,
  );

  els.setupInitializeButton?.addEventListener("click", initializeSetup);
}
