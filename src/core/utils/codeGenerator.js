import crypto from "node:crypto";

const DEFAULT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomReadableCode(length = 8, alphabet = DEFAULT_ALPHABET) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return code;
}
