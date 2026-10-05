import { state } from "./state.js";
import { els } from "./elements.js";
import { persistSession, token } from "./session.js";
import { setText } from "./ui.js";

function getCurrentAdminDisplayName() {
  return (
    state.user?.displayName ||
    [state.user?.firstName, state.user?.lastName].filter(Boolean).join(" ") ||
    state.user?.email ||
    state.user?.id ||
    "Logged in"
  );
}

export function normalizeAdminUserFromMePayload(payload = {}) {
  const user = payload?.data?.user;

  if (!user) {
    throw new Error("Admin session response did not include a user.");
  }

  return {
    id: String(user.id || ""),
    email: user.email || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    displayName:
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Logged in",
    role: user.role || "admin",
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

function renderAdminNavbarUser() {
  if (!token() || !state.user) {
    setText(els.adminUserName, "Not logged in");
    setText(els.adminUserEmail, "-");
    return;
  }

  setText(els.adminUserName, getCurrentAdminDisplayName());
  setText(els.adminUserEmail, state.user.email || state.user.id || "-");
}

export function closeAdminUserDropdown() {
  els.adminUserDropdown?.classList.add("hidden");
  els.adminUserMenuButton?.setAttribute("aria-expanded", "false");
}

export function toggleAdminUserDropdown() {
  const isOpen = !els.adminUserDropdown?.classList.contains("hidden");

  if (isOpen) {
    closeAdminUserDropdown();
    return;
  }

  els.adminUserDropdown?.classList.remove("hidden");
  els.adminUserMenuButton?.setAttribute("aria-expanded", "true");
}

export function setSession({ accessToken, user }) {
  state.accessToken = String(accessToken || "").trim();
  state.user = user || null;

  persistSession();
  updateLoginState();
}

export function clearSession() {
  state.accessToken = "";
  state.user = null;

  persistSession();
  updateLoginState();
}

export function updateLoginState() {
  renderAdminNavbarUser();

  if (!els.adminLoginState) {
    return;
  }

  if (!token()) {
    els.adminLoginState.textContent = "Not logged in.";
    return;
  }

  els.adminLoginState.textContent = state.user
    ? `Logged in as ${getCurrentAdminDisplayName()}`
    : "Logged in.";
}

export function showSetupView() {
  els.setupView?.classList.remove("hidden");
  els.loginView?.classList.add("hidden");
  els.cmsView?.classList.add("hidden");
}

export function showLoginView() {
  els.setupView?.classList.add("hidden");
  els.loginView?.classList.remove("hidden");
  els.cmsView?.classList.add("hidden");
}

export function showCmsView() {
  els.setupView?.classList.add("hidden");
  els.loginView?.classList.add("hidden");
  els.cmsView?.classList.remove("hidden");
}

export function handleUnauthorized(message) {
  clearSession();
  showLoginView();

  setText(
    els.adminLoginState,
    message || "Your session expired. Please log in again.",
  );
}
