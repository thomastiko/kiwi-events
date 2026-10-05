import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const PASSWORD_HASH_ALGORITHM = "scrypt";
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;

/**
 * Creates a password hash.
 *
 * Format:
 * scrypt:<saltHex>:<hashHex>
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const normalizedPassword = String(password || "");

  if (!normalizedPassword) {
    throw new Error("Password is required");
  }

  const salt = randomBytes(PASSWORD_SALT_LENGTH);
  const derivedKey = await scrypt(
    normalizedPassword,
    salt,
    PASSWORD_KEY_LENGTH,
  );

  return [
    PASSWORD_HASH_ALGORITHM,
    salt.toString("hex"),
    Buffer.from(derivedKey).toString("hex"),
  ].join(":");
}

/**
 * Verifies a password against a stored hash.
 *
 * @param {string} password
 * @param {string|null|undefined} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  const normalizedPassword = String(password || "");
  const normalizedHash = String(storedHash || "");

  if (!normalizedPassword || !normalizedHash) {
    return false;
  }

  const [algorithm, saltHex, hashHex] = normalizedHash.split(":");

  if (algorithm !== PASSWORD_HASH_ALGORITHM || !saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const actual = await scrypt(normalizedPassword, salt, expected.length);

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), expected);
}
