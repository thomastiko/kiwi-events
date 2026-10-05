import { loadKiwiEventsConfig } from "./kiwi-events/kiwi-events.config.store.js";

export function getFeatures() {
  const config = loadKiwiEventsConfig();

  return {
    ticketing: Boolean(config.features?.ticketing),

    guestCheckout: Boolean(config.features?.guestCheckout),
    depositTickets: Boolean(config.features?.depositTickets),
    discountCodes: Boolean(config.features?.discountCodes),

    ticketPdf: Boolean(config.features?.ticketPdf),
    ticketQr: Boolean(config.features?.ticketQr),

    mail: Boolean(config.features?.mail),
    mailOrderConfirmation: Boolean(config.features?.mailOrderConfirmation),
    mailOrderCancellation: Boolean(config.features?.mailOrderCancellation),
    mailOrderRefunded: Boolean(config.features?.mailOrderRefunded),
    mailEventCancellation: Boolean(config.features?.mailEventCancellation),
    mailEventReminder: Boolean(config.features?.mailEventReminder),
    mailEventCustom: Boolean(config.features?.mailEventCustom),

    media: Boolean(config.features?.media),
  };
}

export function isFeatureEnabled(featureName) {
  return getFeatures()[featureName] === true;
}

export const features = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      return getFeatures()[property];
    },

    ownKeys() {
      return Reflect.ownKeys(getFeatures());
    },

    getOwnPropertyDescriptor(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      const currentFeatures = getFeatures();

      if (!Object.prototype.hasOwnProperty.call(currentFeatures, property)) {
        return undefined;
      }

      return {
        enumerable: true,
        configurable: true,
      };
    },
  },
);
