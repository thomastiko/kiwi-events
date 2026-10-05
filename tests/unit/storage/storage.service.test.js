import { afterEach, describe, expect, it, vi } from "vitest";

let localUploadBufferMock;
let localGetBufferMock;
let localDeleteObjectMock;

let publicUploadBufferMock;
let publicGetBufferMock;
let publicDeleteObjectMock;

let privateUploadBufferMock;
let privateGetBufferMock;
let privateDeleteObjectMock;

let createS3StorageProviderMock;

const PUBLIC_CONFIG = {
  enabled: true,
  endpoint: "https://public-s3.example.test",
  region: "auto",
  bucket: "kiwi-events-public",
  publicBaseUrl: "https://assets.example.test",
  accessKeyId: "public-access-key",
  secretAccessKey: "public-secret-key",
  forcePathStyle: false,
};

const PRIVATE_CONFIG = {
  enabled: true,
  endpoint: "https://private-s3.example.test",
  region: "auto",
  bucket: "kiwi-events-private",
  accessKeyId: "private-access-key",
  secretAccessKey: "private-secret-key",
  forcePathStyle: true,
};

async function loadStorageService() {
  vi.resetModules();

  localUploadBufferMock = vi.fn().mockResolvedValue({
    key: "local/file.png",
    bucket: "local",
    storageTarget: "local",
  });
  localGetBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("local"),
    contentType: "application/octet-stream",
    contentLength: 5,
  });
  localDeleteObjectMock = vi.fn().mockResolvedValue({ success: true });

  publicUploadBufferMock = vi.fn().mockResolvedValue({
    key: "public/file.png",
    bucket: "kiwi-events-public",
    storageTarget: "public",
  });
  publicGetBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("public"),
    contentType: "image/png",
    contentLength: 6,
  });
  publicDeleteObjectMock = vi.fn().mockResolvedValue({ success: true });

  privateUploadBufferMock = vi.fn().mockResolvedValue({
    key: "private/file.png",
    bucket: "kiwi-events-private",
    storageTarget: "private",
  });
  privateGetBufferMock = vi.fn().mockResolvedValue({
    buffer: Buffer.from("private"),
    contentType: "application/pdf",
    contentLength: 7,
  });
  privateDeleteObjectMock = vi.fn().mockResolvedValue({ success: true });

  const providers = {
    public: {
      uploadBuffer: publicUploadBufferMock,
      getBuffer: publicGetBufferMock,
      deleteObject: publicDeleteObjectMock,
    },
    private: {
      uploadBuffer: privateUploadBufferMock,
      getBuffer: privateGetBufferMock,
      deleteObject: privateDeleteObjectMock,
    },
  };

  createS3StorageProviderMock = vi.fn(({ target }) => providers[target]);

  vi.doMock("../../../src/config/env.js", () => ({
    env: {
      storage: {
        local: { dir: "uploads" },
        public: PUBLIC_CONFIG,
        private: PRIVATE_CONFIG,
      },
    },
  }));

  vi.doMock(
    "../../../src/modules/storage/providers/local.storage.provider.js",
    () => ({
      localStorageProvider: {
        uploadBuffer: localUploadBufferMock,
        getBuffer: localGetBufferMock,
        deleteObject: localDeleteObjectMock,
      },
    }),
  );

  vi.doMock(
    "../../../src/modules/storage/providers/s3.storage.provider.js",
    () => ({
      createS3StorageProvider: createS3StorageProviderMock,
    }),
  );

  return import("../../../src/modules/storage/storage.service.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("storage.service", () => {
  it("uses local storage by default when no target is provided", async () => {
    const { uploadBuffer, getBuffer, deleteObject } =
      await loadStorageService();

    const uploadParams = {
      buffer: Buffer.from("image"),
      mimeType: "image/png",
      originalName: "event.png",
      folder: "media/events",
    };

    const uploadResult = await uploadBuffer(uploadParams);
    const getResult = await getBuffer({ key: "local/file.png" });
    const deleteResult = await deleteObject({ key: "local/file.png" });

    expect(localUploadBufferMock).toHaveBeenCalledWith(uploadParams);
    expect(localGetBufferMock).toHaveBeenCalledWith("local/file.png");
    expect(localDeleteObjectMock).toHaveBeenCalledWith("local/file.png");
    expect(createS3StorageProviderMock).not.toHaveBeenCalled();

    expect(uploadResult).toEqual({
      key: "local/file.png",
      bucket: "local",
      storageTarget: "local",
    });
    expect(getResult.buffer.equals(Buffer.from("local"))).toBe(true);
    expect(deleteResult).toEqual({ success: true });
  });

  it("routes explicit public storage operations to the public S3 provider", async () => {
    const { uploadBuffer, getBuffer, deleteObject } =
      await loadStorageService();

    const uploadResult = await uploadBuffer({
      storageTarget: "public",
      buffer: Buffer.from("image"),
      mimeType: "image/png",
      originalName: "event.png",
      folder: "media/events",
    });

    await getBuffer({
      storageTarget: "public",
      key: "public/file.png",
    });
    await deleteObject({
      storageTarget: "public",
      key: "public/file.png",
    });

    expect(createS3StorageProviderMock).toHaveBeenCalledTimes(1);
    expect(createS3StorageProviderMock).toHaveBeenCalledWith({
      target: "public",
      config: PUBLIC_CONFIG,
    });
    expect(publicUploadBufferMock).toHaveBeenCalledWith({
      buffer: Buffer.from("image"),
      mimeType: "image/png",
      originalName: "event.png",
      folder: "media/events",
    });
    expect(publicGetBufferMock).toHaveBeenCalledWith("public/file.png");
    expect(publicDeleteObjectMock).toHaveBeenCalledWith("public/file.png");
    expect(localUploadBufferMock).not.toHaveBeenCalled();

    expect(uploadResult.storageTarget).toBe("public");
  });

  it("routes explicit private storage operations to the private S3 provider", async () => {
    const { uploadBuffer, getBuffer, deleteObject } =
      await loadStorageService();

    const uploadResult = await uploadBuffer({
      storageTarget: "private",
      buffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
      key: "tickets/ticket.pdf",
    });

    await getBuffer({
      storageTarget: "private",
      key: "tickets/ticket.pdf",
    });
    await deleteObject({
      storageTarget: "private",
      key: "tickets/ticket.pdf",
    });

    expect(createS3StorageProviderMock).toHaveBeenCalledWith({
      target: "private",
      config: PRIVATE_CONFIG,
    });
    expect(privateUploadBufferMock).toHaveBeenCalledWith({
      buffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
      key: "tickets/ticket.pdf",
    });
    expect(privateGetBufferMock).toHaveBeenCalledWith("tickets/ticket.pdf");
    expect(privateDeleteObjectMock).toHaveBeenCalledWith("tickets/ticket.pdf");
    expect(uploadResult.storageTarget).toBe("private");
  });

  it("normalizes storage target casing and whitespace", async () => {
    const { uploadBuffer } = await loadStorageService();

    await uploadBuffer({
      storageTarget: "  PUBLIC  ",
      buffer: Buffer.from("image"),
    });

    expect(createS3StorageProviderMock).toHaveBeenCalledWith({
      target: "public",
      config: PUBLIC_CONFIG,
    });
  });

  it("throws an AppError for unsupported storage targets", async () => {
    const { uploadBuffer } = await loadStorageService();

    await expect(
      uploadBuffer({
        storageTarget: "ftp",
        buffer: Buffer.from("file"),
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "STORAGE_TARGET_UNSUPPORTED",
      message: "Unsupported storage target.",
    });

    expect(localUploadBufferMock).not.toHaveBeenCalled();
    expect(createS3StorageProviderMock).not.toHaveBeenCalled();
  });
});
