import { els } from "./elements.js";

import { setInputsDisabled } from "./ui.js";

import { updatePaymentProviderFields } from "./payments.js";

import { updateMailProviderFields } from "./mailing.js";

import { updateStorageFields } from "./storage.js";

let editingResolver = null;

export function setFeatureEditingResolver(resolver) {
  editingResolver = typeof resolver === "function" ? resolver : null;
}

function isEditing(sectionName) {
  return editingResolver ? editingResolver(sectionName) : false;
}

export function updateFeatureDependencies() {
  const ticketingEnabled = Boolean(els.featureTicketing?.checked);

  const customerSelfServiceCancellationEnabled = Boolean(
    els.customerSelfServiceCancellationEnabled?.checked,
  );

  const ticketQrEnabled = Boolean(els.featureTicketQr?.checked);

  const mailEnabled = Boolean(els.featureMail?.checked);

  if (!ticketingEnabled) {
    [
      els.featureDepositTickets,
      els.featureTicketQr,
      els.featureTicketPdf,
      els.featureGuestCheckout,
      els.featureDiscountCodes,
      els.customerSelfServiceCancellationEnabled,
    ].forEach((input) => {
      if (input) {
        input.checked = false;
      }
    });
  }

  if (!mailEnabled) {
    [
      els.featureMailOrderConfirmation,
      els.featureMailOrderRefunded,
      els.featureMailEventCancellation,
      els.featureMailEventReminder,
    ].forEach((input) => {
      if (input) {
        input.checked = false;
      }
    });
  }

  const ticketingEditing = isEditing("ticketing");

  const mailingEditing = isEditing("mailing");

  const storageEditing = isEditing("storage");

  setInputsDisabled(
    [
      els.featureDepositTickets,
      els.featureTicketQr,
      els.featureTicketPdf,
      els.featureGuestCheckout,
      els.featureDiscountCodes,
      els.customerSelfServiceCancellationEnabled,
    ],
    !ticketingEditing || !ticketingEnabled,
  );

  setInputsDisabled(
    [els.customerSelfServiceRefundDeadlineDays],
    !ticketingEditing ||
      !ticketingEnabled ||
      !customerSelfServiceCancellationEnabled,
  );

  setInputsDisabled(
    [
      els.paymentProvider,
      els.paymentDefaultCurrency,
      els.paymentMollieApiKey,
      els.paymentMollieRedirectUrl,
      els.paymentMollieWebhookUrl,
      els.paymentStripeSecretKey,
      els.paymentStripeSuccessUrl,
      els.paymentStripeCancelUrl,
      els.paymentStripeWebhookSecret,
    ],
    !ticketingEditing,
  );

  if (els.featureTicketQrSecret) {
    els.featureTicketQrSecret.disabled =
      !ticketingEditing || !ticketingEnabled || !ticketQrEnabled;
  }

  els.ticketQrSecretPanel?.classList.toggle("hidden", !ticketQrEnabled);

  els.mailDisabledNotice?.classList.toggle("hidden", mailEnabled);

  els.mailConfigFields?.classList.toggle("disabled-area", !mailEnabled);

  els.mailTemplatesCard?.classList.toggle("disabled-area", !mailEnabled);

  setInputsDisabled(
    [
      els.mailProvider,
      els.mailDefaultFromName,
      els.mailDefaultFromEmail,
      els.mailDefaultReplyTo,
      els.mailSmtpHost,
      els.mailSmtpPort,
      els.mailSmtpSecure,
      els.mailSmtpUser,
      els.mailSmtpPass,
      els.mailResendApiKey,
      els.mailResendTimeoutMs,
      els.featureMailOrderConfirmation,
      els.featureMailOrderRefunded,
      els.featureMailEventCancellation,
      els.featureMailEventReminder,
    ],
    !mailingEditing || !mailEnabled,
  );

  setInputsDisabled(
    [
      els.storageLocalDir,

      els.storagePublicEnabled,
      els.storagePublicEndpoint,
      els.storagePublicBucket,
      els.storagePublicRegion,
      els.storagePublicBaseUrl,
      els.storagePublicAccessKeyId,
      els.storagePublicSecretAccessKey,
      els.storagePublicForcePathStyle,

      els.storagePrivateEnabled,
      els.storagePrivateEndpoint,
      els.storagePrivateBucket,
      els.storagePrivateRegion,
      els.storagePrivateAccessKeyId,
      els.storagePrivateSecretAccessKey,
      els.storagePrivateForcePathStyle,

      els.storageTicketPdfTarget,
    ],
    !storageEditing,
  );

  updatePaymentProviderFields();
  updateMailProviderFields();
  updateStorageFields();
}
