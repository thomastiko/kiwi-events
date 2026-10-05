const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlY2ioAAAAASUVORK5CYII=";

export function createTestPngBuffer() {
  return Buffer.from(TEST_PNG_BASE64, "base64");
}
