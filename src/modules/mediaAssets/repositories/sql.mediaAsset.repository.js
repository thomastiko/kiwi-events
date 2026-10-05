import { randomUUID } from "node:crypto";
import { getDatabaseConnection } from "../../database/database.service.js";
import { STORAGE_TARGETS } from "../../storage/storage.constants.js";

function now() {
  return new Date();
}

function mapMediaAssetRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    kind: row.kind,
    folder: row.folder,
    key: row.storage_key,
    storageTarget: row.storage_target,
    filenameOriginal: row.filename_original || "",
    mimeType: row.mime_type || "",
    size: Number(row.size || 0),
    ownerEventId: row.owner_event_id || null,
    createdByEventUserId: row.created_by_event_user_id,
    updatedByEventUserId: row.updated_by_event_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMediaAssetInsert(data) {
  const timestamp = now();

  return {
    id: randomUUID(),
    kind: data.kind,
    folder: data.folder,
    storage_key: data.key,
    storage_target: data.storageTarget,
    filename_original: data.filenameOriginal || "",
    mime_type: data.mimeType || "",
    size: Number(data.size || 0),
    owner_event_id: data.ownerEventId || null,
    created_by_event_user_id: data.createdByEventUserId,
    updated_by_event_user_id: data.updatedByEventUserId,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function findMediaAssetById(id) {
  const db = getDatabaseConnection();

  const row = await db("media_assets").where({ id }).first();

  return mapMediaAssetRow(row);
}

export async function findMediaAssetsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const db = getDatabaseConnection();

  const rows = await db("media_assets").whereIn("id", ids);

  return rows.map(mapMediaAssetRow);
}

export async function listMediaAssetsByKind(kind) {
  const db = getDatabaseConnection();

  const rows = await db("media_assets")
    .where({ kind })
    .orderBy("created_at", "desc");

  return rows.map(mapMediaAssetRow);
}

export async function findMediaAssetByIdAndKind(id, kind) {
  const db = getDatabaseConnection();

  const row = await db("media_assets")
    .where({
      id,
      kind,
    })
    .first();

  return mapMediaAssetRow(row);
}

export async function createMediaAsset(data) {
  const db = getDatabaseConnection();

  const row = toMediaAssetInsert(data);

  await db("media_assets").insert(row);

  return mapMediaAssetRow(row);
}

export async function deleteMediaAssetById(id) {
  const db = getDatabaseConnection();

  const existing = await findMediaAssetById(id);

  if (!existing) {
    return null;
  }

  await db("media_assets").where({ id }).delete();

  return existing;
}
export async function listMediaAssetsByKindAndOwnerEventId(kind, ownerEventId) {
  const db = getDatabaseConnection();

  const rows = await db("media_assets")
    .where({
      kind,
      owner_event_id: ownerEventId,
    })
    .orderBy("created_at", "asc");

  return rows.map(mapMediaAssetRow);
}
