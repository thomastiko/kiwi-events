// src/modules/orders/repositories/mongo.order.repository.js
import mongoose from "mongoose";
import { Order } from "../order.model.js";
import {
  ORDER_BUYER_TYPE,
  ORDER_FULFILLMENT_STATUS,
  ORDER_FULFILLMENT_STEP,
  ORDER_PAYMENT_STATUS,
  ORDER_REFUND_STATUS,
  ORDER_STATUS,
} from "../order.constants.js";
function toMongoEventIds(eventIds = []) {
  return eventIds.map((eventId) => {
    if (eventId instanceof mongoose.Types.ObjectId) {
      return eventId;
    }

    if (mongoose.Types.ObjectId.isValid(eventId)) {
      return new mongoose.Types.ObjectId(eventId);
    }

    return eventId;
  });
}
function applyOptions(query, options = {}) {
  if (options.session) query.session(options.session);
  if (options.select) query.select(options.select);
  if (options.lean) query.lean();
  return query;
}

function getSession(options = {}) {
  return options?.session || options?.trx?.session || null;
}

function cleanExternal(value) {
  return String(value || "").trim();
}
function cleanEmail(value) {
  return cleanExternal(value).toLowerCase();
}

function normalizeSort(sortBy = "createdAt", sortOrder = "desc") {
  const allowedSortFields = new Set([
    "createdAt",
    "updatedAt",
    "confirmedAt",
    "totalPrice",
    "status",
    "paymentStatus",
  ]);

  const field = allowedSortFields.has(sortBy) ? sortBy : "createdAt";
  const direction = sortOrder === "asc" ? 1 : -1;

  return {
    [field]: direction,
  };
}

function buildEventInternalQuery({ eventId, status, paymentStatus, search }) {
  const query = {
    eventId,
  };

  if (status) {
    query.status = status;
  }

  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  }

  const cleanSearch = String(search || "").trim();

  if (cleanSearch) {
    query.$or = [
      { orderNumber: { $regex: cleanSearch, $options: "i" } },
      { buyerEmailSnapshot: { $regex: cleanSearch, $options: "i" } },
      { buyerFirstNameSnapshot: { $regex: cleanSearch, $options: "i" } },
      { buyerLastNameSnapshot: { $regex: cleanSearch, $options: "i" } },
      { buyerDisplayNameSnapshot: { $regex: cleanSearch, $options: "i" } },
      { buyerExternalUserId: { $regex: cleanSearch, $options: "i" } },
    ];
  }

  return query;
}

export async function aggregateOrderStatsByEventIds(eventIds) {
  return Order.aggregate([
    {
      $match: {
        eventId: {
          $in: toMongoEventIds(eventIds),
        },
      },
    },
    {
      $group: {
        _id: "$eventId",
        ordersCount: {
          $sum: 1,
        },
        paidOrdersCount: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", ORDER_PAYMENT_STATUS.PAID] },
              1,
              0,
            ],
          },
        },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", ORDER_PAYMENT_STATUS.PAID] },
              "$totalPrice",
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        eventId: {
          $toString: "$_id",
        },
        ordersCount: 1,
        paidOrdersCount: 1,
        revenue: 1,
      },
    },
  ]);
}

export async function createOrder(data, options = {}) {
  const session = getSession(options);

  if (session) {
    const [order] = await Order.create([data], { session });
    return order;
  }

  return Order.create(data);
}

export async function findOrderById(id, options = {}) {
  const query = Order.findById(id);
  return applyOptions(query, options);
}
export async function findGuestOrderForRecovery(
  { orderNumber, email, hostServiceProvider, hostServiceId },
  options = {},
) {
  const query = Order.findOne({
    orderNumber: cleanExternal(orderNumber),
    buyerType: ORDER_BUYER_TYPE.GUEST,
    buyerEmailSnapshot: cleanEmail(email),
    hostServiceProvider: cleanExternal(hostServiceProvider),
    hostServiceId: cleanExternal(hostServiceId),
  });

  return applyOptions(query, options);
}
export async function findOrderByIdempotency({ scope, key }, options = {}) {
  const record = await Order.findOne({
    idempotencyScope: scope,
    idempotencyKey: key,
  })
    .select(
      [
        "+idempotencyScope",
        "+idempotencyKey",
        "+idempotencyRequestHash",
        "+idempotencyCompletedAt",
      ].join(" "),
    )
    .lean();

  if (!record) {
    return null;
  }

  const {
    idempotencyScope,
    idempotencyKey,
    idempotencyRequestHash,
    idempotencyCompletedAt,
    ...order
  } = record;

  return {
    order,
    requestHash: idempotencyRequestHash,
    completedAt: idempotencyCompletedAt,
  };
}
export async function findOrdersByEventId(eventId, options = {}) {
  const query = Order.find({ eventId }).sort({ createdAt: -1 });
  return applyOptions(query, options);
}

