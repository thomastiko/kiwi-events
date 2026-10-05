function valueToString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toLocaleString("de-AT");
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatHtmlTemplateValue(value) {
  return escapeHtml(valueToString(value)).replace(/\r\n|\r|\n/g, "<br>");
}

function renderTemplateString(input, variables = {}, { html = false } = {}) {
  if (!input) {
    return "";
  }

  return String(input).replace(/{{\s*([^}]+)\s*}}/g, (match, rawKey) => {
    const key = String(rawKey || "").trim();

    if (!key) {
      return match;
    }

    const value = variables[key];

    if (value === undefined || value === null) {
      return match;
    }

    return html ? formatHtmlTemplateValue(value) : valueToString(value);
  });
}

function collectTemplateVariableKeys(input, target) {
  if (!input) {
    return;
  }

  const value = String(input);
  const pattern = /{{\s*([^}]+)\s*}}/g;

  for (const match of value.matchAll(pattern)) {
    const key = String(match[1] || "").trim();

    if (key) {
      target.add(key);
    }
  }
}

function isMissingTemplateValue(value) {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

export function getTemplateVariableKeys(template = {}) {
  const keys = new Set();

  for (const rawKey of template.variables || []) {
    const key = String(rawKey || "").trim();

    if (key) {
      keys.add(key);
    }
  }

  collectTemplateVariableKeys(template.subject, keys);
  collectTemplateVariableKeys(template.html, keys);
  collectTemplateVariableKeys(template.text, keys);

  return [...keys];
}

export function renderEmailTemplate(template, variables = {}) {
  return {
    subject: renderTemplateString(template.subject, variables),

    html: renderTemplateString(template.html, variables, {
      html: true,
    }),

    text: renderTemplateString(template.text, variables),
  };
}

export function findMissingTemplateVariables(template = {}, variables = {}) {
  return getTemplateVariableKeys(template).filter((key) =>
    isMissingTemplateValue(variables?.[key]),
  );
}
