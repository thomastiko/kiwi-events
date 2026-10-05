// src/modules/orders/order.model.js

import mongoose from "mongoose";
import { TICKET_TYPE_PRICING_MODE } from "../ticketTypes/ticketType.constants.js";
import {
  ORDER_BUYER_TYPE,
  ORDER_FULFILLMENT_STATUS,
  ORDER_FULFILLMENT_STEP,
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_SOURCE,
  ORDER_STATUS,
} from "./order.constants.js";

const { Schema, model } = mongoose;

const orderItemSchema = new Schema(
  {
    ticketTypeId: {
      type: Schema.Types.ObjectId,
      ref: "TicketType",
      required: true,
      index: true,
    },

    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    lineTotal: {
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

    ticketKindSnapshot: {
      type: String,
      trim: true,
      default: "normal",
    },
    pricingModeSnapshot: {
      type: String,
      enum: Object.values(TICKET_TYPE_PRICING_MODE),
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const orderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    idempotencyScope: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 300,
      default: null,
      select: false,
    },

    idempotencyKey: {
      type: String,
      trim: true,
      minlength: 16,
      maxlength: 200,
      default: null,
      select: false,
    },

    idempotencyRequestHash: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
      default: null,
      select: false,
    },
    idempotencyCompletedAt: {
      type: Date,
      default: null,
      select: false,
    },

    /**
     * Technical host-service ownership.
     *
     * These fields identify the host system that created the order.
     * They are not buyer identity and must never be changed after creation.
     *
     * Required for host-scoped guest-access recovery.
     */
    hostServiceProvider: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
      index: true,
    },

    hostServiceId: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
      index: true,
    },

    /**
     * Buyer/customer snapshot.
     *
     * kiwi-events no longer creates a normal User document for buyers.
     * If the buyer comes from a host system, store provider + externalUserId
     * plus contact snapshots.
     */
    buyerType: {
      type: String,
      enum: Object.values(ORDER_BUYER_TYPE),
      default: ORDER_BUYER_TYPE.GUEST,
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

    buyerRawExternalSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },

    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
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
      index: true,
    },

    eventCategorySnapshot: {
      type: String,
      trim: true,
      default: null,
    },
    eventLocationSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    eventStartsAtSnapshot: {
      type: Date,
      default: null,
      index: true,
    },
    eventTimezoneSnapshot: {
      type: String,
      trim: true,
      default: "Europe/Vienna",
    },
    items: {
      type: [orderItemSchema],
      default: [],
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "EUR",
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    discountCodeIdSnapshot: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
    },

    discountCodeSnapshot: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      immutable: true,
    },

    discountCodeGroupIdSnapshot: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
    },

    discountCodeGroupNameSnapshot: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
    },

    discountPercent: {
      type: Number,
      default: null,
      min: 1,
      max: 100,
      immutable: true,
      validate: {
        validator(value) {
          return value === null || Number.isInteger(value);
        },
        message: "discountPercent must be an integer",
      },
    },

    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      immutable: true,
    },

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: Object.values(ORDER_PAYMENT_STATUS),
      default: ORDER_PAYMENT_STATUS.PENDING,
      index: true,
    },

    paymentProvider: {
      type: String,
      enum: Object.values(ORDER_PAYMENT_PROVIDER),
      default: ORDER_PAYMENT_PROVIDER.NONE,
      index: true,
    },

    paymentProviderPaymentId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    paymentCheckoutUrl: {
      type: String,
      trim: true,
      default: null,
    },

    refundStatus: {
      type: String,
      enum: Object.values(ORDER_REFUND_STATUS),
      default: ORDER_REFUND_STATUS.NONE,
      index: true,
    },

    refundReason: {
      type: String,
      trim: true,
      default: null,
    },

    refundedAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    paymentProviderRefundId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    refundedAt: {
      type: Date,
      default: null,
      index: true,
    },

    refundFailedAt: {
      type: Date,
      default: null,
    },

    refundFailureReason: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    fulfillmentStatus: {
      type: String,
      enum: Object.values(ORDER_FULFILLMENT_STATUS),
      default: ORDER_FULFILLMENT_STATUS.NOT_STARTED,
      index: true,
    },

    fulfillmentStep: {
      type: String,
      enum: [null, ...Object.values(ORDER_FULFILLMENT_STEP)],
      default: null,
    },

    fulfillmentAttemptCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    fulfillmentStartedAt: {
      type: Date,
      default: null,
    },

    fulfillmentCompletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    fulfillmentFailedAt: {
      type: Date,
      default: null,
    },

    fulfillmentLastError: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    fulfillmentLeaseToken: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    fulfillmentLeaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    fulfillmentNextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },

    fulfillmentManualReviewAt: {
      type: Date,
      default: null,
    },
    guestAccessTokenHash: {
      type: String,
      trim: true,
      default: null,
      select: false,
      index: true,
    },

    guestAccessTokenExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    guestAccessLastUsedAt: {
      type: Date,
      default: null,
    },

    guestAccessDownloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    source: {
      type: String,
      enum: Object.values(ORDER_SOURCE),
      default: ORDER_SOURCE.PUBLIC,
      index: true,
    },

    manualAssignmentReason: {
      type: String,
      trim: true,
      default: null,
    },

    confirmedAt: {
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
      trim: true,
      default: null,
    },

    expiresAt: {
      type: Date,
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

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index({ eventId: 1, createdAt: -1 });
orderSchema.index({ eventId: 1, status: 1, createdAt: -1 });
orderSchema.index({ eventId: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({
  hostServiceProvider: 1,
  hostServiceId: 1,
  createdAt: -1,
});
orderSchema.index({
  buyerExternalProvider: 1,
  buyerExternalUserId: 1,
  createdAt: -1,
});
orderSchema.index({ buyerEmailSnapshot: 1, createdAt: -1 });
orderSchema.index(
  {
    idempotencyScope: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    name: "uq_orders_idempotency",
    partialFilterExpression: {
      idempotencyScope: {
        $type: "string",
      },
      idempotencyKey: {
        $type: "string",
      },
    },
  },
);
orderSchema.index({
  status: 1,
  paymentStatus: 1,
  fulfillmentStatus: 1,
  fulfillmentNextRetryAt: 1,
});

orderSchema.index({
  status: 1,
  paymentStatus: 1,
  fulfillmentStatus: 1,
  fulfillmentLeaseExpiresAt: 1,
});

export const Order = mongoose.models.Order || model("Order", orderSchema);
