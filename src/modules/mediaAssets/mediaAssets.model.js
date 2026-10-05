import mongoose from "mongoose";

const { Schema } = mongoose;

export {
  MEDIA_ASSET_KINDS,
  MEDIA_ASSET_KIND_VALUES,
} from "./mediaAsset.constants.js";

import { STORAGE_TARGET_VALUES } from "../storage/storage.constants.js";

import { MEDIA_ASSET_KIND_VALUES } from "./mediaAsset.constants.js";

const mediaAssetSchema = new Schema(
  {
    kind: {
      type: String,
      enum: MEDIA_ASSET_KIND_VALUES,
      required: true,
      index: true,
    },

    folder: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
      index: true,
    },

    storageTarget: {
      type: String,
      enum: STORAGE_TARGET_VALUES,
      required: true,
      index: true,
    },

    filenameOriginal: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    mimeType: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },

    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    ownerEventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      default: null,
      index: true,
    },

    createdByEventUserId: {
      type: Schema.Types.ObjectId,
      ref: "EventUser",
      default: null,
      index: true,
    },

    updatedByEventUserId: {
      type: Schema.Types.ObjectId,
      ref: "EventUser",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);
mediaAssetSchema.index(
  {
    storageTarget: 1,
    key: 1,
  },
  {
    unique: true,
    name: "uq_media_assets_storage_target_key",
  },
);

export const MediaAsset =
  mongoose.models.MediaAsset || mongoose.model("MediaAsset", mediaAssetSchema);
