import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/utils/prisma';
import {
  allocateExistingPayment,
  approveRefundRequest,
  completePendingPaymentInTransaction,
  createCompletedPayment,
  createRefundRequest,
  getPaymentSettlementSnapshot,
  getStudentAccountCredits,
  PaymentSettlementError,
  processApprovedRefund,
  settleInvoicePayment,
  voidPaymentSettlement,
} from '../src/services/paymentSettlementService';
import { runTermWriteTransaction } from '../src/services/termLifecycleService';
import {
  onCreditNoteCreated,
  onInvoiceCancelled,
  onInvoiceSent,
  onPaymentCreated,
  onPaymentVoided,
  onRefundProcessed,
} from '../src/services/accountingBridge';
import {
  getTermFinancialSummary,
  recalculateTermSummary,
} from '../src/services/termFinancialService';
import { cancelInvoice, createCreditNote } from '../src/controllers/invoiceController';
import {
  applyFinanceSettlementReconciliationPlan,
  buildFinanceSettlementReconciliationPlan,
  FinanceSettlementReconciliationError,
} from '../src/services/financeSettlementReconciliationService';
import { processAccountingPostingOutbox } from '../src/services/accountingOutboxService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=payment_settlement_test';
const prefix = `Settlement integration ${Date.now()}`;

