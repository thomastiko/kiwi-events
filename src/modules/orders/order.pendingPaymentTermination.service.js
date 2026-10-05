import { logger } from "../../config/logger.js";

import { cancelPaymentSession } from "../payments/payment.service.js";

import {
  ORDER_PAYMENT_PROVIDER,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
} from "./order.constants.js";

import {
  findOrderById,
  markPendingOrderPaymentPaid,
} from "./repositories/order.repository.js";

function hasTerminableProviderPayment(order) {
  const providerPaymentId = String(
    order?.paymentProviderPaymentId || "",
  ).trim();

  return (
    providerPaymentId &&
    order?.paymentProvider &&
    order.paymentProvider !== ORDER_PAYMENT_PROVIDER.NONE
  );
}

export async function terminatePendingOrderPaymentService({ order }) {
  if (!order?.id) {
    throw new TypeError("Pending payment termination requires an order.");
  }

  if (
    order.status !== ORDER_STATUS.PENDING ||
    order.paymentStatus !== ORDER_PAYMENT_STATUS.PENDING
  ) {
    return {
      order,
      termination: null,
      attempted: false,
      providerFailed: false,
    };
  }

  if (!hasTerminableProviderPayment(order)) {
    return {
      order,
      termination: null,
      attempted: false,
      providerFailed: false,
    };
  }

  const orderId = String(order.id);

  const providerPaymentId = String(order.paymentProviderPaymentId).trim();

  try {
    const termination = await cancelPaymentSession({
      provider: order.paymentProvider,
      providerPaymentId,
    });

    /*
     * Das Payment kann genau während der
     * Cancellation bereits erfolgreich geworden sein.
     *
     * In diesem Fall synchronisieren wir zuerst
     * PENDING/PENDING -> CONFIRMED/PAID.
     *
     * Was danach mit der bezahlten Order passiert
     * (nur canceln oder zusätzlich refunden), ist
     * Aufgabe des aufrufenden fachlichen Services.
     */
    if (termination?.paid === true) {
      await markPendingOrderPaymentPaid(
        orderId,
        {
          paymentProviderPaymentId: providerPaymentId,

          confirmedAt: new Date(),
        },
        {
          lean: true,
        },
      );

      const latestOrder = await findOrderById(orderId, {
        lean: true,
      });

      return {
        order: latestOrder || order,

        termination,

        attempted: true,

        providerFailed: false,
      };
    }

    return {
      order,

      termination,

      attempted: true,

      providerFailed: false,
    };
  } catch (error) {
    /*
     * Provider termination ist best effort.
     *
     * Der lokale Order-Cancel bleibt autoritativ.
     * Ein später doch eintreffendes PAID-Webhook
     * wird vom bestehenden Late-Payment-Schutz
     * verarbeitet.
     */
    logger.warn(
      "Order cancellation could not terminate provider payment session",
      {
        orderId,

        provider: order.paymentProvider,

        providerPaymentId,

        error: error.message,
      },
    );

    return {
      order,

      termination: null,

      attempted: true,

      providerFailed: true,
    };
  }
}
