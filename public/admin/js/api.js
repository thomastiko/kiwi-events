import { token } from "./session.js";

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
}

function normalizeApiFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .map((field) => ({
      path: String(field?.path || field?.field || "").trim(),
      message: String(field?.message || "").trim(),
      code: field?.code ? String(field.code).trim() : "",
    }))
    .filter((field) => field.path || field.message);
}

function readableFieldPath(path) {
  return String(path || "")
    .replace(/^(body|params|query)\./, "")
    .replace(/\./g, " → ");
}

function formatApiErrorMessage(apiError, fallbackMessage) {
  const lines = [];

  const mainMessage =
    apiError?.message ||
    apiError?.title ||
    fallbackMessage ||
    "Request failed.";

  lines.push(mainMessage);

  const fields = normalizeApiFields(apiError?.fields);

  if (fields.length) {
    lines.push("");

    fields.forEach((field) => {
      const label = readableFieldPath(field.path);
      const fieldMessage = field.message || "Invalid value.";

      lines.push(label ? `${label}: ${fieldMessage}` : fieldMessage);
    });
  }

  if (apiError?.action) {
    lines.push("");
    lines.push(`Hint: ${apiError.action}`);
  }

  if (apiError?.code) {
    lines.push("");
    lines.push(`Code: ${apiError.code}`);
  }

  return lines.join("\n");
}

class ApiRequestError extends Error {
  constructor({ response, payload, fallbackMessage }) {
    const apiError =
      payload?.error && typeof payload.error === "object"
        ? payload.error
        : null;

    const message = apiError
      ? formatApiErrorMessage(apiError, fallbackMessage)
      : payload?.message || fallbackMessage || "Request failed.";

    super(message);

    this.name = "ApiRequestError";
    this.status = response?.status || 0;
    this.statusCode = response?.status || 0;
    this.code = apiError?.code || null;
    this.title = apiError?.title || response?.statusText || "Request failed";
    this.action = apiError?.action || null;
    this.fields = normalizeApiFields(apiError?.fields);
    this.details = apiError?.details || null;
    this.payload = payload || null;
  }
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return {
        success: false,
        error: {
          code: "INVALID_JSON_RESPONSE",
          title: "Invalid server response",
          message: "The server returned an invalid JSON response.",
        },
      };
    }
  }

  const text = await response.text();

  return {
    success: response.ok,
    message: text,
  };
}

async function requestJson(path, options = {}) {
  const {
    auth = false,
    headers: customHeaders = {},
    ...fetchOptions
  } = options;

  const headers = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  if (auth) {
    if (!token()) {
      throw new Error("Admin session is missing. Please log in again.");
    }

    headers.Authorization = `Bearer ${token()}`;
  }

  const response = await fetch(path, {
    ...fetchOptions,
    cache: "no-store",
    headers,
  });

  if (response.status === 204) {
    return {
      success: true,
      data: null,
    };
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const fallbackMessage = `Request failed with status ${response.status}`;

    const requestError = new ApiRequestError({
      response,
      payload,
      fallbackMessage,
    });

    if (response.status === 401 && unauthorizedHandler) {
      unauthorizedHandler(requestError.message);
    }

    throw requestError;
  }

  return payload;
}

export function apiRequest(path, options = {}) {
  return requestJson(path, { ...options, auth: true });
}

export function publicApiRequest(path, options = {}) {
  return requestJson(path, { ...options, auth: false });
}