export async function findOrderByIdAndExternalBuyer(
  { orderId, externalProvider, externalUserId },
  options = {},
) {
  const cleanProvider = cleanExternal(externalProvider);
  const cleanExternalUserId = cleanExternal(externalUserId);

  const query = Order.findOne({
    _id: orderId,
    buyerExternalProvider: cleanProvider,
    buyerExternalUserId: cleanExternalUserId,
  });

  return applyOptions(query, options);
}

export async function listOrdersByExternalBuyer(
  {
    externalProvider,
    externalUserId,
    page = 1,
    limit = 20,
    status,
    paymentStatus,
  },
  options = {},
) {
  const cleanProvider = cleanExternal(externalProvider);
  const cleanExternalUserId = cleanExternal(externalUserId);

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);

  const query = {
    buyerExternalProvider: cleanProvider,
    buyerExternalUserId: cleanExternalUserId,
  };

  if (status) query.status = status;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  const [items, total] = await Promise.all([
    applyOptions(
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),
      {
        ...options,
        lean: options.lean !== false,
      },
    ),
    Order.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function listOrdersByEventInternal(
  {
    eventId,
    page = 1,
    limit = 20,
    status,
    paymentStatus,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  },
  options = {},
) {
  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);

  const query = buildEventInternalQuery({
    eventId,
    status,
    paymentStatus,
    search,
  });

  const sort = normalizeSort(sortBy, sortOrder);

  const [items, total] = await Promise.all([
    applyOptions(
      Order.find(query)
        .sort(sort)
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),
      {
        ...options,
        lean: options.lean !== false,
      },
    ),
    Order.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function updateOrderById(id, data, options = {}) {
  const query = Order.findByIdAndUpdate(
    id,
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function updateOrderRefundStateIfNotCompleted(
  id,
  data = {},
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,

      refundStatus: {
        $ne: ORDER_REFUND_STATUS.COMPLETED,
      },
    },
    {
      $set: data,
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}

export async function cancelOrderById(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      status: ORDER_STATUS.CANCELLED,
      cancelledAt: data.cancelledAt || new Date(),
    },
    options,
  );
}
export async function cancelPendingOrderIfUnpaid(id, data = {}, options = {}) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,

      status: ORDER_STATUS.PENDING,

      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,

      refundStatus: ORDER_REFUND_STATUS.NONE,
    },
    {
      $set: {
        ...data,

        status: ORDER_STATUS.CANCELLED,

        /*
         * There is no successful payment to refund.
         * FAILED represents the terminated unpaid
         * payment lifecycle.
         *
         * A later provider PAID webhook is still
         * handled by the late-payment refund path.
         */
        paymentStatus: ORDER_PAYMENT_STATUS.FAILED,

        cancelledAt: data.cancelledAt || new Date(),

        cancellationReason: data.cancellationReason || "Cancelled by buyer",
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}

export async function cancelConfirmedFreeCustomerOrder(
  id,
  data = {},
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,

      status: ORDER_STATUS.CONFIRMED,

      paymentStatus: ORDER_PAYMENT_STATUS.NOT_REQUIRED,

      refundStatus: ORDER_REFUND_STATUS.NONE,
    },
    {
      $set: {
        ...data,

        status: ORDER_STATUS.CANCELLED,

        cancelledAt: data.cancelledAt || new Date(),

        cancellationReason: data.cancellationReason || "Cancelled by buyer",
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function cancelOrderByIdIfNotCancelled(
  id,
  data = {},
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,
      status: {
        $ne: ORDER_STATUS.CANCELLED,
      },
    },
    {
      $set: {
        ...data,
        status: ORDER_STATUS.CANCELLED,
        cancelledAt: data.cancelledAt || new Date(),
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function markOrderPaymentPending(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    },
    options,
  );
}

export async function markPendingOrderPaymentPaid(id, data = {}, options = {}) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    },
    {
      $set: {
        ...data,
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
        status: data.status || ORDER_STATUS.CONFIRMED,
        confirmedAt: data.confirmedAt || new Date(),
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function markOrderPaymentFailed(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      status: data.status || ORDER_STATUS.CANCELLED,
      paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
      cancelledAt: data.cancelledAt || new Date(),
      cancellationReason: data.cancellationReason || "Payment failed",
    },
    options,
  );
}
export async function markPendingOrderPaymentFailed(
  id,
  data = {},
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    },
    {
      $set: {
        ...data,
        status: data.status || ORDER_STATUS.CANCELLED,
        paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
        cancelledAt: data.cancelledAt || new Date(),
        cancellationReason: data.cancellationReason || "Payment failed",
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function markOrderPaymentRefunded(id, data = {}, options = {}) {
  return updateOrderById(
    id,
    {
      ...data,
      paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
    },
    options,
  );
}
export async function markOrderRefundCompletedIfNotCompleted(
  id,
  data = {},
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,

      paymentStatus: {
        $in: [ORDER_PAYMENT_STATUS.PAID, ORDER_PAYMENT_STATUS.REFUNDED],
      },

      refundStatus: {
        $ne: ORDER_REFUND_STATUS.COMPLETED,
      },
    },
    {
      $set: {
        ...data,

        paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

        refundStatus: ORDER_REFUND_STATUS.COMPLETED,

        refundedAt: data.refundedAt || new Date(),

        refundFailedAt: null,
        refundFailureReason: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function markTerminatedOrderLatePaymentRefunded(
  id,
  data = {},
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: id,

      status: {
        $in: [ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED],
      },

      paymentStatus: {
        $in: [
          ORDER_PAYMENT_STATUS.FAILED,
          ORDER_PAYMENT_STATUS.EXPIRED,
          ORDER_PAYMENT_STATUS.REFUNDED,
        ],
      },

      refundStatus: {
        $ne: ORDER_REFUND_STATUS.COMPLETED,
      },
    },
    {
      $set: {
        ...data,

        paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,

        refundStatus: ORDER_REFUND_STATUS.COMPLETED,

        refundedAt: data.refundedAt || new Date(),

        refundFailedAt: null,
        refundFailureReason: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function markExpiredOrders(options = {}) {
  const now = new Date();

  return Order.updateMany(
    {
      status: ORDER_STATUS.PENDING,
      expiresAt: {
        $lte: now,
      },
    },
    {
      $set: {
        status: ORDER_STATUS.EXPIRED,
        paymentStatus: ORDER_PAYMENT_STATUS.EXPIRED,
        updatedByEventUserId: options.updatedByEventUserId || null,
      },
    },
  );
}
export async function findPendingExpiredOrders(
  { now = new Date(), limit = 100 } = {},
  options = {},
) {
  const numericLimit = Math.max(1, Number(limit) || 100);

  const query = Order.find({
    status: ORDER_STATUS.PENDING,
    paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    expiresAt: {
      $lte: now,
    },
  })
    .sort({ expiresAt: 1, createdAt: 1 })
    .limit(numericLimit);

  return applyOptions(query, {
    ...options,
    lean: options.lean !== false,
  });
}
export async function findFulfillmentRecoveryCandidates(
  { now = new Date(), limit = 100 } = {},
  options = {},
) {
  const numericLimit = Math.max(1, Math.min(500, Number(limit) || 100));

  const query = Order.find({
    status: ORDER_STATUS.CONFIRMED,

    paymentStatus: {
      $in: [ORDER_PAYMENT_STATUS.PAID, ORDER_PAYMENT_STATUS.NOT_REQUIRED],
    },

    $or: [
      {
        fulfillmentStatus: ORDER_FULFILLMENT_STATUS.NOT_STARTED,
      },

      {
        fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

        fulfillmentNextRetryAt: {
          $lte: now,
        },
      },

      {
        fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,

        fulfillmentLeaseExpiresAt: {
          $lte: now,
        },
      },
    ],
  })
    .sort({
      updatedAt: 1,
      createdAt: 1,
    })
    .limit(numericLimit);

  return applyOptions(query, {
    ...options,
    lean: options.lean !== false,
  });
}
export async function expireOrder(
  { orderId, reason = "Order expired", actor = {} },
  options = {},
) {
  const update = {
    status: ORDER_STATUS.EXPIRED,
    paymentStatus: ORDER_PAYMENT_STATUS.EXPIRED,
    cancellationReason: reason,
    updatedByEventUserId: actor.eventUserId || null,
  };

  const query = Order.findOneAndUpdate(
    {
      _id: orderId,
      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      expiresAt: {
        $lte: new Date(),
      },
    },
    {
      $set: update,
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
export async function findOrdersByIdsAndEventId(
  { orderIds = [], eventId },
  options = {},
) {
  const ids = orderIds.filter(Boolean);

  if (ids.length === 0) {
    return [];
  }

  const query = Order.find({
    _id: {
      $in: ids,
    },
    eventId,
  });

  return applyOptions(query, {
    ...options,
    lean: options.lean !== false,
  });
}
export async function rotateGuestAccessTokenForOrder(
  { orderId, hostServiceProvider, hostServiceId, tokenHash, expiresAt },
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: orderId,
      buyerType: ORDER_BUYER_TYPE.GUEST,
      hostServiceProvider: cleanExternal(hostServiceProvider),
      hostServiceId: cleanExternal(hostServiceId),
    },
    {
      $set: {
        guestAccessTokenHash: tokenHash,
        guestAccessTokenExpiresAt: expiresAt,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}

export async function findOrderByIdWithGuestAccess(orderId, options = {}) {
  const query = Order.findById(orderId).select("+guestAccessTokenHash");
  return applyOptions(query, options);
}

export async function markGuestAccessUsed(orderId, options = {}) {
  const query = Order.findByIdAndUpdate(
    orderId,
    {
      $set: {
        guestAccessLastUsedAt: new Date(),
      },
      $inc: {
        guestAccessDownloadCount: 1,
      },
    },
    {
      new: true,
    },
  );

  return applyOptions(query, options);
}
export async function claimOrderFulfillment(
  { orderId, leaseToken, now = new Date(), leaseExpiresAt },
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: orderId,
      status: ORDER_STATUS.CONFIRMED,
      paymentStatus: {
        $in: [ORDER_PAYMENT_STATUS.PAID, ORDER_PAYMENT_STATUS.NOT_REQUIRED],
      },
      $or: [
        {
          fulfillmentStatus: ORDER_FULFILLMENT_STATUS.NOT_STARTED,
        },

        {
          fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED,

          fulfillmentNextRetryAt: {
            $lte: now,
          },
        },

        {
          fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,

          fulfillmentLeaseExpiresAt: {
            $lte: now,
          },
        },
      ],
    },
    {
      $set: {
        fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,
        fulfillmentStep: ORDER_FULFILLMENT_STEP.TICKETS,
        fulfillmentStartedAt: now,
        fulfillmentCompletedAt: null,
        fulfillmentFailedAt: null,
        fulfillmentLastError: null,
        fulfillmentLeaseToken: leaseToken,
        fulfillmentLeaseExpiresAt: leaseExpiresAt,
        fulfillmentNextRetryAt: null,
        fulfillmentManualReviewAt: null,
      },
      $inc: {
        fulfillmentAttemptCount: 1,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  ).select("+fulfillmentLeaseToken +fulfillmentLastError");

  return applyOptions(query, options);
}

export async function advanceOrderFulfillment(
  { orderId, leaseToken, step, leaseExpiresAt },
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: orderId,
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillmentLeaseToken: leaseToken,
    },
    {
      $set: {
        fulfillmentStep: step,
        fulfillmentLeaseExpiresAt: leaseExpiresAt,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  ).select("+fulfillmentLeaseToken +fulfillmentLastError");

  return applyOptions(query, options);
}

export async function completeOrderFulfillment(
  { orderId, leaseToken, completedAt = new Date() },
  options = {},
) {
  const query = Order.findOneAndUpdate(
    {
      _id: orderId,
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillmentLeaseToken: leaseToken,
    },
    {
      $set: {
        fulfillmentStatus: ORDER_FULFILLMENT_STATUS.COMPLETED,
        fulfillmentStep: ORDER_FULFILLMENT_STEP.COMPLETED,
        fulfillmentCompletedAt: completedAt,
        fulfillmentFailedAt: null,
        fulfillmentLastError: null,
        fulfillmentLeaseToken: null,
        fulfillmentLeaseExpiresAt: null,
        fulfillmentNextRetryAt: null,
        fulfillmentManualReviewAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}

export async function recordOrderFulfillmentFailure(
  {
    orderId,
    leaseToken,
    step,
    error,
    status,
    failedAt = new Date(),
    nextRetryAt = null,
    manualReviewAt = null,
  },
  options = {},
) {
  if (
    status !== ORDER_FULFILLMENT_STATUS.FAILED &&
    status !== ORDER_FULFILLMENT_STATUS.MANUAL_REVIEW
  ) {
    throw new TypeError(
      "Fulfillment failure status must be failed or manual_review.",
    );
  }

  const query = Order.findOneAndUpdate(
    {
      _id: orderId,
      fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PROCESSING,
      fulfillmentLeaseToken: leaseToken,
    },
    {
      $set: {
        fulfillmentStatus: status,
        fulfillmentStep: step,

        fulfillmentFailedAt: failedAt,
        fulfillmentLastError: String(error || "").slice(0, 4000),

        fulfillmentLeaseToken: null,
        fulfillmentLeaseExpiresAt: null,

        fulfillmentNextRetryAt: nextRetryAt,
        fulfillmentManualReviewAt: manualReviewAt,
      },
    },
    {
      new: true,
      runValidators: true,
      session: getSession(options),
    },
  );

  return applyOptions(query, options);
}
