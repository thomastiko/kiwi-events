import { state } from "./state.js";
import { els } from "./elements.js";
import { apiRequest } from "./api.js";

import {
  setInputValue,
  setInputsDisabled,
  setLoading,
  setSelectValue,
  setText,
  showMessage,
} from "./ui.js";

import { escapeHtml, valueOrUndefined } from "./utils.js";

import {
  ensureEventRolesLoaded,
  getDefaultExternalEventUserRole,
  renderRoleSelectOptions,
} from "./event-roles.js";

function normalizeEventUserList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.users)) return payload.data.users;
  if (Array.isArray(payload?.users)) return payload.users;

  return [];
}

function getEventUserId(eventUser) {
  return eventUser?.id || eventUser?._id || "";
}

function getEventUserDisplayName(eventUser) {
  return (
    [eventUser?.firstNameSnapshot, eventUser?.lastNameSnapshot]
      .filter(Boolean)
      .join(" ") ||
    eventUser?.emailSnapshot ||
    eventUser?.externalUserId ||
    getEventUserId(eventUser)
  );
}

function getCurrentAdminId() {
  return state.user?.id || state.user?._id || state.user?.eventUserId || "";
}

function isProtectedInitialAdmin(eventUser) {
  return (
    eventUser?.authProvider === "local" &&
    String(eventUser?.emailSnapshot || "")
      .trim()
      .toLowerCase() === "admin@admin"
  );
}

function isExternalOnlyEventUser(eventUser) {
  return eventUser?.authProvider === "external";
}

function isLocalPasswordCapableEventUser(eventUser) {
  return (
    eventUser?.authProvider === "local" || eventUser?.authProvider === "hybrid"
  );
}

function canUseAdminUiLogin(eventUser) {
  return (
    eventUser?.role === "admin" && isLocalPasswordCapableEventUser(eventUser)
  );
}

function selectedEventUser() {
  const selectedId = String(state.selectedEventUserId || "");

  return state.eventUsers.find(
    (eventUser) => String(getEventUserId(eventUser)) === selectedId,
  );
}

function normalizeExternalEventUserRole(role) {
  const normalized = String(role || "").trim();
  const defaultRole = getDefaultExternalEventUserRole();

  if (!normalized || normalized === "admin") {
    return defaultRole;
  }

  return normalized;
}

export function updateEventUserFormVisibility() {
  const type = els.eventUserType?.value || "local";

  els.eventUserLocalForm?.classList.toggle("hidden", type !== "local");

  els.eventUserExternalForm?.classList.toggle("hidden", type !== "external");
}

