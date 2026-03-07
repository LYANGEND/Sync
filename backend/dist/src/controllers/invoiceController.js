"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoiceSummary = exports.createCreditNote = exports.generateStudentInvoices = exports.cancelInvoice = exports.recordInvoicePayment = exports.sendInvoice = exports.createInvoice = exports.getInvoiceById = exports.getInvoices = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
const accountingService_1 = require("../services/accountingService");
const accountingBridge_1 = require("../services/accountingBridge");
// ========================================
// INVOICE MANAGEMENT
// ========================================
const createInvoiceSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    termId: zod_1.z.string().uuid(),
    dueDate: zod_1.z.string().transform(s => new Date(s)),
    discount: zod_1.z.number().min(0).default(0),
    taxAmount: zod_1.z.number().min(0).default(0),
    notes: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        description: zod_1.z.string(),
        quantity: zod_1.z.number().int().positive().default(1),
        unitPrice: zod_1.z.number().positive(),
        feeTemplateId: zod_1.z.string().uuid().optional(),
    })).min(1),
});
const getInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const { status, studentId, page = '1', limit = '20' } = req.query;
        const where = Object.assign({}, branchFilter);
        if (status)
            where.status = status;
        if (studentId)
            where.studentId = studentId;
        const skip = (Number(page) - 1) * Number(limit);
        const [invoices, total] = yield Promise.all([
            prisma_1.prisma.invoice.findMany({
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
            prisma_1.prisma.invoice.count({ where }),
        ]);
        res.json({ invoices, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});
exports.getInvoices = getInvoices;
const getInvoiceById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invoice = yield prisma_1.prisma.invoice.findUnique({
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
        if (!invoice)
            return res.status(404).json({ error: 'Invoice not found' });
        res.json(invoice);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});
exports.getInvoiceById = getInvoiceById;
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = createInvoiceSchema.parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        // Verify student exists
        const student = yield prisma_1.prisma.student.findUnique({ where: { id: data.studentId } });
        if (!student)
            return res.status(404).json({ error: 'Student not found' });
        const invoiceNumber = yield (0, accountingService_1.generateSequenceNumber)('INV', user.branchId);
        const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const totalAmount = subtotal - data.discount + data.taxAmount;
        const balanceDue = totalAmount;
        const invoice = yield prisma_1.prisma.invoice.create({
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
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'INVOICE_CREATED',
            entityType: 'Invoice',
            entityId: invoice.id,
            description: `Created invoice ${invoiceNumber} for ${invoice.student.firstName} ${invoice.student.lastName}`,
            amount: totalAmount,
            branchId: user.branchId,
        });
        res.status(201).json(invoice);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});
