import { createHash } from 'node:crypto';
import { AccountingPostingEventType, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import {
  enqueueAccountingPosting,
  paymentAllocationPostingKey,
} from './accountingOutboxService';

type ReconciliationClient = Prisma.TransactionClient | typeof prisma;

export type FinanceReconciliationAction = {
  kind: 'CREATE' | 'INCREMENT';
  paymentId: string;
  studentFeeId: string;
  amount: number;
  receiptTermId: string;
  obligationTermId: string;
};

export type FinanceReconciliationFinding = {
  code: string;
  entityType: string;
  entityId: string;
  message: string;
  details?: Record<string, unknown>;
};

export type FinanceSettlementReconciliationPlan = {
  version: 1;
  generatedAt: string;
  sourceFingerprint: string;
  summary: {
    completedPayments: number;
    feeObligations: number;
    existingAllocations: number;
    proposedAllocations: number;
    proposedAllocationAmount: number;
    projectedAccountCredit: number;
    blockers: number;
    warnings: number;
    unlinkedInvoiceItems: number;
    feeCounterMismatches: number;
    invoiceCounterMismatches: number;
  };
  actions: FinanceReconciliationAction[];
  blockers: FinanceReconciliationFinding[];
  warnings: FinanceReconciliationFinding[];
  projectedCredits: Array<{
    paymentId: string;
    studentId: string;
    receiptTermId: string;
    amount: number;
  }>;
  unlinkedInvoiceItems: Array<{
    invoiceItemId: string;
    invoiceId: string;
    studentId: string;
    termId: string;
    feeTemplateId: string | null;
    candidateStudentFeeIds: string[];
    reason: 'NO_FEE_TEMPLATE' | 'NO_MATCH' | 'AMBIGUOUS_OR_ALREADY_LINKED';
  }>;
  feeCounterMismatches: Array<{
    studentFeeId: string;
    currentAmountPaid: number;
    expectedAmountPaid: number;
  }>;
  invoiceCounterMismatches: Array<{
    invoiceId: string;
    currentAmountPaid: number;
    expectedAmountPaid: number;
    currentBalanceDue: number;
    expectedBalanceDue: number;
    currentStatus: string;
    expectedStatus: string;
  }>;
};

export class FinanceSettlementReconciliationError extends Error {
  constructor(
    public readonly code: 'STALE_PLAN' | 'BLOCKERS_PRESENT',
    message: string,
  ) {
    super(message);
    this.name = 'FinanceSettlementReconciliationError';
  }
}

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const differs = (left: number, right: number): boolean => Math.abs(left - right) > 0.005;

const effectiveAllocationAmount = (allocation: {
  amount: unknown;
  refundAllocations: Array<{ amount: unknown }>;
}): number => money(Math.max(
  0,
  Number(allocation.amount)
    - allocation.refundAllocations.reduce((sum, reversal) => sum + Number(reversal.amount), 0),
));

export const buildFinanceSettlementReconciliationPlan = async (
  client: ReconciliationClient = prisma,
): Promise<FinanceSettlementReconciliationPlan> => {
  const [payments, fees, allocations, invoiceItems, invoices] = await Promise.all([
    client.payment.findMany({
      include: {
        refunds: {
          where: { status: 'PROCESSED' },
          select: { amount: true },
        },
      },
      orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
    }),
    client.studentFeeStructure.findMany({
      include: {
        academicTerm: { select: { startDate: true } },
        invoiceItem: { select: { id: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    client.paymentAllocation.findMany({
      include: {
        payment: { select: { studentId: true, status: true } },
        studentFee: { select: { studentId: true } },
        refundAllocations: {
          where: { refund: { status: 'PROCESSED' } },
          select: { amount: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    client.invoiceItem.findMany({
      include: {
        invoice: { select: { studentId: true, termId: true } },
      },
      orderBy: { id: 'asc' },
    }),
    client.invoice.findMany({
      include: {
        items: { select: { studentFeeId: true } },
        creditNotes: { select: { amount: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const fingerprintPayload = {
    payments: payments.map(payment => ({
      id: payment.id,
      studentId: payment.studentId,
      academicTermId: payment.academicTermId,
      amount: String(payment.amount),
      status: payment.status,
      paymentDate: payment.paymentDate.toISOString(),
      refunds: payment.refunds.map(refund => String(refund.amount)),
    })),
    fees: fees.map(fee => ({
      id: fee.id,
      studentId: fee.studentId,
      academicTermId: fee.academicTermId,
      amountDue: String(fee.amountDue),
      amountPaid: String(fee.amountPaid),
      dueDate: fee.dueDate?.toISOString() ?? null,
      invoiceItemId: fee.invoiceItem?.id ?? null,
    })),
    allocations: allocations.map(allocation => ({
      id: allocation.id,
      paymentId: allocation.paymentId,
      studentFeeId: allocation.studentFeeId,
      amount: String(allocation.amount),
      reversals: allocation.refundAllocations.map(reversal => String(reversal.amount)),
    })),
    invoiceItems: invoiceItems.map(item => ({
      id: item.id,
      invoiceId: item.invoiceId,
      feeTemplateId: item.feeTemplateId,
      studentFeeId: item.studentFeeId,
    })),
    invoices: invoices.map(invoice => ({
      id: invoice.id,
      totalAmount: String(invoice.totalAmount),
      amountPaid: String(invoice.amountPaid),
      balanceDue: String(invoice.balanceDue),
      status: invoice.status,
      creditNotes: invoice.creditNotes.map(note => String(note.amount)),
    })),
  };
  const sourceFingerprint = createHash('sha256')
    .update(JSON.stringify(fingerprintPayload))
    .digest('hex');

  const blockers: FinanceReconciliationFinding[] = [];
  const warnings: FinanceReconciliationFinding[] = [];
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  const feeById = new Map(fees.map(fee => [fee.id, fee]));
  const existingPairKeys = new Set<string>();
  const paymentSettled = new Map<string, number>();
  const feeSettled = new Map<string, number>();

  for (const allocation of allocations) {
    const pairKey = `${allocation.paymentId}:${allocation.studentFeeId}`;
    if (existingPairKeys.has(pairKey)) {
      blockers.push({
        code: 'DUPLICATE_ALLOCATION_PAIR',
        entityType: 'PaymentAllocation',
        entityId: allocation.id,
        message: 'A payment and fee obligation have more than one allocation row',
        details: { paymentId: allocation.paymentId, studentFeeId: allocation.studentFeeId },
      });
    }
    existingPairKeys.add(pairKey);

    if (allocation.payment.studentId !== allocation.studentFee.studentId) {
      blockers.push({
        code: 'CROSS_STUDENT_ALLOCATION',
        entityType: 'PaymentAllocation',
        entityId: allocation.id,
        message: 'Payment allocation crosses student account ownership',
        details: { paymentId: allocation.paymentId, studentFeeId: allocation.studentFeeId },
      });
    }
    if (allocation.payment.status === 'VOIDED') {
      // Allocation rows are retained as immutable audit evidence; void status
      // removes them from effective settlement without deleting history.
      continue;
    }
    if (allocation.payment.status !== 'COMPLETED') {
      blockers.push({
        code: 'NON_COMPLETED_PAYMENT_ALLOCATION',
        entityType: 'PaymentAllocation',
        entityId: allocation.id,
        message: 'Only completed receipts can carry an effective allocation',
      });
      continue;
    }

    const effective = effectiveAllocationAmount(allocation);
    paymentSettled.set(
      allocation.paymentId,
      money((paymentSettled.get(allocation.paymentId) ?? 0) + effective),
    );
    feeSettled.set(
      allocation.studentFeeId,
      money((feeSettled.get(allocation.studentFeeId) ?? 0) + effective),
    );
  }

  const paymentRemaining = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== 'COMPLETED') continue;
    const refunded = payment.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
    const netReceipt = money(Number(payment.amount) - refunded);
    const settled = paymentSettled.get(payment.id) ?? 0;
    if (netReceipt < -0.005) {
      blockers.push({
        code: 'REFUNDS_EXCEED_RECEIPT',
        entityType: 'Payment',
        entityId: payment.id,
        message: 'Processed refunds exceed the source receipt',
        details: { receiptAmount: Number(payment.amount), refunded },
      });
    }
    if (settled > netReceipt + 0.005) {
      blockers.push({
        code: 'RECEIPT_OVERALLOCATED',
        entityType: 'Payment',
        entityId: payment.id,
        message: 'Effective allocations exceed the net receipt amount',
        details: { netReceipt, allocated: settled },
      });
    }
    paymentRemaining.set(payment.id, money(Math.max(0, netReceipt - settled)));
  }

  const feeRemaining = new Map<string, number>();
  for (const fee of fees) {
    const settled = feeSettled.get(fee.id) ?? 0;
    const amountDue = Number(fee.amountDue);
    if (settled > amountDue + 0.005) {
      blockers.push({
        code: 'OBLIGATION_OVERALLOCATED',
        entityType: 'StudentFeeStructure',
        entityId: fee.id,
        message: 'Effective allocations exceed the fee obligation',
        details: { amountDue, allocated: settled },
      });
    }
    feeRemaining.set(fee.id, money(Math.max(0, amountDue - settled)));
  }

  const obligationsByStudent = new Map<string, typeof fees>();
  for (const fee of fees) {
    const list = obligationsByStudent.get(fee.studentId) ?? [];
    list.push(fee);
    obligationsByStudent.set(fee.studentId, list);
  }
  for (const list of obligationsByStudent.values()) {
    list.sort((left, right) => (
      left.academicTerm.startDate.getTime() - right.academicTerm.startDate.getTime()
      || (left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
      || left.createdAt.getTime() - right.createdAt.getTime()
      || left.id.localeCompare(right.id)
    ));
  }

  const actions: FinanceReconciliationAction[] = [];
  const projectedCredits: FinanceSettlementReconciliationPlan['projectedCredits'] = [];
  for (const payment of payments) {
    if (payment.status !== 'COMPLETED') continue;
    let remaining = paymentRemaining.get(payment.id) ?? 0;
    for (const fee of obligationsByStudent.get(payment.studentId) ?? []) {
      if (remaining <= 0.005) break;
      const outstanding = feeRemaining.get(fee.id) ?? 0;
      if (outstanding <= 0.005) continue;
      const amount = money(Math.min(remaining, outstanding));
      const pairKey = `${payment.id}:${fee.id}`;
      actions.push({
        kind: existingPairKeys.has(pairKey) ? 'INCREMENT' : 'CREATE',
        paymentId: payment.id,
        studentFeeId: fee.id,
        amount,
        receiptTermId: payment.academicTermId,
        obligationTermId: fee.academicTermId,
      });
      existingPairKeys.add(pairKey);
      remaining = money(remaining - amount);
      feeRemaining.set(fee.id, money(outstanding - amount));
      feeSettled.set(fee.id, money((feeSettled.get(fee.id) ?? 0) + amount));
    }
    paymentRemaining.set(payment.id, remaining);
    if (remaining > 0.005) {
      projectedCredits.push({
        paymentId: payment.id,
        studentId: payment.studentId,
        receiptTermId: payment.academicTermId,
        amount: remaining,
      });
    }
  }

  const unlinkedInvoiceItems: FinanceSettlementReconciliationPlan['unlinkedInvoiceItems'] = [];
  for (const item of invoiceItems.filter(candidate => !candidate.studentFeeId)) {
    const candidates = item.feeTemplateId
      ? fees.filter(fee => (
        fee.studentId === item.invoice.studentId
        && fee.academicTermId === item.invoice.termId
        && fee.feeTemplateId === item.feeTemplateId
        && !fee.invoiceItem
      )).map(fee => fee.id)
      : [];
    const reason = !item.feeTemplateId
      ? 'NO_FEE_TEMPLATE'
      : candidates.length === 0
        ? 'NO_MATCH'
        : 'AMBIGUOUS_OR_ALREADY_LINKED';
    unlinkedInvoiceItems.push({
      invoiceItemId: item.id,
      invoiceId: item.invoiceId,
      studentId: item.invoice.studentId,
      termId: item.invoice.termId,
      feeTemplateId: item.feeTemplateId,
      candidateStudentFeeIds: candidates,
      reason,
    });
    warnings.push({
      code: 'UNLINKED_INVOICE_ITEM',
      entityType: 'InvoiceItem',
      entityId: item.id,
      message: 'Invoice item is not linked to a canonical fee obligation',
      details: { invoiceId: item.invoiceId, reason, candidateStudentFeeIds: candidates },
    });
  }

  const feeCounterMismatches = fees
    .map(fee => ({
      studentFeeId: fee.id,
      currentAmountPaid: Number(fee.amountPaid),
      expectedAmountPaid: money(feeSettled.get(fee.id) ?? 0),
    }))
    .filter(mismatch => differs(mismatch.currentAmountPaid, mismatch.expectedAmountPaid));
  for (const mismatch of feeCounterMismatches) {
    warnings.push({
      code: 'FEE_COUNTER_MISMATCH',
      entityType: 'StudentFeeStructure',
      entityId: mismatch.studentFeeId,
      message: 'Stored amountPaid differs from effective canonical allocations',
      details: mismatch,
    });
  }

  const invoiceCounterMismatches: FinanceSettlementReconciliationPlan['invoiceCounterMismatches'] = [];
  for (const invoice of invoices) {
    if (invoice.status === 'CANCELLED' || invoice.items.some(item => !item.studentFeeId)) continue;
    const credited = invoice.creditNotes.reduce((sum, note) => sum + Number(note.amount), 0);
    const payable = money(Math.max(0, Number(invoice.totalAmount) - credited));
    const allocated = money(invoice.items.reduce(
      (sum, item) => sum + (item.studentFeeId ? feeSettled.get(item.studentFeeId) ?? 0 : 0),
      0,
    ));
    const expectedAmountPaid = money(Math.min(Math.max(allocated, 0), payable));
    const expectedBalanceDue = money(Math.max(0, payable - expectedAmountPaid));
    const expectedStatus = payable === 0 && credited > 0
      ? 'CREDITED'
      : expectedBalanceDue === 0
        ? 'PAID'
        : expectedAmountPaid > 0
          ? 'PARTIALLY_PAID'
          : ['PAID', 'PARTIALLY_PAID', 'CREDITED', 'OVERDUE'].includes(invoice.status)
            ? 'SENT'
            : invoice.status;
    if (
      differs(Number(invoice.amountPaid), expectedAmountPaid)
      || differs(Number(invoice.balanceDue), expectedBalanceDue)
      || invoice.status !== expectedStatus
    ) {
      invoiceCounterMismatches.push({
        invoiceId: invoice.id,
        currentAmountPaid: Number(invoice.amountPaid),
        expectedAmountPaid,
        currentBalanceDue: Number(invoice.balanceDue),
        expectedBalanceDue,
        currentStatus: invoice.status,
        expectedStatus,
      });
    }
  }
  for (const mismatch of invoiceCounterMismatches) {
    warnings.push({
      code: 'INVOICE_COUNTER_MISMATCH',
      entityType: 'Invoice',
      entityId: mismatch.invoiceId,
      message: 'Stored invoice counters differ from linked effective allocations',
      details: mismatch,
    });
  }

  const proposedAllocationAmount = money(actions.reduce((sum, action) => sum + action.amount, 0));
  const projectedAccountCredit = money(projectedCredits.reduce((sum, credit) => sum + credit.amount, 0));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFingerprint,
    summary: {
      completedPayments: payments.filter(payment => payment.status === 'COMPLETED').length,
      feeObligations: fees.length,
      existingAllocations: allocations.length,
      proposedAllocations: actions.length,
      proposedAllocationAmount,
      projectedAccountCredit,
      blockers: blockers.length,
      warnings: warnings.length,
      unlinkedInvoiceItems: unlinkedInvoiceItems.length,
      feeCounterMismatches: feeCounterMismatches.length,
      invoiceCounterMismatches: invoiceCounterMismatches.length,
    },
    actions,
    blockers,
    warnings,
    projectedCredits,
    unlinkedInvoiceItems,
    feeCounterMismatches,
    invoiceCounterMismatches,
  };
};

export const applyFinanceSettlementReconciliationPlan = async (
  expectedFingerprint: string,
): Promise<{
  appliedActions: number;
  appliedAmount: number;
  before: FinanceSettlementReconciliationPlan;
  after: FinanceSettlementReconciliationPlan;
}> => {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sync:finance-settlement-reconciliation'))`;
    const before = await buildFinanceSettlementReconciliationPlan(tx);
    if (before.sourceFingerprint !== expectedFingerprint) {
      throw new FinanceSettlementReconciliationError(
        'STALE_PLAN',
        'Finance data changed after the reconciliation plan was generated',
      );
    }
    if (before.blockers.length > 0) {
      throw new FinanceSettlementReconciliationError(
        'BLOCKERS_PRESENT',
        'Finance reconciliation blockers must be resolved before applying allocations',
      );
    }

    for (const action of before.actions) {
      await enqueueAccountingPosting(
        tx,
        AccountingPostingEventType.PAYMENT_RECEIVED,
        action.paymentId,
      );
      const allocation = await tx.paymentAllocation.upsert({
        where: {
          paymentId_studentFeeId: {
            paymentId: action.paymentId,
            studentFeeId: action.studentFeeId,
          },
        },
        create: {
          paymentId: action.paymentId,
          studentFeeId: action.studentFeeId,
          amount: action.amount,
        },
        update: { amount: { increment: action.amount } },
      });
      const fee = await tx.studentFeeStructure.findUniqueOrThrow({
        where: { id: action.studentFeeId },
        include: {
          feeTemplate: { select: { name: true } },
          invoiceItem: { select: { id: true } },
        },
      });
      await enqueueAccountingPosting(
        tx,
        AccountingPostingEventType.PAYMENT_ALLOCATED,
        allocation.id,
        null,
        {
          eventKey: paymentAllocationPostingKey(allocation.id, allocation.amount),
          payload: {
            amount: action.amount,
            settlesInvoice: Boolean(fee.invoiceItem),
            feeTemplateName: fee.feeTemplate.name,
          },
        },
      );
    }

    return {
      before,
      appliedActions: before.actions.length,
      appliedAmount: before.summary.proposedAllocationAmount,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 120_000,
  });

  return {
    ...result,
    after: await buildFinanceSettlementReconciliationPlan(),
  };
};
