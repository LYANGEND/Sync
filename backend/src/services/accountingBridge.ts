/**
 * Accounting Bridge Service
 * 
 * Links operational transactions (payments, expenses, payroll, invoices)
 * to the double-entry accounting system by auto-creating journal entries.
 * 
 * Chart of Accounts Reference:
 *   ASSETS:    1000 Cash at Bank, 1100 Petty Cash, 1200 Accounts Receivable
 *   LIABILITIES: 2000 AP, 2100 PAYE Payable, 2200 NAPSA, 2300 NHIMA
 *   INCOME:    4000 Tuition Fees, 4100 Registration, 4200 Transport, 4300 Boarding, 4900 Other
 *   EXPENSES:  5000 Salaries, 5100 Utilities, 5200 Supplies, 5300 Maintenance, etc.
 */

import { prisma } from '../utils/prisma';
import { createJournalEntry, logFinancialAction } from './accountingService';

// ========================================
// ACCOUNT CODE MAPPINGS
// ========================================

/** Map payment methods to cash/bank account codes */
const PAYMENT_METHOD_ACCOUNTS: Record<string, string> = {
  CASH: '1000',          // Cash at Bank
  MOBILE_MONEY: '1000',  // Cash at Bank (mobile money settles to bank)
  BANK_DEPOSIT: '1000',  // Cash at Bank
};

/** Map expense categories to expense account codes */
const EXPENSE_CATEGORY_ACCOUNTS: Record<string, string> = {
  SALARIES: '5000',
  UTILITIES: '5100',
  SUPPLIES: '5200',
  MAINTENANCE: '5300',
  TRANSPORT: '5400',
  FOOD_CATERING: '5500',
  RENT: '5600',
  INSURANCE: '5700',
  MARKETING: '5800',
  TECHNOLOGY: '5900',
  PROFESSIONAL_FEES: '6000',
  BANK_CHARGES: '6100',
  TAXES: '6200',
  DEPRECIATION: '6300',
  MISCELLANEOUS: '6900',
};

/** Map fee category names to income account codes */
const FEE_INCOME_ACCOUNTS: Record<string, string> = {
  tuition: '4000',
  registration: '4100',
  transport: '4200',
  boarding: '4300',
  laboratory: '4400',
  uniform: '4500',
  default: '4900', // Other Income for unmatched categories
};

/**
 * Resolve income account code from fee template name
 */
function resolveIncomeAccount(feeTemplateName?: string): string {
  if (!feeTemplateName) return FEE_INCOME_ACCOUNTS.default;
  const lower = feeTemplateName.toLowerCase();
  for (const [key, code] of Object.entries(FEE_INCOME_ACCOUNTS)) {
    if (key !== 'default' && lower.includes(key)) return code;
  }
  return FEE_INCOME_ACCOUNTS.default;
}

const postingExists = async (postingKey: string): Promise<boolean> => (
  (await prisma.journalEntry.count({ where: { postingKey } })) > 0
);

// ========================================
// PAYMENT → JOURNAL ENTRY
// ========================================

/**
 * Create journal entries when a fee payment is recorded.
 * 
 * DEBIT:  1000 Cash at Bank (asset increases)
 * CREDIT: 2400 Advance Fees Received
 *
 * Allocation events separately reclassify source credit to receivable/revenue.
 * This keeps later allocations auditable without rewriting the receipt journal.
 */
