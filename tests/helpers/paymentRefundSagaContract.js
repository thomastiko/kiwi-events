import { expect, it, vi } from "vitest";

import {
  PAYMENT_REFUND_SOURCE_TYPE,
  PAYMENT_REFUND_STATUS,
} from "../../src/modules/paymentRefunds/paymentRefund.constants.js";
import { executePaymentRefundService } from "../../src/modules/paymentRefunds/paymentRefund.service.js";
import { findPaymentRefundByIdempotencyKey } from "../../src/modules/paymentRefunds/repositories/paymentRefund.repository.js";

function buildInput(idPrefix, overrides = {}) {
  return {
    sourceType: PAYMENT_REFUND_SOURCE_TYPE.DEPOSIT_TICKET,
    sourceId: `${idPrefix}-saga-ticket-1`,
    orderId: `${idPrefix}-saga-order-1`,
    ticketId: `${idPrefix}-saga-ticket-1`,

    provider: "mollie",
    providerPaymentId: `pay_${idPrefix}_saga_1`,

    amount: 2500,
    currency: "EUR",

    idempotencyKey: `deposit-refund:${idPrefix}-saga-ticket-1`,

    description: `Refund ${idPrefix} saga ticket`,

    metadata: {
      source: `${idPrefix}_payment_refund_saga_test`,
    },

    actor: {
      eventUserId: `${idPrefix}-saga-event-user-1`,
    },

    /*
     * Die Tests sollen Retries direkt ausführen
     * können, ohne reale Wartezeiten.
     */
    retryBaseMs: 0,
    retryMaxMs: 0,

    ...overrides,
  };
}

function buildProviderRefund(idPrefix, overrides = {}) {
  return {
    provider: "mollie",
    providerPaymentId: `pay_${idPrefix}_saga_1`,
    providerRefundId: `refund_${idPrefix}_saga_1`,
    status: "refunded",

    ...overrides,
  };
}

