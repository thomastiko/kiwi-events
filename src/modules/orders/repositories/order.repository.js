// src/modules/orders/repositories/order.repository.js
import {
  DATABASE_PROVIDER,
  isSqlDatabaseProvider,
} from "../../database/database.constants.js";
import { getDatabaseProvider } from "../../database/database.service.js";
import * as mongoOrderRepository from "./mongo.order.repository.js";
import * as sqlOrderRepository from "./sql.order.repository.js";

function toPlainOrderRecord(order) {
  if (!order) {
    throw new TypeError("Cannot normalize a missing order repository result.");
  }

  if (typeof order.toObject === "function") {
    return order.toObject();
  }

  return order;
}

function normalizeRepositoryOrderId(value, provider) {
  const id = String(value ?? "").trim();

  if (!id || id === "[object Object]") {
    throw new TypeError(`Cannot normalize an invalid ${provider} order id.`);
  }

  return id;
}

function toCanonicalOrderRecord(order, provider) {
  const record = toPlainOrderRecord(order);

  if (provider === DATABASE_PROVIDER.MONGODB) {
    const { _id, __v, id: ignoredId, ...fields } = record;

    return {
      ...fields,

      id: normalizeRepositoryOrderId(_id, "MongoDB"),
    };
  }

  if (isSqlDatabaseProvider(provider)) {
    const { _id, __v, ...fields } = record;

    return {
      ...fields,

      id: normalizeRepositoryOrderId(fields.id, "SQL"),
    };
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}
function getOrderRepository() {
  const provider = getDatabaseProvider();

  if (provider === DATABASE_PROVIDER.MONGODB) {
    return mongoOrderRepository;
  }

  if (isSqlDatabaseProvider(provider)) {
    return sqlOrderRepository;
  }

  throw new Error(`Unsupported database provider: ${provider}`);
}

export function aggregateOrderStatsByEventIds(eventIds) {
  return getOrderRepository().aggregateOrderStatsByEventIds(eventIds);
}

export async function createOrder(data, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().createOrder(data, options);

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function findOrderById(id, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().findOrderById(id, options);

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function findGuestOrderForRecovery(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().findGuestOrderForRecovery(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function findOrderByIdempotency(input, options = {}) {
  const provider = getDatabaseProvider();

  const record = await getOrderRepository().findOrderByIdempotency(
    input,
    options,
  );

  if (!record) {
    return null;
  }

  return {
    ...record,

    order: toCanonicalOrderRecord(record.order, provider),
  };
}
export async function findOrdersByEventId(eventId, options = {}) {
  const provider = getDatabaseProvider();

  const orders = await getOrderRepository().findOrdersByEventId(
    eventId,
    options,
  );

  return (orders || []).map((order) => toCanonicalOrderRecord(order, provider));
}

export async function findOrderByIdAndExternalBuyer(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().findOrderByIdAndExternalBuyer(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function listOrdersByExternalBuyer(input, options = {}) {
  const provider = getDatabaseProvider();

  const result = await getOrderRepository().listOrdersByExternalBuyer(
    input,
    options,
  );

  return {
    ...result,

    items: (result.items || []).map((order) =>
      toCanonicalOrderRecord(order, provider),
    ),
  };
}

export async function listOrdersByEventInternal(input, options = {}) {
  const provider = getDatabaseProvider();

  const result = await getOrderRepository().listOrdersByEventInternal(
    input,
    options,
  );

  return {
    ...result,

    items: (result.items || []).map((order) =>
      toCanonicalOrderRecord(order, provider),
    ),
  };
}

export async function updateOrderById(id, data, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().updateOrderById(id, data, options);

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function updateOrderRefundStateIfNotCompleted(
  id,
  data = {},
  options = {},
) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().updateOrderRefundStateIfNotCompleted(
    id,
    data,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function cancelOrderById(id, data = {}, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().cancelOrderById(id, data, options);

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function cancelPendingOrderIfUnpaid(id, data = {}, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().cancelPendingOrderIfUnpaid(
    id,
    data,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function cancelConfirmedFreeCustomerOrder(
  id,
  data = {},
  options = {},
) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().cancelConfirmedFreeCustomerOrder(
    id,
    data,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function cancelOrderByIdIfNotCancelled(
  id,
  data = {},
  options = {},
) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().cancelOrderByIdIfNotCancelled(
    id,
    data,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function markOrderPaymentPending(id, data = {}, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().markOrderPaymentPending(
    id,
    data,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function markOrderPaymentFailed(id, data = {}, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().markOrderPaymentFailed(
    id,
    data,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export function markPendingOrderPaymentPaid(id, data = {}, options = {}) {
  return getOrderRepository().markPendingOrderPaymentPaid(id, data, options);
}

export function markPendingOrderPaymentFailed(id, data = {}, options = {}) {
  return getOrderRepository().markPendingOrderPaymentFailed(id, data, options);
}
export function markOrderPaymentRefunded(id, data = {}, options = {}) {
  return getOrderRepository().markOrderPaymentRefunded(id, data, options);
}
export async function markOrderRefundCompletedIfNotCompleted(
  id,
  data = {},
  options = {},
) {
  const provider = getDatabaseProvider();

  const order =
    await getOrderRepository().markOrderRefundCompletedIfNotCompleted(
      id,
      data,
      options,
    );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function markTerminatedOrderLatePaymentRefunded(
  id,
  data = {},
  options = {},
) {
  const provider = getDatabaseProvider();

  const order =
    await getOrderRepository().markTerminatedOrderLatePaymentRefunded(
      id,
      data,
      options,
    );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export function markExpiredOrders(options = {}) {
  return getOrderRepository().markExpiredOrders(options);
}
export async function findPendingExpiredOrders(input = {}, options = {}) {
  const provider = getDatabaseProvider();

  const orders = await getOrderRepository().findPendingExpiredOrders(
    input,
    options,
  );

  return (orders || []).map((order) => toCanonicalOrderRecord(order, provider));
}
export async function findFulfillmentRecoveryCandidates(
  input = {},
  options = {},
) {
  const provider = getDatabaseProvider();

  const orders = await getOrderRepository().findFulfillmentRecoveryCandidates(
    input,
    options,
  );

  return orders.map((order) => toCanonicalOrderRecord(order, provider));
}
export async function expireOrder(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().expireOrder(input, options);

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function findOrdersByIdsAndEventId(
  { orderIds, eventId },
  options = {},
) {
  const provider = getDatabaseProvider();

  const orders = await getOrderRepository().findOrdersByIdsAndEventId(
    {
      orderIds,
      eventId,
    },
    options,
  );

  return (orders || []).map((order) => toCanonicalOrderRecord(order, provider));
}
export async function rotateGuestAccessTokenForOrder(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().rotateGuestAccessTokenForOrder(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export async function findOrderByIdWithGuestAccess(id, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().findOrderByIdWithGuestAccess(
    id,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
export function markGuestAccessUsed(id, options = {}) {
  return getOrderRepository().markGuestAccessUsed(id, options);
}
export async function claimOrderFulfillment(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().claimOrderFulfillment(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function advanceOrderFulfillment(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().advanceOrderFulfillment(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function completeOrderFulfillment(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().completeOrderFulfillment(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}

export async function recordOrderFulfillmentFailure(input, options = {}) {
  const provider = getDatabaseProvider();

  const order = await getOrderRepository().recordOrderFulfillmentFailure(
    input,
    options,
  );

  if (!order) {
    return null;
  }

  return toCanonicalOrderRecord(order, provider);
}
