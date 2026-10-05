import { state } from "./state.js";
import { els } from "./elements.js";
import { apiRequest } from "./api.js";
import {
  setInputValue,
  setLoading,
  setSelectValue,
  showMessage,
} from "./ui.js";
import { escapeHtml, valueOrUndefined } from "./utils.js";

let reloadEventUsersHandler = null;

export function setEventUsersReloadHandler(handler) {
  reloadEventUsersHandler = typeof handler === "function" ? handler : null;
}

function normalizeEventRoleList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.roles)) return payload.roles;
  return [];
}

function normalizeEventRolePermissionGroups(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.permissionGroups)) {
    return payload.permissionGroups;
  }

  return [];
}

function getEventRoleKey(role) {
  return role?.key || role?.id || role?._id || "";
}

function getEventRoleLabel(roleOrKey) {
  const roleKey =
    typeof roleOrKey === "string" ? roleOrKey : getEventRoleKey(roleOrKey);

  if (!roleKey) {
    return "No role";
  }

  const role = state.eventRoles.find(
    (candidate) => getEventRoleKey(candidate) === roleKey,
  );

  if (!role) {
    return roleKey;
  }

  return role.name ? `${role.name} (${role.key})` : role.key;
}

function isProtectedEventRole(role) {
  return getEventRoleKey(role) === "admin" || role?.isProtected === true;
}

