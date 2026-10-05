import { afterAll, beforeAll, beforeEach, describe, vi } from "vitest";

import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

const { createProviderRefundMock, sendRefundCompletedMailMock } = vi.hoisted(
  () => ({
    createProviderRefundMock: vi.fn(),
    sendRefundCompletedMailMock: vi.fn(),
  }),
);

vi.mock("../../../src/modules/payments/payment.service.js", () => ({
  createPaymentRefund: createProviderRefundMock,
}));
vi.mock(
  "../../../src/modules/paymentRefunds/paymentRefund.mail.service.js",
  () => ({
    sendPaymentRefundCompletedMailSafe: sendRefundCompletedMailMock,
  }),
);

import { PaymentRefund } from "../../../src/modules/paymentRefunds/paymentRefund.model.js";
import { definePaymentRefundSagaContract } from "../../helpers/paymentRefundSagaContract.js";

describe("Payment refund saga MongoDB integration", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
    await PaymentRefund.syncIndexes();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    await clearMongoTestDb();

    createProviderRefundMock.mockResolvedValue({
      provider: "mollie",
      providerPaymentId: "pay_mongo_saga_1",
      providerRefundId: "refund_mongo_saga_1",
      status: "refunded",
    });

    sendRefundCompletedMailMock.mockResolvedValue({
      skipped: false,
    });
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
  });

  definePaymentRefundSagaContract({
    idPrefix: "mongo",
    createProviderRefundMock,
    sendRefundCompletedMailMock,
  });
});