export function definePaymentRefundSagaContract({
  idPrefix,
  createProviderRefundMock,
  sendRefundCompletedMailMock,
}) {
  it.each([
    {
      provider: "mollie",
      providerPaymentId: `pay_${idPrefix}_mollie_1`,
      providerRefundId: `refund_${idPrefix}_mollie_1`,
      sourceId: `${idPrefix}-saga-ticket-mollie`,
    },
    {
      provider: "stripe",
      providerPaymentId: `pi_${idPrefix}_stripe_1`,
      providerRefundId: `re_${idPrefix}_stripe_1`,
      sourceId: `${idPrefix}-saga-ticket-stripe`,
    },
  ])(
    "completes a $provider refund and ignores an already completed replay",
    async ({ provider, providerPaymentId, providerRefundId, sourceId }) => {
      const input = buildInput(idPrefix, {
        sourceId,
        ticketId: sourceId,

        provider,
        providerPaymentId,

        idempotencyKey: `deposit-refund:${sourceId}`,
      });

      createProviderRefundMock.mockResolvedValueOnce(
        buildProviderRefund(idPrefix, {
          provider,
          providerPaymentId,
          providerRefundId,
        }),
      );

      const finalizeLocalState = vi.fn(async ({ paymentRefund }) => ({
        ticketId: paymentRefund.ticketId,
      }));

      const result = await executePaymentRefundService({
        ...input,
        finalizeLocalState,
      });

      expect(result).toMatchObject({
        success: true,
        ignored: false,

        paymentRefund: {
          status: PAYMENT_REFUND_STATUS.COMPLETED,
          providerRefundId,
        },

        localResult: {
          ticketId: sourceId,
        },
      });
      expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

      expect(createProviderRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider,
          providerPaymentId,

          idempotencyKey: `deposit-refund:${sourceId}`,

          amount: "25.00",
          currency: "EUR",
        }),
      );

      expect(finalizeLocalState).toHaveBeenCalledTimes(1);

      /*
       * Ein vollständig abgeschlossener Refund
       * darf weder Provider noch lokale
       * Finalisierung erneut ausführen.
       */
      const replay = await executePaymentRefundService({
        ...input,
        finalizeLocalState,
      });

      expect(replay).toMatchObject({
        success: true,
        ignored: true,
        reason: "refund_already_completed",
      });
      expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

      expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

      expect(finalizeLocalState).toHaveBeenCalledTimes(1);
    },
  );

  it("calls the completed-mail hook only for order refunds and retries it on completed replay", async () => {
    const orderId = `${idPrefix}-saga-order-mail-1`;

    const input = buildInput(idPrefix, {
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
      sourceId: orderId,
      orderId,
      ticketId: null,

      providerPaymentId: `pay_${idPrefix}_order_mail_1`,

      idempotencyKey: `order-refund:${orderId}`,

      description: `Order refund ${idPrefix}`,
    });

    createProviderRefundMock.mockResolvedValueOnce(
      buildProviderRefund(idPrefix, {
        providerPaymentId: `pay_${idPrefix}_order_mail_1`,
        providerRefundId: `refund_${idPrefix}_order_mail_1`,
      }),
    );

    const finalizeLocalState = vi.fn(async () => ({
      orderId,
    }));

    const first = await executePaymentRefundService({
      ...input,
      finalizeLocalState,
    });

    expect(first.paymentRefund).toMatchObject({
      sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
      sourceId: orderId,
      orderId,
      status: PAYMENT_REFUND_STATUS.COMPLETED,
      providerRefundId: `refund_${idPrefix}_order_mail_1`,
    });

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(1);
    expect(sendRefundCompletedMailMock).toHaveBeenLastCalledWith({
      paymentRefund: expect.objectContaining({
        sourceType: PAYMENT_REFUND_SOURCE_TYPE.ORDER,
        status: PAYMENT_REFUND_STATUS.COMPLETED,
        providerRefundId: `refund_${idPrefix}_order_mail_1`,
      }),

      context: {
        eventUserId: `${idPrefix}-saga-event-user-1`,
      },
    });

    const replay = await executePaymentRefundService({
      ...input,
      finalizeLocalState,
    });

    expect(replay).toMatchObject({
      success: true,
      ignored: true,
      reason: "refund_already_completed",
    });

    expect(sendRefundCompletedMailMock).toHaveBeenCalledTimes(2);
    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);
    expect(finalizeLocalState).toHaveBeenCalledTimes(1);
  });

  it("allows only one provider call for two parallel executions", async () => {
    let releaseProvider;
    let markProviderStarted;

    const providerBarrier = new Promise((resolve) => {
      releaseProvider = resolve;
    });

    const providerStarted = new Promise((resolve) => {
      markProviderStarted = resolve;
    });

    createProviderRefundMock.mockImplementationOnce(async () => {
      markProviderStarted();

      await providerBarrier;

      return buildProviderRefund(idPrefix);
    });

    const finalizeLocalState = vi.fn(async () => ({
      finalized: true,
    }));

    const first = executePaymentRefundService({
      ...buildInput(idPrefix),
      finalizeLocalState,
    });

    /*
     * Der erste Worker hält jetzt sicher
     * den Lease und befindet sich beim Provider.
     */
    await providerStarted;

    const second = executePaymentRefundService({
      ...buildInput(idPrefix),
      finalizeLocalState,
    });

    releaseProvider();

    const results = await Promise.all([first, second]);

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(finalizeLocalState).toHaveBeenCalledTimes(1);

    expect(
      results.filter((result) => result.success && !result.ignored),
    ).toHaveLength(1);

    expect(results.filter((result) => result.ignored)).toHaveLength(1);
  });

  it("retries a definitive provider failure with the same idempotency key", async () => {
    const providerError = Object.assign(new Error("Provider rejected refund"), {
      statusCode: 422,
    });

    createProviderRefundMock
      .mockRejectedValueOnce(providerError)
      .mockResolvedValueOnce(buildProviderRefund(idPrefix));

    const finalizeLocalState = vi.fn(async () => ({
      finalized: true,
    }));

    const input = buildInput(idPrefix);

    await expect(
      executePaymentRefundService({
        ...input,
        finalizeLocalState,
      }),
    ).rejects.toThrow("Provider rejected refund");

    const failed = await findPaymentRefundByIdempotencyKey(
      input.idempotencyKey,
    );

    expect(failed).toMatchObject({
      status: PAYMENT_REFUND_STATUS.FAILED,
      attemptCount: 1,
    });

    expect(failed.nextRetryAt).not.toBeNull();

    const retry = await executePaymentRefundService({
      ...input,
      finalizeLocalState,
    });

    expect(retry.paymentRefund).toMatchObject({
      status: PAYMENT_REFUND_STATUS.COMPLETED,
      attemptCount: 2,
    });

    expect(createProviderRefundMock).toHaveBeenCalledTimes(2);

    expect(
      createProviderRefundMock.mock.calls.map(
        ([providerInput]) => providerInput.idempotencyKey,
      ),
    ).toEqual([input.idempotencyKey, input.idempotencyKey]);
  });

  it("retries local finalization without calling the provider again", async () => {
    const finalizeLocalState = vi
      .fn()
      .mockRejectedValueOnce(new Error("Ticket update failed"))
      .mockResolvedValueOnce({
        finalized: true,
      });

    const input = buildInput(idPrefix);

    await expect(
      executePaymentRefundService({
        ...input,
        finalizeLocalState,
      }),
    ).rejects.toThrow("Ticket update failed");
    /*
     * Provider-Erfolg allein reicht nicht.
     * Solange die lokale Finalisierung nicht
     * erfolgreich war, darf keine Refund-Mail raus.
     */
    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    const providerSucceeded = await findPaymentRefundByIdempotencyKey(
      input.idempotencyKey,
    );

    expect(providerSucceeded).toMatchObject({
      status: PAYMENT_REFUND_STATUS.PROVIDER_SUCCEEDED,

      providerRefundId: `refund_${idPrefix}_saga_1`,

      attemptCount: 1,
    });

    expect(providerSucceeded.nextRetryAt).not.toBeNull();

    const retry = await executePaymentRefundService({
      ...input,
      finalizeLocalState,
    });

    expect(retry.paymentRefund).toMatchObject({
      status: PAYMENT_REFUND_STATUS.COMPLETED,

      providerRefundId: `refund_${idPrefix}_saga_1`,

      attemptCount: 2,
    });
    expect(sendRefundCompletedMailMock).not.toHaveBeenCalled();

    /*
     * Wichtigste Saga-Garantie:
     *
     * Der Provider wurde bereits erfolgreich
     * ausgeführt und darf beim lokalen Retry
     * nicht nochmals aufgerufen werden.
     */
    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(finalizeLocalState).toHaveBeenCalledTimes(2);

    expect(finalizeLocalState.mock.calls[1][0]).toMatchObject({
      providerRefund: {
        providerRefundId: `refund_${idPrefix}_saga_1`,

        resumed: true,
      },
    });
  });

  it("moves an ambiguous provider error to manual review and does not retry it", async () => {
    createProviderRefundMock.mockRejectedValueOnce(
      Object.assign(new Error("Provider request timed out"), {
        code: "ETIMEDOUT",
      }),
    );

    const finalizeLocalState = vi.fn(async () => ({
      finalized: true,
    }));

    const input = buildInput(idPrefix);

    await expect(
      executePaymentRefundService({
        ...input,
        finalizeLocalState,
      }),
    ).rejects.toThrow("Provider request timed out");

    const manualReview = await findPaymentRefundByIdempotencyKey(
      input.idempotencyKey,
    );

    expect(manualReview).toMatchObject({
      status: PAYMENT_REFUND_STATUS.MANUAL_REVIEW,

      attemptCount: 1,
      lastError: "Provider request timed out",
    });

    /*
     * manual_review wird niemals automatisch
     * erneut beim Provider ausgeführt.
     */
    const retry = await executePaymentRefundService({
      ...input,
      finalizeLocalState,
    });

    expect(retry).toMatchObject({
      success: false,
      ignored: true,
      reason: "refund_requires_manual_review",
    });

    expect(createProviderRefundMock).toHaveBeenCalledTimes(1);

    expect(finalizeLocalState).not.toHaveBeenCalled();
  });

  it("keeps an unknown provider refund id in manual review", async () => {
    const providerRefundId = `refund_${idPrefix}_unknown_1`;

    createProviderRefundMock.mockResolvedValueOnce(
      buildProviderRefund(idPrefix, {
        providerRefundId,
        status: "unknown",
      }),
    );

    const finalizeLocalState = vi.fn(async () => ({
      finalized: true,
    }));

    const input = buildInput(idPrefix);

    await expect(
      executePaymentRefundService({
        ...input,
        finalizeLocalState,
      }),
    ).rejects.toThrow(
      `Payment provider returned refund ${providerRefundId} with an unknown status.`,
    );

    const manualReview = await findPaymentRefundByIdempotencyKey(
      input.idempotencyKey,
    );

    /*
     * Die bekannte Provider-ID darf nicht
     * verloren gehen. Ein Admin muss damit
     * später beim Provider nachforschen können.
     */
    expect(manualReview).toMatchObject({
      status: PAYMENT_REFUND_STATUS.MANUAL_REVIEW,

      providerRefundId,
      attemptCount: 1,
    });

    expect(manualReview.providerSucceededAt).not.toBeNull();

    expect(finalizeLocalState).not.toHaveBeenCalled();
  });
}