function uniquePermissions(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function eventUserRoleOptions(
  selectedRole,
  { includeEmpty = false, excludeAdmin = false } = {},
) {
  const selected = selectedRole || "";

  const roles = (
    Array.isArray(state.eventRoles) ? state.eventRoles : []
  ).filter((role) => {
    const key = getEventRoleKey(role);

    if (excludeAdmin && key === "admin") {
      return false;
    }

    return true;
  });

  const options = [];

  if (includeEmpty) {
    options.push(
      `<option value="" ${!selected ? "selected" : ""}>No role</option>`,
    );
  }

  options.push(
    ...roles.map((role) => {
      const key = getEventRoleKey(role);
      const label = getEventRoleLabel(key);

      return `
        <option
          value="${escapeHtml(key)}"
          ${key === selected ? "selected" : ""}
        >
          ${escapeHtml(label)}
        </option>
      `;
    }),
  );

  return options.join("");
}

export function getDefaultExternalEventUserRole() {
  const roles = Array.isArray(state.eventRoles) ? state.eventRoles : [];

  if (roles.some((role) => getEventRoleKey(role) === "event_manager")) {
    return "event_manager";
  }

  return getEventRoleKey(
    roles.find((role) => getEventRoleKey(role) !== "admin"),
  );
}

export function renderRoleSelectOptions({ editUser = null } = {}) {
  const defaultExternalRole = getDefaultExternalEventUserRole();

  if (els.eventUserExternalRole) {
    els.eventUserExternalRole.innerHTML = eventUserRoleOptions(
      els.eventUserExternalRole.value || defaultExternalRole,
      {
        excludeAdmin: true,
      },
    );

    setSelectValue(
      els.eventUserExternalRole,
      els.eventUserExternalRole.value || defaultExternalRole,
    );
  }

  if (els.editEventUserRole) {
    const isLocalOnly = editUser?.authProvider === "local";

    const selectedRole = isLocalOnly
      ? "admin"
      : editUser?.role === "admin"
        ? defaultExternalRole
        : editUser?.role || defaultExternalRole;

    els.editEventUserRole.innerHTML = eventUserRoleOptions(selectedRole, {
      includeEmpty: true,
      excludeAdmin: !isLocalOnly,
    });

    setSelectValue(els.editEventUserRole, selectedRole);
  }
}

function renderPermissionCheckboxes(container, selectedPermissions = []) {
  if (!container) {
    return;
  }

  const groups = Array.isArray(state.eventRolePermissionGroups)
    ? state.eventRolePermissionGroups
    : [];

  const selected = new Set(selectedPermissions);

  if (!groups.length) {
    container.innerHTML = `
      <div class="empty-state">
        Permission groups are not loaded yet.
      </div>
    `;
    return;
  }

  container.innerHTML = groups
    .map((group) => {
      const permissions = Array.isArray(group.permissions)
        ? group.permissions
        : [];

      const checked =
        permissions.length > 0 &&
        permissions.every((permission) => selected.has(permission));

      const permissionList = permissions
        .map((permission) => `<code>${escapeHtml(permission)}</code>`)
        .join("");

      return `
        <label class="permission-card">
          <input
            type="checkbox"
            data-permission-group="${escapeHtml(group.key)}"
            data-permissions="${escapeHtml(JSON.stringify(permissions))}"
            ${checked ? "checked" : ""}
          />

          <span>
            <strong>
              ${escapeHtml(group.label || group.key)}
            </strong>

            <small>
              ${escapeHtml(group.description || "")}
            </small>

            <span class="permission-code-list">
              ${permissionList}
            </span>
          </span>
        </label>
      `;
    })
    .join("");
}

function getPermissionGroupSelection(container) {
  if (!container) {
    return [];
  }

  const selected = [];

  container
    .querySelectorAll("input[data-permission-group]:checked")
    .forEach((input) => {
      const permissions = JSON.parse(input.dataset.permissions || "[]");

      selected.push(...permissions);
    });

  return uniquePermissions(selected);
}

function clearCreateEventRoleForm() {
  setInputValue(els.eventRoleCreateKey, "");

  setInputValue(els.eventRoleCreateName, "");

  setInputValue(els.eventRoleCreateDescription, "");

  setInputValue(els.eventRoleCreateSortOrder, "100");

  renderPermissionCheckboxes(els.eventRoleCreatePermissions, []);
}

function renderEventRoles() {
  if (!els.eventRoleList) {
    return;
  }

  const roles = Array.isArray(state.eventRoles) ? state.eventRoles : [];

  renderRoleSelectOptions();

  renderPermissionCheckboxes(els.eventRoleCreatePermissions, []);

  if (!roles.length) {
    els.eventRoleList.innerHTML = `
      <div class="empty-state">
        No roles found yet.
      </div>
    `;
    return;
  }

  els.eventRoleList.innerHTML = roles
    .map((role) => {
      const key = getEventRoleKey(role);

      const protectedRole = isProtectedEventRole(role);

      const permissionCount = Array.isArray(role.permissions)
        ? role.permissions.length
        : 0;

      const bodyHtml = protectedRole
        ? `
          <div class="role-card-body">
            <div class="admin-role-info">
              <h4>Protected system role</h4>

              <p>
                The admin role is the built-in safety role of kiwi-events.
                It cannot be edited or deleted, always has full system
                permissions and is the only role that can access the
                Admin UI and system settings.
              </p>

              <div class="admin-role-info-grid">
                <span>Cannot be deleted</span>
                <span>Cannot be edited</span>
                <span>Full event access</span>
                <span>Admin UI access</span>
              </div>
            </div>
          </div>
        `
        : `
          <div class="role-card-body">
            <div class="grid-2">
              <label class="field">
                <span>Name</span>

                <input
                  type="text"
                  data-role-name="${escapeHtml(key)}"
                  value="${escapeHtml(role.name || "")}"
                />
              </label>

              <label class="field">
                <span>Sort order</span>

                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  data-role-sort-order="${escapeHtml(key)}"
                  value="${escapeHtml(role.sortOrder ?? 100)}"
                />
              </label>

              <label class="field wide">
                <span>Description</span>

                <textarea
                  data-role-description="${escapeHtml(key)}"
                >${escapeHtml(role.description || "")}</textarea>
              </label>
            </div>

            <div class="permission-section">
              <div class="permission-section-head">
                <strong>Permissions</strong>
                <small>
                  Select permissions for this role.
                </small>
              </div>

              <div
                class="permission-grid"
                data-role-permissions="${escapeHtml(key)}"
              ></div>
            </div>

            <div class="actions role-card-actions">
              <button
                type="button"
                data-role-save="${escapeHtml(key)}"
              >
                Save role
              </button>

              <button
                type="button"
                class="secondary danger-button"
                data-role-delete="${escapeHtml(key)}"
              >
                Delete role
              </button>
            </div>
          </div>
        `;

      return `
        <details
          class="role-card ${protectedRole ? "role-card-protected" : ""}"
          data-role-card="${escapeHtml(key)}"
        >
          <summary class="role-card-summary">
            <span class="role-card-summary-main">
              <span>
                <strong>
                  ${escapeHtml(role.name || key)}
                </strong>

                <small>
                  ${escapeHtml(key)}
                </small>
              </span>
            </span>

            <span class="role-card-badges">
              ${
                protectedRole
                  ? `<span class="mini-pill warning">Protected</span>`
                  : `<span class="mini-pill success">Editable</span>`
              }

              ${
                protectedRole
                  ? `<span class="mini-pill accent">Full access</span>`
                  : `<span class="mini-pill">${permissionCount} permission(s)</span>`
              }

              <span class="mini-pill accent role-toggle-pill">
                Open
              </span>
            </span>
          </summary>

          ${bodyHtml}
        </details>
      `;
    })
    .join("");

  roles.forEach((role) => {
    const key = getEventRoleKey(role);

    if (isProtectedEventRole(role)) {
      return;
    }

    const container = els.eventRoleList.querySelector(
      `[data-role-permissions="${CSS.escape(key)}"]`,
    );

    renderPermissionCheckboxes(container, role.permissions || []);
  });

  els.eventRoleList.querySelectorAll("[data-role-save]").forEach((button) => {
    button.addEventListener("click", () => {
      saveEventRole(button.dataset.roleSave);
    });
  });

  els.eventRoleList.querySelectorAll("[data-role-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteEventRole(button.dataset.roleDelete);
    });
  });
}