function renderEventUsers() {
  if (!els.eventUserList) {
    return;
  }

  const users = Array.isArray(state.eventUsers) ? state.eventUsers : [];

  if (!users.length) {
    els.eventUserList.innerHTML = `
      <div class="empty-state">
        No EventUsers found yet.
      </div>
    `;

    return;
  }

  els.eventUserList.innerHTML = `
    <table class="user-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Auth</th>
          <th>External link</th>
          <th>Role</th>
          <th>Status</th>
          <th>Admin UI login</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        ${users
          .map((eventUser) => {
            const id = getEventUserId(eventUser);

            const isCurrentUser = String(getCurrentAdminId()) === String(id);

            const isProtected = isProtectedInitialAdmin(eventUser);

            const externalLink =
              eventUser.externalProvider && eventUser.externalUserId
                ? `${eventUser.externalProvider} / ${eventUser.externalUserId}`
                : "-";

            return `
              <tr>
                <td>
                  <strong>
                    ${escapeHtml(getEventUserDisplayName(eventUser))}
                  </strong>

                  <small>
                    ${escapeHtml(eventUser.emailSnapshot || "-")}
                  </small>

                  ${
                    isCurrentUser
                      ? `<span class="mini-pill">Current user</span>`
                      : ""
                  }

                  ${
                    isProtected
                      ? `<span class="mini-pill warning">Protected initial admin</span>`
                      : ""
                  }
                </td>

                <td>
                  <span class="mini-pill">
                    ${escapeHtml(eventUser.authProvider || "-")}
                  </span>
                </td>

                <td>
                  <code>
                    ${escapeHtml(externalLink)}
                  </code>
                </td>

                <td>
                  <span class="mini-pill accent">
                    ${escapeHtml(eventUser.role || "-")}
                  </span>
                </td>

                <td>
                  <span
                    class="mini-pill ${
                      eventUser.isActive === false ? "danger" : "success"
                    }"
                  >
                    ${eventUser.isActive === false ? "Inactive" : "Active"}
                  </span>
                </td>

                <td>
                  ${
                    canUseAdminUiLogin(eventUser)
                      ? `<span class="mini-pill success">Yes</span>`
                      : `<span class="mini-pill">No</span>`
                  }
                </td>

                <td>
                  <div class="table-actions">
                    <button
                      type="button"
                      class="secondary"
                      data-event-user-edit="${escapeHtml(id)}"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      class="secondary"
                      data-event-user-toggle="${escapeHtml(id)}"
                      data-event-user-active="${eventUser.isActive !== false}"
                      ${isProtected ? "disabled" : ""}
                    >
                      ${
                        eventUser.isActive === false
                          ? "Reactivate"
                          : "Deactivate"
                      }
                    </button>

                    <button
                      type="button"
                      class="secondary danger-button"
                      data-event-user-delete="${escapeHtml(id)}"
                      ${isProtected ? "disabled" : ""}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  els.eventUserList
    .querySelectorAll("[data-event-user-edit]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        openEventUserEditDialog(button.dataset.eventUserEdit);
      });
    });

  els.eventUserList
    .querySelectorAll("[data-event-user-toggle]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        toggleEventUserActive(
          button.dataset.eventUserToggle,
          button.dataset.eventUserActive === "true",
        );
      });
    });

  els.eventUserList
    .querySelectorAll("[data-event-user-delete]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        deleteEventUser(button.dataset.eventUserDelete);
      });
    });
}

export async function loadEventUsers({ silent = false } = {}) {
  setLoading(els.reloadEventUsersButton, true);

  try {
    const payload = await apiRequest("/api/admin/event-users");

    state.eventUsers = normalizeEventUserList(payload);

    state.eventUsersLoaded = true;

    renderEventUsers();

    if (!silent) {
      showMessage(
        "Users loaded",
        `${state.eventUsers.length} EventUser account(s) loaded.`,
        "success",
      );
    }

    return state.eventUsers;
  } catch (error) {
    state.eventUsersLoaded = false;

    if (!silent) {
      showMessage("Loading users failed", error.message, "error");
    }

    throw error;
  } finally {
    setLoading(els.reloadEventUsersButton, false);
  }
}

function clearLocalEventUserForm() {
  setInputValue(els.eventUserLocalEmail, "");

  setInputValue(els.eventUserLocalPassword, "");

  setInputValue(els.eventUserLocalRepeatPassword, "");

  setInputValue(els.eventUserLocalFirstName, "");

  setInputValue(els.eventUserLocalLastName, "");

  setInputValue(els.eventUserLocalNotes, "");
}

function clearExternalEventUserForm() {
  setInputValue(els.eventUserExternalProvider, "");

  setInputValue(els.eventUserExternalUserId, "");

  setInputValue(els.eventUserExternalEmail, "");

  setInputValue(els.eventUserExternalFirstName, "");

  setInputValue(els.eventUserExternalLastName, "");

  renderRoleSelectOptions();

  setSelectValue(els.eventUserExternalRole, "event_manager");

  setInputValue(els.eventUserExternalNotes, "");
}

