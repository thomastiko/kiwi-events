import { MediaAsset } from "../mediaAssets.model.js";

export async function findMediaAssetById(id, options = {}) {
  const query = MediaAsset.findById(id);

  if (options.select) {
    query.select(options.select);
  }

  if (options.lean) {
    query.lean();
  }

  return query;
}

export async function findMediaAssetsByIds(ids, options = {}) {
  const query = MediaAsset.find({
    _id: { $in: ids },
  });

  if (options.select) {
    query.select(options.select);
  }

  if (options.lean) {
    query.lean();
  }

  return query;
}

export async function listMediaAssetsByKind(kind, options = {}) {
  const query = MediaAsset.find({ kind }).sort({ createdAt: -1 });

  if (options.lean) {
    query.lean();
  }

  return query;
}

export async function findMediaAssetByIdAndKind(id, kind, options = {}) {
  const query = MediaAsset.findOne({
    _id: id,
    kind,
  });

  if (options.lean) {
    query.lean();
  }

  return query;
}

export async function createMediaAsset(data) {
  return MediaAsset.create(data);
}

export async function deleteMediaAssetById(id) {
  const asset = await MediaAsset.findById(id);

  if (!asset) {
    return null;
  }

  await asset.deleteOne();

  return asset;
}
export async function listMediaAssetsByKindAndOwnerEventId(
  kind,
  ownerEventId,
  options = {},
) {
  const query = MediaAsset.find({
    kind,
    ownerEventId,
  }).sort({
    createdAt: 1,
  });

  if (options.lean) {
    query.lean();
  }

  return query;
}