export async function loadEventRoles({ silent = false } = {}) {
  setLoading(els.reloadEventRolesButton, true);

  try {
    const [rolesPayload, groupsPayload] = await Promise.all([
      apiRequest("/api/admin/event-roles"),
      apiRequest("/api/admin/event-roles/permission-groups"),
    ]);

    state.eventRoles = normalizeEventRoleList(rolesPayload);

    state.eventRolePermissionGroups =
      normalizeEventRolePermissionGroups(groupsPayload);

    state.eventRolesLoaded = true;

    renderEventRoles();

    if (!silent) {
      showMessage(
        "Roles loaded",
        `${state.eventRoles.length} role(s) loaded.`,
        "success",
      );
    }

    return state.eventRoles;
  } catch (error) {
    state.eventRolesLoaded = false;

    if (!silent) {
      showMessage("Loading roles failed", error.message, "error");
    }

    throw error;
  } finally {
    setLoading(els.reloadEventRolesButton, false);
  }
}

export async function ensureEventRolesLoaded() {
  if (state.eventRolesLoaded) {
    return state.eventRoles;
  }

  return loadEventRoles({
    silent: true,
  });
}

async function createEventRole() {
  const key = valueOrUndefined(els.eventRoleCreateKey?.value);

  const name = valueOrUndefined(els.eventRoleCreateName?.value);

  if (!key || !name) {
    showMessage(
      "Missing role data",
      "Role key and name are required.",
      "warning",
    );

    return;
  }

  setLoading(els.createEventRoleButton, true);

  try {
    await apiRequest("/api/admin/event-roles", {
      method: "POST",

      body: JSON.stringify({
        key,
        name,

        description:
          valueOrUndefined(els.eventRoleCreateDescription?.value) || "",

        sortOrder: Number(els.eventRoleCreateSortOrder?.value || 100),

        permissions: getPermissionGroupSelection(
          els.eventRoleCreatePermissions,
        ),
      }),
    });

    clearCreateEventRoleForm();

    await loadEventRoles({
      silent: true,
    });

    showMessage(
      "Role created",
      "The role was created successfully.",
      "success",
    );
  } catch (error) {
    showMessage("Creating role failed", error.message, "error");
  } finally {
    setLoading(els.createEventRoleButton, false);
  }
}

