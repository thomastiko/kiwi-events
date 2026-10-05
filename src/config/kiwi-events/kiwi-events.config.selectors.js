export function getActivePaymentConfig(config) {
  const provider = config.payments?.provider || "disabled";

  if (provider === "disabled") {
    return {
      provider,
    };
  }

  return {
    provider,
    ...(config.payments?.[provider] || {}),
    currency:
      config.payments?.currency || config.branding?.defaultCurrency || "EUR",
  };
}

export function getActiveMailConfig(config) {
  const provider = config.mail?.provider || "disabled";

  if (provider === "disabled") {
    return {
      provider,
      enabled: false,
    };
  }

  return {
    provider,
    enabled: Boolean(config.features?.mail),
    defaultFromName: config.mail?.defaultFromName || "",
    defaultFromEmail: config.mail?.defaultFromEmail || "",
    defaultReplyTo: config.mail?.defaultReplyTo || "",
    ...(config.mail?.[provider] || {}),
  };
}
