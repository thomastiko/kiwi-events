import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KIWI_EVENTS_SECRET_PATHS } from "../../src/config/kiwi-events/kiwi-events.secret.constants.js";

import {
  deleteKiwiEventsSecret,
  getKiwiEventsMasterKeyPath,
  getKiwiEventsSecretsPath,
  loadKiwiEventsSecrets,
  getKiwiEventsSecretStatus,
  getStoredKiwiEventsSecret,
  hasStoredKiwiEventsSecret,
  resolveKiwiEventsSecret,
  setKiwiEventsSecret,
  updateKiwiEventsSecrets,
} from "../../src/config/kiwi-events/kiwi-events.secret.store.js";

let temporaryDirectory;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kiwi-events-secret-store-"),
  );

  vi.stubEnv(
    "KIWI_EVENTS_SECRETS_FILE",
    path.join(temporaryDirectory, "kiwi-events.secrets.enc"),
  );

  vi.stubEnv(
    "KIWI_EVENTS_MASTER_KEY_FILE",
    path.join(temporaryDirectory, "kiwi-events.master.key"),
  );
});

afterEach(() => {
  fs.rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
  });

  vi.unstubAllEnvs();
});

describe("Kiwi Events secret store", () => {
  it("encrypts and reads configured secrets", () => {
    const secretPath = KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY;

    const secretValue = "test_mollie_secret_123";

    expect(fs.existsSync(getKiwiEventsSecretsPath())).toBe(false);
    expect(fs.existsSync(getKiwiEventsMasterKeyPath())).toBe(false);

    const result = setKiwiEventsSecret(secretPath, secretValue);

    expect(result.configuredPaths).toEqual([secretPath]);

    expect(fs.existsSync(getKiwiEventsSecretsPath())).toBe(true);
    expect(fs.existsSync(getKiwiEventsMasterKeyPath())).toBe(true);

    const encryptedFile = fs.readFileSync(getKiwiEventsSecretsPath(), "utf8");

    const envelope = JSON.parse(encryptedFile);

    expect(envelope).toMatchObject({
      version: 1,
      algorithm: "aes-256-gcm",
    });

    expect(envelope.iv).toBeTruthy();
    expect(envelope.authenticationTag).toBeTruthy();
    expect(envelope.ciphertext).toBeTruthy();

    // Das Geheimnis darf nicht im Klartext vorkommen.
    expect(encryptedFile).not.toContain(secretValue);

    const encodedMasterKey = fs
      .readFileSync(getKiwiEventsMasterKeyPath(), "utf8")
      .trim();

    expect(Buffer.from(encodedMasterKey, "base64")).toHaveLength(32);

    expect(getStoredKiwiEventsSecret(secretPath)).toBe(secretValue);
    expect(hasStoredKiwiEventsSecret(secretPath)).toBe(true);

    expect(loadKiwiEventsSecrets()).toEqual({
      [secretPath]: secretValue,
    });
  });

  it("prefers environment secrets over stored secrets", () => {
    const secretPath = KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY;

    setKiwiEventsSecret(secretPath, "stored-mollie-secret");

    vi.stubEnv("KIWI_EVENTS_MOLLIE_API_KEY", "environment-mollie-secret");

    expect(getStoredKiwiEventsSecret(secretPath)).toBe("stored-mollie-secret");

    expect(resolveKiwiEventsSecret(secretPath)).toBe(
      "environment-mollie-secret",
    );

    expect(getKiwiEventsSecretStatus(secretPath)).toEqual({
      configured: true,
      source: "environment",
      deletable: false,
    });
  });

  it("reports encrypted-store and missing secret states", () => {
    const secretPath = KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD;

    expect(getKiwiEventsSecretStatus(secretPath)).toEqual({
      configured: false,
      source: "none",
      deletable: false,
    });

    setKiwiEventsSecret(secretPath, "smtp-secret");

    expect(getKiwiEventsSecretStatus(secretPath)).toEqual({
      configured: true,
      source: "encrypted_store",
      deletable: true,
    });
  });

  it("supports repeated updates without losing existing secrets", () => {
    const jwtPath = KIWI_EVENTS_SECRET_PATHS.AUTH_LOCAL_JWT_SECRET;

    const molliePath = KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY;

    setKiwiEventsSecret(jwtPath, "local-jwt-secret");
    setKiwiEventsSecret(molliePath, "mollie-secret");

    expect(loadKiwiEventsSecrets()).toEqual({
      [jwtPath]: "local-jwt-secret",
      [molliePath]: "mollie-secret",
    });

    setKiwiEventsSecret(jwtPath, "updated-jwt-secret");

    expect(loadKiwiEventsSecrets()).toEqual({
      [jwtPath]: "updated-jwt-secret",
      [molliePath]: "mollie-secret",
    });
  });

  it("removes one secret without changing the others", () => {
    const jwtPath = KIWI_EVENTS_SECRET_PATHS.AUTH_LOCAL_JWT_SECRET;

    const smtpPath = KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD;

    updateKiwiEventsSecrets({
      set: {
        [jwtPath]: "jwt-secret",
        [smtpPath]: "smtp-secret",
      },
    });

    const result = deleteKiwiEventsSecret(smtpPath);

    expect(result.configuredPaths).toEqual([jwtPath]);

    expect(hasStoredKiwiEventsSecret(smtpPath)).toBe(false);
    expect(getStoredKiwiEventsSecret(smtpPath)).toBe("");

    expect(loadKiwiEventsSecrets()).toEqual({
      [jwtPath]: "jwt-secret",
    });
  });

  it("rejects unsupported paths and empty secret values", () => {
    expect(() => {
      setKiwiEventsSecret("unsupported.secret", "secret-value");
    }).toThrow("Unsupported Kiwi Events secret path");

    expect(() => {
      setKiwiEventsSecret(KIWI_EVENTS_SECRET_PATHS.MAIL_SMTP_PASSWORD, "   ");
    }).toThrow("must be a non-empty string");
  });

  it("detects manipulation of the encrypted file", () => {
    const secretPath = KIWI_EVENTS_SECRET_PATHS.PAYMENTS_MOLLIE_API_KEY;

    setKiwiEventsSecret(secretPath, "mollie-secret");

    const envelope = JSON.parse(
      fs.readFileSync(getKiwiEventsSecretsPath(), "utf8"),
    );

    const ciphertext = Buffer.from(envelope.ciphertext, "base64");

    ciphertext[0] ^= 0xff;
    envelope.ciphertext = ciphertext.toString("base64");

    fs.writeFileSync(
      getKiwiEventsSecretsPath(),
      `${JSON.stringify(envelope, null, 2)}\n`,
      "utf8",
    );

    expect(() => {
      loadKiwiEventsSecrets();
    }).toThrow("The master key is incorrect or the file was modified");
  });

  it("does not silently replace a missing master key", () => {
    const secretPath = KIWI_EVENTS_SECRET_PATHS.AUTH_LOCAL_JWT_SECRET;

    setKiwiEventsSecret(secretPath, "local-jwt-secret");

    fs.unlinkSync(getKiwiEventsMasterKeyPath());

    expect(() => {
      loadKiwiEventsSecrets();
    }).toThrow("Kiwi Events master key is missing");

    // Es darf kein neuer, unbrauchbarer Schlüssel erzeugt werden.
    expect(fs.existsSync(getKiwiEventsMasterKeyPath())).toBe(false);
  });
});
