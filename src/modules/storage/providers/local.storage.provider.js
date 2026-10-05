// src/modules/storage/providers/local.storage.provider.js

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../../config/env.js";
import {
  invalidStorageKeyError,
  storageKeyRequiredError,
} from "../storage.errors.js";

/**
 * Returns the normalized local storage root directory.
 *
 * @returns {string}
 */
function getLocalStorageRoot() {
  return path.resolve(process.cwd(), env.storage.local?.dir || "uploads");
}

/**
 * Ensures that a storage key cannot escape the configured local storage root.
 *
 * @param {string} key
 * @returns {string}
 */
function resolveSafeLocalPath(key) {
  if (!key) {
    throw storageKeyRequiredError();
  }

  const root = getLocalStorageRoot();
  const targetPath = path.resolve(root, key);
  const relativePath = path.relative(root, targetPath);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw invalidStorageKeyError();
  }

  return targetPath;
}

/**
 * Builds a storage key when no explicit key is provided.
 *
 * @param {object} params
 * @param {string} [params.originalName]
 * @param {string} [params.folder]
 * @returns {string}
 */
function buildStorageKey({ originalName, folder = "uploads" }) {
  const extension = originalName?.includes(".")
    ? originalName.split(".").pop()
    : "bin";

  return `${folder}/${uuidv4()}.${extension}`;
}

/**
 * Uploads a buffer to the local filesystem.
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} [params.mimeType]
 * @param {string} [params.originalName]
 * @param {string} [params.folder]
 * @param {string} [params.key]
 * @returns {Promise<{key: string, bucket: string}>}
 */
async function uploadBuffer({ buffer, originalName, folder = "uploads", key }) {
  const finalKey = key || buildStorageKey({ originalName, folder });
  const filePath = resolveSafeLocalPath(finalKey);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);

  return {
    key: finalKey,
    bucket: "local",
    storageTarget: "local",
  };
}

/**
 * Reads a buffer from the local filesystem.
 *
 * @param {string} key
 * @returns {Promise<{buffer: Buffer, contentType: string, contentLength: number|null}>}
 */
async function getBuffer(key) {
  const filePath = resolveSafeLocalPath(key);
  const buffer = await fs.readFile(filePath);
  const stat = await fs.stat(filePath);

  return {
    buffer,
    contentType: "application/octet-stream",
    contentLength: stat.size,
  };
}

/**
 * Deletes an object from the local filesystem.
 *
 * @param {string} key
 * @returns {Promise<{success: boolean}>}
 */
async function deleteObject(key) {
  const filePath = resolveSafeLocalPath(key);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return { success: true };
}

export const localStorageProvider = {
  uploadBuffer,
  getBuffer,
  deleteObject,
};
