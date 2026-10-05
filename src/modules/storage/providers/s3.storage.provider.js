import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../../config/logger.js";
import {
  storageBucketMissingError,
  storageCredentialsMissingError,
  storageKeyRequiredError,
  storageTargetNotConfiguredError,
} from "../storage.errors.js";

function buildStorageKey({ originalName, folder = "uploads" }) {
  const extension = originalName?.includes(".")
    ? originalName.split(".").pop()
    : "bin";

  return `${folder}/${uuidv4()}.${extension}`;
}

export function createS3StorageProvider({ target, config }) {
  let clientInstance = null;

  function assertConfigured() {
    if (config?.enabled !== true) {
      throw storageTargetNotConfiguredError(target);
    }

    if (!config.bucket) {
      throw storageBucketMissingError(target);
    }

    if (!config.accessKeyId || !config.secretAccessKey) {
      throw storageCredentialsMissingError(target);
    }
  }

  function getClient() {
    assertConfigured();

    if (!clientInstance) {
      clientInstance = new S3Client({
        region: config.region || "auto",
        endpoint: config.endpoint || undefined,

        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },

        forcePathStyle: Boolean(config.forcePathStyle),
      });
    }

    return clientInstance;
  }

  async function uploadBuffer({
    buffer,
    mimeType,
    originalName,
    folder = "uploads",
    key,
  }) {
    const client = getClient();

    const finalKey =
      key ||
      buildStorageKey({
        originalName,
        folder,
      });

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: finalKey,
        Body: buffer,
        ContentType: mimeType || "application/octet-stream",
      }),
    );

    logger.info("Storage object uploaded", {
      target,
      provider: "s3",
      bucket: config.bucket,
      key: finalKey,
      endpoint: config.endpoint || null,
      forcePathStyle: Boolean(config.forcePathStyle),
    });

    return {
      key: finalKey,
      bucket: config.bucket,
      storageTarget: target,
    };
  }

  async function getBuffer(key) {
    const client = getClient();

    if (!key) {
      throw storageKeyRequiredError();
    }

    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    const chunks = [];

    for await (const chunk of result.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: result.ContentType || "application/octet-stream",
      contentLength: result.ContentLength || null,
    };
  }

  async function deleteObject(key) {
    const client = getClient();

    if (!key) {
      throw storageKeyRequiredError();
    }

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    return {
      success: true,
    };
  }

  return Object.freeze({
    uploadBuffer,
    getBuffer,
    deleteObject,
  });
}
