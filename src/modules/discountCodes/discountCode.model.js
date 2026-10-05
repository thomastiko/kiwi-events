import mongoose from "mongoose";

const { Schema, model } = mongoose;

const discountCodeSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    groupId: {
      type: Schema.Types.ObjectId,
      ref: "DiscountCodeGroup",
      required: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 64,
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

discountCodeSchema.index(
  {
    eventId: 1,
    code: 1,
  },
  {
    unique: true,
  },
);

discountCodeSchema.index({
  groupId: 1,
  createdAt: 1,
});

export const DiscountCode =
  mongoose.models.DiscountCode || model("DiscountCode", discountCodeSchema);