export async function onPaymentCreated(
  paymentId: string,
  userId?: string,
  options: { allowSuperseded?: boolean } = {},
): Promise<void> {
  try {
    const postingKey = `payment:${paymentId}:receipt`;
    if (await postingExists(postingKey)) return;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
      },
    }) as any;

    if (
      !payment
      || (payment.status !== 'COMPLETED' && !(options.allowSuperseded && payment.status === 'VOIDED'))
    ) return;

    const amount = Number(payment.amount);
    const cashAccount = PAYMENT_METHOD_ACCOUNTS[payment.method] || '1000';
    const studentName = `${payment.student.firstName} ${payment.student.lastName}`;
    const description = `Fee payment received - ${studentName} (${payment.transactionId})`;

    await createJournalEntry({
      date: payment.paymentDate,
      description,
      postingKey,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      lines: [
        {
          accountCode: cashAccount,
          debit: amount,
          description: `Payment ${payment.transactionId} - ${payment.method}`,
        },
        {
          accountCode: '2400',
          credit: amount,
          description: `Source account credit - ${studentName}`,
        },
      ],
      branchId: payment.branchId || undefined,
      autoPost: true,
    });

    // Audit log
    if (userId) {
      await logFinancialAction({
        userId,
        action: 'PAYMENT_JOURNALED',
        entityType: 'Payment',
        entityId: payment.id,
        description: `Auto-created journal entry for payment ${payment.transactionId}`,
        amount,
        branchId: payment.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal payment ${paymentId}:`, error);
    // Don't throw — journal failure should not block the payment
  }
}

// ========================================
// PAYMENT ALLOCATION → CREDIT RECLASSIFICATION
// ========================================

export async function onPaymentAllocated(
  allocationId: string,
  amount: number,
  postingKey: string,
  classification: { settlesInvoice: boolean; feeTemplateName?: string | null },
  userId?: string,
): Promise<void> {
  try {
    if (await postingExists(postingKey)) return;
    const allocation = await prisma.paymentAllocation.findUnique({
      where: { id: allocationId },
      include: {
        payment: {
          include: { student: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!allocation || !['COMPLETED', 'VOIDED'].includes(allocation.payment.status)) return;
    if (amount <= 0 || amount > Number(allocation.amount) + 0.005) {
      throw new Error(`Invalid allocation accounting delta ${amount} for ${allocationId}`);
    }

    const studentName = `${allocation.payment.student.firstName} ${allocation.payment.student.lastName}`;
    const targetAccount = classification.settlesInvoice
      ? '1200'
      : resolveIncomeAccount(classification.feeTemplateName || undefined);
    await createJournalEntry({
      date: allocation.createdAt,
      description: `Allocate payment ${allocation.payment.transactionId} - ${studentName}`,
      postingKey,
      referenceType: 'PAYMENT_ALLOCATION',
      referenceId: allocation.id,
      lines: [
        {
          accountCode: '2400',
          debit: amount,
          description: `Apply source account credit - ${studentName}`,
        },
        {
          accountCode: targetAccount,
          credit: amount,
          description: classification.settlesInvoice
            ? `Settle invoice receivable - ${classification.feeTemplateName || 'Fee'}`
            : `Recognize ${classification.feeTemplateName || 'fee'} revenue - ${studentName}`,
        },
      ],
      branchId: allocation.payment.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'PAYMENT_ALLOCATION_JOURNALED',
        entityType: 'PaymentAllocation',
        entityId: allocation.id,
        description: `Reclassified payment allocation for ${allocation.payment.transactionId}`,
        amount,
        branchId: allocation.payment.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal allocation ${allocationId}:`, error);
  }
}

// ========================================
// PAYMENT VOID → REVERSAL JOURNAL ENTRY
// ========================================

/**
 * Create a reversal journal entry when a payment is voided.
 * Reverses the source receipt and every allocation reclassification.
 */
