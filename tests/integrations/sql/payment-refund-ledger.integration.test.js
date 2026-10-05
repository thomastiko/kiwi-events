import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearSqlTestDb,
  connectSqlTestDb,
  disconnectSqlTestDb,
  hasSqlTestDatabaseConfiguration,
} from "../../helpers/sqlTestDb.js";
import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../../../src/modules/paymentRefunds/paymentRefund.constants.js";
import {
  claimPaymentRefundService,
  completePaymentRefundService,
  ensurePaymentRefundService,
  recordPaymentRefundLocalFailureService,
  recordPaymentRefundProviderFailureService,
  recordPaymentRefundProviderSucceededService,
} from "../../../src/modules/paymentRefunds/paymentRefund.service.js";
import {
  createPaymentRefund,
  findPaymentRefundById,
  findPaymentRefundByIdempotencyKey,
  findPaymentRefundBySource,
} from "../../../src/modules/paymentRefunds/repositories/paymentRefund.repository.js";

function buildDepositRefundInput(overrides = {}) {
  return {
    sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
    sourceId: "sql-ledger-ticket-1",
    orderId: "sql-ledger-order-1",
    ticketId: "sql-ledger-ticket-1",
    provider: "mollie",
    providerPaymentId: "pay_sql_ledger_1",
    amount: 2500,
    currency: "EUR",
    idempotencyKey: "deposit-refund:sql-ledger-ticket-1",
    metadata: {
      source: "sql_payment_refund_ledger_test",
    },
    actor: {
      eventUserId: "sql-ledger-event-user-1",
    },
    ...overrides,
  };
}

