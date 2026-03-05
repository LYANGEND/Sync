import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { generateSequenceNumber, logFinancialAction } from '../services/accountingService';
import { onInvoiceSent } from '../services/accountingBridge';

// ========================================
// INVOICE MANAGEMENT
// ========================================

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
    feeTemplateId: z.string().uuid().optional(),
  })).min(1),
});

export const getInvoices = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const { status, studentId, page = '1', limit = '20' } = req.query;

    const where: any = { ...branchFilter };
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
          items: true,
          _count: { select: { creditNotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({ invoices, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        student: {
          select: {
            firstName: true, lastName: true, admissionNumber: true,
            guardianName: true, guardianPhone: true, guardianEmail: true,
            class: { select: { name: true, gradeLevel: true } },
          },
        },
        items: true,
        creditNotes: true,
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
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

    const invoiceNumber = await generateSequenceNumber('INV', user.branchId);

    const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalAmount = subtotal - data.discount + data.taxAmount;
    const balanceDue = totalAmount;

    const invoice = await prisma.invoice.create({
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
        balanceDue,
        notes: data.notes,
        status: 'DRAFT',
        branchId: user.branchId || student.branchId,
        items: {
          create: data.items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice,
            feeTemplateId: item.feeTemplateId,
          })),
        },
      },
      include: { items: true, student: { select: { firstName: true, lastName: true } } },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      description: `Created invoice ${invoiceNumber} for ${invoice.student.firstName} ${invoice.student.lastName}`,
      amount: totalAmount,
      branchId: user.branchId,
    });

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
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
      include: { student: true },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
        sentAt: new Date(),
      },
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

    // Create accounting journal entry (Accounts Receivable)
    onInvoiceSent(invoice.id, user.userId).catch(err =>
      console.error('Background invoice journal creation failed:', err)
    );

    res.json({ message: 'Invoice sent', invoice: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invoice' });
  }
};

export const recordInvoicePayment = async (req: Request, res: Response) => {
  try {
    const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const newAmountPaid = Number(invoice.amountPaid) + amount;
    const newBalanceDue = Number(invoice.totalAmount) - newAmountPaid;

    let newStatus = invoice.status;
    if (newBalanceDue <= 0) {
      newStatus = 'PAID';
    } else if (newAmountPaid > 0) {
      newStatus = 'PARTIALLY_PAID';
    }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: Math.max(0, newBalanceDue),
        status: newStatus,
        paidAt: newStatus === 'PAID' ? new Date() : null,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

export const cancelInvoice = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'PAID') return res.status(400).json({ error: 'Cannot cancel a paid invoice' });

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
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

    res.json(updated);
  } catch (error) {
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
    const classFilter = classId ? { classId } : {};

    // Get students with fee structures for this term
    const students = await prisma.student.findMany({
      where: { status: 'ACTIVE', ...branchFilter, ...classFilter },
      include: {
        feeStructures: {
          include: { feeTemplate: true },
          where: { feeTemplate: { academicTermId: termId } },
        },
        class: true,
      },
    });

    let invoicesCreated = 0;

    for (const student of students) {
      if (student.feeStructures.length === 0) continue;

      // Check if invoice already exists for this term
      const existing = await prisma.invoice.findFirst({
        where: {
          studentId: student.id,
          termId,
          status: { notIn: ['CANCELLED'] },
        },
      });
      if (existing) continue;

      const invoiceNumber = await generateSequenceNumber('INV', user.branchId);
      const items = student.feeStructures.map(fs => ({
        description: fs.feeTemplate.name,
        quantity: 1,
        unitPrice: Number(fs.amountDue),
        amount: Number(fs.amountDue),
        feeTemplateId: fs.feeTemplateId,
      }));

      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      await prisma.invoice.create({
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

      invoicesCreated++;
    }

    res.json({ message: `Generated ${invoicesCreated} invoices`, count: invoicesCreated });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
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
    if (amount > Number(invoice.balanceDue)) {
      return res.status(400).json({ error: 'Credit note amount exceeds balance due' });
    }

    const creditNoteNumber = await generateSequenceNumber('CN', user.branchId);

    const creditNote = await prisma.creditNote.create({
      data: {
        creditNoteNumber,
        invoiceId,
        amount,
        reason,
        issuedBy: user.userId,
      },
    });

    // Update invoice balances
    const newBalance = Number(invoice.balanceDue) - amount;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        balanceDue: newBalance,
        status: newBalance <= 0 ? 'CREDITED' : invoice.status,
      },
    });

    res.status(201).json(creditNote);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to create credit note' });
  }
};

export const getInvoiceSummary = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const [total, paid, overdue, draft, partiallyPaid] = await Promise.all([
      prisma.invoice.aggregate({ where: { ...branchFilter, status: { notIn: ['CANCELLED'] } }, _sum: { totalAmount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { ...branchFilter, status: 'PAID' }, _sum: { totalAmount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { ...branchFilter, status: 'OVERDUE' }, _sum: { balanceDue: true }, _count: true }),
      prisma.invoice.count({ where: { ...branchFilter, status: 'DRAFT' } }),
      prisma.invoice.aggregate({ where: { ...branchFilter, status: 'PARTIALLY_PAID' }, _sum: { balanceDue: true }, _count: true }),
    ]);

    res.json({
      totalInvoiced: Number(total._sum.totalAmount || 0),
      totalInvoices: total._count,
      totalPaid: Number(paid._sum.totalAmount || 0),
      paidCount: paid._count,
      overdueAmount: Number(overdue._sum.balanceDue || 0),
      overdueCount: overdue._count,
      draftCount: draft,
      partiallyPaidAmount: Number(partiallyPaid._sum.balanceDue || 0),
      partiallyPaidCount: partiallyPaid._count,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get invoice summary' });
  }
};
