import { state } from "./state.js";
import { STORAGE_KEYS } from "./constants.js";

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Browser storage may be unavailable. */
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* Browser storage may be unavailable. */
  }
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function token() {
  return String(state.accessToken || "").trim();
}

export function persistSession() {
  if (token()) {
    writeStorage(STORAGE_KEYS.accessToken, token());
  } else {
    removeStorage(STORAGE_KEYS.accessToken);
  }

  if (state.user) {
    writeStorage(STORAGE_KEYS.user, JSON.stringify(state.user));
  } else {
    removeStorage(STORAGE_KEYS.user);
  }
}

export function restoreSession() {
  state.accessToken = String(
    readStorage(STORAGE_KEYS.accessToken) || "",
  ).trim();

  state.user = parseJson(readStorage(STORAGE_KEYS.user));
}
