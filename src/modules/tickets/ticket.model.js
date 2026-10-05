// src/modules/tickets/ticket.model.js

import mongoose from "mongoose";
import {
  TICKET_DEPOSIT_REFUND_STATUS,
  TICKET_KIND,
  TICKET_STATUS,
} from "./ticket.constants.js";
import { STORAGE_TARGET_VALUES } from "../storage/storage.constants.js";

const { Schema, model } = mongoose;

const ticketSchema = new Schema(
  {
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderItemIndex: {
      type: Number,
      required: true,
      min: 0,
    },

    orderItemUnitIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    ticketTypeId: {
      type: Schema.Types.ObjectId,
      ref: "TicketType",
      required: true,
      index: true,
    },

    buyerType: {
      type: String,
      default: "guest",
      index: true,
    },

    buyerExternalProvider: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    buyerExternalUserId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    buyerEmailSnapshot: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    buyerFirstNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    buyerLastNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    buyerDisplayNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    holderType: {
      type: String,
      default: "buyer",
      index: true,
    },

    holderExternalProvider: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    holderExternalUserId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    holderEmailSnapshot: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    holderFirstNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    holderLastNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    holderDisplayNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    eventTitleSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    eventSlugSnapshot: {
      type: String,
      trim: true,
      default: null,
    },

    eventCategorySnapshot: {
      type: String,
      trim: true,
      default: null,
    },

    eventStartsAtSnapshot: {
      type: Date,
      default: null,
      index: true,
    },

    ticketTypeNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    ticketTypeDescriptionSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    ticketKind: {
      type: String,
      enum: Object.values(TICKET_KIND),
      default: TICKET_KIND.NORMAL,
      index: true,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "EUR",
    },

    status: {
      type: String,
      enum: Object.values(TICKET_STATUS),
      default: TICKET_STATUS.ACTIVE,
      index: true,
    },

    checkedInAt: {
      type: Date,
      default: null,
      index: true,
    },

    checkedInByEventUserId: {
      type: Schema.Types.ObjectId,
      ref: "EventUser",
      default: null,
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: null,
    },

    checkInTokenHash: {
      type: String,
      trim: true,
      default: null,
      index: true,
      select: false,
    },

    encryptedCheckInToken: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    checkInPayloadVersion: {
      type: Number,
      default: 1,
    },

    checkInTokenCreatedAt: {
      type: Date,
      default: null,
    },

    checkInTokenRotatedAt: {
      type: Date,
      default: null,
    },

    checkInTokenLastUsedAt: {
      type: Date,
      default: null,
    },

    ticketPdfStorageKey: {
      type: String,
      trim: true,
      default: null,
    },
    ticketPdfStorageTarget: {
      type: String,
      enum: STORAGE_TARGET_VALUES,
      default: null,
    },

    ticketPdfGeneratedAt: {
      type: Date,
      default: null,
    },

    depositRefundStatus: {
      type: String,
      enum: Object.values(TICKET_DEPOSIT_REFUND_STATUS),
      default: TICKET_DEPOSIT_REFUND_STATUS.NOT_REQUIRED,
      index: true,
    },

    depositRefundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    depositRefundCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "EUR",
    },

    depositRefundProviderRefundId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    depositRefundTriggeredAt: {
      type: Date,
      default: null,
    },

    depositRefundTriggeredByEventUserId: {
      type: Schema.Types.ObjectId,
      ref: "EventUser",
      default: null,
    },

    depositRefundFailureReason: {
      type: String,
      trim: true,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
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

ticketSchema.index({ orderId: 1, createdAt: -1 });
ticketSchema.index({ eventId: 1, createdAt: -1 });
ticketSchema.index({ ticketTypeId: 1, createdAt: -1 });
ticketSchema.index({
  buyerExternalProvider: 1,
  buyerExternalUserId: 1,
  createdAt: -1,
});
ticketSchema.index({
  holderExternalProvider: 1,
  holderExternalUserId: 1,
  createdAt: -1,
});
ticketSchema.index(
  {
    orderId: 1,
    orderItemIndex: 1,
    orderItemUnitIndex: 1,
  },
  {
    unique: true,
    name: "uq_tickets_order_item_unit",
  },
);

export const Ticket = mongoose.models.Ticket || model("Ticket", ticketSchema);
