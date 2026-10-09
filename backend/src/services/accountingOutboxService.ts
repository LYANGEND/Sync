import {
  AccountingPostingEventType,
  AccountingPostingStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../utils/prisma';
import {
  onCreditNoteCreated,
  onInvoiceCancelled,
  onInvoiceSent,
  onPaymentAllocated,
  onPaymentCreated,
  onPaymentVoided,
  onRefundProcessed,
} from './accountingBridge';

type OutboxClient = Prisma.TransactionClient | typeof prisma;

type ClaimedPosting = {
  id: string;
  postingKey: string;
  eventType: AccountingPostingEventType;
  aggregateId: string;
  userId: string | null;
  payload: unknown;
  attempts: number;
};

type AllocationPostingPayload = {
  amount: number;
  settlesInvoice: boolean;
  feeTemplateName: string | null;
};

export const paymentAllocationPostingKey = (
  allocationId: string,
  cumulativeAmount: number | Prisma.Decimal,
) => `payment-allocation:${allocationId}:${Number(cumulativeAmount).toFixed(2)}`;

const outboxKey = (
  eventType: AccountingPostingEventType,
  aggregateId: string,
  eventKey?: string,
) => (
  eventKey || `${eventType}:${aggregateId}`
);

export const enqueueAccountingPosting = async (
  client: OutboxClient,
  eventType: AccountingPostingEventType,
  aggregateId: string,
  userId?: string | null,
  options: { eventKey?: string; payload?: Prisma.InputJsonValue } = {},
) => client.accountingPostingOutbox.upsert({
  where: { postingKey: outboxKey(eventType, aggregateId, options.eventKey) },
  create: {
    postingKey: outboxKey(eventType, aggregateId, options.eventKey),
    eventType,
    aggregateId,
    userId: userId || null,
    payload: options.payload,
  },
  update: {
    ...(userId ? { userId } : {}),
  },
});

const expectedJournalPostingKey = (
  eventType: AccountingPostingEventType,
  aggregateId: string,
  postingKey: string,
): string => {
  switch (eventType) {
    case 'PAYMENT_RECEIVED': return `payment:${aggregateId}:receipt`;
    case 'PAYMENT_ALLOCATED': return postingKey;
    case 'PAYMENT_VOIDED': return `payment:${aggregateId}:void`;
    case 'INVOICE_ISSUED': return `invoice:${aggregateId}:issued`;
    case 'INVOICE_CANCELLED': return `invoice:${aggregateId}:cancelled`;
    case 'CREDIT_NOTE_ISSUED': return `credit-note:${aggregateId}:issued`;
    case 'REFUND_PROCESSED': return `refund:${aggregateId}:processed`;
  }
};

const parseAllocationPostingPayload = (
  posting: Pick<ClaimedPosting, 'postingKey' | 'payload'>,
): AllocationPostingPayload => {
  const payload = posting.payload as {
    amount?: unknown;
    settlesInvoice?: unknown;
    feeTemplateName?: unknown;
  } | null;
  if (
    !payload
    || typeof payload.amount !== 'number'
    || !Number.isFinite(payload.amount)
    || payload.amount <= 0
    || typeof payload.settlesInvoice !== 'boolean'
  ) {
    throw new Error(`Invalid allocation payload for ${posting.postingKey}`);
  }
  return {
    amount: payload.amount,
    settlesInvoice: payload.settlesInvoice,
    feeTemplateName: typeof payload.feeTemplateName === 'string'
      ? payload.feeTemplateName
      : null,
  };
};

const dispatchAllocationPosting = async (
  posting: Pick<ClaimedPosting, 'postingKey' | 'aggregateId' | 'payload' | 'userId'>,
): Promise<void> => {
  const payload = parseAllocationPostingPayload(posting);
  const allocation = await prisma.paymentAllocation.findUnique({
    where: { id: posting.aggregateId },
    select: { paymentId: true },
  });
  if (!allocation) {
    throw new Error(`Payment allocation ${posting.aggregateId} was not found`);
  }
  const userId = posting.userId || undefined;
  await onPaymentCreated(allocation.paymentId, userId, { allowSuperseded: true });
  await onPaymentAllocated(
    posting.aggregateId,
    payload.amount,
    posting.postingKey,
    {
      settlesInvoice: payload.settlesInvoice,
      feeTemplateName: payload.feeTemplateName,
    },
    userId,
  );
};

const reconstructPaymentAllocationPostings = async (
  paymentId: string,
): Promise<void> => {
  const allocations = await prisma.paymentAllocation.findMany({
    where: { paymentId },
    select: { id: true, amount: true },
  });
  if (allocations.length === 0) return;

  const allocationIds = allocations.map(allocation => allocation.id);
  const postings = await prisma.accountingPostingOutbox.findMany({
    where: {
      eventType: AccountingPostingEventType.PAYMENT_ALLOCATED,
      aggregateId: { in: allocationIds },
    },
    select: {
      postingKey: true,
      aggregateId: true,
      payload: true,
      userId: true,
      createdAt: true,
      id: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const postedAmounts = new Map<string, number>();
  for (const posting of postings) {
    const payload = parseAllocationPostingPayload(posting);
    postedAmounts.set(
      posting.aggregateId,
      (postedAmounts.get(posting.aggregateId) ?? 0) + payload.amount,
    );
    await dispatchAllocationPosting(posting);
  }

  for (const allocation of allocations) {
    const eventTotal = postedAmounts.get(allocation.id) ?? 0;
    if (Math.abs(eventTotal - Number(allocation.amount)) > 0.005) {
      throw new Error(
        `Allocation accounting events for ${allocation.id} total ${eventTotal.toFixed(2)} instead of ${Number(allocation.amount).toFixed(2)}`,
      );
    }
  }
};

const dispatchPosting = async (posting: ClaimedPosting): Promise<void> => {
  const userId = posting.userId || undefined;
  switch (posting.eventType) {
    case 'PAYMENT_RECEIVED':
      await onPaymentCreated(posting.aggregateId, userId, { allowSuperseded: true });
      break;
    case 'PAYMENT_ALLOCATED':
      await dispatchAllocationPosting(posting);
      break;
    case 'PAYMENT_VOIDED':
      await onPaymentCreated(posting.aggregateId, userId, { allowSuperseded: true });
      await reconstructPaymentAllocationPostings(posting.aggregateId);
      await onPaymentVoided(posting.aggregateId, userId);
      break;
    case 'INVOICE_ISSUED':
      await onInvoiceSent(posting.aggregateId, userId, { allowSuperseded: true });
      break;
    case 'INVOICE_CANCELLED':
      await onInvoiceCancelled(posting.aggregateId, userId);
      break;
    case 'CREDIT_NOTE_ISSUED':
      await onCreditNoteCreated(posting.aggregateId, userId, { allowSuperseded: true });
      break;
    case 'REFUND_PROCESSED': {
      const refund = await prisma.refund.findUnique({
        where: { id: posting.aggregateId },
        select: { paymentId: true },
      });
      if (refund) {
        await onPaymentCreated(refund.paymentId, userId, { allowSuperseded: true });
      }
      await onRefundProcessed(posting.aggregateId, userId);
      break;
    }
  }

  const journalKey = expectedJournalPostingKey(
    posting.eventType,
    posting.aggregateId,
    posting.postingKey,
  );
  const posted = await prisma.journalEntry.findUnique({
    where: { postingKey: journalKey },
    select: { id: true },
  });
  if (!posted) {
    throw new Error(`Expected journal posting ${journalKey} was not created`);
  }
};

const claimAccountingPostings = async (batchSize: number): Promise<ClaimedPosting[]> => (
  prisma.$transaction(tx => tx.$queryRaw<ClaimedPosting[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "accounting_posting_outbox"
      WHERE "attempts" < 10
        AND (
          ("status" IN ('PENDING', 'FAILED') AND "availableAt" <= CURRENT_TIMESTAMP)
          OR (
            "status" = 'PROCESSING'
            AND "lockedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          )
        )
      ORDER BY "createdAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE "accounting_posting_outbox" outbox
    SET
      "status" = 'PROCESSING',
      "attempts" = outbox."attempts" + 1,
      "lockedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM candidates
    WHERE outbox."id" = candidates."id"
    RETURNING
      outbox."id",
      outbox."postingKey",
      outbox."eventType",
      outbox."aggregateId",
      outbox."userId",
      outbox."payload",
      outbox."attempts"
  `)
);

export const processAccountingPostingOutbox = async (
  batchSize = 50,
): Promise<{ claimed: number; completed: number; failed: number }> => {
  const claimed = await claimAccountingPostings(Math.max(1, Math.min(batchSize, 200)));
  let completed = 0;
  let failed = 0;

  for (const posting of claimed) {
    try {
      await dispatchPosting(posting);
      await prisma.accountingPostingOutbox.update({
        where: { id: posting.id },
        data: {
          status: AccountingPostingStatus.COMPLETED,
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryDelaySeconds = Math.min(3600, 2 ** Math.min(posting.attempts, 10) * 15);
      await prisma.accountingPostingOutbox.update({
        where: { id: posting.id },
        data: {
          status: AccountingPostingStatus.FAILED,
          lastError: message.slice(0, 4000),
          lockedAt: null,
          availableAt: new Date(Date.now() + retryDelaySeconds * 1000),
        },
      });
      failed += 1;
      console.error(`[AccountingOutbox] ${posting.postingKey} failed:`, error);
    }
  }

  return { claimed: claimed.length, completed, failed };
};
