import mongoose from "mongoose";

const { Schema, model } = mongoose;

const discountCodeGroupSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    discountPercent: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      validate: {
        validator: Number.isInteger,
        message: "discountPercent must be an integer",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

discountCodeGroupSchema.index({
  eventId: 1,
  createdAt: -1,
});

export const DiscountCodeGroup =
  mongoose.models.DiscountCodeGroup ||
  model("DiscountCodeGroup", discountCodeGroupSchema);
