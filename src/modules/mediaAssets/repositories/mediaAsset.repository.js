import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import { getDatabaseProvider } from "../../database/database.service.js";

import * as mongoMediaAssetRepository from "./mongo.mediaAsset.repository.js";
import * as sqlMediaAssetRepository from "./sql.mediaAsset.repository.js";

function getMediaAssetRepositoryContext() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return {
      provider,
      repository: mongoMediaAssetRepository,
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    return {
      provider,
      repository: sqlMediaAssetRepository,
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

function toPlainMediaAssetRecord(asset) {
  if (!asset) {
    return null;
  }

  if (typeof asset.toObject === "function") {
    return asset.toObject();
  }

  return asset;
}

function normalizeRequiredId(value, fieldName) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot normalize a MediaAsset without ${fieldName}.`);
  }

  if (typeof value === "string") {
    const id = value.trim();

    if (!id) {
      throw new TypeError(
        `Cannot normalize a MediaAsset without ${fieldName}.`,
      );
    }

    return id;
  }

  if (typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const id = String(value).trim();

  if (!id) {
    throw new TypeError(`Cannot normalize a MediaAsset without ${fieldName}.`);
  }

  return id;
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredId(value, "referenced id");
}

function toCanonicalMediaAssetRecord(asset, provider) {
  const record = toPlainMediaAssetRecord(asset);

  if (!record) {
    return null;
  }

  const id =
    provider === DATABASE_PROVIDER.MONGODB
      ? normalizeRequiredId(record._id, "MongoDB _id")
      : normalizeRequiredId(record.id, "SQL id");

  const {
    _id,
    __v,
    id: ignoredId,

    ownerEventId,

    createdByEventUserId,
    updatedByEventUserId,

    ...fields
  } = record;

  return {
    id,
    ...fields,
    ownerEventId:
      ownerEventId === undefined
        ? undefined
        : normalizeOptionalId(ownerEventId),

    createdByEventUserId:
      createdByEventUserId === undefined
        ? undefined
        : normalizeOptionalId(createdByEventUserId),

    updatedByEventUserId:
      updatedByEventUserId === undefined
        ? undefined
        : normalizeOptionalId(updatedByEventUserId),
  };
}

export async function findMediaAssetById(id, options = {}) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const asset = await repository.findMediaAssetById(id, options);

  return toCanonicalMediaAssetRecord(asset, provider);
}

export async function findMediaAssetsByIds(ids, options = {}) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const assets = await repository.findMediaAssetsByIds(ids, options);

  return assets.map((asset) => toCanonicalMediaAssetRecord(asset, provider));
}

export async function createMediaAsset(data) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const asset = await repository.createMediaAsset(data);

  return toCanonicalMediaAssetRecord(asset, provider);
}

export async function deleteMediaAssetById(id) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const asset = await repository.deleteMediaAssetById(id);

  return toCanonicalMediaAssetRecord(asset, provider);
}

export async function listMediaAssetsByKind(kind, options = {}) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const assets = await repository.listMediaAssetsByKind(kind, options);

  return assets.map((asset) => toCanonicalMediaAssetRecord(asset, provider));
}

export async function findMediaAssetByIdAndKind(id, kind, options = {}) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const asset = await repository.findMediaAssetByIdAndKind(id, kind, options);

  return toCanonicalMediaAssetRecord(asset, provider);
}
export async function listMediaAssetsByKindAndOwnerEventId(
  kind,
  ownerEventId,
  options = {},
) {
  const { provider, repository } = getMediaAssetRepositoryContext();

  const assets = await repository.listMediaAssetsByKindAndOwnerEventId(
    kind,
    ownerEventId,
    options,
  );

  return assets.map((asset) => toCanonicalMediaAssetRecord(asset, provider));
}
