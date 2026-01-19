import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

const prisma = new PrismaClient();

// ==========================================
// INVOICE MANAGEMENT
// ==========================================

/**
 * Get all invoices with filters
 */
export const getAllInvoices = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;
        const tenantId = req.query.tenantId as string;
        const search = req.query.search as string;

        const where: any = {};
        if (status) where.status = status;
        if (tenantId) where.tenantId = tenantId;
        if (search) {
            where.OR = [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                { tenant: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [invoices, total] = await Promise.all([
            prisma.invoice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { name: true, slug: true, email: true } },
                    items: true,
                    payments: true,
                },
            }),
            prisma.invoice.count({ where }),
        ]);

        res.json({
            invoices: invoices.map(inv => ({
                ...inv,
                subtotal: Number(inv.subtotal),
                taxAmount: Number(inv.taxAmount),
                discountAmount: Number(inv.discountAmount),
                totalAmount: Number(inv.totalAmount),
                paidAmount: Number(inv.paidAmount),
                balanceAmount: Number(inv.balanceAmount),
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
};

/**
 * Generate invoice for subscription payment
 */
export const generateInvoiceForSubscription = async (req: Request, res: Response) => {
    try {
        const { subscriptionPaymentId } = req.body;

        const payment = await prisma.subscriptionPayment.findUnique({
            where: { id: subscriptionPaymentId },
            include: {
                tenant: true,
                plan: true,
            },
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Check if invoice already exists
        const existingInvoice = await prisma.invoice.findFirst({
            where: { subscriptionPaymentId },
        });

        if (existingInvoice) {
            return res.status(400).json({ error: 'Invoice already exists for this payment' });
        }

        // Generate invoice number
        const year = new Date().getFullYear();
        const count = await prisma.invoice.count({
            where: {
                invoiceNumber: { startsWith: `INV-${year}` },
            },
        });
        const invoiceNumber = `INV-${year}-${String(count + 1).padStart(6, '0')}`;

        // Calculate due date (30 days from issue)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        // Create invoice
        const invoice = await prisma.invoice.create({
            data: {
                tenantId: payment.tenantId,
                invoiceNumber,
                invoiceType: 'SUBSCRIPTION',
                status: payment.status === 'COMPLETED' ? 'PAID' : 'SENT',
                subtotal: payment.baseAmount,
                taxAmount: 0,
                discountAmount: 0,
                totalAmount: payment.totalAmount,
                paidAmount: payment.status === 'COMPLETED' ? payment.totalAmount : 0,
                balanceAmount: payment.status === 'COMPLETED' ? 0 : payment.totalAmount,
                currency: payment.currency,
                dueDate,
                paidDate: payment.paidAt,
                subscriptionPaymentId: payment.id,
                items: {
                    create: [
                        {
                            description: `${payment.plan.name} Plan - ${payment.billingCycle}`,
                            quantity: 1,
                            unitPrice: payment.baseAmount,
                            amount: payment.baseAmount,
                        },
                        ...(payment.overageStudents > 0 ? [{
                            description: `Additional Students (${payment.overageStudents} students)`,
                            quantity: payment.overageStudents,
                            unitPrice: payment.overageAmount.div(payment.overageStudents),
                            amount: payment.overageAmount,
                        }] : []),
                    ],
                },
            },
            include: {
                items: true,
                tenant: true,
            },
        });

        res.status(201).json({ message: 'Invoice generated', invoice });
    } catch (error) {
        console.error('Generate invoice error:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
};

/**
 * Generate invoice PDF
 */
export const generateInvoicePDF = async (req: Request, res: Response) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                tenant: true,
                items: true,
                payments: true,
            },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
            res.send(pdfBuffer);
        });

        // Header
        doc.fontSize(20).text('INVOICE', { align: 'center' });
        doc.moveDown();

        // Company info
        doc.fontSize(10);
        doc.text('Sync School Management', { align: 'left' });
        doc.text('Platform Admin', { align: 'left' });
        doc.moveDown();

        // Invoice details
        doc.fontSize(12).text(`Invoice #: ${invoice.invoiceNumber}`);
        doc.fontSize(10);
        doc.text(`Issue Date: ${invoice.issueDate.toLocaleDateString()}`);
        doc.text(`Due Date: ${invoice.dueDate.toLocaleDateString()}`);
        doc.text(`Status: ${invoice.status}`);
        doc.moveDown();

        // Bill to
        doc.fontSize(12).text('Bill To:');
        doc.fontSize(10);
        doc.text(invoice.tenant.name);
        doc.text(invoice.tenant.email);
        doc.moveDown();

        // Items table
        doc.fontSize(12).text('Items:');
        doc.moveDown(0.5);

        // Table header
        const tableTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Description', 50, tableTop);
        doc.text('Qty', 300, tableTop);
        doc.text('Unit Price', 350, tableTop);
        doc.text('Amount', 450, tableTop, { align: 'right' });

        // Table rows
        doc.font('Helvetica');
        let yPosition = tableTop + 20;
        invoice.items.forEach((item) => {
            doc.text(item.description, 50, yPosition);
            doc.text(item.quantity.toString(), 300, yPosition);
            doc.text(`${invoice.currency} ${Number(item.unitPrice).toFixed(2)}`, 350, yPosition);
            doc.text(`${invoice.currency} ${Number(item.amount).toFixed(2)}`, 450, yPosition, { align: 'right' });
            yPosition += 20;
        });

        // Totals
        yPosition += 20;
        doc.font('Helvetica-Bold');
        doc.text('Subtotal:', 350, yPosition);
        doc.text(`${invoice.currency} ${Number(invoice.subtotal).toFixed(2)}`, 450, yPosition, { align: 'right' });
        
        yPosition += 20;
        doc.text('Tax:', 350, yPosition);
        doc.text(`${invoice.currency} ${Number(invoice.taxAmount).toFixed(2)}`, 450, yPosition, { align: 'right' });
        
        yPosition += 20;
        doc.text('Discount:', 350, yPosition);
        doc.text(`${invoice.currency} ${Number(invoice.discountAmount).toFixed(2)}`, 450, yPosition, { align: 'right' });
        
        yPosition += 20;
        doc.fontSize(12);
        doc.text('Total:', 350, yPosition);
        doc.text(`${invoice.currency} ${Number(invoice.totalAmount).toFixed(2)}`, 450, yPosition, { align: 'right' });
        
        yPosition += 20;
        doc.text('Paid:', 350, yPosition);
        doc.text(`${invoice.currency} ${Number(invoice.paidAmount).toFixed(2)}`, 450, yPosition, { align: 'right' });
        
        yPosition += 20;
        doc.text('Balance:', 350, yPosition);
        doc.text(`${invoice.currency} ${Number(invoice.balanceAmount).toFixed(2)}`, 450, yPosition, { align: 'right' });

        // Footer
        doc.fontSize(10).font('Helvetica');
        doc.moveDown(3);
        doc.text('Thank you for your business!', { align: 'center' });

        doc.end();
    } catch (error) {
        console.error('Generate PDF error:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
};

/**
 * Send invoice reminder
 */
export const sendInvoiceReminder = async (req: Request, res: Response) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { tenant: true },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Update reminder count
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                remindersSent: { increment: 1 },
                lastReminderAt: new Date(),
            },
        });

        // TODO: Send email reminder
        console.log(`📧 Sending invoice reminder to ${invoice.tenant.email}`);

        res.json({ message: 'Reminder sent successfully' });
    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
};

/**
 * Bulk generate invoices for pending payments
 */
export const bulkGenerateInvoices = async (req: Request, res: Response) => {
    try {
        // Find all completed payments without invoices
        const paymentsWithoutInvoices = await prisma.subscriptionPayment.findMany({
            where: {
                status: 'COMPLETED',
                invoice: null,
            },
            include: {
                tenant: true,
                plan: true,
            },
            take: 100, // Limit to 100 at a time
        });

        const results = [];

        for (const payment of paymentsWithoutInvoices) {
            try {
                // Generate invoice number
                const year = new Date().getFullYear();
                const count = await prisma.invoice.count({
                    where: {
                        invoiceNumber: { startsWith: `INV-${year}` },
                    },
                });
                const invoiceNumber = `INV-${year}-${String(count + 1).padStart(6, '0')}`;

                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30);

                const invoice = await prisma.invoice.create({
                    data: {
                        tenantId: payment.tenantId,
                        invoiceNumber,
                        invoiceType: 'SUBSCRIPTION',
                        status: 'PAID',
                        subtotal: payment.baseAmount,
                        taxAmount: 0,
                        discountAmount: 0,
                        totalAmount: payment.totalAmount,
                        paidAmount: payment.totalAmount,
                        balanceAmount: 0,
                        currency: payment.currency,
                        dueDate,
                        paidDate: payment.paidAt,
                        subscriptionPaymentId: payment.id,
                        items: {
                            create: [
                                {
                                    description: `${payment.plan.name} Plan - ${payment.billingCycle}`,
                                    quantity: 1,
                                    unitPrice: payment.baseAmount,
                                    amount: payment.baseAmount,
                                },
                            ],
                        },
                    },
                });

                results.push({ success: true, invoiceNumber: invoice.invoiceNumber, paymentId: payment.id });
            } catch (error: any) {
                results.push({ success: false, error: error.message, paymentId: payment.id });
            }
        }

        res.json({
            message: `Generated ${results.filter(r => r.success).length} invoices`,
            total: results.length,
            results,
        });
    } catch (error) {
        console.error('Bulk generate invoices error:', error);
        res.status(500).json({ error: 'Failed to bulk generate invoices' });
    }
};

