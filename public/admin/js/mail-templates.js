import { state } from "./state.js";
import { els } from "./elements.js";
import { apiRequest } from "./api.js";

import {
  setInputValue,
  setLoading,
  setSelectValue,
  setText,
  showMessage,
} from "./ui.js";

import { removeUndefinedDeep, valueOrUndefined } from "./utils.js";

function getTemplateId(template) {
  return template?._id || template?.id;
}

function normalizeTemplateList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.templates)) {
    return payload.templates;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (payload?.data && Array.isArray(payload.data.templates)) {
    return payload.data.templates;
  }

  return [];
}

function selectedTemplate() {
  return state.mailTemplates.find(
    (template) =>
      String(getTemplateId(template)) === String(state.selectedMailTemplateId),
  );
}

function setTemplateEditMode(enabled) {
  document.querySelectorAll("[data-template-editable]").forEach((input) => {
    input.disabled = !enabled;
  });

  if (els.saveMailTemplateButton) {
    els.saveMailTemplateButton.disabled = !enabled;
  }

  if (els.editMailTemplateButton) {
    els.editMailTemplateButton.disabled = enabled;

    els.editMailTemplateButton.textContent = enabled
      ? "Editing..."
      : "Edit template";
  }
}

function parseTemplateVariables(rawValue) {
  const raw = String(rawValue || "").trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    /* Fall back to comma separated input. */
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderTemplateVariables(variables) {
  if (!variables) {
    return "";
  }

  if (Array.isArray(variables)) {
    return JSON.stringify(variables, null, 2);
  }

  return String(variables);
}

function renderMailTemplateList() {
  if (!els.mailTemplateList) {
    return;
  }

  if (!state.mailTemplates.length) {
    els.mailTemplateList.innerHTML =
      '<div class="empty-state">No templates loaded yet.</div>';

    return;
  }

  els.mailTemplateList.innerHTML = state.mailTemplates
    .map((template) => {
      const templateId = getTemplateId(template);

      const key = template.key || template.templateKey || templateId;

      const selected =
        String(templateId) === String(state.selectedMailTemplateId);

      const status = template.status || "unknown";

      return `
          <button
            type="button"
            class="mail-template-item ${selected ? "active" : ""}"
            data-template-id="${templateId}"
          >
            <span class="mail-template-name">
              ${template.name || key}
            </span>

            <span class="mail-template-key">
              ${key}
            </span>

            <span class="mail-template-status">
              ${status}
            </span>
          </button>
        `;
    })
    .join("");

  els.mailTemplateList
    .querySelectorAll("[data-template-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        selectMailTemplate(button.dataset.templateId);
      });
    });
}

export function clearMailTemplateEditor() {
  state.selectedMailTemplateId = null;

  els.mailTemplateEmptyState?.classList.remove("hidden");

  els.mailTemplateEditorForm?.classList.add("hidden");

  setTemplateEditMode(false);
}

function selectMailTemplate(templateId) {
  state.selectedMailTemplateId = templateId;

  const template = selectedTemplate();

  if (!template) {
    clearMailTemplateEditor();
    renderMailTemplateList();

    return;
  }

  const key = template.key || template.templateKey || "-";

  els.mailTemplateEmptyState?.classList.add("hidden");

  els.mailTemplateEditorForm?.classList.remove("hidden");

  setText(els.mailTemplateEditorTitle, template.name || key);

  setText(
    els.mailTemplateEditorMeta,
    template.description || "Edit this mail template.",
  );

  setText(els.mailTemplateKey, key);

  setText(els.mailTemplateModule, template.module);

  setText(els.mailTemplateCategory, template.category);

  setText(els.mailTemplateIsSystem, template.isSystem ? "Yes" : "No");

  setInputValue(els.mailTemplateName, template.name);

  setSelectValue(els.mailTemplateStatus, template.status || "active");

  setInputValue(els.mailTemplateDescription, template.description);

  setInputValue(els.mailTemplateSubject, template.subject);

  setInputValue(els.mailTemplateHtml, template.html);

  setInputValue(
    els.mailTemplateVariables,
    renderTemplateVariables(template.variables),
  );

  setTemplateEditMode(false);
  renderMailTemplateList();
}

