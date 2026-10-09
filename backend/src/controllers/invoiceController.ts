import { Request, Response } from 'express';
import { AccountingPostingEventType, InvoiceStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { generateSequenceNumber, logFinancialAction } from '../services/accountingService';
import {
  onCreditNoteCreated,
  onInvoiceCancelled,
  onInvoiceSent,
  onPaymentCreated,
} from '../services/accountingBridge';
import { enqueueAccountingPosting } from '../services/accountingOutboxService';
import { createNotification, generateInvoiceIssuedEmail, sendNotification } from '../services/notificationService';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  PaymentSettlementError,
  settleInvoicePayment,
} from '../services/paymentSettlementService';
import { sendPaymentSettlementError } from '../utils/paymentSettlementHttp';

// ========================================
// INVOICE MANAGEMENT
// ========================================

const getEffectiveInvoiceStatus = (invoice: { status: string; dueDate: Date | string; balanceDue: unknown }) => {
  const dueDate = new Date(invoice.dueDate);
  const balanceDue = Number(invoice.balanceDue || 0);

  if (
    ['SENT', 'PARTIALLY_PAID'].includes(invoice.status) &&
    balanceDue > 0 &&
    dueDate.getTime() < Date.now()
  ) {
    return 'OVERDUE';
  }

  return invoice.status;
};

const createInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  dueDate: z.string().transform(s => new Date(s)),
  discount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().int().positive().default(1),
    unitPrice: z.number().positive(),
    feeTemplateId: z.string().uuid(),
  })).min(1),
}).superRefine((data, context) => {
  if (data.discount !== 0 || data.taxAmount !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discount'],
      message: 'Invoice discounts and taxes require canonical fee adjustments and are not supported yet',
    });
  }
  const feeTemplateIds = data.items.map(item => item.feeTemplateId);
  if (new Set(feeTemplateIds).size !== feeTemplateIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'Each fee obligation can appear only once on an invoice',
    });
  }
});

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const { status, studentId, termId, page = '1', limit = '20' } = req.query;
    if (!termId || typeof termId !== 'string') {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }

    const where: any = { ...branchFilter, termId };
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNumber: true,
              termEnrollments: {
                where: { academicTermId: termId },
                select: { class: { select: { name: true } } },
                take: 1,
              },
            },
          },
          items: true,
          _count: { select: { creditNotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.invoice.count({ where }),
    ]);

    const normalizedInvoices = invoices.map(invoice => {
      const { termEnrollments, ...student } = invoice.student;
      return {
        ...invoice,
        student: {
          ...student,
          class: termEnrollments[0]?.class ?? null,
        },
        status: getEffectiveInvoiceStatus(invoice),
      };
    });

    res.json({ invoices: normalizedInvoices, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        student: {
          select: {
            firstName: true, lastName: true, admissionNumber: true,
            guardianName: true, guardianPhone: true, guardianEmail: true,
            termEnrollments: {
              select: {
                academicTermId: true,
                class: { select: { name: true, gradeLevel: true } },
              },
            },
          },
        },
        items: true,
        creditNotes: true,
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (user.role !== 'SUPER_ADMIN' && invoice.branchId !== user.branchId) {
      return res.status(403).json({ error: 'Invoice does not belong to the current branch' });
    }
    const { termEnrollments, ...student } = invoice.student;
    res.json({
      ...invoice,
      student: {
        ...student,
        class: termEnrollments.find(enrollment => enrollment.academicTermId === invoice.termId)?.class ?? null,
      },
      status: getEffectiveInvoiceStatus(invoice),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const data = createInvoiceSchema.parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Verify student exists
    const student = await prisma.student.findUnique({ where: { id: data.studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (user.role !== 'SUPER_ADMIN' && student.branchId !== user.branchId) {
      return res.status(403).json({ error: 'Student does not belong to the current branch' });
    }

    const term = await prisma.academicTerm.findUnique({ where: { id: data.termId }, select: { id: true } });
    if (!term) return res.status(404).json({ error: 'Academic term not found' });

    const feeTemplateIds = data.items.map(item => item.feeTemplateId);
    if (feeTemplateIds.length > 0) {
      const matchingTemplateCount = await prisma.feeTemplate.count({
        where: { id: { in: feeTemplateIds }, academicTermId: data.termId },
      });
      if (matchingTemplateCount !== new Set(feeTemplateIds).size) {
        return res.status(400).json({ error: 'Every fee item must belong to the selected academic term' });
      }
    }

    const invoice = await runTermWriteTransaction(data.termId, 'FINANCIAL_OBLIGATION', async tx => {
      const feeStructures = await tx.studentFeeStructure.findMany({
        where: {
          studentId: data.studentId,
          academicTermId: data.termId,
          feeTemplateId: { in: feeTemplateIds },
        },
        select: {
          id: true,
          feeTemplateId: true,
          amountDue: true,
          invoiceItem: { select: { id: true } },
          feeTemplate: { select: { name: true } },
        },
      });
      if (feeStructures.length !== feeTemplateIds.length) {
        throw new PaymentSettlementError(
          'FEE_NOT_FOUND',
          'Every invoice item must match an assigned fee obligation for this student and term',
          400,
        );
      }
      if (feeStructures.some(fee => fee.invoiceItem)) {
        throw new PaymentSettlementError(
          'INVOICE_OBLIGATION_LINK_REQUIRED',
          'One or more selected fee obligations already belong to an invoice',
        );
      }
      const studentFeeByTemplate = new Map(
        feeStructures.map(fee => [fee.feeTemplateId, fee]),
      );
      const canonicalItems = data.items.map(item => {
        const fee = studentFeeByTemplate.get(item.feeTemplateId)!;
        return {
          description: fee.feeTemplate.name,
          quantity: 1,
          unitPrice: Number(fee.amountDue),
          amount: Number(fee.amountDue),
          feeTemplateId: item.feeTemplateId,
          studentFeeId: fee.id,
        };
      });
      const subtotal = canonicalItems.reduce((sum, item) => sum + item.amount, 0);
      const totalAmount = subtotal - data.discount + data.taxAmount;
      if (totalAmount <= 0 || totalAmount > subtotal) {
        throw new PaymentSettlementError(
          'INVOICE_NOT_SETTLEABLE',
          'Invoice total must be positive and cannot exceed its canonical fee obligations',
          400,
        );
      }
      const invoiceNumber = await generateSequenceNumber('INV', user.branchId, tx);
      return tx.invoice.create({
        data: {
          invoiceNumber,
          studentId: data.studentId,
          termId: data.termId,
          dueDate: data.dueDate,
          subtotal,
          discount: data.discount,
          taxAmount: data.taxAmount,
          totalAmount,
          amountPaid: 0,
          balanceDue: totalAmount,
          notes: data.notes,
          status: 'DRAFT',
          branchId: student.branchId,
          items: {
            create: canonicalItems,
          },
        },
        include: { items: true, student: { select: { firstName: true, lastName: true } } },
      });
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      description: `Created invoice ${invoice.invoiceNumber} for ${invoice.student.firstName} ${invoice.student.lastName}`,
      amount: Number(invoice.totalAmount),
      branchId: user.branchId,
    });

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

export const sendInvoice = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        student: {
          include: {
            parent: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (user.role !== 'SUPER_ADMIN' && invoice.branchId !== user.branchId) {
      return res.status(403).json({ error: 'Invoice does not belong to the current branch' });
    }

    const updated = await runTermWriteTransaction(invoice.termId, 'FINANCIAL_OBLIGATION', async tx => {
      const sent = await tx.invoice.update({
        where: { id: req.params.id },
        data: {
          status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
          sentAt: new Date(),
        },
      });
      if (sent.status !== 'DRAFT' && sent.status !== 'CANCELLED') {
        await enqueueAccountingPosting(
          tx,
          AccountingPostingEventType.INVOICE_ISSUED,
          sent.id,
          user.userId,
        );
      }
      return sent;
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'INVOICE_SENT',
      entityType: 'Invoice',
      entityId: invoice.id,
      description: `Sent invoice ${invoice.invoiceNumber} to ${invoice.student.guardianEmail || 'parent'}`,
      amount: Number(invoice.totalAmount),
      branchId: user.branchId,
    });

    try {
      const settings = await prisma.schoolSettings.findFirst();
      const schoolName = settings?.schoolName || 'School';
      const guardianName = invoice.student.parent?.fullName || invoice.student.guardianName || 'Parent/Guardian';
      const parentEmail = invoice.student.parent?.email || invoice.student.guardianEmail;
      const parentPhone = invoice.student.guardianPhone;

      if (parentEmail || parentPhone) {
        const { subject, text, html, sms } = generateInvoiceIssuedEmail(
          guardianName,
          `${invoice.student.firstName} ${invoice.student.lastName}`,
          invoice.invoiceNumber,
          Number(invoice.totalAmount),
          Number(invoice.balanceDue),
          new Date(invoice.dueDate),
          schoolName,
          new Date(invoice.issueDate),
          invoice.notes
        );

        sendNotification(
          parentEmail || undefined,
          parentPhone || undefined,
          subject,
          text,
          html,
          sms
        ).catch(err => console.error('Background invoice notification failed:', err));
      }

      if (invoice.student.parent?.id) {
        createNotification(
          invoice.student.parent.id,
          '📄 New Invoice Available',
          `${invoice.invoiceNumber} for ${invoice.student.firstName} ${invoice.student.lastName} is now available. Balance due: ZMW ${Number(invoice.balanceDue).toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
          'INFO'
        ).catch(err => console.error('Invoice in-app notification failed:', err));
      }
    } catch (notifyError) {
      console.error('Failed to process invoice notifications:', notifyError);
    }

    // Create accounting journal entry (Accounts Receivable)
    onInvoiceSent(invoice.id, user.userId).catch(err =>
      console.error('Background invoice journal creation failed:', err)
    );

    res.json({ message: 'Invoice sent', invoice: updated });
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
};

export const recordInvoicePayment = async (req: Request, res: Response) => {
  try {
    const data = z.object({
      amount: z.number().positive(),
      method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
      receiptTermId: z.string().uuid(),
      idempotencyKey: z.string().min(8).max(200).optional(),
      notes: z.string().max(500).optional(),
    }).parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await settleInvoicePayment({
      invoiceId: req.params.id,
      receiptTermId: data.receiptTermId,
      amount: data.amount,
      method: data.method,
      notes: data.notes,
      idempotencyKey: data.idempotencyKey ?? req.header?.('Idempotency-Key')?.trim(),
      userId: user.userId,
      actorBranchId: user.role === 'SUPER_ADMIN' ? null : user.branchId,
    });

    if (!result.reused) {
      onPaymentCreated(result.payment.id, user.userId).catch(error =>
        console.error('Background invoice settlement journal failed:', error)
      );
    }

    res.status(result.reused ? 200 : 201).json({
      invoice: result.invoice,
      payment: result.payment,
      settlement: {
        allocatedAmount: result.settlement.allocatedAmount,
        unallocatedAmount: result.settlement.unallocatedAmount,
      },
      reused: result.reused,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
    console.error('Record invoice payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

export const cancelInvoice = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (user.role !== 'SUPER_ADMIN' && invoice.branchId !== user.branchId) {
      return res.status(403).json({ error: 'Invoice does not belong to the current branch' });
    }
    if (Number(invoice.amountPaid) > 0 || ['PAID', 'PARTIALLY_PAID'].includes(invoice.status)) {
      return res.status(400).json({ error: 'Cannot cancel an invoice with settled allocations' });
    }

    const updated = await runTermWriteTransaction(invoice.termId, 'FINANCIAL_ADJUSTMENT', async tx => {
      const cancelled = await tx.invoice.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED' },
      });
      await tx.invoiceItem.updateMany({
        where: { invoiceId: invoice.id },
        data: { studentFeeId: null },
      });
      if (invoice.status !== 'DRAFT') {
        await enqueueAccountingPosting(
          tx,
          AccountingPostingEventType.INVOICE_CANCELLED,
          invoice.id,
          user.userId,
        );
      }
      return cancelled;
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'INVOICE_CANCELLED',
      entityType: 'Invoice',
      entityId: invoice.id,
      description: `Cancelled invoice ${invoice.invoiceNumber}`,
      amount: Number(invoice.totalAmount),
      branchId: user.branchId,
    });

    onInvoiceCancelled(invoice.id, user.userId).catch(error =>
      console.error('Background invoice cancellation journal failed:', error)
    );

    res.json(updated);
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to cancel invoice' });
  }
};

export const generateStudentInvoices = async (req: Request, res: Response) => {
  try {
    const { termId, classId } = z.object({
      termId: z.string().uuid(),
      classId: z.string().uuid().optional(),
    }).parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchFilter = user.role === 'SUPER_ADMIN' ? {} : { branchId: user.branchId };
    const term = await prisma.academicTerm.findUnique({ where: { id: termId }, select: { id: true } });
    if (!term) return res.status(404).json({ error: 'Academic term not found' });
    if (classId) {
      const selectedClass = await prisma.class.findUnique({
        where: { id: classId },
        select: { academicTermId: true, branchId: true },
      });
      if (!selectedClass) return res.status(404).json({ error: 'Class not found' });
      if (user.role !== 'SUPER_ADMIN' && selectedClass.branchId !== user.branchId) {
        return res.status(403).json({ error: 'Class does not belong to the current branch' });
      }
      if (selectedClass.academicTermId !== termId) {
        return res.status(400).json({ error: 'Selected class does not belong to the selected academic term' });
      }
    }

    const invoicesCreated = await runTermWriteTransaction(termId, 'FINANCIAL_OBLIGATION', async tx => {
      const students = await tx.student.findMany({
        where: {
          status: 'ACTIVE',
          ...branchFilter,
          termEnrollments: {
            some: {
              academicTermId: termId,
              status: 'ACTIVE',
              ...(classId ? { classId } : {}),
            },
          },
        },
        include: {
          feeStructures: {
            include: { feeTemplate: true },
            where: { academicTermId: termId, invoiceItem: { is: null } },
          },
        },
      });

      let createdCount = 0;
      for (const student of students) {
        if (student.feeStructures.length === 0) continue;

        const invoiceNumber = await generateSequenceNumber('INV', user.branchId, tx);
        const items = student.feeStructures.map(fs => ({
          description: fs.feeTemplate.name,
          quantity: 1,
          unitPrice: Number(fs.amountDue),
          amount: Number(fs.amountDue),
          feeTemplateId: fs.feeTemplateId,
          studentFeeId: fs.id,
        }));

        const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        await tx.invoice.create({
          data: {
            invoiceNumber,
            studentId: student.id,
            termId,
            dueDate,
            subtotal,
            discount: 0,
            taxAmount: 0,
            totalAmount: subtotal,
            amountPaid: 0,
            balanceDue: subtotal,
            status: 'DRAFT',
            branchId: student.branchId,
            items: { create: items },
          },
        });

        createdCount++;
      }
      return createdCount;
    });

    res.json({ message: `Generated ${invoicesCreated} invoices`, count: invoicesCreated });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Generate invoices error:', error);
    res.status(500).json({ error: 'Failed to generate invoices' });
  }
};

// Credit Note
export const createCreditNote = async (req: Request, res: Response) => {
  try {
    const { invoiceId, amount, reason } = z.object({
      invoiceId: z.string().uuid(),
      amount: z.number().positive(),
      reason: z.string().min(3),
    }).parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (user.role !== 'SUPER_ADMIN' && invoice.branchId !== user.branchId) {
      return res.status(403).json({ error: 'Invoice does not belong to the current branch' });
    }
    const creditResult = await runTermWriteTransaction(invoice.termId, 'FINANCIAL_ADJUSTMENT', async tx => {
      const current = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: {
          items: {
            where: { studentFeeId: { not: null } },
            include: {
              studentFee: { select: { id: true, amountDue: true, amountPaid: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      });
      if (!['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(current.status)) {
        throw new PaymentSettlementError(
          'INVOICE_NOT_SETTLEABLE',
          'Credit notes can only adjust an issued invoice with an outstanding balance',
          400,
        );
      }
      if (amount > Number(current.balanceDue)) {
        return { kind: 'AMOUNT_EXCEEDS_BALANCE' as const };
      }

      const availableAdjustment = current.items.reduce(
        (sum, item) => sum + Math.max(
          0,
          Number(item.studentFee?.amountDue || 0) - Number(item.studentFee?.amountPaid || 0),
        ),
        0,
      );
      if (amount > availableAdjustment + 0.005) {
        throw new PaymentSettlementError(
          'INVOICE_NOT_SETTLEABLE',
          'Credit note exceeds the unpaid canonical fee obligations linked to this invoice',
          409,
        );
      }

      const creditNoteNumber = await generateSequenceNumber('CN', user.branchId, tx);
      const created = await tx.creditNote.create({
        data: {
          creditNoteNumber,
          invoiceId,
          amount,
          reason,
          issuedBy: user.userId,
        },
      });

      let remaining = amount;
      for (const item of current.items) {
        if (!item.studentFee || remaining <= 0.005) break;
        const outstanding = Math.max(
          0,
          Number(item.studentFee.amountDue) - Number(item.studentFee.amountPaid),
        );
        const adjustment = Math.min(remaining, outstanding);
        if (adjustment > 0.005) {
          await tx.studentFeeStructure.update({
            where: { id: item.studentFee.id },
            data: { amountDue: { decrement: adjustment } },
          });
          remaining -= adjustment;
        }
      }
      if (remaining > 0.005) {
        throw new PaymentSettlementError(
          'INVOICE_NOT_SETTLEABLE',
          'Unable to apply the full credit note to canonical fee obligations',
          409,
        );
      }
      await enqueueAccountingPosting(
        tx,
        AccountingPostingEventType.CREDIT_NOTE_ISSUED,
        created.id,
        user.userId,
      );
      return { kind: 'CREATED' as const, creditNote: created };
    });

    if (creditResult.kind === 'AMOUNT_EXCEEDS_BALANCE') {
      return res.status(400).json({ error: 'Credit note amount exceeds balance due' });
    }

    onCreditNoteCreated(creditResult.creditNote.id, user.userId).catch(error =>
      console.error('Background credit-note journal creation failed:', error)
    );

    res.status(201).json(creditResult.creditNote);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
    res.status(500).json({ error: 'Failed to create credit note' });
  }
};

export const getInvoiceSummary = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined;
    if (!termId) return res.status(400).json({ error: 'Academic term ID is required' });
    const branchFilter = {
      ...(user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId }),
      termId,
    };
    const openInvoiceFilter = {
      ...branchFilter,
      status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.CREDITED] },
      balanceDue: { gt: 0 },
    };
    const overdueFilter = {
      ...branchFilter,
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
      balanceDue: { gt: 0 },
      dueDate: { lt: new Date() },
    };

    const [total, paidCount, collected, overdue, draft, partiallyPaid, outstanding] = await Promise.all([
      prisma.invoice.aggregate({ where: { ...branchFilter, status: { notIn: ['CANCELLED'] } }, _sum: { totalAmount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { ...branchFilter, status: 'PAID' }, _count: true }),
      prisma.invoice.aggregate({ where: { ...branchFilter, status: { notIn: ['CANCELLED'] } }, _sum: { amountPaid: true } }),
      prisma.invoice.aggregate({ where: overdueFilter, _sum: { balanceDue: true }, _count: true }),
      prisma.invoice.count({ where: { ...branchFilter, status: 'DRAFT' } }),
      prisma.invoice.aggregate({ where: { ...branchFilter, status: 'PARTIALLY_PAID' }, _sum: { balanceDue: true }, _count: true }),
      prisma.invoice.aggregate({ where: openInvoiceFilter, _sum: { balanceDue: true } }),
    ]);

    const totalPaid = Number(collected._sum.amountPaid || 0);
    const overdueAmount = Number(overdue._sum?.balanceDue || 0);
    const totalOutstanding = Number(outstanding._sum?.balanceDue || 0);

    res.json({
      totalInvoiced: Number(total._sum.totalAmount || 0),
      totalInvoices: total._count,
      totalPaid,
      totalCollected: totalPaid,
      paidCount: paidCount._count,
      overdueAmount,
      totalOverdue: overdueAmount,
      overdueCount: overdue._count,
      draftCount: draft,
      totalOutstanding,
      partiallyPaidAmount: Number(partiallyPaid._sum.balanceDue || 0),
      partiallyPaidCount: partiallyPaid._count,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get invoice summary' });
  }
};
