import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

let sendMock;
let loggerInfoMock;

let PutObjectCommandMock;
let GetObjectCommandMock;
let DeleteObjectCommandMock;
let S3ClientMock;

const DEFAULT_CONFIG = {
  enabled: true,
  endpoint: "https://r2.example.test",
  region: "auto",
  bucket: "kiwi-events-public",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  forcePathStyle: true,
};

async function loadS3StorageProvider({
  target = "public",
  configPatch = {},
} = {}) {
  vi.resetModules();

  sendMock = vi.fn().mockResolvedValue({});

  PutObjectCommandMock = vi.fn(function PutObjectCommand(input) {
    return { commandName: "PutObjectCommand", input };
  });
  GetObjectCommandMock = vi.fn(function GetObjectCommand(input) {
    return { commandName: "GetObjectCommand", input };
  });
  DeleteObjectCommandMock = vi.fn(function DeleteObjectCommand(input) {
    return { commandName: "DeleteObjectCommand", input };
  });
  S3ClientMock = vi.fn(function S3Client(config) {
    this.config = config;
    this.send = sendMock;
  });

  loggerInfoMock = vi.fn();

  vi.doMock("@aws-sdk/client-s3", () => ({
    S3Client: S3ClientMock,
    PutObjectCommand: PutObjectCommandMock,
    GetObjectCommand: GetObjectCommandMock,
    DeleteObjectCommand: DeleteObjectCommandMock,
  }));

  vi.doMock("../../../src/config/logger.js", () => ({
    logger: {
      info: loggerInfoMock,
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  const { createS3StorageProvider } =
    await import("../../../src/modules/storage/providers/s3.storage.provider.js");

  return createS3StorageProvider({
    target,
    config: {
      ...DEFAULT_CONFIG,
      ...configPatch,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("s3.storage.provider", () => {
  it("uploads a buffer with an explicit key", async () => {
    const provider = await loadS3StorageProvider();

    const result = await provider.uploadBuffer({
      buffer: Buffer.from("image"),
      mimeType: "image/png",
      originalName: "event.png",
      folder: "media/events",
      key: "media/events/event.png",
    });

    expect(S3ClientMock).toHaveBeenCalledTimes(1);
    expect(S3ClientMock).toHaveBeenCalledWith({
      region: "auto",
      endpoint: "https://r2.example.test",
      credentials: {
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
      },
      forcePathStyle: true,
    });

    expect(PutObjectCommandMock).toHaveBeenCalledWith({
      Bucket: "kiwi-events-public",
      Key: "media/events/event.png",
      Body: Buffer.from("image"),
      ContentType: "image/png",
    });

    expect(loggerInfoMock).toHaveBeenCalledWith("Storage object uploaded", {
      target: "public",
      provider: "s3",
      bucket: "kiwi-events-public",
      key: "media/events/event.png",
      endpoint: "https://r2.example.test",
      forcePathStyle: true,
    });

    expect(result).toEqual({
      key: "media/events/event.png",
      bucket: "kiwi-events-public",
      storageTarget: "public",
    });
  });

  it("returns the configured private target for private storage", async () => {
    const provider = await loadS3StorageProvider({
      target: "private",
      configPatch: {
        bucket: "kiwi-events-private",
      },
    });

    const result = await provider.uploadBuffer({
      buffer: Buffer.from("pdf"),
      key: "tickets/ticket.pdf",
    });

    expect(result).toEqual({
      key: "tickets/ticket.pdf",
      bucket: "kiwi-events-private",
      storageTarget: "private",
    });
  });

  it("generates a key from folder and original file extension", async () => {
    const provider = await loadS3StorageProvider();

    const result = await provider.uploadBuffer({
      buffer: Buffer.from("image"),
      mimeType: "image/jpeg",
      originalName: "hero.jpeg",
      folder: "media/events",
    });

    expect(result.key).toMatch(/^media\/events\/[0-9a-f-]{36}\.jpeg$/);
    expect(result.bucket).toBe("kiwi-events-public");
    expect(result.storageTarget).toBe("public");
    expect(result).not.toHaveProperty("url");
  });

  it("falls back to application/octet-stream when mimeType is missing", async () => {
    const provider = await loadS3StorageProvider();

    await provider.uploadBuffer({
      buffer: Buffer.from("file"),
      key: "media/events/file.bin",
    });

    expect(PutObjectCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ContentType: "application/octet-stream",
      }),
    );
  });

  it("supports providers without an explicit endpoint", async () => {
    const provider = await loadS3StorageProvider({
      configPatch: {
        endpoint: "",
        region: "eu-central-1",
        forcePathStyle: false,
      },
    });

    await provider.uploadBuffer({
      buffer: Buffer.from("file"),
      key: "media/events/file.bin",
    });

    expect(S3ClientMock).toHaveBeenCalledWith({
      region: "eu-central-1",
      endpoint: undefined,
      credentials: {
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
      },
      forcePathStyle: false,
    });
  });

  it("reads an object and concatenates streamed chunks", async () => {
    const provider = await loadS3StorageProvider();

    sendMock.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("hello "), "from ", Buffer.from("s3")]),
      ContentType: "image/png",
      ContentLength: 13,
    });

    const result = await provider.getBuffer("media/events/read-me.png");

    expect(GetObjectCommandMock).toHaveBeenCalledWith({
      Bucket: "kiwi-events-public",
      Key: "media/events/read-me.png",
    });
    expect(result.buffer.equals(Buffer.from("hello from s3"))).toBe(true);
    expect(result.contentType).toBe("image/png");
    expect(result.contentLength).toBe(13);
  });

  it("falls back to default metadata when get result has no content metadata", async () => {
    const provider = await loadS3StorageProvider();

    sendMock.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("file")]),
    });

    const result = await provider.getBuffer("media/events/file.bin");

    expect(result.buffer.equals(Buffer.from("file"))).toBe(true);
    expect(result.contentType).toBe("application/octet-stream");
    expect(result.contentLength).toBeNull();
  });

  it("deletes an object", async () => {
    const provider = await loadS3StorageProvider();

    const result = await provider.deleteObject("media/events/delete-me.png");

    expect(DeleteObjectCommandMock).toHaveBeenCalledWith({
      Bucket: "kiwi-events-public",
      Key: "media/events/delete-me.png",
    });
    expect(result).toEqual({ success: true });
  });

  it("rejects empty keys for get and delete", async () => {
    const provider = await loadS3StorageProvider();

    await expect(provider.getBuffer("")).rejects.toMatchObject({
      statusCode: 400,
      message: "Storage key is required.",
    });
    await expect(provider.deleteObject("")).rejects.toMatchObject({
      statusCode: 400,
      message: "Storage key is required.",
    });

    expect(GetObjectCommandMock).not.toHaveBeenCalled();
    expect(DeleteObjectCommandMock).not.toHaveBeenCalled();
  });

  it("rejects a storage target that is not enabled", async () => {
    const provider = await loadS3StorageProvider({
      target: "private",
      configPatch: { enabled: false },
    });

    await expect(
      provider.uploadBuffer({
        buffer: Buffer.from("file"),
        key: "tickets/file.pdf",
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "STORAGE_TARGET_NOT_CONFIGURED",
      message: "private storage is not configured.",
    });

    expect(S3ClientMock).not.toHaveBeenCalled();
  });

  it("throws when the target bucket is missing", async () => {
    const provider = await loadS3StorageProvider({
      target: "private",
      configPatch: { bucket: "" },
    });

    await expect(
      provider.uploadBuffer({
        buffer: Buffer.from("file"),
        key: "tickets/file.pdf",
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "private storage bucket is not configured.",
    });

    expect(S3ClientMock).not.toHaveBeenCalled();
  });

  it("throws when target credentials are missing", async () => {
    const provider = await loadS3StorageProvider({
      target: "private",
      configPatch: {
        accessKeyId: "",
        secretAccessKey: "",
      },
    });

    await expect(
      provider.uploadBuffer({
        buffer: Buffer.from("file"),
        key: "tickets/file.pdf",
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "private storage credentials are not configured.",
    });

    expect(S3ClientMock).not.toHaveBeenCalled();
  });
});
