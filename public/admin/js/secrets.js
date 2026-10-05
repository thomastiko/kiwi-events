import { state } from "./state.js";
import { SECRET_PATHS } from "./constants.js";
import { els } from "./elements.js";

let sectionEditingResolver = null;

export function setSecretSectionEditingResolver(resolver) {
  sectionEditingResolver = typeof resolver === "function" ? resolver : null;
}

function isSectionEditing(sectionName) {
  return sectionEditingResolver ? sectionEditingResolver(sectionName) : false;
}

function secretValueOrUndefined(value) {
  const rawValue = String(value ?? "");

  return rawValue.trim() ? rawValue : undefined;
}

function getSecretStatus(secretPath) {
  return (
    state.secretStatuses[secretPath] || {
      configured: false,
      source: "none",
      deletable: false,
    }
  );
}

function getSecretRemovalButton(input) {
  if (!input?.id) {
    return null;
  }

  return document.querySelector(`[data-secret-remove-for="${input.id}"]`);
}

function createSecretRemovalButton(input) {
  if (!input?.id) {
    return null;
  }

  const existingButton = getSecretRemovalButton(input);

  if (existingButton) {
    return existingButton;
  }

  const field = input.closest(".field");

  if (!field) {
    return null;
  }

  const button = document.createElement("button");

  button.type = "button";

  button.className = "secondary danger-button secret-remove-button hidden";

  button.dataset.editable = "";
  button.dataset.secretRemoveFor = input.id;

  field.insertAdjacentElement("afterend", button);

  return button;
}

function hideSecretRemovalButton(input) {
  const button = getSecretRemovalButton(input);

  if (!button) {
    return;
  }

  button.classList.add("hidden");
  button.onclick = null;
}

function renderSecretRemovalButton(input, secretPath, label, status) {
  const button = createSecretRemovalButton(input);

  if (!button) {
    return;
  }

  const canRemove =
    status.configured === true &&
    status.deletable === true &&
    status.source === "encrypted_store";

  if (!canRemove) {
    state.pendingSecretRemovals.delete(secretPath);

    button.classList.add("hidden");
    button.onclick = null;

    return;
  }

  const removalRequested = state.pendingSecretRemovals.has(secretPath);

  button.classList.remove("hidden");

  button.classList.toggle("danger-button", !removalRequested);

  button.textContent = removalRequested
    ? "Undo secret removal"
    : "Remove configured secret";

  const sectionName = input.closest("[data-edit-section]")?.dataset
    ?.editSection;

  button.disabled = !sectionName || !isSectionEditing(sectionName);

  button.onclick = () => {
    if (state.pendingSecretRemovals.has(secretPath)) {
      state.pendingSecretRemovals.delete(secretPath);
    } else {
      const confirmed = window.confirm(
        `Remove ${label}? The secret will be deleted when you save this section.`,
      );

      if (!confirmed) {
        return;
      }

      state.pendingSecretRemovals.add(secretPath);

      input.value = "";
    }

    renderSecretInputStatus(input, secretPath, label);
  };
}

export function isLockedSecretInput(input) {
  const secretPath = input?.dataset?.secretPath;

  return (
    input?.dataset?.secretSource === "environment" ||
    Boolean(secretPath && state.pendingSecretRemovals.has(secretPath))
  );
}

function clearSecretInputStatus(input, placeholder = "") {
  if (!input) {
    return;
  }

  const previousSecretPath = input.dataset.secretPath;

  if (previousSecretPath) {
    state.pendingSecretRemovals.delete(previousSecretPath);
  }

  input.value = "";
  input.placeholder = placeholder;
  input.title = "";

  delete input.dataset.secretPath;
  delete input.dataset.secretSource;
  delete input.dataset.secretConfigured;
  delete input.dataset.secretDeletable;

  hideSecretRemovalButton(input);
}

