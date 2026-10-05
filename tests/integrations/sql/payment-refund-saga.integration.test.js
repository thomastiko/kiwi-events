import { afterAll, beforeAll, beforeEach, describe, vi } from "vitest";

import {
  clearSqlTestDb,
  connectSqlTestDb,
  disconnectSqlTestDb,
  hasSqlTestDatabaseConfiguration,
} from "../../helpers/sqlTestDb.js";

import { definePaymentRefundSagaContract } from "../../helpers/paymentRefundSagaContract.js";

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

describe.skipIf(!hasSqlTestDatabaseConfiguration())(
  "Payment refund saga SQL integration",
  () => {
    beforeAll(async () => {
      await connectSqlTestDb();
    });

    beforeEach(async () => {
      vi.clearAllMocks();

      await clearSqlTestDb();

      createProviderRefundMock.mockResolvedValue({
        provider: "mollie",
        providerPaymentId: "pay_sql_saga_1",
        providerRefundId: "refund_sql_saga_1",
        status: "refunded",
      });

      sendRefundCompletedMailMock.mockResolvedValue({
        skipped: false,
      });
    });

    afterAll(async () => {
      await clearSqlTestDb();
      await disconnectSqlTestDb();
    });

    definePaymentRefundSagaContract({
      idPrefix: "sql",
      createProviderRefundMock,
      sendRefundCompletedMailMock,
    });
  },
);
