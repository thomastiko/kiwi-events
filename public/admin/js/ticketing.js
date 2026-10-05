import { SECRET_PATHS } from "./constants.js";
import { els } from "./elements.js";

import { setCheckboxValue, setInputValue } from "./ui.js";

import { collectSecretInput } from "./secrets.js";

import { collectPaymentPatch } from "./payments.js";

export function renderTicketingConfig(config = {}) {
  const features = config.features || {};

  setCheckboxValue(els.featureTicketing, features.ticketing);

  setCheckboxValue(els.featureDepositTickets, features.depositTickets);

  setCheckboxValue(
    els.featureTicketQr,
    features.ticketQr ?? features.ticketQrCodes,
  );

  setCheckboxValue(els.featureTicketPdf, features.ticketPdf);

  setCheckboxValue(els.featureGuestCheckout, features.guestCheckout);

  setCheckboxValue(els.featureDiscountCodes, features.discountCodes);

  const customerSelfServiceCancellation =
    config.orders?.customerSelfServiceCancellation || {};

  setCheckboxValue(
    els.customerSelfServiceCancellationEnabled,
    customerSelfServiceCancellation.enabled === true,
  );

  setInputValue(
    els.customerSelfServiceRefundDeadlineDays,
    customerSelfServiceCancellation.refundDeadlineDaysBeforeSession,
  );
}

export function collectTicketingPatch() {
  const ticketing = Boolean(els.featureTicketing?.checked);

  const customerSelfServiceCancellationEnabled =
    ticketing && Boolean(els.customerSelfServiceCancellationEnabled?.checked);

  const refundDeadlineRaw = String(
    els.customerSelfServiceRefundDeadlineDays?.value ?? "",
  ).trim();

  const refundDeadlineDaysBeforeSession =
    refundDeadlineRaw === "" ? null : Number(refundDeadlineRaw);

  if (
    refundDeadlineRaw !== "" &&
    (!Number.isSafeInteger(refundDeadlineDaysBeforeSession) ||
      refundDeadlineDaysBeforeSession < 0 ||
      refundDeadlineDaysBeforeSession > 3650)
  ) {
    throw new Error(
      "Refund deadline must be a whole number between 0 and 3650 days.",
    );
  }

  const depositTickets =
    ticketing && Boolean(els.featureDepositTickets?.checked);

  const ticketQr = ticketing && Boolean(els.featureTicketQr?.checked);

  const payment = collectPaymentPatch({
    depositTickets,
  });

  return {
    config: {
      features: {
        ticketing,
        depositTickets,
        ticketQr,

        ticketPdf: ticketing && Boolean(els.featureTicketPdf?.checked),

        guestCheckout: ticketing && Boolean(els.featureGuestCheckout?.checked),

        discountCodes: ticketing && Boolean(els.featureDiscountCodes?.checked),
      },

      orders: {
        customerSelfServiceCancellation: {
          enabled: customerSelfServiceCancellationEnabled,

          refundDeadlineDaysBeforeSession:
            customerSelfServiceCancellationEnabled
              ? refundDeadlineDaysBeforeSession
              : null,
        },
      },

      payments: payment.config,
    },

    secrets: {
      ...payment.secrets,

      ...(ticketQr
        ? collectSecretInput(
            els.featureTicketQrSecret,
            SECRET_PATHS.SECURITY_TICKET_QR_SECRET,
          )
        : {}),
    },
  };
}