export async function onPaymentVoided(paymentId: string, userId?: string): Promise<void> {
  try {
    const postingKey = `payment:${paymentId}:void`;
    if (await postingExists(postingKey)) return;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        allocations: { select: { id: true, amount: true } },
      },
    }) as any;

    if (!payment) return;

    const amount = Number(payment.amount);
    const studentName = `${payment.student.firstName} ${payment.student.lastName}`;

    const allocationIds = payment.allocations.map((allocation: { id: string }) => allocation.id);
    const sourceJournals = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { postingKey: `payment:${paymentId}:receipt` },
          { referenceType: 'PAYMENT', referenceId: paymentId },
          ...(allocationIds.length > 0
            ? [{
              referenceType: 'PAYMENT_ALLOCATION',
              referenceId: { in: allocationIds },
            }]
            : []),
        ],
      },
      include: { lines: { include: { account: { select: { code: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const receiptJournal = sourceJournals.find(journal => (
      journal.postingKey === `payment:${paymentId}:receipt`
      || (journal.referenceType === 'PAYMENT' && journal.referenceId === paymentId)
    ));
    if (!receiptJournal) {
      throw new Error(`Original journal entry for payment ${paymentId} was not found`);
    }

    const expectedAllocationAmount = payment.allocations.reduce(
      (sum: number, allocation: { amount: unknown }) => sum + Number(allocation.amount),
      0,
    );
    const allocationJournalAmount = sourceJournals
      .filter(journal => journal.referenceType === 'PAYMENT_ALLOCATION')
      .flatMap(journal => journal.lines)
      .filter(line => line.account.code === '2400')
      .reduce((sum, line) => sum + Number(line.debit), 0);
    if (Math.abs(expectedAllocationAmount - allocationJournalAmount) > 0.005) {
      throw new Error(
        `Allocation journals for payment ${paymentId} total ${allocationJournalAmount.toFixed(2)} instead of ${expectedAllocationAmount.toFixed(2)}`,
      );
    }

    await createJournalEntry({
      date: payment.voidedAt || new Date(),
      description: `VOID: Payment reversal - ${studentName} (${payment.transactionId}) - ${payment.voidReason || 'Voided'}`,
      postingKey,
      referenceType: 'PAYMENT_VOID',
      referenceId: payment.id,
      lines: sourceJournals.flatMap(journal => journal.lines.map(line => ({
        accountCode: line.account.code,
        debit: Number(line.credit),
        credit: Number(line.debit),
        description: `Reversal of ${line.description || journal.entryNumber}`,
      }))),
      branchId: payment.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'PAYMENT_VOID_JOURNALED',
        entityType: 'Payment',
        entityId: payment.id,
        description: `Auto-created reversal journal for voided payment ${payment.transactionId}`,
        amount,
        branchId: payment.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal void for ${paymentId}:`, error);
  }
}

// ========================================
// EXPENSE PAID → JOURNAL ENTRY
// ========================================

/**
 * Create journal entry when an expense is marked as paid.
 * 
 * DEBIT:  5xxx Expense account (expense recognized)
 * CREDIT: 1000 Cash at Bank (cash decreases)
 * 
 * If tax is included, creates a separate line for VAT/Tax.
 */
export async function onExpensePaid(expenseId: string, userId?: string): Promise<void> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { vendor: true },
    });

    if (!expense || expense.status !== 'PAID') return;

    const totalAmount = Number(expense.totalAmount);
    const baseAmount = Number(expense.amount);
    const taxAmount = Number(expense.taxAmount);
    const expenseAccount = EXPENSE_CATEGORY_ACCOUNTS[expense.category] || '6900';
    const cashAccount = PAYMENT_METHOD_ACCOUNTS[expense.paymentMethod || 'CASH'] || '1000';
    const vendorName = expense.vendor?.name || 'Unknown vendor';

    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];

    // DEBIT: Expense account
    lines.push({
      accountCode: expenseAccount,
      debit: baseAmount,
      description: `${expense.description} - ${vendorName}`,
    });

    // DEBIT: Tax (if any) → goes to Taxes expense
    if (taxAmount > 0) {
      lines.push({
        accountCode: '6200', // Taxes & Levies
        debit: taxAmount,
        description: `Tax on ${expense.expenseNumber}`,
      });
    }

    // CREDIT: Cash/Bank account
    lines.push({
      accountCode: cashAccount,
      credit: totalAmount,
      description: `Payment for ${expense.expenseNumber}`,
    });

    await createJournalEntry({
      date: expense.date,
      description: `Expense: ${expense.description} (${expense.expenseNumber})`,
      referenceType: 'EXPENSE',
      referenceId: expense.id,
      lines,
      branchId: expense.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'EXPENSE_JOURNALED',
        entityType: 'Expense',
        entityId: expense.id,
        description: `Auto-created journal entry for expense ${expense.expenseNumber}`,
        amount: totalAmount,
        branchId: expense.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal expense ${expenseId}:`, error);
  }
}

// ========================================
// PAYROLL → JOURNAL ENTRIES
// ========================================

/**
 * Create journal entries for a completed payroll run.
 * 
 * DEBIT:  5000 Salaries & Wages (gross salary)
 * CREDIT: 2100 PAYE Payable (tax withheld)
 * CREDIT: 2200 NAPSA Payable (employee + employer contribution)
 * CREDIT: 2300 NHIMA Payable (employee + employer contribution)
 * CREDIT: 1000 Cash at Bank (net salary paid)
 * 
 * Employer contributions:
 * DEBIT:  5000 Salaries & Wages (employer share)
 * CREDIT: 2200 NAPSA Payable (employer share)
 * CREDIT: 2300 NHIMA Payable (employer share)
 */
export async function onPayrollCompleted(payrollRunId: string, userId?: string): Promise<void> {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        payslips: {
          where: { isPaid: true },
        },
      },
    });

    if (!run || !run.payslips.length) return;

    let totalGross = 0;
    let totalPAYE = 0;
    let totalNAPSAEmployee = 0;
    let totalNAPSAEmployer = 0;
    let totalNHIMAEmployee = 0;
    let totalNHIMAEmployer = 0;
    let totalNet = 0;

    for (const slip of run.payslips) {
      totalGross += Number(slip.grossSalary);
      totalPAYE += Number(slip.payeTax);
      totalNAPSAEmployee += Number(slip.napsaContribution);
      totalNAPSAEmployer += Number(slip.napsaContribution); // Employer matches employee
      totalNHIMAEmployee += Number(slip.nhimaContribution);
      totalNHIMAEmployer += Number(slip.nhimaContribution); // Employer matches employee
      totalNet += Number(slip.netSalary);
    }

    const totalEmployerContributions = totalNAPSAEmployer + totalNHIMAEmployer;
    const totalDeductions = totalPAYE + totalNAPSAEmployee + totalNHIMAEmployee;

    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];

    // DEBIT: Salaries expense (gross + employer contributions)
    lines.push({
      accountCode: '5000',
      debit: totalGross + totalEmployerContributions,
      description: `Payroll ${run.month}/${run.year} - Gross salaries + employer contributions`,
    });

    // CREDIT: PAYE Payable
    if (totalPAYE > 0) {
      lines.push({
        accountCode: '2100',
        credit: totalPAYE,
        description: `PAYE withheld - ${run.month}/${run.year}`,
      });
    }

    // CREDIT: NAPSA Payable (employee + employer)
    if (totalNAPSAEmployee + totalNAPSAEmployer > 0) {
      lines.push({
        accountCode: '2200',
        credit: totalNAPSAEmployee + totalNAPSAEmployer,
        description: `NAPSA contributions - ${run.month}/${run.year}`,
      });
    }

    // CREDIT: NHIMA Payable (employee + employer)
    if (totalNHIMAEmployee + totalNHIMAEmployer > 0) {
      lines.push({
        accountCode: '2300',
        credit: totalNHIMAEmployee + totalNHIMAEmployer,
        description: `NHIMA contributions - ${run.month}/${run.year}`,
      });
    }

    // CREDIT: Cash at Bank (net salaries paid)
    lines.push({
      accountCode: '1000',
      credit: totalNet,
      description: `Net salaries paid - ${run.month}/${run.year}`,
    });

    await createJournalEntry({
      date: new Date(),
      description: `Payroll Run: ${run.month}/${run.year} - ${run.payslips.length} staff`,
      referenceType: 'PAYROLL',
      referenceId: run.id,
      lines,
      branchId: run.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'PAYROLL_JOURNALED',
        entityType: 'PayrollRun',
        entityId: run.id,
        description: `Auto-created journal entry for payroll ${run.month}/${run.year}`,
        amount: totalGross,
        branchId: run.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal payroll ${payrollRunId}:`, error);
  }
}

// ========================================
// INVOICE → JOURNAL ENTRY (Accounts Receivable)
// ========================================

/**
 * Create journal entry when an invoice is sent/finalized.
 * 
 * DEBIT:  1200 Accounts Receivable (money owed to school)
 * CREDIT: 4xxx Income account (revenue recognized on accrual basis)
 */
export async function onInvoiceSent(
  invoiceId: string,
  userId?: string,
  options: { allowSuperseded?: boolean } = {},
): Promise<void> {
  try {
    const postingKey = `invoice:${invoiceId}:issued`;
    if (await postingExists(postingKey)) return;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        items: true,
      },
    });

    if (
      !invoice
      || (
        !['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDITED'].includes(invoice.status)
        && !(options.allowSuperseded && invoice.status === 'CANCELLED')
      )
    ) return;

    const totalAmount = Number(invoice.totalAmount);
    const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`;

    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];

    // DEBIT: Accounts Receivable
    lines.push({
      accountCode: '1200',
      debit: totalAmount,
      description: `Invoice ${invoice.invoiceNumber} - ${studentName}`,
    });

    // CREDIT: Income (from invoice items)
    if (invoice.items && invoice.items.length > 0) {
      for (const item of invoice.items) {
        const incomeAccount = resolveIncomeAccount(item.description);
        lines.push({
          accountCode: incomeAccount,
          credit: Number(item.amount),
          description: `${item.description} - ${studentName}`,
        });
      }
    } else {
      lines.push({
        accountCode: '4000',
        credit: totalAmount,
        description: `Invoice ${invoice.invoiceNumber} - ${studentName}`,
      });
    }

    const itemTotal = invoice.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const invoiceAdjustment = totalAmount - itemTotal;
    if (Math.abs(invoiceAdjustment) > 0.005) {
      lines.push({
        accountCode: '4900',
        ...(invoiceAdjustment > 0
          ? { credit: invoiceAdjustment }
          : { debit: Math.abs(invoiceAdjustment) }),
        description: invoiceAdjustment > 0
          ? `Invoice tax/rounding adjustment - ${studentName}`
          : `Invoice discount adjustment - ${studentName}`,
      });
    }

    await createJournalEntry({
      date: invoice.issueDate,
      description: `Invoice: ${invoice.invoiceNumber} - ${studentName}`,
      postingKey,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
      lines,
      branchId: invoice.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'INVOICE_JOURNALED',
        entityType: 'Invoice',
        entityId: invoice.id,
        description: `Auto-created journal entry for invoice ${invoice.invoiceNumber}`,
        amount: totalAmount,
        branchId: invoice.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal invoice ${invoiceId}:`, error);
  }
}

// ========================================
// CREDIT NOTE → RECEIVABLE/REVENUE REVERSAL
// ========================================

export async function onCreditNoteCreated(
  creditNoteId: string,
  userId?: string,
  options: { allowSuperseded?: boolean } = {},
): Promise<void> {
  try {
    const postingKey = `credit-note:${creditNoteId}:issued`;
    if (await postingExists(postingKey)) return;

    const creditNote = await prisma.creditNote.findUnique({
      where: { id: creditNoteId },
      include: {
        invoice: {
          include: { student: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!creditNote || (creditNote.invoice.status === 'CANCELLED' && !options.allowSuperseded)) return;

    // An issued credit note reverses part of the accrual recognized when the
    // invoice was sent. Ensure that source posting exists before its reversal.
    await onInvoiceSent(creditNote.invoiceId, userId, options);
    if (!await postingExists(`invoice:${creditNote.invoiceId}:issued`)) {
      throw new Error(`Invoice journal for credit note ${creditNoteId} was not created`);
    }

    const amount = Number(creditNote.amount);
    const studentName = `${creditNote.invoice.student.firstName} ${creditNote.invoice.student.lastName}`;
    await createJournalEntry({
      date: creditNote.issuedAt,
      description: `Credit note ${creditNote.creditNoteNumber} - ${studentName}`,
      postingKey,
      referenceType: 'CREDIT_NOTE',
      referenceId: creditNote.id,
      lines: [
        {
          accountCode: '4900',
          debit: amount,
          description: `Revenue adjustment - ${creditNote.reason}`,
        },
        {
          accountCode: '1200',
          credit: amount,
          description: `Reduce invoice ${creditNote.invoice.invoiceNumber} receivable`,
        },
      ],
      branchId: creditNote.invoice.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'CREDIT_NOTE_JOURNALED',
        entityType: 'CreditNote',
        entityId: creditNote.id,
        description: `Auto-created journal entry for credit note ${creditNote.creditNoteNumber}`,
        amount,
        branchId: creditNote.invoice.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal credit note ${creditNoteId}:`, error);
  }
}

// ========================================
// INVOICE CANCELLATION → JOURNAL REVERSAL
// ========================================

export async function onInvoiceCancelled(invoiceId: string, userId?: string): Promise<void> {
  try {
    const postingKey = `invoice:${invoiceId}:cancelled`;
    if (await postingExists(postingKey)) return;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        creditNotes: { select: { id: true } },
      },
    });
    if (!invoice || invoice.status !== 'CANCELLED') return;

    await onInvoiceSent(invoice.id, userId, { allowSuperseded: true });
    for (const creditNote of invoice.creditNotes) {
      await onCreditNoteCreated(creditNote.id, userId, { allowSuperseded: true });
    }

    const sourceKeys = [
      `invoice:${invoice.id}:issued`,
      ...invoice.creditNotes.map(note => `credit-note:${note.id}:issued`),
    ];
    const sourceJournals = await prisma.journalEntry.findMany({
      where: { postingKey: { in: sourceKeys } },
      include: { lines: { include: { account: { select: { code: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    if (sourceJournals.length === 0) return;

    const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`;
    await createJournalEntry({
      date: new Date(),
      description: `CANCELLED: Invoice ${invoice.invoiceNumber} - ${studentName}`,
      postingKey,
      referenceType: 'INVOICE_CANCELLED',
      referenceId: invoice.id,
      lines: sourceJournals.flatMap(journal => journal.lines.map(line => ({
        accountCode: line.account.code,
        debit: Number(line.credit),
        credit: Number(line.debit),
        description: `Reversal of ${line.description || journal.entryNumber}`,
      }))),
      branchId: invoice.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'INVOICE_CANCELLED_JOURNALED',
        entityType: 'Invoice',
        entityId: invoice.id,
        description: `Auto-created reversal journal for invoice ${invoice.invoiceNumber}`,
        amount: Number(invoice.totalAmount),
        branchId: invoice.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal invoice cancellation ${invoiceId}:`, error);
  }
}

// ========================================
// REFUND → REVERSAL JOURNAL ENTRY
// ========================================

export async function onRefundProcessed(refundId: string, userId?: string): Promise<void> {
  try {
    const postingKey = `refund:${refundId}:processed`;
    if (await postingExists(postingKey)) return;

    const refund = await prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        payment: {
          include: { student: { select: { firstName: true, lastName: true } } },
        },
        allocationReversals: {
          include: {
            paymentAllocation: {
              include: {
                studentFee: {
                  include: {
                    feeTemplate: true,
                    invoiceItem: { select: { invoiceId: true } },
                  },
                },
              },
            },
          },
        },
      },
    }) as any;
    if (!refund || refund.status !== 'PROCESSED') return;

    const amount = Number(refund.amount);
    const studentName = `${refund.payment.student.firstName} ${refund.payment.student.lastName}`;
    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];
    let reversedAllocations = 0;

    for (const reversal of refund.allocationReversals) {
      const reversalAmount = Number(reversal.amount);
      reversedAllocations += reversalAmount;
      const studentFee = reversal.paymentAllocation.studentFee;
      const settlesInvoice = Boolean(studentFee.invoiceItem);
      lines.push({
        accountCode: settlesInvoice ? '1200' : resolveIncomeAccount(studentFee.feeTemplate?.name),
        debit: reversalAmount,
        description: settlesInvoice
          ? `Reopen invoice receivable - ${studentName}`
          : `Reverse ${studentFee.feeTemplate?.name || 'fee'} revenue - ${studentName}`,
      });
    }

    const returnedAccountCredit = Math.max(0, amount - reversedAllocations);
    if (returnedAccountCredit > 0.005) {
      lines.push({
        accountCode: '2400',
        debit: returnedAccountCredit,
        description: `Return unallocated account credit - ${studentName}`,
      });
    }
    lines.push({
      accountCode: PAYMENT_METHOD_ACCOUNTS[refund.payment.method] || '1000',
      credit: amount,
      description: `Refund ${refund.refundNumber} paid - ${studentName}`,
    });

    await createJournalEntry({
      date: refund.processedAt || new Date(),
      description: `Refund processed - ${studentName} (${refund.refundNumber})`,
      postingKey,
      referenceType: 'REFUND',
      referenceId: refund.id,
      lines,
      branchId: refund.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'REFUND_JOURNALED',
        entityType: 'Refund',
        entityId: refund.id,
        description: `Auto-created reversal journal for refund ${refund.refundNumber}`,
        amount,
        branchId: refund.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal refund ${refundId}:`, error);
  }
}

// ========================================
// PETTY CASH → JOURNAL ENTRY
// ========================================

/**
 * Create journal entry for petty cash transactions.
 * 
 * Disbursement (money out):
 *   DEBIT:  5xxx/6xxx Expense account
 *   CREDIT: 1100 Petty Cash
 * 
 * Replenishment (refill petty cash):
 *   DEBIT:  1100 Petty Cash
 *   CREDIT: 1000 Cash at Bank
 */
export async function onPettyCashTransaction(transactionId: string, userId?: string): Promise<void> {
  try {
    const txn = await prisma.pettyCashTransaction.findUnique({
      where: { id: transactionId },
      include: { account: true },
    }) as any;

    if (!txn) return;

    const amount = Number(txn.amount);
    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];

    if (txn.type === 'DISBURSEMENT') {
      // Money going out of petty cash for an expense
      const expenseAccount = EXPENSE_CATEGORY_ACCOUNTS[txn.category || 'MISCELLANEOUS'] || '6900';
      lines.push({
        accountCode: expenseAccount,
        debit: amount,
        description: txn.description,
      });
      lines.push({
        accountCode: '1100', // Petty Cash
        credit: amount,
        description: `Petty cash disbursement - ${txn.id.substring(0, 8)}`,
      });
    } else if (txn.type === 'REPLENISHMENT') {
      // Refilling petty cash from bank
      lines.push({
        accountCode: '1100', // Petty Cash
        debit: amount,
        description: `Petty cash replenishment`,
      });
      lines.push({
        accountCode: '1000', // Cash at Bank
        credit: amount,
        description: `Transfer to petty cash - ${txn.id.substring(0, 8)}`,
      });
    } else {
      return; // Skip other types
    }

    await createJournalEntry({
      date: txn.date,
      description: `Petty Cash: ${txn.description} (${txn.id.substring(0, 8)})`,
      referenceType: 'PETTY_CASH',
      referenceId: txn.id,
      lines,
      branchId: txn.account?.branchId || undefined,
      autoPost: true,
    });

    if (userId) {
      await logFinancialAction({
        userId,
        action: 'PETTY_CASH_JOURNALED',
        entityType: 'PettyCashTransaction',
        entityId: txn.id,
        description: `Auto-created journal entry for petty cash transaction`,
        amount,
        branchId: txn.account?.branchId || undefined,
      });
    }
  } catch (error) {
    console.error(`[AccountingBridge] Failed to journal petty cash ${transactionId}:`, error);
  }
}
