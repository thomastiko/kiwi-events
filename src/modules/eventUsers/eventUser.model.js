import mongoose from "mongoose";

import {
  EVENT_USER_ROLES,
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_AUTH_PROVIDER_VALUES,
} from "./eventUser.constants.js";

export {
  EVENT_USER_ROLES,
  EVENT_USER_AUTH_PROVIDER,
  EVENT_USER_AUTH_PROVIDER_VALUES,
} from "./eventUser.constants.js";

const eventUserSchema = new mongoose.Schema(
  {
    authProvider: {
      type: String,
      enum: EVENT_USER_AUTH_PROVIDER_VALUES,
      default: EVENT_USER_AUTH_PROVIDER.EXTERNAL,
      index: true,
    },

    emailSnapshot: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: {
        unique: true,
        partialFilterExpression: {
          authProvider: { $in: ["local", "hybrid"] },
          emailSnapshot: { $type: "string", $ne: "" },
        },
      },
    },

    passwordHash: {
      type: String,
      default: null,
      select: false,
    },

    externalProvider: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      index: true,
    },

    externalUserId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    firstNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    lastNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    profileBio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 3000,
    },

    profileImageAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaAsset",
      default: null,
      index: true,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    /**
     * Only role key is stored on EventUser.
     * The permissions are resolved through EventRole.
     *
     * null means: this EventUser currently has no role and no event permissions.
     */
    role: {
      type: String,
      trim: true,
      lowercase: true,
      default: EVENT_USER_ROLES.EVENT_MANAGER,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

eventUserSchema.index(
  {
    externalProvider: 1,
    externalUserId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      externalProvider: { $type: "string", $ne: null },
      externalUserId: { $type: "string", $ne: null },
    },
  },
);

export const EventUser =
  mongoose.models.EventUser || mongoose.model("EventUser", eventUserSchema);
