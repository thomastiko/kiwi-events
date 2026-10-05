import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempDir;

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadLocalStorageProvider({ localDir } = {}) {
  vi.resetModules();

  tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "kiwi-events-local-storage-"),
  );

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      storage: {
        local: {
          dir: localDir || tempDir,
        },
      },
    },
  }));

  const module =
    await import("../../../src/modules/storage/providers/local.storage.provider.js");

  return {
    localStorageProvider: module.localStorageProvider,
    rootDir: localDir || tempDir,
  };
}

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }

  tempDir = null;

  vi.restoreAllMocks();
  vi.resetModules();
});

describe("local.storage.provider", () => {
  it("uploads a buffer to the local filesystem with an explicit key", async () => {
    const { localStorageProvider, rootDir } = await loadLocalStorageProvider();

    const result = await localStorageProvider.uploadBuffer({
      buffer: Buffer.from("event image"),
      originalName: "event.png",
      folder: "media/events",
      key: "media/events/event.png",
    });

    expect(result).toEqual({
      key: "media/events/event.png",
      bucket: "local",
      storageTarget: "local",
    });

    const storedPath = path.join(rootDir, "media", "events", "event.png");
    const storedContent = await fs.readFile(storedPath);

    expect(storedContent.equals(Buffer.from("event image"))).toBe(true);
  });

  it("builds a generated key using the folder and original file extension", async () => {
    const { localStorageProvider, rootDir } = await loadLocalStorageProvider();

    const result = await localStorageProvider.uploadBuffer({
      buffer: Buffer.from("generated"),
      originalName: "hero.jpeg",
      folder: "media/events",
    });

    expect(result.key).toMatch(/^media\/events\/[0-9a-f-]{36}\.jpeg$/);
    expect(result.bucket).toBe("local");
    expect(result.storageTarget).toBe("local");
    expect(result).not.toHaveProperty("url");

    const storedPath = path.join(rootDir, ...result.key.split("/"));
    const storedContent = await fs.readFile(storedPath);

    expect(storedContent.equals(Buffer.from("generated"))).toBe(true);
  });

  it("falls back to .bin extension when originalName has no extension", async () => {
    const { localStorageProvider } = await loadLocalStorageProvider();

    const result = await localStorageProvider.uploadBuffer({
      buffer: Buffer.from("bin"),
      originalName: "file-without-extension",
      folder: "media/events",
    });

    expect(result.key).toMatch(/^media\/events\/[0-9a-f-]{36}\.bin$/);
  });

  it("never returns a public url for stored objects", async () => {
    const { localStorageProvider } = await loadLocalStorageProvider();

    const result = await localStorageProvider.uploadBuffer({
      buffer: Buffer.from("private"),
      key: "media/events/private.png",
    });

    expect(result).toEqual({
      key: "media/events/private.png",
      bucket: "local",
      storageTarget: "local",
    });

    expect(result).not.toHaveProperty("url");
  });

  it("reads a stored local file as a buffer", async () => {
    const { localStorageProvider } = await loadLocalStorageProvider();

    await localStorageProvider.uploadBuffer({
      buffer: Buffer.from("read me"),
      key: "media/events/read-me.png",
    });

    const result = await localStorageProvider.getBuffer(
      "media/events/read-me.png",
    );

    expect(result.buffer.equals(Buffer.from("read me"))).toBe(true);
    expect(result.contentType).toBe("application/octet-stream");
    expect(result.contentLength).toBe(Buffer.byteLength("read me"));
  });

  it("deletes a stored local file", async () => {
    const { localStorageProvider, rootDir } = await loadLocalStorageProvider();

    await localStorageProvider.uploadBuffer({
      buffer: Buffer.from("delete me"),
      key: "media/events/delete-me.png",
    });

    const storedPath = path.join(rootDir, "media", "events", "delete-me.png");

    expect(await pathExists(storedPath)).toBe(true);

    const result = await localStorageProvider.deleteObject(
      "media/events/delete-me.png",
    );

    expect(result).toEqual({ success: true });
    expect(await pathExists(storedPath)).toBe(false);
  });

  it("treats deleting a missing local file as success", async () => {
    const { localStorageProvider } = await loadLocalStorageProvider();

    const result = await localStorageProvider.deleteObject(
      "media/events/missing.png",
    );

    expect(result).toEqual({ success: true });
  });

  it("rejects empty storage keys", async () => {
    const { localStorageProvider } = await loadLocalStorageProvider();

    await expect(localStorageProvider.getBuffer("")).rejects.toMatchObject({
      statusCode: 400,
      message: "Storage key is required.",
    });

    await expect(localStorageProvider.deleteObject("")).rejects.toMatchObject({
      statusCode: 400,
      message: "Storage key is required.",
    });
  });

  it("rejects path traversal outside the local storage root", async () => {
    const { localStorageProvider, rootDir } = await loadLocalStorageProvider();

    await expect(
      localStorageProvider.uploadBuffer({
        buffer: Buffer.from("hack"),
        key: "../outside.txt",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid storage key.",
    });

    await expect(
      localStorageProvider.getBuffer("../outside.txt"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid storage key.",
    });

    await expect(
      localStorageProvider.deleteObject("../outside.txt"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid storage key.",
    });

    const outsidePath = path.resolve(rootDir, "..", "outside.txt");

    expect(await pathExists(outsidePath)).toBe(false);
  });
});