function collectMailTemplatePatch() {
  return removeUndefinedDeep({
    name: valueOrUndefined(els.mailTemplateName?.value),

    status: valueOrUndefined(els.mailTemplateStatus?.value),

    description: valueOrUndefined(els.mailTemplateDescription?.value),

    subject: valueOrUndefined(els.mailTemplateSubject?.value),

    html: valueOrUndefined(els.mailTemplateHtml?.value),

    variables: parseTemplateVariables(els.mailTemplateVariables?.value),
  });
}

export async function loadMailTemplates({ silent = false } = {}) {
  if (!els.featureMail?.checked) {
    if (!silent) {
      showMessage(
        "Mailing disabled",
        "Enable mailing before loading templates.",
        "warning",
      );
    }

    return;
  }

  setLoading(els.loadMailTemplatesButton, true);

  try {
    const payload = await apiRequest("/api/admin/mail/templates");

    state.mailTemplates = normalizeTemplateList(payload);

    renderMailTemplateList();

    if (state.selectedMailTemplateId) {
      selectMailTemplate(state.selectedMailTemplateId);
    } else {
      clearMailTemplateEditor();
    }

    if (!silent) {
      showMessage(
        "Templates loaded",
        `${state.mailTemplates.length} templates loaded.`,
        "success",
      );
    }

    return state.mailTemplates;
  } catch (error) {
    if (!silent) {
      showMessage("Loading templates failed", error.message, "error");

      return null;
    }

    throw error;
  } finally {
    setLoading(els.loadMailTemplatesButton, false);
  }
}

async function saveSelectedMailTemplate() {
  const template = selectedTemplate();

  if (!template) {
    showMessage(
      "No template selected",
      "Select a mail template first.",
      "warning",
    );

    return;
  }

  setLoading(els.saveMailTemplateButton, true);

  try {
    const templateId = getTemplateId(template);

    await apiRequest(`/api/admin/mail/templates/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify(collectMailTemplatePatch()),
    });

    await loadMailTemplates({
      silent: true,
    });

    selectMailTemplate(templateId);

    showMessage(
      "Template saved",
      "Mail template content was updated.",
      "success",
    );
  } catch (error) {
    showMessage("Saving template failed", error.message, "error");
  } finally {
    setLoading(els.saveMailTemplateButton, false);
  }
}

async function sendSelectedMailTemplateTest() {
  const template = selectedTemplate();

  const recipientEmail = valueOrUndefined(els.mailTemplateTestEmail?.value);

  if (!template) {
    showMessage(
      "No template selected",
      "Select a mail template first.",
      "warning",
    );

    return;
  }

  if (!recipientEmail) {
    showMessage(
      "Missing recipient",
      "Test recipient email is required.",
      "warning",
    );

    return;
  }

  setLoading(els.sendMailTemplateTestButton, true);

  try {
    await apiRequest(
      `/api/admin/mail/templates/${getTemplateId(template)}/test`,
      {
        method: "POST",

        body: JSON.stringify({
          to: {
            email: recipientEmail,
            name: "",
          },

          variables: {},
        }),
      },
    );

    showMessage(
      "Test mail sent",
      `A test mail was sent to ${recipientEmail}.`,
      "success",
    );
  } catch (error) {
    showMessage("Test mail failed", error.message, "error");
  } finally {
    setLoading(els.sendMailTemplateTestButton, false);
  }
}

export function registerMailTemplateEventListeners() {
  els.loadMailTemplatesButton?.addEventListener("click", () => {
    loadMailTemplates();
  });

  els.editMailTemplateButton?.addEventListener("click", () => {
    setTemplateEditMode(true);
  });

  els.saveMailTemplateButton?.addEventListener(
    "click",
    saveSelectedMailTemplate,
  );

  els.sendMailTemplateTestButton?.addEventListener(
    "click",
    sendSelectedMailTemplateTest,
  );
}
