function normalizeError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: error.status,
      code: error.code,
    };
  }

  return error;
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }

  const normalized = { ...meta };

  if ("error" in normalized) {
    normalized.error = normalizeError(normalized.error);
  }

  return normalized;
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (meta === undefined) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      prefix,
      message,
    );
    return;
  }

  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    prefix,
    message,
    normalizeMeta(meta),
  );
}

export const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