exports.createInvoice = createInvoice;
const sendInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const invoice = yield prisma_1.prisma.invoice.findUnique({
            where: { id: req.params.id },
            include: { student: true },
        });
        if (!invoice)
            return res.status(404).json({ error: 'Invoice not found' });
        const updated = yield prisma_1.prisma.invoice.update({
            where: { id: req.params.id },
            data: {
                status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
                sentAt: new Date(),
            },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'INVOICE_SENT',
            entityType: 'Invoice',
            entityId: invoice.id,
            description: `Sent invoice ${invoice.invoiceNumber} to ${invoice.student.guardianEmail || 'parent'}`,
            amount: Number(invoice.totalAmount),
            branchId: user.branchId,
        });
        // Create accounting journal entry (Accounts Receivable)
        (0, accountingBridge_1.onInvoiceSent)(invoice.id, user.userId).catch(err => console.error('Background invoice journal creation failed:', err));
        res.json({ message: 'Invoice sent', invoice: updated });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to send invoice' });
    }
});
exports.sendInvoice = sendInvoice;
const recordInvoicePayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { amount } = zod_1.z.object({ amount: zod_1.z.number().positive() }).parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const invoice = yield prisma_1.prisma.invoice.findUnique({ where: { id: req.params.id } });
        if (!invoice)
            return res.status(404).json({ error: 'Invoice not found' });
        const newAmountPaid = Number(invoice.amountPaid) + amount;
        const newBalanceDue = Number(invoice.totalAmount) - newAmountPaid;
        let newStatus = invoice.status;
        if (newBalanceDue <= 0) {
            newStatus = 'PAID';
        }
        else if (newAmountPaid > 0) {
            newStatus = 'PARTIALLY_PAID';
        }
        const updated = yield prisma_1.prisma.invoice.update({
            where: { id: req.params.id },
            data: {
                amountPaid: newAmountPaid,
                balanceDue: Math.max(0, newBalanceDue),
                status: newStatus,
                paidAt: newStatus === 'PAID' ? new Date() : null,
            },
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to record payment' });
    }
});
exports.recordInvoicePayment = recordInvoicePayment;
const cancelInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const invoice = yield prisma_1.prisma.invoice.findUnique({ where: { id: req.params.id } });
        if (!invoice)
            return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status === 'PAID')
            return res.status(400).json({ error: 'Cannot cancel a paid invoice' });
        const updated = yield prisma_1.prisma.invoice.update({
            where: { id: req.params.id },
            data: { status: 'CANCELLED' },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'INVOICE_CANCELLED',
            entityType: 'Invoice',
            entityId: invoice.id,
            description: `Cancelled invoice ${invoice.invoiceNumber}`,
            amount: Number(invoice.totalAmount),
            branchId: user.branchId,
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to cancel invoice' });
    }
});
exports.cancelInvoice = cancelInvoice;
const generateStudentInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { termId, classId } = zod_1.z.object({
            termId: zod_1.z.string().uuid(),
            classId: zod_1.z.string().uuid().optional(),
        }).parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const branchFilter = user.role === 'SUPER_ADMIN' ? {} : { branchId: user.branchId };
        const classFilter = classId ? { classId } : {};
        // Get students with fee structures for this term
        const students = yield prisma_1.prisma.student.findMany({
            where: Object.assign(Object.assign({ status: 'ACTIVE' }, branchFilter), classFilter),
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
            if (student.feeStructures.length === 0)
                continue;
            // Check if invoice already exists for this term
            const existing = yield prisma_1.prisma.invoice.findFirst({
                where: {
                    studentId: student.id,
                    termId,
                    status: { notIn: ['CANCELLED'] },
                },
            });
            if (existing)
                continue;
            const invoiceNumber = yield (0, accountingService_1.generateSequenceNumber)('INV', user.branchId);
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
            yield prisma_1.prisma.invoice.create({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Generate invoices error:', error);
        res.status(500).json({ error: 'Failed to generate invoices' });
    }
});
exports.generateStudentInvoices = generateStudentInvoices;
// Credit Note
const createCreditNote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { invoiceId, amount, reason } = zod_1.z.object({
            invoiceId: zod_1.z.string().uuid(),
            amount: zod_1.z.number().positive(),
            reason: zod_1.z.string().min(3),
        }).parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const invoice = yield prisma_1.prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice)
            return res.status(404).json({ error: 'Invoice not found' });
        if (amount > Number(invoice.balanceDue)) {
            return res.status(400).json({ error: 'Credit note amount exceeds balance due' });
        }
        const creditNoteNumber = yield (0, accountingService_1.generateSequenceNumber)('CN', user.branchId);
        const creditNote = yield prisma_1.prisma.creditNote.create({
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
        yield prisma_1.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                balanceDue: newBalance,
                status: newBalance <= 0 ? 'CREDITED' : invoice.status,
            },
        });
        res.status(201).json(creditNote);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to create credit note' });
    }
});
exports.createCreditNote = createCreditNote;
const getInvoiceSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const [total, paid, overdue, draft, partiallyPaid] = yield Promise.all([
            prisma_1.prisma.invoice.aggregate({ where: Object.assign(Object.assign({}, branchFilter), { status: { notIn: ['CANCELLED'] } }), _sum: { totalAmount: true }, _count: true }),
            prisma_1.prisma.invoice.aggregate({ where: Object.assign(Object.assign({}, branchFilter), { status: 'PAID' }), _sum: { totalAmount: true }, _count: true }),
            prisma_1.prisma.invoice.aggregate({ where: Object.assign(Object.assign({}, branchFilter), { status: 'OVERDUE' }), _sum: { balanceDue: true }, _count: true }),
            prisma_1.prisma.invoice.count({ where: Object.assign(Object.assign({}, branchFilter), { status: 'DRAFT' }) }),
            prisma_1.prisma.invoice.aggregate({ where: Object.assign(Object.assign({}, branchFilter), { status: 'PARTIALLY_PAID' }), _sum: { balanceDue: true }, _count: true }),
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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get invoice summary' });
    }
});
exports.getInvoiceSummary = getInvoiceSummary;
