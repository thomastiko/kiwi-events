// src/modules/events/event.model.js

import mongoose from "mongoose";
import {
  EVENT_CATEGORY_VALUES,
  EVENT_STATUS_VALUES,
  EVENT_VISIBILITY_VALUES,
  SESSION_STATUS_VALUES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "./event.constants.js";

const { Schema } = mongoose;

const eventSessionSchema = new Schema(
  {
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      default: "Europe/Vienna",
      trim: true,
    },
    locationLabel: {
      type: String,
      trim: true,
      default: "",
    },
    locationDetails: {
      type: String,
      trim: true,
      default: "",
    },
    capacity: {
      type: Number,
      min: 1,
      default: null,
    },
    status: {
      type: String,
      enum: SESSION_STATUS_VALUES,
      default: "scheduled",
    },
  },
  { _id: true },
);

const eventFaqSchema = new Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true },
);

const eventSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    category: {
      type: String,
      enum: EVENT_CATEGORY_VALUES,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: EVENT_STATUS_VALUES,
      default: EVENT_STATUSES.DRAFT,
      index: true,
    },

    visibility: {
      type: String,
      enum: EVENT_VISIBILITY_VALUES,
      default: EVENT_VISIBILITIES.PUBLIC,
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    imageAssetIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "MediaAsset",
        },
      ],
      default: [],
      index: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    sessions: {
      type: [eventSessionSchema],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one session is required.",
      },
    },

    faqs: {
      type: [eventFaqSchema],
      default: [],
    },

    isFree: {
      type: Boolean,
      default: true,
    },

    salesStartAt: {
      type: Date,
      default: null,
    },

    salesEndAt: {
      type: Date,
      default: null,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    featuredOrder: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    notesInternal: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
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

    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },

    isCancellationFinalized: {
      type: Boolean,
      default: false,
      index: true,
    },

    cancellationFinalizedAt: {
      type: Date,
      default: null,
    },

    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

eventSchema.index({ category: 1, status: 1, visibility: 1 });
eventSchema.index({
  title: "text",
  shortDescription: "text",
  description: "text",
});

export const Event =
  mongoose.models.Event || mongoose.model("Event", eventSchema);