async function refreshEventUsersAfterRoleChange() {
  if (!reloadEventUsersHandler) {
    return;
  }

  await reloadEventUsersHandler();
}

async function saveEventRole(roleKey) {
  const role = state.eventRoles.find(
    (candidate) => getEventRoleKey(candidate) === roleKey,
  );

  if (!role) {
    showMessage("Role not found", "Could not find this role.", "error");

    return;
  }

  if (isProtectedEventRole(role)) {
    showMessage(
      "Protected role",
      "The admin role cannot be edited.",
      "warning",
    );

    return;
  }

  const card = els.eventRoleList?.querySelector(
    `[data-role-card="${CSS.escape(roleKey)}"]`,
  );

  if (!card) {
    return;
  }

  const name = valueOrUndefined(
    card.querySelector(`[data-role-name="${CSS.escape(roleKey)}"]`)?.value,
  );

  if (!name) {
    showMessage("Missing role name", "Role name is required.", "warning");

    return;
  }

  const button = card.querySelector(
    `[data-role-save="${CSS.escape(roleKey)}"]`,
  );

  setLoading(button, true);

  try {
    await apiRequest(`/api/admin/event-roles/${encodeURIComponent(roleKey)}`, {
      method: "PATCH",

      body: JSON.stringify({
        name,

        description:
          valueOrUndefined(
            card.querySelector(
              `[data-role-description="${CSS.escape(roleKey)}"]`,
            )?.value,
          ) || "",

        sortOrder: Number(
          card.querySelector(`[data-role-sort-order="${CSS.escape(roleKey)}"]`)
            ?.value || 100,
        ),

        permissions: getPermissionGroupSelection(
          card.querySelector(
            `[data-role-permissions="${CSS.escape(roleKey)}"]`,
          ),
        ),
      }),
    });

    await loadEventRoles({
      silent: true,
    });

    await refreshEventUsersAfterRoleChange();

    showMessage(
      "Role updated",
      "The role was updated successfully.",
      "success",
    );
  } catch (error) {
    showMessage("Saving role failed", error.message, "error");
  } finally {
    setLoading(button, false);
  }
}

async function deleteEventRole(roleKey) {
  const role = state.eventRoles.find(
    (candidate) => getEventRoleKey(candidate) === roleKey,
  );

  if (!role) {
    showMessage("Role not found", "Could not find this role.", "error");

    return;
  }

  if (isProtectedEventRole(role)) {
    showMessage(
      "Protected role",
      "The admin role cannot be deleted.",
      "warning",
    );

    return;
  }

  const confirmed = window.confirm(
    `Delete role "${role.name || roleKey}"?\n\nUsers with this role will have no role afterwards.`,
  );

  if (!confirmed) {
    return;
  }

  const card = els.eventRoleList?.querySelector(
    `[data-role-card="${CSS.escape(roleKey)}"]`,
  );

  const button = card?.querySelector(
    `[data-role-delete="${CSS.escape(roleKey)}"]`,
  );

  setLoading(button, true);

  try {
    const payload = await apiRequest(
      `/api/admin/event-roles/${encodeURIComponent(roleKey)}`,
      {
        method: "DELETE",
      },
    );

    const affectedUsers = payload?.data?.affectedUsers ?? 0;

    await loadEventRoles({
      silent: true,
    });

    await refreshEventUsersAfterRoleChange();

    showMessage(
      "Role deleted",
      `The role was deleted. ${affectedUsers} user(s) now have no role.`,
      "success",
    );
  } catch (error) {
    showMessage("Deleting role failed", error.message, "error");
  } finally {
    setLoading(button, false);
  }
}

export function registerEventRoleEventListeners() {
  els.reloadEventRolesButton?.addEventListener("click", () => {
    loadEventRoles();
  });

  els.createEventRoleButton?.addEventListener("click", createEventRole);
}
