import { els } from "./elements.js";

import { isLockedSecretInput } from "./secrets.js";

export function setText(element, value, fallback = "-") {
  if (element) {
    element.textContent = value || fallback;
  }
}

export function setInputValue(input, value) {
  if (input) {
    input.value = value ?? "";
  }
}
export function setCheckboxValue(input, value) {
  if (input) {
    input.checked = Boolean(value);
  }
}

export function setSelectValue(select, value) {
  if (!select || value === undefined || value === null) {
    return;
  }

  const selectedValue = String(value);

  const hasOption = [...select.options].some(
    (option) => option.value === selectedValue,
  );

  if (hasOption) {
    select.value = selectedValue;
  }
}

export function setInputsDisabled(inputs, disabled) {
  inputs.forEach((input) => {
    if (!input) {
      return;
    }

    input.disabled = disabled || isLockedSecretInput(input);
  });
}
export function setLoading(button, loading) {
  if (!button) {
    return;
  }

  button.disabled = loading;
  button.dataset.originalText ||= button.textContent;
  button.textContent = loading ? "Loading..." : button.dataset.originalText;
}

const NOTIFY_TIMEOUTS = {
  success: 4500,
  neutral: 5500,
  warning: 7500,
  error: 9500,
};

const NOTIFY_TYPES = new Set(["success", "neutral", "warning", "error"]);

function normalizeMessageType(type) {
  const normalized = String(type || "neutral").toLowerCase();
  return NOTIFY_TYPES.has(normalized) ? normalized : "neutral";
}

function messageIcon(type) {
  if (type === "success") return "✓";
  if (type === "warning") return "!";
  if (type === "error") return "!";
  return "i";
}

function getNotifyRoot() {
  if (!els.notifyRoot) {
    throw new Error("notifyRoot is missing in public/admin/index.html.");
  }

  return els.notifyRoot;
}

function dismissNotification(card) {
  if (!card || card.dataset.closing === "true") {
    return;
  }

  card.dataset.closing = "true";
  card.classList.remove("is-visible");
  card.classList.add("is-leaving");

  window.setTimeout(() => {
    card.remove();
  }, 180);
}

export function showMessage(title, message, type = "neutral") {
  const variant = normalizeMessageType(type);
  const displayTitle = String(title || "Status").trim();
  const displayMessage = String(message || "-").trim();

  const root = getNotifyRoot();

  const card = document.createElement("article");
  card.className = `notify-card notify-${variant}`;
  card.setAttribute("role", variant === "error" ? "alert" : "status");

  const icon = document.createElement("div");
  icon.className = "notify-icon";
  icon.textContent = messageIcon(variant);

  const content = document.createElement("div");
  content.className = "notify-content";

  const titleElement = document.createElement("strong");
  titleElement.className = "notify-title";
  titleElement.textContent = displayTitle;

  const messageElement = document.createElement("p");
  messageElement.className = "notify-message";
  messageElement.textContent = displayMessage;

  content.append(titleElement, messageElement);

  const closeButton = document.createElement("button");
  closeButton.className = "notify-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => dismissNotification(card));

  card.append(icon, content, closeButton);
  root.prepend(card);

  window.requestAnimationFrame(() => {
    card.classList.add("is-visible");
  });

  const autoDismiss = window.setTimeout(() => {
    dismissNotification(card);
  }, NOTIFY_TIMEOUTS[variant]);

  card.addEventListener("mouseenter", () => {
    window.clearTimeout(autoDismiss);
  });
}

export function clearMessages() {
  els.notifyRoot?.replaceChildren();
}