function renderSecretInputStatus(input, secretPath, label) {
  if (!input) {
    return;
  }

  const previousSecretPath = input.dataset.secretPath;

  if (previousSecretPath && previousSecretPath !== secretPath) {
    state.pendingSecretRemovals.delete(previousSecretPath);
  }

  const status = getSecretStatus(secretPath);

  input.value = "";

  input.dataset.secretPath = secretPath;

  input.dataset.secretSource = status.source || "none";

  input.dataset.secretConfigured = String(Boolean(status.configured));

  input.dataset.secretDeletable = String(Boolean(status.deletable));

  if (status.source === "environment") {
    state.pendingSecretRemovals.delete(secretPath);

    input.placeholder = `${label} is configured by environment`;

    input.title =
      "This secret is controlled by an environment variable and cannot be changed here.";

    input.disabled = true;

    renderSecretRemovalButton(input, secretPath, label, status);

    return;
  }

  renderSecretRemovalButton(input, secretPath, label, status);

  if (state.pendingSecretRemovals.has(secretPath)) {
    input.placeholder = `${label} will be removed when you save`;

    input.title = "Use Undo secret removal to keep the configured value.";

    input.disabled = true;

    return;
  }

  if (status.configured) {
    input.placeholder = `${label} is configured — enter a new value to replace it`;

    input.title = "The current value is never returned by the server.";

    return;
  }

  input.placeholder = `Enter ${label.toLowerCase()}`;

  input.title = "No secret is currently configured.";
}

function renderGeneralSecretInputs() {
  renderSecretInputStatus(
    els.externalJwtSecret,
    SECRET_PATHS.AUTH_EXTERNAL_JWT_SECRET,
    "External JWT secret",
  );
}

function renderTicketingSecretInputs() {
  renderSecretInputStatus(
    els.featureTicketQrSecret,
    SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
    "Ticket QR secret",
  );
}

export function renderPaymentSecretInputs() {
  renderSecretInputStatus(
    els.paymentMollieApiKey,
    SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY,
    "Mollie API key",
  );

  renderSecretInputStatus(
    els.paymentStripeSecretKey,
    SECRET_PATHS.PAYMENTS_STRIPE_SECRET_KEY,
    "Stripe secret key",
  );

  renderSecretInputStatus(
    els.paymentStripeWebhookSecret,
    SECRET_PATHS.PAYMENTS_STRIPE_WEBHOOK_SECRET,
    "Stripe webhook signing secret",
  );
}

export function renderMailSecretInputs() {
  const provider = els.mailProvider?.value || "disabled";

  if (provider === "smtp") {
    renderSecretInputStatus(
      els.mailSmtpPass,
      SECRET_PATHS.MAIL_SMTP_PASSWORD,
      "SMTP password",
    );
  } else {
    clearSecretInputStatus(els.mailSmtpPass, "SMTP password");
  }

  if (provider === "resend") {
    renderSecretInputStatus(
      els.mailResendApiKey,
      SECRET_PATHS.MAIL_RESEND_API_KEY,
      "Resend API key",
    );
  } else {
    clearSecretInputStatus(els.mailResendApiKey, "re_xxxxxxxxx");
  }
}

export function renderStorageSecretInputs() {
  if (els.storagePublicEnabled?.checked) {
    renderSecretInputStatus(
      els.storagePublicAccessKeyId,
      SECRET_PATHS.STORAGE_PUBLIC_ACCESS_KEY_ID,
      "Access key ID",
    );

    renderSecretInputStatus(
      els.storagePublicSecretAccessKey,
      SECRET_PATHS.STORAGE_PUBLIC_SECRET_ACCESS_KEY,
      "Secret access key",
    );
  } else {
    clearSecretInputStatus(els.storagePublicAccessKeyId, "Access key ID");

    clearSecretInputStatus(
      els.storagePublicSecretAccessKey,
      "Secret access key",
    );
  }

  if (els.storagePrivateEnabled?.checked) {
    renderSecretInputStatus(
      els.storagePrivateAccessKeyId,
      SECRET_PATHS.STORAGE_PRIVATE_ACCESS_KEY_ID,
      "Access key ID",
    );

    renderSecretInputStatus(
      els.storagePrivateSecretAccessKey,
      SECRET_PATHS.STORAGE_PRIVATE_SECRET_ACCESS_KEY,
      "Secret access key",
    );
  } else {
    clearSecretInputStatus(els.storagePrivateAccessKeyId, "Access key ID");

    clearSecretInputStatus(
      els.storagePrivateSecretAccessKey,
      "Secret access key",
    );
  }
}

export function renderAllSecretInputs() {
  renderGeneralSecretInputs();
  renderTicketingSecretInputs();
  renderPaymentSecretInputs();
  renderMailSecretInputs();
  renderStorageSecretInputs();
}

export function collectSecretInput(input, secretPath) {
  if (!input) {
    return {};
  }

  if (state.pendingSecretRemovals.has(secretPath)) {
    return {
      [secretPath]: null,
    };
  }

  if (input.dataset.secretSource === "environment") {
    return {};
  }

  const value = secretValueOrUndefined(input.value);

  if (value === undefined) {
    return {};
  }

  return {
    [secretPath]: value,
  };
}
