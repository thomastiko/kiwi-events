import mongoose from "mongoose";

const eventRoleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 64,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    permissions: {
      type: [String],
      default: [],
    },

    isProtected: {
      type: Boolean,
      default: false,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 100,
      index: true,
    },
  },
  { timestamps: true },
);

export const EventRole =
  mongoose.models.EventRole || mongoose.model("EventRole", eventRoleSchema);