describe.skipIf(!hasSqlTestDatabaseConfiguration())(
  "Payment refund ledger SQL integration",
  () => {
    beforeAll(async () => {
      await connectSqlTestDb();
    });

    beforeEach(async () => {
      await clearSqlTestDb();
    });

    afterAll(async () => {
      await clearSqlTestDb();
      await disconnectSqlTestDb();
    });

    it("creates one durable refund and reuses it for the same source and idempotency key", async () => {
      const [first, replay] = await Promise.all([
        ensurePaymentRefundService(buildDepositRefundInput()),
        ensurePaymentRefundService(buildDepositRefundInput()),
      ]);

      expect([first.created, replay.created].sort()).toEqual([false, true]);
      expect(replay.paymentRefund.id).toBe(first.paymentRefund.id);
      expect(first.paymentRefund).toMatchObject({
        sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
        sourceId: "sql-ledger-ticket-1",
        orderId: "sql-ledger-order-1",
        ticketId: "sql-ledger-ticket-1",
        provider: "mollie",
        providerPaymentId: "pay_sql_ledger_1",
        amount: 2500,
        currency: "EUR",
        status: PAYMENT_REFUND_STATUS.PENDING,
        attemptCount: 0,
        triggeredByEventUserId: "sql-ledger-event-user-1",
      });

      const byIdempotencyKey = await findPaymentRefundByIdempotencyKey(
        "deposit-refund:sql-ledger-ticket-1",
      );
      const bySource = await findPaymentRefundBySource({
        sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
        sourceId: "sql-ledger-ticket-1",
      });

      expect(byIdempotencyKey.id).toBe(first.paymentRefund.id);
      expect(bySource.id).toBe(first.paymentRefund.id);
    });

    it("stores order refunds with the order as the unique source", async () => {
      const result = await ensurePaymentRefundService({
        sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
        sourceId: "sql-ledger-order-source-1",
        orderId: "sql-ledger-order-source-1",
        ticketId: null,
        provider: "stripe",
        providerPaymentId: "cs_sql_ledger_order_1",
        amount: 5000,
        currency: "EUR",
        idempotencyKey: "order-refund:sql-ledger-order-source-1",
        metadata: {
          source: "sql_order_refund_ledger_test",
        },
      });

      expect(result).toMatchObject({
        created: true,
        paymentRefund: {
          sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
          sourceId: "sql-ledger-order-source-1",
          orderId: "sql-ledger-order-source-1",
          ticketId: null,
          provider: "stripe",
          amount: 5000,
          status: PAYMENT_REFUND_STATUS.PENDING,
        },
      });
    });

    it("rejects changed immutable refund data for an existing source or key", async () => {
      await ensurePaymentRefundService(buildDepositRefundInput());

      await expect(
        ensurePaymentRefundService(
          buildDepositRefundInput({
            amount: 2600,
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_REFUND_REPLAY_CONFLICT",
      });

      await expect(
        ensurePaymentRefundService(
          buildDepositRefundInput({
            idempotencyKey: "deposit-refund:sql-ledger-ticket-1-other",
          }),
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_REFUND_REPLAY_CONFLICT",
      });
    });

    it("allows only one active lease and reclaims an expired processing lease", async () => {
      const ensured = await ensurePaymentRefundService(
        buildDepositRefundInput(),
      );
      const now = new Date("2026-08-03T18:00:00.000Z");

      const firstClaim = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now,
        leaseMs: 60_000,
      });
      const parallelClaim = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now,
        leaseMs: 60_000,
      });

      expect(firstClaim.paymentRefund).toMatchObject({
        status: PAYMENT_REFUND_STATUS.PROCESSING,
        attemptCount: 1,
      });
      expect(parallelClaim).toBeNull();

      const stale = await createPaymentRefund({
        ...buildDepositRefundInput({
          sourceId: "sql-ledger-ticket-stale",
          orderId: "sql-ledger-order-stale",
          ticketId: "sql-ledger-ticket-stale",
          providerPaymentId: "pay_sql_ledger_stale",
          idempotencyKey: "deposit-refund:sql-ledger-ticket-stale",
        }),
        actor: undefined,
        triggeredByEventUserId: null,
        status: PAYMENT_REFUND_STATUS.PROCESSING,
        attemptCount: 1,
        leaseToken: "00000000-0000-4000-8000-000000000001",
        leaseExpiresAt: new Date(now.getTime() - 1),
      });

      const reclaimed = await claimPaymentRefundService({
        paymentRefundId: stale.id,
        now,
        leaseMs: 60_000,
      });

      expect(reclaimed.paymentRefund).toMatchObject({
        status: PAYMENT_REFUND_STATUS.PROCESSING,
        attemptCount: 2,
      });
      expect(reclaimed.leaseToken).not.toBe(
        "00000000-0000-4000-8000-000000000001",
      );
    });

    it("keeps provider success durable across a local failure and completes without losing the provider refund id", async () => {
      const ensured = await ensurePaymentRefundService(
        buildDepositRefundInput(),
      );
      const firstClaim = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now: new Date("2026-08-03T18:00:00.000Z"),
        leaseMs: 60_000,
      });

      const providerSucceeded =
        await recordPaymentRefundProviderSucceededService({
          paymentRefundId: ensured.paymentRefund.id,
          leaseToken: firstClaim.leaseToken,
          providerRefundId: "refund_sql_ledger_1",
          providerSucceededAt: new Date("2026-08-03T18:00:10.000Z"),
          leaseMs: 60_000,
        });

      expect(providerSucceeded).toMatchObject({
        status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
        providerRefundId: "refund_sql_ledger_1",
      });

      const parallelFinalizeClaim = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now: new Date("2026-08-03T18:00:20.000Z"),
        leaseMs: 60_000,
      });

      expect(parallelFinalizeClaim).toBeNull();

      const localFailure = await recordPaymentRefundLocalFailureService({
        paymentRefundId: ensured.paymentRefund.id,
        leaseToken: firstClaim.leaseToken,
        error: "Local ticket finalization failed",
        failedAt: new Date("2026-08-03T18:00:30.000Z"),
        nextRetryAt: new Date("2026-08-03T18:01:00.000Z"),
      });

      expect(localFailure).toMatchObject({
        status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
        providerRefundId: "refund_sql_ledger_1",
        lastError: "Local ticket finalization failed",
      });

      const retryClaim = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now: new Date("2026-08-03T18:01:00.000Z"),
        leaseMs: 60_000,
      });

      expect(retryClaim.paymentRefund).toMatchObject({
        status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,
        providerRefundId: "refund_sql_ledger_1",
        attemptCount: 2,
      });

      const completed = await completePaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        leaseToken: retryClaim.leaseToken,
        completedAt: new Date("2026-08-03T18:01:10.000Z"),
      });

      expect(completed).toMatchObject({
        status: PAYMENT_REFUND_STATUS.COMPLETED,
        providerRefundId: "refund_sql_ledger_1",
      });
    });

    it("blocks retry until nextRetryAt after a provider failure", async () => {
      const ensured = await ensurePaymentRefundService(
        buildDepositRefundInput(),
      );
      const firstClaim = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now: new Date("2026-08-03T18:00:00.000Z"),
        leaseMs: 60_000,
      });

      const failed = await recordPaymentRefundProviderFailureService({
        paymentRefundId: ensured.paymentRefund.id,
        leaseToken: firstClaim.leaseToken,
        error: "Provider rejected refund",
        failedAt: new Date("2026-08-03T18:00:10.000Z"),
        nextRetryAt: new Date("2026-08-03T18:05:00.000Z"),
      });

      expect(failed).toMatchObject({
        status: PAYMENT_REFUND_STATUS.FAILED,
        lastError: "Provider rejected refund",
      });

      await expect(
        claimPaymentRefundService({
          paymentRefundId: ensured.paymentRefund.id,
          now: new Date("2026-08-03T18:04:59.000Z"),
          leaseMs: 60_000,
        }),
      ).resolves.toBeNull();

      const retry = await claimPaymentRefundService({
        paymentRefundId: ensured.paymentRefund.id,
        now: new Date("2026-08-03T18:05:00.000Z"),
        leaseMs: 60_000,
      });

      expect(retry.paymentRefund).toMatchObject({
        status: PAYMENT_REFUND_STATUS.PROCESSING,
        attemptCount: 2,
      });

      const stored = await findPaymentRefundById(ensured.paymentRefund.id);
      expect(stored.providerSucceededAt).toBeNull();
    });
  },
);
