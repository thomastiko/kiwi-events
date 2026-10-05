function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(...objects) {
  const result = {};

  for (const object of objects) {
    if (!isPlainObject(object)) {
      continue;
    }

    for (const [key, value] of Object.entries(object)) {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(result[key], value);
        continue;
      }

      if (isPlainObject(value)) {
        result[key] = deepMerge(value);
        continue;
      }

      result[key] = value;
    }
  }

  return result;
}
export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}