const resetSettlementFixtures = async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "accounting_posting_outbox",
      "branches",
      "users",
      "academic_terms",
      "fee_categories",
      "chart_of_accounts",
      "receipt_sequences",
      "school_settings"
    RESTART IDENTITY CASCADE
  `);
};

const settlementError = (code: string) => (error: unknown) => (
  error instanceof PaymentSettlementError && error.code === code
);

const databaseMessageIncludes = (fragment: string) => (error: unknown) => (
  String(error).includes(fragment)
  || JSON.stringify((error as any)?.meta ?? {}).includes(fragment)
);

const createMockResponse = () => {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
};

after(async () => {
  await prisma.$disconnect();
});

test('canonical settlement preserves receipt provenance and enforces allocation, invoice, refund, void, branch, mobile, accounting, and concurrency invariants', async t => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing settlement integration test without an isolated ${expectedSchema} database URL`,
  );

  await resetSettlementFixtures();
  t.after(resetSettlementFixtures);

  const [branchA, branchB, summaryBranch] = await Promise.all([
    prisma.branch.create({ data: { name: `${prefix} branch A`, code: `SA${Date.now()}`, isMain: true } }),
    prisma.branch.create({ data: { name: `${prefix} branch B`, code: `SB${Date.now()}` } }),
    prisma.branch.create({ data: { name: `${prefix} summary branch`, code: `SS${Date.now()}` } }),
  ]);
  const user = await prisma.user.create({
    data: {
      email: `settlement-${Date.now()}@example.test`,
      passwordHash: 'integration-test-only',
      fullName: `${prefix} bursar`,
      role: 'BURSAR',
      branchId: branchA.id,
    },
  });
  const closedTerm = await prisma.academicTerm.create({
    data: {
      name: `${prefix} closed`,
      startDate: new Date('2040-01-01T00:00:00.000Z'),
      endDate: new Date('2040-03-31T00:00:00.000Z'),
      status: 'CLOSED',
      isActive: false,
      closedAt: new Date('2040-04-01T00:00:00.000Z'),
    },
  });
  const activeTerm = await prisma.academicTerm.create({
    data: {
      name: `${prefix} active`,
      startDate: new Date('2040-04-01T00:00:00.000Z'),
      endDate: new Date('2040-06-30T00:00:00.000Z'),
      status: 'ACTIVE',
      isActive: true,
      activatedAt: new Date('2040-04-01T00:00:00.000Z'),
    },
  });
  const [classA, classB, classSummary] = await Promise.all([
    prisma.class.create({
      data: {
        name: `${prefix} class A`,
        gradeLevel: 7,
        teacherId: user.id,
        academicTermId: activeTerm.id,
        branchId: branchA.id,
      },
    }),
    prisma.class.create({
      data: {
        name: `${prefix} class B`,
        gradeLevel: 7,
        teacherId: user.id,
        academicTermId: activeTerm.id,
        branchId: branchB.id,
      },
    }),
    prisma.class.create({
      data: {
        name: `${prefix} summary class`,
        gradeLevel: 7,
        teacherId: user.id,
        academicTermId: activeTerm.id,
        branchId: summaryBranch.id,
      },
    }),
  ]);
  const category = await prisma.feeCategory.create({
    data: { name: `${prefix} tuition`, code: `SETTLEMENT-${Date.now()}` },
  });

  await prisma.chartOfAccount.createMany({
    data: [
      { code: '1000', name: 'Cash at Bank', type: 'ASSET', branchId: branchA.id },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', branchId: branchA.id },
      { code: '2400', name: 'Advance Fees Received', type: 'LIABILITY', branchId: branchA.id },
      { code: '4000', name: 'Tuition Revenue', type: 'INCOME', branchId: branchA.id },
      { code: '4900', name: 'Other Income', type: 'INCOME', branchId: branchA.id },
    ],
  });

  let admissionSequence = 0;
  const createStudent = async (branchId = branchA.id, classId = classA.id, label = 'student') => {
    admissionSequence += 1;
    return prisma.student.create({
      data: {
        admissionNumber: `SETTLEMENT-${Date.now()}-${admissionSequence}`,
        firstName: 'Settlement',
        lastName: label,
        dateOfBirth: new Date('2020-01-01T00:00:00.000Z'),
        gender: admissionSequence % 2 === 0 ? 'FEMALE' : 'MALE',
        classId,
        branchId,
      },
    });
  };

  let feeSequence = 0;
  const createFee = async (
    studentId: string,
    academicTermId: string,
    amountDue: number,
    dueDate: Date,
    label = 'Tuition',
  ) => {
    feeSequence += 1;
    const template = await prisma.feeTemplate.create({
      data: {
        name: `${label} ${feeSequence}`,
        amount: amountDue,
        academicTermId,
        applicableGrade: 7,
        categoryId: category.id,
      },
    });
    return prisma.studentFeeStructure.create({
      data: {
        studentId,
        feeTemplateId: template.id,
        academicTermId,
        amountDue,
        dueDate,
      },
      include: { feeTemplate: true },
    });
  };

  await t.test('cash and receivable terms remain separate while cross-term and closed-term receipts remain valid', async () => {
    const student = await createStudent(summaryBranch.id, classSummary.id, 'Summary');
    const oldFee = await createFee(
      student.id,
      closedTerm.id,
      100,
      new Date('2040-02-01T00:00:00.000Z'),
      'Historical tuition',
    );
    const activeFee = await createFee(
      student.id,
      activeTerm.id,
      100,
      new Date('2040-05-01T00:00:00.000Z'),
      'Current tuition',
    );

    const laterReceipt = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 60,
      method: 'CASH',
      source: 'MANUAL',
      actorBranchId: summaryBranch.id,
      idempotencyKey: `${prefix}:later-receipt`,
      studentFeeIds: [oldFee.id],
    });
    assert.equal(laterReceipt.payment.academicTermId, activeTerm.id);
    assert.equal(laterReceipt.settlement.allocatedAmount, 60);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: oldFee.id } })).amountPaid.toNumber(), 60);

    const replay = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 60,
      method: 'CASH',
      source: 'MANUAL',
      actorBranchId: summaryBranch.id,
      idempotencyKey: `${prefix}:later-receipt`,
      studentFeeIds: [oldFee.id],
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.payment.id, laterReceipt.payment.id);
    assert.equal(await prisma.payment.count({ where: { idempotencyKey: `${prefix}:later-receipt` } }), 1);

    await assert.rejects(
      createCompletedPayment({
        studentId: student.id,
        receiptTermId: activeTerm.id,
        amount: 61,
        method: 'CASH',
        source: 'MANUAL',
        idempotencyKey: `${prefix}:later-receipt`,
      }),
      settlementError('IDEMPOTENCY_CONFLICT'),
    );

    const closedReceipt = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: closedTerm.id,
      amount: 10,
      method: 'BANK_DEPOSIT',
      source: 'MANUAL',
      actorBranchId: summaryBranch.id,
      idempotencyKey: `${prefix}:closed-receipt`,
      studentFeeIds: [oldFee.id],
    });
    assert.equal(closedReceipt.payment.academicTermId, closedTerm.id);
    assert.equal(closedReceipt.settlement.allocatedAmount, 10);

    await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 40,
      method: 'MOBILE_MONEY',
      source: 'MOBILE_MONEY',
      actorBranchId: summaryBranch.id,
      idempotencyKey: `${prefix}:current-receipt`,
      studentFeeIds: [activeFee.id],
    });

    await recalculateTermSummary(closedTerm.id, summaryBranch.id);
    await recalculateTermSummary(activeTerm.id, summaryBranch.id);
    const historicalSummary = await getTermFinancialSummary(closedTerm.id, summaryBranch.id);
    const currentSummary = await getTermFinancialSummary(activeTerm.id, summaryBranch.id);
    assert.ok(historicalSummary);
    assert.ok(currentSummary);
    assert.equal(historicalSummary.totalFeesExpected, 100);
    assert.equal(historicalSummary.totalFeesCollected, 70);
    assert.equal(historicalSummary.totalOutstanding, 30);
    assert.equal(historicalSummary.totalCashReceived, 10);
    assert.equal(currentSummary.totalFeesExpected, 100);
    assert.equal(currentSummary.totalFeesCollected, 40);
    assert.equal(currentSummary.totalOutstanding, 60);
    assert.equal(currentSummary.totalCashReceived, 100);
    assert.equal(currentSummary.netCashReceived, 100);

    const historicalRefund = await createRefundRequest({
      paymentId: closedReceipt.payment.id,
      amount: 5,
      reason: 'Historical receipt correction',
      method: 'cash_back',
      requestedByUserId: user.id,
      actorBranchId: summaryBranch.id,
      idempotencyKey: `${prefix}:closed-receipt-refund`,
    });
    await approveRefundRequest(historicalRefund.refund.id, user.id, summaryBranch.id);
    await processApprovedRefund(historicalRefund.refund.id, user.id, summaryBranch.id);
    await recalculateTermSummary(closedTerm.id, summaryBranch.id);
    const adjustedHistoricalSummary = await getTermFinancialSummary(closedTerm.id, summaryBranch.id);
    assert.ok(adjustedHistoricalSummary);
    assert.equal(adjustedHistoricalSummary.totalFeesCollected, 65);
    assert.equal(adjustedHistoricalSummary.totalRefunded, 5);
    assert.equal(adjustedHistoricalSummary.netCashReceived, 5);
  });

  await t.test('database constraints reject cross-student and over-limit allocations', async () => {
    const firstStudent = await createStudent(branchA.id, classA.id, 'Limits A');
    const secondStudent = await createStudent(branchA.id, classA.id, 'Limits B');
    const firstFee = await createFee(firstStudent.id, activeTerm.id, 100, new Date('2040-04-10T00:00:00.000Z'));
    const secondFee = await createFee(secondStudent.id, activeTerm.id, 100, new Date('2040-04-10T00:00:00.000Z'));
    const receipt = await createCompletedPayment({
      studentId: firstStudent.id,
      receiptTermId: activeTerm.id,
      amount: 10,
      method: 'CASH',
      autoAllocate: false,
      idempotencyKey: `${prefix}:limit-receipt`,
    });

    await assert.rejects(
      prisma.paymentAllocation.create({
        data: { paymentId: receipt.payment.id, studentFeeId: secondFee.id, amount: 1 },
      }),
      databaseMessageIncludes('same student'),
    );
    await assert.rejects(
      prisma.paymentAllocation.create({
        data: { paymentId: receipt.payment.id, studentFeeId: firstFee.id, amount: 11 },
      }),
      databaseMessageIncludes('net receipt amount'),
    );

    const smallFee = await createFee(firstStudent.id, activeTerm.id, 5, new Date('2040-04-09T00:00:00.000Z'), 'Small fee');
    const largerReceipt = await createCompletedPayment({
      studentId: firstStudent.id,
      receiptTermId: activeTerm.id,
      amount: 20,
      method: 'CASH',
      autoAllocate: false,
      idempotencyKey: `${prefix}:obligation-limit`,
    });
    await assert.rejects(
      prisma.paymentAllocation.create({
        data: { paymentId: largerReceipt.payment.id, studentFeeId: smallFee.id, amount: 6 },
      }),
      databaseMessageIncludes('fee obligation'),
    );
  });

  await t.test('invoice settlement creates one receipt and allocation and remains idempotent after the invoice is paid', async () => {
    const student = await createStudent(branchA.id, classA.id, 'Invoice');
    const fee = await createFee(student.id, closedTerm.id, 80, new Date('2040-03-01T00:00:00.000Z'), 'Invoice tuition');
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-SETTLEMENT-${Date.now()}`,
        studentId: student.id,
        termId: closedTerm.id,
        dueDate: new Date('2040-03-15T00:00:00.000Z'),
        subtotal: 80,
        totalAmount: 80,
        amountPaid: 0,
        balanceDue: 80,
        status: 'SENT',
        branchId: branchA.id,
        items: {
          create: {
            description: fee.feeTemplate.name,
            quantity: 1,
            unitPrice: 80,
            amount: 80,
            feeTemplateId: fee.feeTemplateId,
            studentFeeId: fee.id,
          },
        },
      },
    });

    await onInvoiceSent(invoice.id, user.id);
    await onInvoiceSent(invoice.id, user.id);
    assert.equal(await prisma.journalEntry.count({ where: { postingKey: `invoice:${invoice.id}:issued` } }), 1);

    const settlement = await settleInvoicePayment({
      invoiceId: invoice.id,
      receiptTermId: activeTerm.id,
      amount: 80,
      method: 'BANK_DEPOSIT',
      userId: user.id,
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:invoice-payment`,
    });
    assert.equal(settlement.payment.source, 'INVOICE');
    assert.equal(settlement.payment.academicTermId, activeTerm.id);
    assert.equal(settlement.settlement.allocatedAmount, 80);
    assert.equal(settlement.invoice.status, 'PAID');
    assert.equal(settlement.invoice.amountPaid.toNumber(), 80);

    const replay = await settleInvoicePayment({
      invoiceId: invoice.id,
      receiptTermId: activeTerm.id,
      amount: 80,
      method: 'BANK_DEPOSIT',
      userId: user.id,
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:invoice-payment`,
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.payment.id, settlement.payment.id);

    await onPaymentCreated(settlement.payment.id, user.id);
    await onPaymentCreated(settlement.payment.id, user.id);
    const receiptJournal = await prisma.journalEntry.findUniqueOrThrow({
      where: { postingKey: `payment:${settlement.payment.id}:receipt` },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(receiptJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.credit), 0), 80);
    assert.equal(receiptJournal.lines.filter(line => line.account.code === '1200').reduce((sum, line) => sum + Number(line.credit), 0), 0);
    assert.equal(await prisma.journalEntry.count({ where: { postingKey: `payment:${settlement.payment.id}:receipt` } }), 1);

    const invoiceAllocation = await prisma.paymentAllocation.findFirstOrThrow({
      where: { paymentId: settlement.payment.id },
    });
    const invoiceDrain = await processAccountingPostingOutbox(200);
    assert.equal(invoiceDrain.failed, 0);
    const allocationJournal = await prisma.journalEntry.findFirstOrThrow({
      where: {
        referenceType: 'PAYMENT_ALLOCATION',
        referenceId: invoiceAllocation.id,
      },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(allocationJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.debit), 0), 80);
    assert.equal(allocationJournal.lines.filter(line => line.account.code === '1200').reduce((sum, line) => sum + Number(line.credit), 0), 80);
    assert.equal(
      await prisma.accountingPostingOutbox.count({
        where: {
          eventType: 'PAYMENT_ALLOCATED',
          aggregateId: invoiceAllocation.id,
        },
      }),
      1,
    );

    const secondFee = await createFee(student.id, closedTerm.id, 50, new Date('2040-03-02T00:00:00.000Z'), 'Second invoice fee');
    const secondInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-SETTLEMENT-OVER-${Date.now()}`,
        studentId: student.id,
        termId: closedTerm.id,
        dueDate: new Date('2040-03-20T00:00:00.000Z'),
        subtotal: 50,
        totalAmount: 50,
        amountPaid: 0,
        balanceDue: 50,
        status: 'SENT',
        branchId: branchA.id,
        items: {
          create: {
            description: secondFee.feeTemplate.name,
            quantity: 1,
            unitPrice: 50,
            amount: 50,
            feeTemplateId: secondFee.feeTemplateId,
            studentFeeId: secondFee.id,
          },
        },
      },
    });
    await assert.rejects(
      settleInvoicePayment({
        invoiceId: secondInvoice.id,
        receiptTermId: activeTerm.id,
        amount: 51,
        method: 'CASH',
        userId: user.id,
      }),
      settlementError('INVOICE_PAYMENT_EXCEEDS_BALANCE'),
    );

    const creditResponse = createMockResponse();
    await createCreditNote({
      body: {
        invoiceId: secondInvoice.id,
        amount: 15,
        reason: 'Approved tuition adjustment',
      },
      user: { userId: user.id, role: 'BURSAR', branchId: branchA.id },
    } as any, creditResponse);
    assert.equal(creditResponse.statusCode, 201);
    const creditedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: secondInvoice.id } });
    assert.equal(creditedInvoice.balanceDue.toNumber(), 35);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: secondFee.id } })).amountDue.toNumber(), 35);

    await onCreditNoteCreated(creditResponse.body.id, user.id);
    await onCreditNoteCreated(creditResponse.body.id, user.id);
    assert.equal(
      await prisma.journalEntry.count({
        where: { postingKey: `credit-note:${creditResponse.body.id}:issued` },
      }),
      1,
    );

    const cancellationFee = await createFee(
      student.id,
      activeTerm.id,
      30,
      new Date('2040-05-15T00:00:00.000Z'),
      'Cancelled invoice fee',
    );
    const cancellableInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-SETTLEMENT-CANCEL-${Date.now()}`,
        studentId: student.id,
        termId: activeTerm.id,
        dueDate: new Date('2040-05-20T00:00:00.000Z'),
        subtotal: 30,
        totalAmount: 30,
        amountPaid: 0,
        balanceDue: 30,
        status: 'SENT',
        branchId: branchA.id,
        items: {
          create: {
            description: cancellationFee.feeTemplate.name,
            quantity: 1,
            unitPrice: 30,
            amount: 30,
            feeTemplateId: cancellationFee.feeTemplateId,
            studentFeeId: cancellationFee.id,
          },
        },
      },
    });
    await onInvoiceSent(cancellableInvoice.id, user.id);
    const cancellationResponse = createMockResponse();
    await cancelInvoice({
      params: { id: cancellableInvoice.id },
      user: { userId: user.id, role: 'BURSAR', branchId: branchA.id },
    } as any, cancellationResponse);
    assert.equal(cancellationResponse.statusCode, 200);
    assert.equal(cancellationResponse.body.status, 'CANCELLED');
    assert.equal(
      (await prisma.invoiceItem.findFirstOrThrow({
        where: { invoiceId: cancellableInvoice.id },
      })).studentFeeId,
      null,
    );
    await onInvoiceCancelled(cancellableInvoice.id, user.id);
    assert.equal(
      await prisma.journalEntry.count({
        where: { postingKey: `invoice:${cancellableInvoice.id}:cancelled` },
      }),
      1,
    );
  });

  await t.test('refunds consume account credit before reversing allocations and cannot exceed the source receipt', async () => {
    const student = await createStudent(branchA.id, classA.id, 'Refund');
    const fee = await createFee(student.id, activeTerm.id, 60, new Date('2040-04-15T00:00:00.000Z'), 'Refund tuition');
    const receipt = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 100,
      method: 'CASH',
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:refund-receipt`,
    });
    assert.equal(receipt.settlement.allocatedAmount, 60);
    assert.equal(receipt.settlement.unallocatedAmount, 40);
    assert.equal((await getStudentAccountCredits(student.id))[0].availableCredit, 40);

    await onPaymentCreated(receipt.payment.id, user.id);
    const receiptJournal = await prisma.journalEntry.findUniqueOrThrow({
      where: { postingKey: `payment:${receipt.payment.id}:receipt` },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(receiptJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.credit), 0), 100);

    const paymentAllocation = await prisma.paymentAllocation.findFirstOrThrow({
      where: { paymentId: receipt.payment.id },
    });
    const allocationDrain = await processAccountingPostingOutbox(200);
    assert.equal(allocationDrain.failed, 0);
    const allocationJournal = await prisma.journalEntry.findFirstOrThrow({
      where: {
        referenceType: 'PAYMENT_ALLOCATION',
        referenceId: paymentAllocation.id,
      },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(allocationJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.debit), 0), 60);
    assert.equal(allocationJournal.lines.filter(line => line.account.code === '4000').reduce((sum, line) => sum + Number(line.credit), 0), 60);

    const request = await createRefundRequest({
      paymentId: receipt.payment.id,
      amount: 30,
      reason: 'Duplicate amount received',
      method: 'cash_back',
      requestedByUserId: user.id,
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:refund-1`,
    });
    const requestReplay = await createRefundRequest({
      paymentId: receipt.payment.id,
      amount: 30,
      reason: 'Duplicate amount received',
      method: 'cash_back',
      requestedByUserId: user.id,
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:refund-1`,
    });
    assert.equal(requestReplay.reused, true);
    assert.equal(requestReplay.refund.id, request.refund.id);
    await approveRefundRequest(request.refund.id, user.id, branchA.id);
    await processApprovedRefund(request.refund.id, user.id, branchA.id);
    assert.equal(await prisma.refundAllocation.count({ where: { refundId: request.refund.id } }), 0);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: fee.id } })).amountPaid.toNumber(), 60);
    assert.equal((await getStudentAccountCredits(student.id))[0].availableCredit, 10);
    await onRefundProcessed(request.refund.id, user.id);
    await onRefundProcessed(request.refund.id, user.id);
    const creditRefundJournal = await prisma.journalEntry.findUniqueOrThrow({
      where: { postingKey: `refund:${request.refund.id}:processed` },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(creditRefundJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.debit), 0), 30);
    assert.equal(creditRefundJournal.lines.filter(line => line.account.code === '1000').reduce((sum, line) => sum + Number(line.credit), 0), 30);

    const secondRequest = await createRefundRequest({
      paymentId: receipt.payment.id,
      amount: 20,
      reason: 'Partial fee refund',
      method: 'cash_back',
      requestedByUserId: user.id,
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:refund-2`,
    });
    await approveRefundRequest(secondRequest.refund.id, user.id, branchA.id);
    await processApprovedRefund(secondRequest.refund.id, user.id, branchA.id);
    const reversal = await prisma.refundAllocation.findFirstOrThrow({
      where: { refundId: secondRequest.refund.id },
    });
    assert.equal(reversal.amount.toNumber(), 10);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: fee.id } })).amountPaid.toNumber(), 50);
    assert.equal((await getPaymentSettlementSnapshot(receipt.payment.id)).unallocatedAmount, 0);

    await onRefundProcessed(secondRequest.refund.id, user.id);
    await onRefundProcessed(secondRequest.refund.id, user.id);
    assert.equal(await prisma.journalEntry.count({ where: { postingKey: `refund:${secondRequest.refund.id}:processed` } }), 1);
    const allocatedRefundJournal = await prisma.journalEntry.findUniqueOrThrow({
      where: { postingKey: `refund:${secondRequest.refund.id}:processed` },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(allocatedRefundJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.debit), 0), 10);
    assert.equal(allocatedRefundJournal.lines.filter(line => line.account.code === '4000').reduce((sum, line) => sum + Number(line.debit), 0), 10);
    assert.equal(allocatedRefundJournal.lines.filter(line => line.account.code === '1000').reduce((sum, line) => sum + Number(line.credit), 0), 20);

    await assert.rejects(
      createRefundRequest({
        paymentId: receipt.payment.id,
        amount: 51,
        reason: 'Exceeds remaining receipt',
        method: 'cash_back',
        requestedByUserId: user.id,
        idempotencyKey: `${prefix}:refund-too-large`,
      }),
      settlementError('REFUND_EXCEEDS_PAYMENT'),
    );
    await assert.rejects(
      voidPaymentSettlement(receipt.payment.id, user.id, 'Cannot void after refund', branchA.id),
      settlementError('PAYMENT_HAS_PROCESSED_REFUND'),
    );
  });

  await t.test('voids restore obligations, reject reconciled or cross-branch mutations, and journal exactly once', async () => {
    const student = await createStudent(branchA.id, classA.id, 'Void');
    const fee = await createFee(student.id, activeTerm.id, 50, new Date('2040-04-16T00:00:00.000Z'), 'Void tuition');
    const receipt = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 50,
      method: 'CASH',
      actorBranchId: branchA.id,
      idempotencyKey: `${prefix}:void-receipt`,
    });
    await onPaymentCreated(receipt.payment.id, user.id);
    const allocation = await prisma.paymentAllocation.findFirstOrThrow({
      where: { paymentId: receipt.payment.id },
    });
    const allocationIntent = await prisma.accountingPostingOutbox.findFirstOrThrow({
      where: {
        eventType: 'PAYMENT_ALLOCATED',
        aggregateId: allocation.id,
      },
    });
    await prisma.accountingPostingOutbox.update({
      where: { id: allocationIntent.id },
      data: { availableAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await voidPaymentSettlement(receipt.payment.id, user.id, 'Cash entry was duplicated', branchA.id);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: fee.id } })).amountPaid.toNumber(), 0);
    assert.equal(
      await prisma.journalEntry.count({
        where: { referenceType: 'PAYMENT_ALLOCATION', referenceId: allocation.id },
      }),
      0,
    );
    const voidDrain = await processAccountingPostingOutbox(200);
    assert.equal(voidDrain.failed, 0);
    await onPaymentVoided(receipt.payment.id, user.id);
    await onPaymentVoided(receipt.payment.id, user.id);
    assert.equal(await prisma.journalEntry.count({ where: { postingKey: `payment:${receipt.payment.id}:void` } }), 1);
    assert.equal(
      await prisma.journalEntry.count({
        where: { referenceType: 'PAYMENT_ALLOCATION', referenceId: allocation.id },
      }),
      1,
    );
    const voidJournal = await prisma.journalEntry.findUniqueOrThrow({
      where: { postingKey: `payment:${receipt.payment.id}:void` },
      include: { lines: { include: { account: true } } },
    });
    assert.equal(voidJournal.lines.filter(line => line.account.code === '1000').reduce((sum, line) => sum + Number(line.credit), 0), 50);
    assert.equal(voidJournal.lines.filter(line => line.account.code === '4000').reduce((sum, line) => sum + Number(line.debit), 0), 50);
    assert.equal(voidJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.debit), 0), 50);
    assert.equal(voidJournal.lines.filter(line => line.account.code === '2400').reduce((sum, line) => sum + Number(line.credit), 0), 50);

    await prisma.accountingPostingOutbox.update({
      where: { id: allocationIntent.id },
      data: { availableAt: new Date(0) },
    });
    const allocationReplay = await processAccountingPostingOutbox(200);
    assert.equal(allocationReplay.failed, 0);
    assert.equal(
      (await prisma.accountingPostingOutbox.findUniqueOrThrow({
        where: { id: allocationIntent.id },
      })).status,
      'COMPLETED',
    );

    const reconciled = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 10,
      method: 'BANK_DEPOSIT',
      autoAllocate: false,
      idempotencyKey: `${prefix}:reconciled`,
    });
    await prisma.payment.update({ where: { id: reconciled.payment.id }, data: { isReconciled: true } });
    await assert.rejects(
      voidPaymentSettlement(reconciled.payment.id, user.id, 'Incorrect bank deposit', branchA.id),
      settlementError('PAYMENT_RECONCILED'),
    );

    const branchBStudent = await createStudent(branchB.id, classB.id, 'Branch B');
    await createFee(branchBStudent.id, activeTerm.id, 20, new Date('2040-04-20T00:00:00.000Z'), 'Branch B tuition');
    await assert.rejects(
      createCompletedPayment({
        studentId: branchBStudent.id,
        receiptTermId: activeTerm.id,
        amount: 20,
        method: 'CASH',
        actorBranchId: branchA.id,
        idempotencyKey: `${prefix}:wrong-branch-create`,
      }),
      settlementError('STUDENT_BRANCH_MISMATCH'),
    );
    const branchBReceipt = await createCompletedPayment({
      studentId: branchBStudent.id,
      receiptTermId: activeTerm.id,
      amount: 20,
      method: 'CASH',
      actorBranchId: null,
      idempotencyKey: `${prefix}:branch-b-receipt`,
    });
    await assert.rejects(
      voidPaymentSettlement(branchBReceipt.payment.id, user.id, 'Wrong branch attempt', branchA.id),
      settlementError('PAYMENT_BRANCH_MISMATCH'),
    );
  });

  await t.test('mobile completion is idempotent and allocation is not duplicated', async () => {
    const student = await createStudent(branchA.id, classA.id, 'Mobile');
    const fee = await createFee(student.id, activeTerm.id, 25, new Date('2040-04-17T00:00:00.000Z'), 'Mobile tuition');
    const pending = await prisma.payment.create({
      data: {
        transactionId: `TXN-MOBILE-${Date.now()}`,
        idempotencyKey: `${prefix}:mobile`,
        source: 'MOBILE_MONEY',
        studentId: student.id,
        academicTermId: activeTerm.id,
        amount: 25,
        method: 'MOBILE_MONEY',
        status: 'PENDING',
        branchId: branchA.id,
      },
    });

    const first = await runTermWriteTransaction(activeTerm.id, 'FINANCIAL_RECEIPT', tx => (
      completePendingPaymentInTransaction(tx, pending.id)
    ));
    const second = await runTermWriteTransaction(activeTerm.id, 'FINANCIAL_RECEIPT', tx => (
      completePendingPaymentInTransaction(tx, pending.id)
    ));
    assert.equal(first.becameCompleted, true);
    assert.equal(second.becameCompleted, false);
    assert.equal(await prisma.paymentAllocation.count({ where: { paymentId: pending.id } }), 1);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: fee.id } })).amountPaid.toNumber(), 25);
  });

  await t.test('concurrent receipts never over-allocate an obligation and preserve excess as source credit', async () => {
    const student = await createStudent(branchA.id, classA.id, 'Concurrent');
    const fee = await createFee(student.id, activeTerm.id, 100, new Date('2040-04-18T00:00:00.000Z'), 'Concurrent tuition');
    const [first, second] = await Promise.all([
      createCompletedPayment({
        studentId: student.id,
        receiptTermId: activeTerm.id,
        amount: 80,
        method: 'CASH',
        idempotencyKey: `${prefix}:concurrent-1`,
      }),
      createCompletedPayment({
        studentId: student.id,
        receiptTermId: activeTerm.id,
        amount: 80,
        method: 'CASH',
        idempotencyKey: `${prefix}:concurrent-2`,
      }),
    ]);

    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: fee.id } })).amountPaid.toNumber(), 100);
    const allocations = await prisma.paymentAllocation.aggregate({
      where: { paymentId: { in: [first.payment.id, second.payment.id] } },
      _sum: { amount: true },
    });
    assert.equal(Number(allocations._sum.amount), 100);
    const credits = await getStudentAccountCredits(student.id);
    assert.equal(credits.reduce((sum, credit) => sum + credit.availableCredit, 0), 60);

    const remaining = await allocateExistingPayment(activeTerm.id, first.payment.id);
    assert.equal(remaining.allocatedAmount, 0);
  });

  await t.test('historical reconciliation plans oldest-debt allocations deterministically and applies only a matching fingerprint', async () => {
    const student = await createStudent(branchA.id, classA.id, 'Reconciliation');
    const historicalFee = await createFee(
      student.id,
      closedTerm.id,
      70,
      new Date('2040-02-10T00:00:00.000Z'),
      'Reconciliation historical tuition',
    );
    const currentFee = await createFee(
      student.id,
      activeTerm.id,
      50,
      new Date('2040-05-10T00:00:00.000Z'),
      'Reconciliation current tuition',
    );
    const firstReceipt = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 80,
      method: 'CASH',
      autoAllocate: false,
      idempotencyKey: `${prefix}:reconciliation-1`,
    });
    const secondReceipt = await createCompletedPayment({
      studentId: student.id,
      receiptTermId: activeTerm.id,
      amount: 60,
      method: 'BANK_DEPOSIT',
      autoAllocate: false,
      idempotencyKey: `${prefix}:reconciliation-2`,
    });

    const plan = await buildFinanceSettlementReconciliationPlan();
    assert.equal(plan.blockers.length, 0);
    const paymentIds = new Set([firstReceipt.payment.id, secondReceipt.payment.id]);
    const actions = plan.actions.filter(action => paymentIds.has(action.paymentId));
    assert.equal(actions.reduce((sum, action) => sum + action.amount, 0), 120);
    assert.equal(actions[0].studentFeeId, historicalFee.id);
    assert.equal(actions[0].receiptTermId, activeTerm.id);
    assert.equal(actions[0].obligationTermId, closedTerm.id);
    assert.equal(
      plan.projectedCredits
        .filter(credit => paymentIds.has(credit.paymentId))
        .reduce((sum, credit) => sum + credit.amount, 0),
      20,
    );

    const applied = await applyFinanceSettlementReconciliationPlan(plan.sourceFingerprint);
    assert.equal(applied.appliedActions >= actions.length, true);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: historicalFee.id } })).amountPaid.toNumber(), 70);
    assert.equal((await prisma.studentFeeStructure.findUniqueOrThrow({ where: { id: currentFee.id } })).amountPaid.toNumber(), 50);
    assert.equal(applied.after.actions.length, 0);

    await assert.rejects(
      applyFinanceSettlementReconciliationPlan(plan.sourceFingerprint),
      (error: unknown) => (
        error instanceof FinanceSettlementReconciliationError
        && error.code === 'STALE_PLAN'
      ),
    );
  });

  await t.test('durable accounting intents drain idempotently after operational transactions commit', async () => {
    const firstDrain = await processAccountingPostingOutbox(200);
    assert.equal(firstDrain.failed, 0);
    assert.equal(firstDrain.completed, firstDrain.claimed);
    assert.equal(
      await prisma.accountingPostingOutbox.count({
        where: { status: { not: 'COMPLETED' } },
      }),
      0,
    );

    const secondDrain = await processAccountingPostingOutbox(200);
    assert.deepEqual(secondDrain, { claimed: 0, completed: 0, failed: 0 });
  });
});
