import {
  AccountingPostingEventType,
  PaymentMethod,
  PaymentSource,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../utils/prisma';
import { generateSequenceNumber } from './accountingService';
import {
  enqueueAccountingPosting,
  paymentAllocationPostingKey,
} from './accountingOutboxService';
import { runTermWriteTransaction } from './termLifecycleService';

type SettlementClient = Prisma.TransactionClient;

const MONEY_EPSILON = 0.005;

const asMoney = (value: Prisma.Decimal | number | string | null | undefined): number => (
  Math.round(Number(value ?? 0) * 100) / 100
);

export type PaymentSettlementErrorCode =
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_NOT_COMPLETED'
  | 'PAYMENT_ALREADY_VOIDED'
  | 'PAYMENT_BRANCH_MISMATCH'
  | 'PAYMENT_NOT_REFUNDABLE'
  | 'PAYMENT_RECONCILED'
  | 'PAYMENT_HAS_PROCESSED_REFUND'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_BRANCH_MISMATCH'
  | 'FEE_NOT_FOUND'
  | 'FEE_STUDENT_MISMATCH'
  | 'ALLOCATION_EXCEEDS_PAYMENT'
  | 'ALLOCATION_EXCEEDS_OBLIGATION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_NOT_SETTLEABLE'
  | 'INVOICE_OBLIGATION_LINK_REQUIRED'
  | 'INVOICE_PAYMENT_EXCEEDS_BALANCE'
  | 'INVOICE_ALLOCATION_SHORTFALL'
  | 'REFUND_NOT_FOUND'
  | 'REFUND_BRANCH_MISMATCH'
  | 'REFUND_IDEMPOTENCY_CONFLICT'
  | 'REFUND_NOT_REQUESTED'
  | 'REFUND_NOT_APPROVED'
  | 'REFUND_EXCEEDS_PAYMENT';

export class PaymentSettlementError extends Error {
  constructor(
    public readonly code: PaymentSettlementErrorCode,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = 'PaymentSettlementError';
  }
}

const lockPayment = async (tx: SettlementClient, paymentId: string) => {
  await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
};

const lockFees = async (tx: SettlementClient, feeIds: string[]) => {
  if (feeIds.length === 0) return;
  await tx.$queryRawUnsafe(
    `SELECT "id" FROM "student_fee_structures" WHERE "id" IN (${feeIds.map((_, index) => `$${index + 1}`).join(', ')}) ORDER BY "id" FOR UPDATE`,
    ...feeIds,
  );
};

const lockInvoice = async (tx: SettlementClient, invoiceId: string) => {
  await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} FOR UPDATE`;
};

const generateTransactionId = (): string => {
  const random = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `TXN-${random}`;
};

const loadPaymentSettlement = async (tx: SettlementClient, paymentId: string) => {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: {
      refunds: {
        where: { status: 'PROCESSED' },
        select: { id: true, amount: true },
      },
      allocations: {
        include: {
          refundAllocations: {
            where: { refund: { status: 'PROCESSED' } },
            select: { amount: true },
          },
        },
      },
    },
  });
  if (!payment) {
    throw new PaymentSettlementError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
  }

  const refundedAmount = asMoney(
    payment.refunds.reduce((sum, refund) => sum + asMoney(refund.amount), 0),
  );
  const allocatedAmount = asMoney(payment.allocations.reduce((sum, allocation) => {
    const reversed = allocation.refundAllocations.reduce(
      (reversalSum, reversal) => reversalSum + asMoney(reversal.amount),
      0,
    );
    return sum + asMoney(allocation.amount) - reversed;
  }, 0));
  const netAmount = asMoney(payment.amount) - refundedAmount;

  return {
    payment,
    refundedAmount,
    allocatedAmount,
    netAmount: asMoney(netAmount),
    unallocatedAmount: asMoney(Math.max(0, netAmount - allocatedAmount)),
  };
};

export interface AllocatePaymentOptions {
  studentFeeIds?: string[];
  obligationTermId?: string;
}

export const allocatePaymentInTransaction = async (
  tx: SettlementClient,
  paymentId: string,
  options: AllocatePaymentOptions = {},
) => {
  await lockPayment(tx, paymentId);
  const settlement = await loadPaymentSettlement(tx, paymentId);
  if (settlement.payment.status !== 'COMPLETED') {
    throw new PaymentSettlementError(
      'PAYMENT_NOT_COMPLETED',
      'Only completed payments can be allocated',
    );
  }
  await enqueueAccountingPosting(
    tx,
    AccountingPostingEventType.PAYMENT_RECEIVED,
    paymentId,
    settlement.payment.recordedByUserId,
  );

  let remaining = settlement.unallocatedAmount;
  if (remaining < MONEY_EPSILON) {
    return { allocations: [], allocatedAmount: 0, unallocatedAmount: 0 };
  }

  const requestedFeeIds = [...new Set(options.studentFeeIds ?? [])];
  const fees = await tx.studentFeeStructure.findMany({
    where: {
      studentId: settlement.payment.studentId,
      ...(requestedFeeIds.length > 0 ? { id: { in: requestedFeeIds } } : {}),
      ...(options.obligationTermId ? { academicTermId: options.obligationTermId } : {}),
    },
    include: {
      academicTerm: { select: { startDate: true } },
      feeTemplate: { select: { name: true } },
      invoiceItem: { select: { id: true } },
    },
    orderBy: [
      { academicTerm: { startDate: 'asc' } },
      { dueDate: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  if (requestedFeeIds.length > 0 && fees.length !== requestedFeeIds.length) {
    const existingFees = await tx.studentFeeStructure.findMany({
      where: { id: { in: requestedFeeIds } },
      select: { id: true, studentId: true },
    });
    if (existingFees.length !== requestedFeeIds.length) {
      throw new PaymentSettlementError('FEE_NOT_FOUND', 'One or more fee obligations were not found', 404);
    }
    throw new PaymentSettlementError(
      'FEE_STUDENT_MISMATCH',
      'Every allocated fee obligation must belong to the payment student',
      400,
    );
  }

  await lockFees(tx, fees.map(fee => fee.id));
  const allocations: Array<{ paymentId: string; studentFeeId: string; amount: number }> = [];

  for (const fee of fees) {
    if (remaining < MONEY_EPSILON) break;
    const outstanding = asMoney(asMoney(fee.amountDue) - asMoney(fee.amountPaid));
    if (outstanding < MONEY_EPSILON) continue;

    const amount = asMoney(Math.min(remaining, outstanding));
    const allocation = await tx.paymentAllocation.upsert({
      where: {
        paymentId_studentFeeId: {
          paymentId,
          studentFeeId: fee.id,
        },
      },
      create: { paymentId, studentFeeId: fee.id, amount },
      update: { amount: { increment: amount } },
    });
    await enqueueAccountingPosting(
      tx,
      AccountingPostingEventType.PAYMENT_ALLOCATED,
      allocation.id,
      settlement.payment.recordedByUserId,
      {
        eventKey: paymentAllocationPostingKey(allocation.id, allocation.amount),
        payload: {
          amount,
          settlesInvoice: Boolean(fee.invoiceItem),
          feeTemplateName: fee.feeTemplate.name,
        },
      },
    );
    allocations.push({ paymentId, studentFeeId: fee.id, amount });
    remaining = asMoney(remaining - amount);
  }

  return {
    allocations,
    allocatedAmount: asMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0)),
    unallocatedAmount: asMoney(remaining),
  };
};

export interface CreateCompletedPaymentInput {
  studentId: string;
  receiptTermId: string;
  amount: number;
  method: PaymentMethod;
  source?: PaymentSource;
  notes?: string | null;
  recordedByUserId?: string | null;
  actorBranchId?: string | null;
  idempotencyKey?: string | null;
  transactionId?: string;
  autoAllocate?: boolean;
  studentFeeIds?: string[];
  obligationTermId?: string;
}

const assertIdempotentPaymentMatches = (
  existing: {
    studentId: string;
    academicTermId: string;
    amount: Prisma.Decimal;
    method: PaymentMethod;
    source: PaymentSource;
  },
  input: CreateCompletedPaymentInput,
) => {
  if (
    existing.studentId !== input.studentId
    || existing.academicTermId !== input.receiptTermId
    || Math.abs(asMoney(existing.amount) - asMoney(input.amount)) > MONEY_EPSILON
    || existing.method !== input.method
    || existing.source !== (input.source ?? 'MANUAL')
  ) {
    throw new PaymentSettlementError(
      'IDEMPOTENCY_CONFLICT',
      'The idempotency key is already associated with a different payment request',
    );
  }
};

export const createCompletedPaymentInTransaction = async (
  tx: SettlementClient,
  input: CreateCompletedPaymentInput,
) => {
  if (input.idempotencyKey) {
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      assertIdempotentPaymentMatches(existing, input);
      await enqueueAccountingPosting(
        tx,
        AccountingPostingEventType.PAYMENT_RECEIVED,
        existing.id,
        input.recordedByUserId,
      );
      return {
        payment: existing,
        settlement: await loadPaymentSettlement(tx, existing.id),
        reused: true,
      };
    }
  }

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, branchId: true },
  });
  if (!student) {
    throw new PaymentSettlementError('STUDENT_NOT_FOUND', 'Student not found', 404);
  }
  if (input.actorBranchId && student.branchId && input.actorBranchId !== student.branchId) {
    throw new PaymentSettlementError(
      'STUDENT_BRANCH_MISMATCH',
      'Payment cannot be recorded for a student in another branch',
      403,
    );
  }

  const payment = await tx.payment.create({
    data: {
      transactionId: input.transactionId ?? generateTransactionId(),
      idempotencyKey: input.idempotencyKey || null,
      source: input.source ?? 'MANUAL',
      studentId: input.studentId,
      academicTermId: input.receiptTermId,
      amount: asMoney(input.amount),
      method: input.method,
      notes: input.notes,
      status: 'COMPLETED',
      recordedByUserId: input.recordedByUserId,
      branchId: student.branchId,
    },
  });

  if (input.autoAllocate !== false) {
    await allocatePaymentInTransaction(tx, payment.id, {
      studentFeeIds: input.studentFeeIds,
      obligationTermId: input.obligationTermId,
    });
  }

  await enqueueAccountingPosting(
    tx,
    AccountingPostingEventType.PAYMENT_RECEIVED,
    payment.id,
    input.recordedByUserId,
  );

  return {
    payment,
    settlement: await loadPaymentSettlement(tx, payment.id),
    reused: false,
  };
};

export const createCompletedPayment = async (input: CreateCompletedPaymentInput) => (
  runTermWriteTransaction(input.receiptTermId, 'FINANCIAL_RECEIPT', tx => (
    createCompletedPaymentInTransaction(tx, input)
  ))
);

export const allocateExistingPayment = async (
  receiptTermId: string,
  paymentId: string,
  options: AllocatePaymentOptions = {},
) => runTermWriteTransaction(receiptTermId, 'FINANCIAL_RECEIPT', tx => (
  allocatePaymentInTransaction(tx, paymentId, options)
));

export const completePendingPaymentInTransaction = async (
  tx: SettlementClient,
  paymentId: string,
) => {
  await lockPayment(tx, paymentId);
  const current = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!current) {
    throw new PaymentSettlementError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
  }
  if (current.status === 'FAILED' || current.status === 'VOIDED') {
    throw new PaymentSettlementError(
      'PAYMENT_NOT_COMPLETED',
      `A ${current.status.toLowerCase()} payment cannot be completed`,
    );
  }

  const becameCompleted = current.status !== 'COMPLETED';
  const payment = becameCompleted
    ? await tx.payment.update({ where: { id: paymentId }, data: { status: 'COMPLETED' } })
    : current;
  await allocatePaymentInTransaction(tx, paymentId);
  await enqueueAccountingPosting(
    tx,
    AccountingPostingEventType.PAYMENT_RECEIVED,
    paymentId,
    payment.recordedByUserId,
  );

  return {
    payment,
    settlement: await loadPaymentSettlement(tx, paymentId),
    becameCompleted,
  };
};

export const voidPaymentSettlement = async (
  paymentId: string,
  userId: string,
  reason: string,
  actorBranchId?: string | null,
) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { academicTermId: true },
  });
  if (!payment) throw new PaymentSettlementError('PAYMENT_NOT_FOUND', 'Payment not found', 404);

  return runTermWriteTransaction(payment.academicTermId, 'FINANCIAL_RECEIPT', async tx => {
    await lockPayment(tx, paymentId);
    const current = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: { where: { status: 'PROCESSED' }, select: { id: true } } },
    });
    if (!current) throw new PaymentSettlementError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (actorBranchId && current.branchId && actorBranchId !== current.branchId) {
      throw new PaymentSettlementError(
        'PAYMENT_BRANCH_MISMATCH',
        'Payment cannot be voided from another branch',
        403,
      );
    }
    if (current.status === 'VOIDED') {
      throw new PaymentSettlementError('PAYMENT_ALREADY_VOIDED', 'Payment has already been voided');
    }
    if (current.isReconciled) {
      throw new PaymentSettlementError(
        'PAYMENT_RECONCILED',
        'Reconciled payments must be unreconciled before they can be voided',
      );
    }
    if (current.refunds.length > 0) {
      throw new PaymentSettlementError(
        'PAYMENT_HAS_PROCESSED_REFUND',
        'A payment with a processed refund cannot be voided',
      );
    }

    const voided = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedByUserId: userId,
        voidReason: reason,
      },
    });
    await enqueueAccountingPosting(
      tx,
      AccountingPostingEventType.PAYMENT_VOIDED,
      paymentId,
      userId,
    );
    return voided;
  });
};

export interface SettleInvoicePaymentInput {
  invoiceId: string;
  receiptTermId: string;
  amount: number;
  method: PaymentMethod;
  notes?: string;
  userId: string;
  actorBranchId?: string | null;
  idempotencyKey?: string | null;
}

export const settleInvoicePayment = async (input: SettleInvoicePaymentInput) => (
  runTermWriteTransaction(input.receiptTermId, 'FINANCIAL_RECEIPT', async tx => {
    await lockInvoice(tx, input.invoiceId);
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { items: { select: { studentFeeId: true } } },
    });
    if (!invoice) {
      throw new PaymentSettlementError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    }

    const studentFeeIds = invoice.items.flatMap(item => item.studentFeeId ? [item.studentFeeId] : []);
    if (studentFeeIds.length !== invoice.items.length || studentFeeIds.length === 0) {
      throw new PaymentSettlementError(
        'INVOICE_OBLIGATION_LINK_REQUIRED',
        'Every invoice item must link to a canonical fee obligation before payment can be recorded',
      );
    }

    if (input.idempotencyKey) {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { allocations: { select: { studentFeeId: true } } },
      });
      if (existing) {
        assertIdempotentPaymentMatches(existing, {
          studentId: invoice.studentId,
          receiptTermId: input.receiptTermId,
          amount: input.amount,
          method: input.method,
          source: 'INVOICE',
        });
        const existingFeeIds = new Set(existing.allocations.map(allocation => allocation.studentFeeId));
        if (
          existingFeeIds.size !== studentFeeIds.length
          || studentFeeIds.some(studentFeeId => !existingFeeIds.has(studentFeeId))
        ) {
          throw new PaymentSettlementError(
            'IDEMPOTENCY_CONFLICT',
            'The idempotency key is already associated with another invoice settlement',
          );
        }
        return {
          payment: existing,
          settlement: await loadPaymentSettlement(tx, existing.id),
          reused: true,
          invoice,
        };
      }
    }

    if (['CANCELLED', 'CREDITED', 'PAID'].includes(invoice.status)) {
      throw new PaymentSettlementError(
        'INVOICE_NOT_SETTLEABLE',
        `A ${invoice.status.toLowerCase()} invoice cannot receive a payment`,
      );
    }
    if (asMoney(input.amount) > asMoney(invoice.balanceDue) + MONEY_EPSILON) {
      throw new PaymentSettlementError(
        'INVOICE_PAYMENT_EXCEEDS_BALANCE',
        'Payment cannot exceed the invoice balance',
        400,
      );
    }

    const creation = await createCompletedPaymentInTransaction(tx, {
      studentId: invoice.studentId,
      receiptTermId: input.receiptTermId,
      amount: input.amount,
      method: input.method,
      source: 'INVOICE',
      notes: input.notes ?? `Settlement for invoice ${invoice.invoiceNumber}`,
      recordedByUserId: input.userId,
      actorBranchId: input.actorBranchId,
      idempotencyKey: input.idempotencyKey,
      studentFeeIds,
    });

    if (creation.settlement.unallocatedAmount > MONEY_EPSILON) {
      throw new PaymentSettlementError(
        'INVOICE_ALLOCATION_SHORTFALL',
        'The invoice payment could not be fully allocated to its fee obligations',
      );
    }

    const updatedInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    return { ...creation, invoice: updatedInvoice };
  })
);

export const processApprovedRefund = async (
  refundId: string,
  userId: string,
  actorBranchId?: string | null,
) => {
  const refundRecord = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { payment: { select: { academicTermId: true } } },
  });
  if (!refundRecord) throw new PaymentSettlementError('REFUND_NOT_FOUND', 'Refund not found', 404);

  return runTermWriteTransaction(
    refundRecord.payment.academicTermId,
    'FINANCIAL_ADJUSTMENT',
    async tx => {
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { allocationReversals: true },
      });
      if (!refund) throw new PaymentSettlementError('REFUND_NOT_FOUND', 'Refund not found', 404);
      if (actorBranchId && refund.branchId && actorBranchId !== refund.branchId) {
        throw new PaymentSettlementError(
          'REFUND_BRANCH_MISMATCH',
          'Refund cannot be processed for another branch',
          403,
        );
      }
      if (refund.status === 'PROCESSED') {
        await enqueueAccountingPosting(
          tx,
          AccountingPostingEventType.REFUND_PROCESSED,
          refund.id,
          userId,
        );
        return refund;
      }
      if (refund.status !== 'APPROVED') {
        throw new PaymentSettlementError(
          'REFUND_NOT_APPROVED',
          'Refund must be approved before processing',
          400,
        );
      }

      await lockPayment(tx, refund.paymentId);
      const settlement = await loadPaymentSettlement(tx, refund.paymentId);
      const refundAmount = asMoney(refund.amount);
      if (refundAmount > settlement.netAmount + MONEY_EPSILON) {
        throw new PaymentSettlementError(
          'REFUND_EXCEEDS_PAYMENT',
          'Refund exceeds the remaining net payment amount',
          400,
        );
      }

      let amountToReverse = asMoney(Math.max(0, refundAmount - settlement.unallocatedAmount));
      const allocations = [...settlement.payment.allocations].reverse();
      for (const allocation of allocations) {
        if (amountToReverse < MONEY_EPSILON) break;
        const alreadyReversed = allocation.refundAllocations.reduce(
          (sum, reversal) => sum + asMoney(reversal.amount),
          0,
        );
        const effective = asMoney(asMoney(allocation.amount) - alreadyReversed);
        if (effective < MONEY_EPSILON) continue;
        const reversalAmount = asMoney(Math.min(effective, amountToReverse));
        await tx.refundAllocation.create({
          data: {
            refundId,
            paymentAllocationId: allocation.id,
            amount: reversalAmount,
          },
        });
        amountToReverse = asMoney(amountToReverse - reversalAmount);
      }

      if (amountToReverse > MONEY_EPSILON) {
        throw new PaymentSettlementError(
          'REFUND_EXCEEDS_PAYMENT',
          'Refund could not be reconciled with the payment credit and allocations',
        );
      }

      const processed = await tx.refund.update({
        where: { id: refundId },
        data: { status: 'PROCESSED', processedBy: userId, processedAt: new Date() },
      });
      await enqueueAccountingPosting(
        tx,
        AccountingPostingEventType.REFUND_PROCESSED,
        refund.id,
        userId,
      );
      return processed;
    },
  );
};

export interface CreateRefundRequestInput {
  paymentId: string;
  amount: number;
  reason: string;
  method: string;
  requestedByUserId: string;
  actorBranchId?: string | null;
  idempotencyKey?: string | null;
  notes?: string | null;
}

export const createRefundRequest = async (input: CreateRefundRequestInput) => {
  const paymentRecord = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { academicTermId: true },
  });
  if (!paymentRecord) {
    throw new PaymentSettlementError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
  }

  return runTermWriteTransaction(
    paymentRecord.academicTermId,
    'FINANCIAL_ADJUSTMENT',
    async tx => {
      await lockPayment(tx, input.paymentId);
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (!payment) {
        throw new PaymentSettlementError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
      }
      if (payment.status !== 'COMPLETED') {
        throw new PaymentSettlementError(
          'PAYMENT_NOT_REFUNDABLE',
          'Only completed payments can be refunded',
          400,
        );
      }
      if (input.actorBranchId && payment.branchId && input.actorBranchId !== payment.branchId) {
        throw new PaymentSettlementError(
          'REFUND_BRANCH_MISMATCH',
          'Refund cannot be requested for a payment in another branch',
          403,
        );
      }

      if (input.idempotencyKey) {
        const existing = await tx.refund.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) {
          if (
            existing.paymentId !== input.paymentId
            || Math.abs(asMoney(existing.amount) - asMoney(input.amount)) > MONEY_EPSILON
            || existing.reason !== input.reason
            || existing.method !== input.method
          ) {
            throw new PaymentSettlementError(
              'REFUND_IDEMPOTENCY_CONFLICT',
              'The idempotency key is already associated with a different refund request',
            );
          }
          return { refund: existing, reused: true };
        }
      }

      const existingRefunds = await tx.refund.aggregate({
        where: { paymentId: input.paymentId, status: { not: 'REJECTED' } },
        _sum: { amount: true },
      });
      if (
        asMoney(existingRefunds._sum.amount) + asMoney(input.amount)
        > asMoney(payment.amount) + MONEY_EPSILON
      ) {
        throw new PaymentSettlementError(
          'REFUND_EXCEEDS_PAYMENT',
          'Cumulative refunds cannot exceed the payment amount',
          400,
        );
      }

      const refundNumber = await generateSequenceNumber('REF', payment.branchId ?? undefined, tx);
      const refund = await tx.refund.create({
        data: {
          refundNumber,
          idempotencyKey: input.idempotencyKey || null,
          paymentId: input.paymentId,
          studentId: payment.studentId,
          amount: asMoney(input.amount),
          reason: input.reason,
          method: input.method,
          notes: input.notes,
          requestedBy: input.requestedByUserId,
          branchId: payment.branchId,
        },
      });
      return { refund, reused: false };
    },
  );
};

export const approveRefundRequest = async (
  refundId: string,
  approvedByUserId: string,
  actorBranchId?: string | null,
) => {
  const refundRecord = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { payment: { select: { academicTermId: true } } },
  });
  if (!refundRecord) {
    throw new PaymentSettlementError('REFUND_NOT_FOUND', 'Refund not found', 404);
  }

  return runTermWriteTransaction(
    refundRecord.payment.academicTermId,
    'FINANCIAL_ADJUSTMENT',
    async tx => {
      const refund = await tx.refund.findUnique({ where: { id: refundId } });
      if (!refund) throw new PaymentSettlementError('REFUND_NOT_FOUND', 'Refund not found', 404);
      if (actorBranchId && refund.branchId && actorBranchId !== refund.branchId) {
        throw new PaymentSettlementError(
          'REFUND_BRANCH_MISMATCH',
          'Refund cannot be approved for another branch',
          403,
        );
      }
      if (refund.status === 'APPROVED') return refund;
      if (refund.status !== 'REQUESTED') {
        throw new PaymentSettlementError(
          'REFUND_NOT_REQUESTED',
          'Only requested refunds can be approved',
          400,
        );
      }
      return tx.refund.update({
        where: { id: refundId },
        data: {
          status: 'APPROVED',
          approvedBy: approvedByUserId,
          approvedAt: new Date(),
        },
      });
    },
  );
};

export const getStudentAccountCredits = async (studentId: string) => {
  const payments = await prisma.payment.findMany({
    where: { studentId, status: 'COMPLETED' },
    include: {
      academicTerm: { select: { id: true, name: true } },
      refunds: { where: { status: 'PROCESSED' }, select: { amount: true } },
      allocations: {
        include: {
          refundAllocations: {
            where: { refund: { status: 'PROCESSED' } },
            select: { amount: true },
          },
        },
      },
    },
    orderBy: { paymentDate: 'asc' },
  });

  return payments.map(payment => {
    const refunded = payment.refunds.reduce((sum, refund) => sum + asMoney(refund.amount), 0);
    const allocated = payment.allocations.reduce((sum, allocation) => (
      sum + asMoney(allocation.amount) - allocation.refundAllocations.reduce(
        (reversalSum, reversal) => reversalSum + asMoney(reversal.amount),
        0,
      )
    ), 0);
    return {
      paymentId: payment.id,
      transactionId: payment.transactionId,
      receiptTerm: payment.academicTerm,
      originalAmount: asMoney(payment.amount),
      refundedAmount: asMoney(refunded),
      allocatedAmount: asMoney(allocated),
      availableCredit: asMoney(Math.max(0, asMoney(payment.amount) - refunded - allocated)),
    };
  }).filter(credit => credit.availableCredit > MONEY_EPSILON);
};

export const getPaymentSettlementSnapshot = async (paymentId: string) => (
  prisma.$transaction(tx => loadPaymentSettlement(tx, paymentId))
);