async function createLocalEventUser() {
  const email = valueOrUndefined(els.eventUserLocalEmail?.value);

  const password = valueOrUndefined(els.eventUserLocalPassword?.value);

  const repeatPassword = valueOrUndefined(
    els.eventUserLocalRepeatPassword?.value,
  );

  if (!email || !password || !repeatPassword) {
    showMessage(
      "Missing local admin data",
      "Email, initial password and repeated password are required for local admin users.",
      "warning",
    );

    return;
  }

  if (password !== repeatPassword) {
    showMessage(
      "Passwords do not match",
      "The repeated password must match the initial password.",
      "warning",
    );

    return;
  }

  setLoading(els.createLocalEventUserButton, true);

  try {
    await apiRequest("/api/admin/event-users", {
      method: "POST",

      body: JSON.stringify({
        authProvider: "local",
        emailSnapshot: email,
        password,

        firstNameSnapshot: valueOrUndefined(els.eventUserLocalFirstName?.value),

        lastNameSnapshot: valueOrUndefined(els.eventUserLocalLastName?.value),

        role: "admin",
        mustChangePassword: false,
        isActive: true,

        notes: valueOrUndefined(els.eventUserLocalNotes?.value),
      }),
    });

    clearLocalEventUserForm();

    await loadEventUsers({
      silent: true,
    });

    showMessage(
      "Local admin created",
      "The kiwi events Admin UI user was created successfully.",
      "success",
    );
  } catch (error) {
    showMessage("Creating local admin failed", error.message, "error");
  } finally {
    setLoading(els.createLocalEventUserButton, false);
  }
}

async function syncExternalEventUser() {
  const provider = valueOrUndefined(els.eventUserExternalProvider?.value);

  const externalUserId = valueOrUndefined(els.eventUserExternalUserId?.value);

  if (!provider || !externalUserId) {
    showMessage(
      "Missing external identity",
      "External provider and external user ID are required.",
      "warning",
    );

    return;
  }

  setLoading(els.syncExternalEventUserButton, true);

  try {
    await apiRequest(
      `/api/admin/event-users/by-external-user/${encodeURIComponent(
        provider,
      )}/${encodeURIComponent(externalUserId)}`,
      {
        method: "PUT",

        body: JSON.stringify({
          authProvider: "external",

          emailSnapshot: valueOrUndefined(els.eventUserExternalEmail?.value),

          firstNameSnapshot: valueOrUndefined(
            els.eventUserExternalFirstName?.value,
          ),

          lastNameSnapshot: valueOrUndefined(
            els.eventUserExternalLastName?.value,
          ),

          role:
            els.eventUserExternalRole?.value === "admin"
              ? getDefaultExternalEventUserRole()
              : els.eventUserExternalRole?.value ||
                getDefaultExternalEventUserRole(),

          isActive: true,

          notes: valueOrUndefined(els.eventUserExternalNotes?.value),
        }),
      },
    );

    clearExternalEventUserForm();

    await loadEventUsers({
      silent: true,
    });

    showMessage(
      "External user linked",
      "The external host user was linked or updated successfully.",
      "success",
    );
  } catch (error) {
    showMessage("Linking external user failed", error.message, "error");
  } finally {
    setLoading(els.syncExternalEventUserButton, false);
  }
}

