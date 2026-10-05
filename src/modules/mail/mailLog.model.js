import mongoose from "mongoose";
import { EMAIL_LOG_STATUS } from "./mail.constants.js";

const emailRecipientSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const emailSourceSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },

    entityType: {
      type: String,
      default: "",
      trim: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { _id: false },
);

const emailLogSchema = new mongoose.Schema(
  {
    templateKey: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmailTemplate",
      default: null,
    },

    module: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },

    to: {
      type: emailRecipientSchema,
      required: true,
    },

    cc: {
      type: [emailRecipientSchema],
      default: [],
    },

    bcc: {
      type: [emailRecipientSchema],
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

    subjectSnapshot: {
      type: String,
      required: true,
      trim: true,
    },

    htmlSnapshot: {
      type: String,
      default: "",
    },

    textSnapshot: {
      type: String,
      default: "",
    },

    variablesSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    deliveryKey: {
      type: String,
      default: undefined,
      trim: true,
      lowercase: true,
    },

    deliveryClaimToken: {
      type: String,
      default: "",
      trim: true,
    },

    deliveryClaimExpiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(EMAIL_LOG_STATUS),
      default: EMAIL_LOG_STATUS.QUEUED,
      index: true,
    },

    provider: {
      type: String,
      default: "smtp",
      trim: true,
      lowercase: true,
    },

    providerMessageId: {
      type: String,
      default: "",
      trim: true,
    },

    errorMessage: {
      type: String,
      default: "",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    source: {
      type: emailSourceSchema,
      default: () => ({}),
    },

    createdByEventUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "email_logs",
  },
);

emailLogSchema.index({ status: 1, createdAt: -1 });
emailLogSchema.index({ "to.email": 1, createdAt: -1 });
emailLogSchema.index({
  "source.module": 1,
  "source.entityType": 1,
  "source.entityId": 1,
});
emailLogSchema.index(
  {
    deliveryKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      deliveryKey: {
        $type: "string",
      },
    },
  },
);
export const EmailLog =
  mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);
