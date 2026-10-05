import mongoose from "mongoose";

import { PAYMENT_PROVIDERS } from "../payments/payment.constants.js";
import {
  PAYMENT_REFUND_SOURCE_TYPE_VALUES,
  PAYMENT_REFUND_STATUS,
  PAYMENT_REFUND_STATUS_VALUES,
} from "./paymentRefund.constants.js";

const { Schema, model } = mongoose;

const paymentRefundSchema = new Schema(
  {
    sourceType: {
      type: String,
      enum: PAYMENT_REFUND_SOURCE_TYPE_VALUES,
      required: true,
      trim: true,
    },

    sourceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    orderId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    ticketId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    provider: {
      type: String,
      enum: [PAYMENT_PROVIDERS.MOLLIE, PAYMENT_PROVIDERS.STRIPE],
      required: true,
      trim: true,
      lowercase: true,
    },

    providerPaymentId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    providerRefundId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Refund amount must be a safe integer in minor units.",
      },
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 10,
      default: "EUR",
    },

    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    status: {
      type: String,
      enum: PAYMENT_REFUND_STATUS_VALUES,
      required: true,
      default: PAYMENT_REFUND_STATUS.PENDING,
    },

    attemptCount: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Refund attempt count must be a safe integer.",
      },
    },

    leaseToken: {
      type: String,
      trim: true,
      maxlength: 36,
      default: null,
      select: false,
    },

    leaseExpiresAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    nextRetryAt: {
      type: Date,
      default: null,
    },

    providerSucceededAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },

    triggeredByEventUserId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

paymentRefundSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    name: "uq_payment_refunds_idempotency_key",
  },
);

paymentRefundSchema.index(
  { sourceType: 1, sourceId: 1 },
  {
    unique: true,
    name: "uq_payment_refunds_source",
  },
);

paymentRefundSchema.index(
  { status: 1, nextRetryAt: 1, leaseExpiresAt: 1, updatedAt: 1 },
  {
    name: "idx_payment_refunds_retryable",
  },
);

paymentRefundSchema.index(
  { provider: 1, providerPaymentId: 1 },
  {
    name: "idx_payment_refunds_provider_payment",
  },
);

paymentRefundSchema.index(
  { provider: 1, providerRefundId: 1 },
  {
    name: "idx_payment_refunds_provider_refund",
  },
);

paymentRefundSchema.index({ orderId: 1, createdAt: -1 });
paymentRefundSchema.index({ ticketId: 1, createdAt: -1 });

export const PaymentRefund =
  mongoose.models.PaymentRefund || model("PaymentRefund", paymentRefundSchema);