function openEventUserEditDialog(eventUserId) {
  const eventUser = state.eventUsers.find(
    (user) => String(getEventUserId(user)) === String(eventUserId),
  );

  if (!eventUser) {
    showMessage("User not found", "Could not find this EventUser.", "error");

    return;
  }

  state.selectedEventUserId = getEventUserId(eventUser);

  const isProtected = isProtectedInitialAdmin(eventUser);

  const isExternalOnly = isExternalOnlyEventUser(eventUser);

  const isLocalOnly = eventUser.authProvider === "local";

  setText(
    els.eventUserEditDialogTitle,
    `Edit ${getEventUserDisplayName(eventUser)}`,
  );

  setText(
    els.eventUserEditDialogMeta,
    isProtected
      ? "This is the protected initial kiwi events administrator."
      : "Update this EventUser account.",
  );

  els.eventUserProtectedNotice?.classList.toggle("hidden", !isProtected);

  els.eventUserExternalOnlyNotice?.classList.toggle("hidden", !isExternalOnly);

  setInputValue(els.editEventUserEmail, eventUser.emailSnapshot);

  setInputValue(els.editEventUserFirstName, eventUser.firstNameSnapshot);

  setInputValue(els.editEventUserLastName, eventUser.lastNameSnapshot);

  renderRoleSelectOptions({
    editUser: eventUser,
  });

  setInputValue(els.editEventUserPassword, "");

  setInputValue(els.editEventUserRepeatPassword, "");

  setInputValue(els.editEventUserExternalProvider, eventUser.externalProvider);

  setInputValue(els.editEventUserExternalUserId, eventUser.externalUserId);

  setInputValue(els.editEventUserNotes, eventUser.notes);

  setInputsDisabled(
    [
      els.editEventUserEmail,
      els.editEventUserFirstName,
      els.editEventUserLastName,
      els.editEventUserRole,
      els.editEventUserExternalProvider,
      els.editEventUserExternalUserId,
      els.editEventUserNotes,
    ],
    isProtected,
  );

  if (els.editEventUserRole) {
    els.editEventUserRole.disabled = isProtected || isLocalOnly;
  }

  setInputsDisabled(
    [els.editEventUserPassword, els.editEventUserRepeatPassword],
    false,
  );

  const showExternalFields =
    eventUser.authProvider === "external" ||
    eventUser.authProvider === "hybrid";

  els.editEventUserExternalProvider
    ?.closest(".field")
    ?.classList.toggle("hidden", !showExternalFields);

  els.editEventUserExternalUserId
    ?.closest(".field")
    ?.classList.toggle("hidden", !showExternalFields);

  els.eventUserEditDialog?.classList.remove("hidden");

  document.body.classList.add("dialog-open");

  if (isProtected) {
    els.editEventUserPassword?.focus();
  } else {
    els.editEventUserEmail?.focus();
  }
}

function closeEventUserEditDialog() {
  state.selectedEventUserId = null;

  els.eventUserEditDialog?.classList.add("hidden");

  document.body.classList.remove("dialog-open");
}