// ==========================================
// REVENUE RECONCILIATION
// ==========================================

/**
 * Get reconciliation dashboard
 */
export const getReconciliationDashboard = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, tenantId } = req.query;

        const where: any = {};
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string),
            };
        }
        if (tenantId) where.tenantId = tenantId;

        // Get invoice summary
        const invoices = await prisma.invoice.groupBy({
            by: ['status'],
            where,
            _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
            _count: true,
        });

        // Get payment summary
        const payments = await prisma.subscriptionPayment.groupBy({
            by: ['status'],
            where,
            _sum: { totalAmount: true },
            _count: true,
        });

        // Get overdue invoices
        const overdueInvoices = await prisma.invoice.findMany({
            where: {
                ...where,
                status: { in: ['SENT', 'OVERDUE'] },
                dueDate: { lt: new Date() },
            },
            include: {
                tenant: { select: { name: true, email: true } },
            },
            take: 10,
        });

        // Get missing payment alerts
        const missingPayments = await prisma.missingPaymentAlert.findMany({
            where: {
                ...where,
                resolved: false,
            },
            include: {
                tenant: { select: { name: true } },
            },
            orderBy: { severity: 'desc' },
            take: 10,
        });

        res.json({
            invoiceSummary: invoices.reduce((acc, inv) => {
                acc[inv.status] = {
                    count: inv._count,
                    totalAmount: Number(inv._sum.totalAmount || 0),
                    paidAmount: Number(inv._sum.paidAmount || 0),
                    balanceAmount: Number(inv._sum.balanceAmount || 0),
                };
                return acc;
            }, {} as Record<string, any>),
            paymentSummary: payments.reduce((acc, pay) => {
                acc[pay.status] = {
                    count: pay._count,
                    totalAmount: Number(pay._sum.totalAmount || 0),
                };
                return acc;
            }, {} as Record<string, any>),
            overdueInvoices: overdueInvoices.map(inv => ({
                ...inv,
                totalAmount: Number(inv.totalAmount),
                balanceAmount: Number(inv.balanceAmount),
            })),
            missingPayments: missingPayments.map(alert => ({
                ...alert,
                expectedAmount: Number(alert.expectedAmount),
            })),
        });
    } catch (error) {
        console.error('Get reconciliation dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch reconciliation data' });
    }
};

