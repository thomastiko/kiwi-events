export function valueOrUndefined(value) {
  const trimmed = String(value ?? "").trim();

  return trimmed ? trimmed : undefined;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, removeUndefinedDeep(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined),
  );
}
