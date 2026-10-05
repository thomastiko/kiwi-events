import mongoose from "mongoose";

import { TICKET_TEMPLATE_SCHEMA_VERSION } from "./ticketTemplate.constants.js";

const { Schema, model } = mongoose;

const ticketTemplateSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
      index: true,
    },

    schemaVersion: {
      type: Number,
      required: true,
      min: 1,
      default: TICKET_TEMPLATE_SCHEMA_VERSION,
    },

    revision: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    template: {
      type: Schema.Types.Mixed,
      required: true,
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

export const TicketTemplate =
  mongoose.models.TicketTemplate ||
  model("TicketTemplate", ticketTemplateSchema);