/**
 * Run reconciliation for a period
 */
export const runReconciliation = async (req: Request, res: Response) => {
    try {
        const { periodStart, periodEnd, tenantId } = req.body;
        const platformUserId = (req as any).platformUser?.userId;

        const where: any = {
            createdAt: {
                gte: new Date(periodStart),
                lte: new Date(periodEnd),
            },
        };
        if (tenantId) where.tenantId = tenantId;

        // Get all invoices for period
        const invoices = await prisma.invoice.findMany({ where });

        // Calculate totals
        const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
        const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0);
        const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balanceAmount), 0);
        
        const overdueInvoices = invoices.filter(inv => 
            inv.status !== 'PAID' && inv.dueDate < new Date()
        );
        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.balanceAmount), 0);

        // Create reconciliation record
        const reconciliation = await prisma.paymentReconciliation.create({
            data: {
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                tenantId: tenantId || null,
                totalInvoiced,
                totalPaid,
                totalOutstanding,
                totalOverdue,
                invoiceCount: invoices.length,
                paidInvoiceCount: invoices.filter(inv => inv.status === 'PAID').length,
                overdueInvoiceCount: overdueInvoices.length,
                status: 'COMPLETED',
                performedBy: platformUserId,
                completedAt: new Date(),
            },
        });

        res.json({ message: 'Reconciliation completed', reconciliation });
    } catch (error) {
        console.error('Run reconciliation error:', error);
        res.status(500).json({ error: 'Failed to run reconciliation' });
    }
};

