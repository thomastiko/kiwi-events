import { SECRET_PATHS } from "./constants.js";
import { els } from "./elements.js";

import { setCheckboxValue, setInputValue, setSelectValue } from "./ui.js";

import { collectSecretInput } from "./secrets.js";

import { valueOrUndefined } from "./utils.js";

export function updateMailProviderFields() {
  const provider = els.mailProvider?.value || "disabled";

  els.smtpFields?.classList.toggle("hidden", provider !== "smtp");

  els.resendFields?.classList.toggle("hidden", provider !== "resend");
}

export function renderMailingConfig(config = {}) {
  const features = config.features || {};

  const mailEnabled = features.mail ?? config.mail?.enabled;

  const allowedProviders = ["smtp", "resend"];

  const provider = allowedProviders.includes(config.mail?.provider)
    ? config.mail.provider
    : "disabled";

  setCheckboxValue(els.featureMail, mailEnabled);

  setCheckboxValue(
    els.featureMailOrderConfirmation,
    features.mailOrderConfirmation ?? Boolean(mailEnabled),
  );

  setCheckboxValue(
    els.featureMailOrderRefunded,
    Boolean(features.mailOrderRefunded),
  );

  setCheckboxValue(
    els.featureMailEventCancellation,
    features.mailEventCancellation ?? Boolean(mailEnabled),
  );

  setCheckboxValue(
    els.featureMailEventReminder,
    features.mailEventReminder ?? false,
  );

  setSelectValue(els.mailProvider, provider);

  setInputValue(els.mailDefaultFromName, config.mail?.defaultFromName);

  setInputValue(els.mailDefaultFromEmail, config.mail?.defaultFromEmail);

  setInputValue(els.mailDefaultReplyTo, config.mail?.defaultReplyTo);

  setInputValue(els.mailSmtpHost, config.mail?.smtp?.host);

  setInputValue(els.mailSmtpPort, config.mail?.smtp?.port);

  setSelectValue(
    els.mailSmtpSecure,
    String(Boolean(config.mail?.smtp?.secure)),
  );

  setInputValue(els.mailSmtpUser, config.mail?.smtp?.user);

  setInputValue(els.mailResendTimeoutMs, config.mail?.resend?.timeoutMs);
}

export function collectMailingPatch() {
  const mail = Boolean(els.featureMail?.checked);

  const selectedProvider = mail
    ? els.mailProvider?.value || "disabled"
    : "disabled";

  const provider = ["smtp", "resend"].includes(selectedProvider)
    ? selectedProvider
    : "disabled";

  const smtpPort = valueOrUndefined(els.mailSmtpPort?.value);

  const resendTimeoutMs = valueOrUndefined(els.mailResendTimeoutMs?.value);

  let secrets = {};

  if (provider === "smtp") {
    secrets = collectSecretInput(
      els.mailSmtpPass,
      SECRET_PATHS.MAIL_SMTP_PASSWORD,
    );
  }

  if (provider === "resend") {
    secrets = collectSecretInput(
      els.mailResendApiKey,
      SECRET_PATHS.MAIL_RESEND_API_KEY,
    );
  }

  return {
    config: {
      features: {
        mail,

        mailOrderConfirmation:
          mail && Boolean(els.featureMailOrderConfirmation?.checked),

        mailOrderRefunded:
          mail && Boolean(els.featureMailOrderRefunded?.checked),

        mailEventCancellation:
          mail && Boolean(els.featureMailEventCancellation?.checked),

        mailEventReminder:
          mail && Boolean(els.featureMailEventReminder?.checked),
      },

      mail: {
        provider,

        defaultFromName: valueOrUndefined(els.mailDefaultFromName?.value),

        defaultFromEmail: valueOrUndefined(els.mailDefaultFromEmail?.value),

        defaultReplyTo: valueOrUndefined(els.mailDefaultReplyTo?.value),

        smtp:
          provider === "smtp"
            ? {
                host: valueOrUndefined(els.mailSmtpHost?.value),

                port: smtpPort ? Number(smtpPort) : undefined,

                secure: els.mailSmtpSecure?.value === "true",

                user: valueOrUndefined(els.mailSmtpUser?.value),
              }
            : undefined,

        resend:
          provider === "resend"
            ? {
                timeoutMs: resendTimeoutMs
                  ? Number(resendTimeoutMs)
                  : undefined,
              }
            : undefined,
      },
    },

    secrets,
  };
}
