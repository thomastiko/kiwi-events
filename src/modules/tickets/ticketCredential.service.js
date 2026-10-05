// src/modules/tickets/ticketCredential.service.js

import crypto from "crypto";
import { getTicketQrSecret } from "./ticketQr.config.js";

import {
  emptyQrCodePayloadError,
  encryptedQrTokenMissingError,
  invalidQrCodePayloadError,
  invalidQrTokenFormatError,
  qrTokenRequiredError,
} from "./ticket.errors.js";

const QR_PAYLOAD_PREFIX = "kiwi-events-ticket";
const QR_PAYLOAD_VERSION = "v1";
const TOKEN_BYTES = 32;
const HASH_ALGORITHM = "sha256";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const ticketQrSecret = getTicketQrSecret();

  return crypto.createHash(HASH_ALGORITHM).update(ticketQrSecret).digest();
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value) {
  const input = String(value || "")
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(input + padding, "base64");
}

export function createRawCheckInToken() {
  return base64UrlEncode(crypto.randomBytes(TOKEN_BYTES));
}

export function hashCheckInToken(rawToken) {
  const token = String(rawToken || "").trim();

  if (!token) {
    throw qrTokenRequiredError();
  }

  return crypto.createHash(HASH_ALGORITHM).update(token).digest("hex");
}

export function encryptCheckInToken(rawToken) {
  const token = String(rawToken || "").trim();

  if (!token) {
    throw qrTokenRequiredError();
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    QR_PAYLOAD_VERSION,
    base64UrlEncode(iv),
    base64UrlEncode(authTag),
    base64UrlEncode(encrypted),
  ].join(":");
}

export function decryptCheckInToken(encryptedValue) {
  const value = String(encryptedValue || "").trim();

  if (!value) {
    throw encryptedQrTokenMissingError();
  }

  const [version, ivValue, authTagValue, encryptedTokenValue] =
    value.split(":");

  if (
    version !== QR_PAYLOAD_VERSION ||
    !ivValue ||
    !authTagValue ||
    !encryptedTokenValue
  ) {
    throw invalidQrTokenFormatError();
  }

  const key = getEncryptionKey();
  const iv = base64UrlDecode(ivValue);
  const authTag = base64UrlDecode(authTagValue);
  const encryptedToken = base64UrlDecode(encryptedTokenValue);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedToken),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function buildCheckInPayloadFromRawToken(rawToken) {
  const token = String(rawToken || "").trim();

  if (!token) {
    throw emptyQrCodePayloadError();
  }

  return `${QR_PAYLOAD_PREFIX}:${QR_PAYLOAD_VERSION}:${token}`;
}

export function extractRawTokenFromCheckInPayload(payload) {
  const value = String(payload || "").trim();

  if (!value) {
    throw invalidQrCodePayloadError();
  }

  /**
   * Supported QR input formats:
   * 1. kiwi-events-ticket:v1:<token>
   * 2. <token> directly
   * 3. URL with ?t=<payload or token> or ?token=<payload or token>
   */
  let candidate = value;

  try {
    const url = new URL(value);
    const queryToken =
      url.searchParams.get("t") || url.searchParams.get("token");
    if (queryToken) candidate = queryToken;
  } catch {
    // Not a URL, keep the raw input.
  }

  if (candidate.startsWith(`${QR_PAYLOAD_PREFIX}:`)) {
    const parts = candidate.split(":");

    if (parts.length !== 3 || parts[1] !== QR_PAYLOAD_VERSION || !parts[2]) {
      throw invalidQrCodePayloadError();
    }

    return parts[2].trim();
  }

  return candidate.trim();
}

export function buildCredentialForTicket() {
  const rawToken = createRawCheckInToken();

  return {
    rawToken,
    tokenHash: hashCheckInToken(rawToken),
    encryptedToken: encryptCheckInToken(rawToken),

    // Persisted DB version is numeric.
    // The QR payload/encrypted token format still uses "v1".
    payloadVersion: 1,

    qrPayload: buildCheckInPayloadFromRawToken(rawToken),
  };
}

export function buildQrPayloadFromEncryptedToken(encryptedToken) {
  const rawToken = decryptCheckInToken(encryptedToken);
  return buildCheckInPayloadFromRawToken(rawToken);
}

export function hashCheckInPayload(payload) {
  const rawToken = extractRawTokenFromCheckInPayload(payload);
  return hashCheckInToken(rawToken);
}