async function saveEventUserFromDialog() {
  const eventUser = selectedEventUser();

  if (!eventUser) {
    showMessage("User not found", "No EventUser is selected.", "error");

    return;
  }

  const eventUserId = getEventUserId(eventUser);

  const isProtected = isProtectedInitialAdmin(eventUser);

  const isLocalOnly = eventUser.authProvider === "local";

  const password = valueOrUndefined(els.editEventUserPassword?.value);

  const repeatPassword = valueOrUndefined(
    els.editEventUserRepeatPassword?.value,
  );

  if (password || repeatPassword) {
    if (!password || !repeatPassword) {
      showMessage(
        "Incomplete password",
        "Please enter and repeat the new password.",
        "warning",
      );

      return;
    }

    if (password !== repeatPassword) {
      showMessage(
        "Passwords do not match",
        "The repeated password must match the new password.",
        "warning",
      );

      return;
    }
  }

  const body = {};

  if (isProtected) {
    if (!password) {
      showMessage(
        "Protected initial admin",
        "For admin@admin only the password can be changed.",
        "warning",
      );

      return;
    }

    body.password = password;
  } else {
    body.emailSnapshot = valueOrUndefined(els.editEventUserEmail?.value);

    body.firstNameSnapshot = valueOrUndefined(
      els.editEventUserFirstName?.value,
    );

    body.lastNameSnapshot = valueOrUndefined(els.editEventUserLastName?.value);

    body.role = isLocalOnly
      ? "admin"
      : normalizeExternalEventUserRole(els.editEventUserRole?.value);

    body.notes = valueOrUndefined(els.editEventUserNotes?.value);

    if (
      eventUser.authProvider === "external" ||
      eventUser.authProvider === "hybrid"
    ) {
      body.externalProvider = valueOrUndefined(
        els.editEventUserExternalProvider?.value,
      );

      body.externalUserId = valueOrUndefined(
        els.editEventUserExternalUserId?.value,
      );
    }

    if (password) {
      body.password = password;
    }
  }

  setLoading(els.saveEventUserEditDialogButton, true);

  try {
    await apiRequest(
      `/api/admin/event-users/${encodeURIComponent(eventUserId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );

    closeEventUserEditDialog();

    await loadEventUsers({
      silent: true,
    });

    showMessage(
      "User updated",
      "The EventUser was updated successfully.",
      "success",
    );
  } catch (error) {
    showMessage("Saving user failed", error.message, "error");
  } finally {
    setLoading(els.saveEventUserEditDialogButton, false);
  }
}

async function toggleEventUserActive(eventUserId, currentlyActive) {
  if (!eventUserId) {
    return;
  }

  const eventUser = state.eventUsers.find(
    (user) => String(getEventUserId(user)) === String(eventUserId),
  );

  if (isProtectedInitialAdmin(eventUser)) {
    showMessage(
      "Protected initial admin",
      "The initial admin@admin user cannot be deactivated.",
      "warning",
    );

    return;
  }

  const action = currentlyActive ? "deactivate" : "reactivate";

  const confirmed = window.confirm(
    currentlyActive
      ? "Deactivate this EventUser?"
      : "Reactivate this EventUser?",
  );

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(
      `/api/admin/event-users/${encodeURIComponent(eventUserId)}/${action}`,
      {
        method: "PATCH",
      },
    );

    await loadEventUsers({
      silent: true,
    });

    showMessage(
      currentlyActive ? "User deactivated" : "User reactivated",
      "The EventUser status was updated.",
      "success",
    );
  } catch (error) {
    showMessage("Updating user status failed", error.message, "error");
  }
}

async function deleteEventUser(eventUserId) {
  if (!eventUserId) {
    return;
  }

  const eventUser = state.eventUsers.find(
    (user) => String(getEventUserId(user)) === String(eventUserId),
  );

  if (isProtectedInitialAdmin(eventUser)) {
    showMessage(
      "Protected initial admin",
      "The initial admin@admin user cannot be deleted.",
      "warning",
    );

    return;
  }

  const confirmed = window.confirm(
    "Delete this EventUser? This cannot be undone.",
  );

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(
      `/api/admin/event-users/${encodeURIComponent(eventUserId)}`,
      {
        method: "DELETE",
      },
    );

    await loadEventUsers({
      silent: true,
    });

    showMessage(
      "User deleted",
      "The EventUser was deleted successfully.",
      "success",
    );
  } catch (error) {
    showMessage("Deleting user failed", error.message, "error");
  }
}

export function registerEventUserEventListeners() {
  els.eventUserType?.addEventListener("change", updateEventUserFormVisibility);

  els.reloadEventUsersButton?.addEventListener("click", async () => {
    await ensureEventRolesLoaded();
    await loadEventUsers();
  });

  els.createLocalEventUserButton?.addEventListener(
    "click",
    createLocalEventUser,
  );

  els.syncExternalEventUserButton?.addEventListener(
    "click",
    syncExternalEventUser,
  );

  els.closeEventUserEditDialogButton?.addEventListener(
    "click",
    closeEventUserEditDialog,
  );

  els.cancelEventUserEditDialogButton?.addEventListener(
    "click",
    closeEventUserEditDialog,
  );

  els.saveEventUserEditDialogButton?.addEventListener(
    "click",
    saveEventUserFromDialog,
  );

  els.eventUserEditDialog?.addEventListener("click", (event) => {
    if (event.target === els.eventUserEditDialog) {
      closeEventUserEditDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !els.eventUserEditDialog?.classList.contains("hidden")
    ) {
      closeEventUserEditDialog();
    }
  });
}
