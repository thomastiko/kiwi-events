import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

let tempDir = null;
const originalConfigFile = process.env.KIWI_EVENTS_CONFIG_FILE;

async function loadStoreWithConfig(initialConfig = {}) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kiwi-config-store-test-"));
  const configPath = path.join(tempDir, "kiwi-events.config.json");
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(initialConfig, null, 2)}\n`,
    "utf8",
  );
  process.env.KIWI_EVENTS_CONFIG_FILE = configPath;
  vi.resetModules();

  const store =
    await import("../../src/config/kiwi-events/kiwi-events.config.store.js");
  return { store, configPath };
}

afterEach(() => {
  if (originalConfigFile === undefined) {
    delete process.env.KIWI_EVENTS_CONFIG_FILE;
  } else {
    process.env.KIWI_EVENTS_CONFIG_FILE = originalConfigFile;
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }

  vi.resetModules();
});

describe("kiwi-events config store cache", () => {
  it("returns the immutable cached config instead of rereading external file edits", async () => {
    const { store, configPath } = await loadStoreWithConfig({
      branding: { appName: "Cached App" },
    });

    const first = store.loadKiwiEventsConfig();
    expect(first.branding.appName).toBe("Cached App");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.branding)).toBe(true);

    fs.writeFileSync(
      configPath,
      `${JSON.stringify({ branding: { appName: "External Edit" } }, null, 2)}\n`,
      "utf8",
    );

    const second = store.loadKiwiEventsConfig();
    expect(second).toBe(first);
    expect(second.branding.appName).toBe("Cached App");
  });

  it("updates the in-memory cache immediately after an API/store write", async () => {
    const { store } = await loadStoreWithConfig({
      branding: { appName: "Before" },
    });

    store.loadKiwiEventsConfig();

    const updated = store.updateKiwiEventsConfig({
      branding: { appName: "After" },
    });

    expect(updated.branding.appName).toBe("After");
    expect(Object.isFrozen(updated)).toBe(true);
    expect(store.loadKiwiEventsConfig()).toBe(updated);
  });
});
