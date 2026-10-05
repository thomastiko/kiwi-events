import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_FEATURES = {
  ticketing: true,

  guestCheckout: true,
  depositTickets: false,
  discountCodes: false,

  ticketPdf: true,
  ticketQr: false,

  mail: false,
  mailOrderConfirmation: true,
  mailOrderCancellation: true,
  mailOrderRefunded: true,
  mailEventCancellation: true,
  mailEventReminder: false,
  mailEventCustom: true,

  media: true,
};

async function loadFeaturesWithConfig(featuresPatch = {}) {
  vi.resetModules();

  vi.doMock("../../src/config/kiwi-events/kiwi-events.config.store.js", () => ({
    loadKiwiEventsConfig: () => ({
      features: {
        ...DEFAULT_FEATURES,
        ...featuresPatch,
      },
    }),
  }));

  return import("../../src/config/features.js");
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("kiwi-events feature configuration", () => {
  describe("default feature behavior", () => {
    it("enables ticketing, guest checkout, ticket PDF and media by default", async () => {
      const { getFeatures } = await loadFeaturesWithConfig();

      const features = getFeatures();

      expect(features.ticketing).toBe(true);
      expect(features.guestCheckout).toBe(true);
      expect(features.ticketPdf).toBe(true);
      expect(features.media).toBe(true);
    });

    it("keeps ticket QR explicitly opt-in by default", async () => {
      const { getFeatures } = await loadFeaturesWithConfig();

      const features = getFeatures();

      expect(features.ticketQr).toBe(false);
    });

    it("disables deposit tickets, discount codes, mail and reminders by default", async () => {
      const { getFeatures } = await loadFeaturesWithConfig();

      const features = getFeatures();

      expect(features.depositTickets).toBe(false);
      expect(features.discountCodes).toBe(false);
      expect(features.mail).toBe(false);
      expect(features.mailEventReminder).toBe(false);
      expect(features.mailEventCustom).toBe(true);
    });
  });

  describe("configured feature values", () => {
    it("can disable ticketing through kiwi-events config", async () => {
      const { getFeatures } = await loadFeaturesWithConfig({
        ticketing: false,
      });

      const features = getFeatures();

      expect(features.ticketing).toBe(false);
    });

    it("can enable optional ticketing features through kiwi-events config", async () => {
      const { getFeatures } = await loadFeaturesWithConfig({
        depositTickets: true,
        discountCodes: true,
        ticketQr: true,
      });

      const features = getFeatures();

      expect(features.depositTickets).toBe(true);
      expect(features.discountCodes).toBe(true);
      expect(features.ticketQr).toBe(true);
    });

    it("documents that mail sub-features can be configured independently from global mail", async () => {
      const { getFeatures } = await loadFeaturesWithConfig({
        mail: false,
        mailOrderConfirmation: true,
        mailOrderCancellation: false,
        mailOrderRefunded: false,
        mailEventCancellation: true,
        mailEventReminder: true,
        mailEventCustom: false,
      });
      const features = getFeatures();

      expect(features.mail).toBe(false);
      expect(features.mailOrderConfirmation).toBe(true);
      expect(features.mailOrderCancellation).toBe(false);
      expect(features.mailEventCancellation).toBe(true);
      expect(features.mailEventReminder).toBe(true);
      expect(features.mailEventCustom).toBe(false);
      expect(features.mailOrderRefunded).toBe(false);
    });
  });

  describe("feature helpers", () => {
    it("checks a single feature with isFeatureEnabled", async () => {
      const { isFeatureEnabled } = await loadFeaturesWithConfig({
        ticketQr: true,
      });

      expect(isFeatureEnabled("ticketQr")).toBe(true);
      expect(isFeatureEnabled("depositTickets")).toBe(false);
    });

    it("exposes feature values through the features proxy", async () => {
      const { features } = await loadFeaturesWithConfig({
        ticketQr: true,
      });

      expect(features.ticketQr).toBe(true);
      expect(features.depositTickets).toBe(false);
    });
  });
});
