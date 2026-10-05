// src/modules/ticketTypes/ticketType.model.js

import mongoose from "mongoose";
import {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
  TICKET_TYPE_STATUS,
} from "./ticketType.constants.js";

export {
  TICKET_TYPE_KIND,
  TICKET_TYPE_PRICING_MODE,
  TICKET_TYPE_STATUS,
} from "./ticketType.constants.js";

const { Schema, model } = mongoose;

const ticketTypeSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    status: {
      type: String,
      enum: Object.values(TICKET_TYPE_STATUS),
      default: TICKET_TYPE_STATUS.ACTIVE,
      index: true,
    },

    ticketKind: {
      type: String,
      enum: Object.values(TICKET_TYPE_KIND),
      default: TICKET_TYPE_KIND.NORMAL,
      required: true,
      index: true,
    },

    pricingMode: {
      type: String,
      enum: Object.values(TICKET_TYPE_PRICING_MODE),
      required: true,
      index: true,
    },

    priceGross: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "EUR",
      maxlength: 10,
    },

    stockTotal: {
      type: Number,
      min: 0,
      default: null,
    },

    stockSold: {
      type: Number,
      min: 0,
      default: 0,
    },

    minPerOrder: {
      type: Number,
      min: 1,
      default: 1,
    },

    maxPerOrder: {
      type: Number,
      min: 1,
      default: 10,
    },

    salesStartAt: {
      type: Date,
      default: null,
    },

    salesEndAt: {
      type: Date,
      default: null,
    },

    isPersonalized: {
      type: Boolean,
      default: false,
    },

    sessionIds: [
      {
        type: Schema.Types.ObjectId,
      },
    ],

    sortOrder: {
      type: Number,
      default: 0,
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
  },
);

ticketTypeSchema.index({ eventId: 1, sortOrder: 1, createdAt: -1 });
ticketTypeSchema.index({ eventId: 1, ticketKind: 1 });

ticketTypeSchema.path("stockTotal").validate(function (value) {
  if (value === null) return true;
  return value >= this.stockSold;
}, "stockTotal must not be smaller than stockSold");

ticketTypeSchema.path("maxPerOrder").validate(function (value) {
  if (value === null || value === undefined) return true;
  return value >= this.minPerOrder;
}, "maxPerOrder must be greater than or equal to minPerOrder");

export const TicketType =
  mongoose.models.TicketType || model("TicketType", ticketTypeSchema);