/**
 * Get reconciliation history
 */
export const getReconciliationHistory = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [reconciliations, total] = await Promise.all([
            prisma.paymentReconciliation.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { name: true } },
                },
            }),
            prisma.paymentReconciliation.count(),
        ]);

        res.json({
            reconciliations: reconciliations.map(rec => ({
                ...rec,
                totalInvoiced: Number(rec.totalInvoiced),
                totalPaid: Number(rec.totalPaid),
                totalOutstanding: Number(rec.totalOutstanding),
                totalOverdue: Number(rec.totalOverdue),
                discrepancyAmount: Number(rec.discrepancyAmount),
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get reconciliation history error:', error);
        res.status(500).json({ error: 'Failed to fetch reconciliation history' });
    }
};

/**
 * Export financial report
 */
export const exportFinancialReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, tenantId } = req.query;

        const where: any = {
            createdAt: {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string),
            },
        };
        if (tenantId) where.tenantId = tenantId;

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                tenant: { select: { name: true, email: true } },
                items: true,
                payments: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Generate CSV
        const headers = [
            'Invoice Number',
            'Tenant',
            'Issue Date',
            'Due Date',
            'Status',
            'Subtotal',
            'Tax',
            'Discount',
            'Total',
            'Paid',
            'Balance',
            'Currency',
        ];

        const rows = invoices.map(inv => [
            inv.invoiceNumber,
            inv.tenant.name,
            inv.issueDate.toLocaleDateString(),
            inv.dueDate.toLocaleDateString(),
            inv.status,
            Number(inv.subtotal).toFixed(2),
            Number(inv.taxAmount).toFixed(2),
            Number(inv.discountAmount).toFixed(2),
            Number(inv.totalAmount).toFixed(2),
            Number(inv.paidAmount).toFixed(2),
            Number(inv.balanceAmount).toFixed(2),
            inv.currency,
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=financial-report-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export financial report error:', error);
        res.status(500).json({ error: 'Failed to export report' });
    }
};
