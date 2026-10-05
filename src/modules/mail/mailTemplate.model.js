import mongoose from "mongoose";
import { EMAIL_TEMPLATE_STATUS } from "./mail.constants.js";

const emailTemplateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    category: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    html: {
      type: String,
      required: true,
      default: "",
    },

    text: {
      type: String,
      default: "",
    },

    variables: {
      type: [String],
      default: [],
    },

    fromName: {
      type: String,
      default: "",
      trim: true,
    },

    fromEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    replyTo: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    status: {
      type: String,
      enum: Object.values(EMAIL_TEMPLATE_STATUS),
      default: EMAIL_TEMPLATE_STATUS.ACTIVE,
      index: true,
    },

    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdByEventUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    updatedByEventUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "email_templates",
  },
);

emailTemplateSchema.index({ module: 1, status: 1 });
emailTemplateSchema.index({ category: 1, status: 1 });

export const EmailTemplate =
  mongoose.models.EmailTemplate ||
  mongoose.model("EmailTemplate", emailTemplateSchema);
