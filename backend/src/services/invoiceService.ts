/**
 * Invoice Generation Service
 * 
 * Generates PDF invoices for subscription payments using PDFKit
 * Install: npm install pdfkit @types/pdfkit
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface InvoiceData {
    invoiceNumber: string;
    date: Date;
    dueDate?: Date;
    school: {
        name: string;
        address?: string;
        email: string;
        phone?: string;
    };
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        amount: number;
    }>;
    subtotal: number;
    tax?: number;
    total: number;
    currency: string;
    notes?: string;
    paymentMethod?: string;
    paidAt?: Date;
}

/**
 * Generate PDF invoice buffer
 */
export const generateInvoicePDF = async (data: InvoiceData): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        try {
            // Check if PDFKit is installed
            let PDFDocument;
            try {
                PDFDocument = require('pdfkit');
            } catch (error) {
                throw new Error('PDFKit not installed. Install with: npm install pdfkit @types/pdfkit');
            }

            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Colors
            const primaryColor = '#2563eb';
            const secondaryColor = '#64748b';
            const accentColor = '#f59e0b';

            // Header
            doc.fontSize(28)
                .fillColor(primaryColor)
                .text('INVOICE', 50, 50, { align: 'left' });

            doc.fontSize(10)
                .fillColor(secondaryColor)
                .text(`Invoice #${data.invoiceNumber}`, 50, 85)
                .text(`Date: ${data.date.toLocaleDateString()}`, 50, 100);

            if (data.dueDate) {
                doc.text(`Due Date: ${data.dueDate.toLocaleDateString()}`, 50, 115);
            }

            // Status badge if paid
            if (data.paidAt) {
                doc.fontSize(12)
                    .fillColor('#059669')
                    .text('✓ PAID', 500, 50, { align: 'right' });
                doc.fontSize(9)
                    .fillColor(secondaryColor)
                    .text(`Paid on ${data.paidAt.toLocaleDateString()}`, 450, 70, { align: 'right' });
            }

            // Platform info (top right)
            doc.fontSize(10)
                .fillColor('#1e293b')
                .text('Sync School Management', 400, 100, { align: 'right' })
                .fillColor(secondaryColor)
                .fontSize(9)
                .text('Platform Subscription', 400, 115, { align: 'right' });

            // Horizontal line
            doc.moveTo(50, 150)
                .lineTo(550, 150)
                .strokeColor('#e2e8f0')
                .stroke();

            // Bill To section
            doc.fontSize(12)
                .fillColor(primaryColor)
                .text('BILL TO:', 50, 170);

            doc.fontSize(11)
                .fillColor('#1e293b')
                .text(data.school.name, 50, 190);

            let yPos = 205;
            if (data.school.address) {
                doc.fontSize(9)
                    .fillColor(secondaryColor)
                    .text(data.school.address, 50, yPos);
                yPos += 15;
            }

            doc.text(data.school.email, 50, yPos);
            yPos += 15;

            if (data.school.phone) {
                doc.text(data.school.phone, 50, yPos);
                yPos += 15;
            }

            // Items table
            yPos += 20;
            const tableTop = yPos;

            // Table header
            doc.fontSize(10)
                .fillColor('#ffffff')
                .rect(50, tableTop, 500, 25)
                .fill(primaryColor);

            doc.fillColor('#ffffff')
                .text('Description', 60, tableTop + 8, { width: 250 })
                .text('Qty', 320, tableTop + 8, { width: 50, align: 'center' })
                .text('Unit Price', 380, tableTop + 8, { width: 80, align: 'right' })
                .text('Amount', 470, tableTop + 8, { width: 70, align: 'right' });

            // Table rows
            yPos = tableTop + 35;
            doc.fillColor('#1e293b');

            data.items.forEach((item, index) => {
                const rowBg = index % 2 === 0 ? '#f8fafc' : '#ffffff';
                doc.rect(50, yPos - 5, 500, 25).fill(rowBg);

                doc.fontSize(9)
                    .fillColor('#1e293b')
                    .text(item.description, 60, yPos, { width: 250 })
                    .text(item.quantity.toString(), 320, yPos, { width: 50, align: 'center' })
                    .text(`${data.currency} ${item.unitPrice.toLocaleString()}`, 380, yPos, { width: 80, align: 'right' })
                    .text(`${data.currency} ${item.amount.toLocaleString()}`, 470, yPos, { width: 70, align: 'right' });

                yPos += 25;
            });

            // Totals section
            yPos += 20;
            const totalsX = 380;

            doc.fontSize(9)
                .fillColor(secondaryColor)
                .text('Subtotal:', totalsX, yPos, { width: 90, align: 'left' })
                .fillColor('#1e293b')
                .text(`${data.currency} ${data.subtotal.toLocaleString()}`, 470, yPos, { width: 70, align: 'right' });

            if (data.tax && data.tax > 0) {
                yPos += 20;
                doc.fillColor(secondaryColor)
                    .text('Tax:', totalsX, yPos, { width: 90, align: 'left' })
                    .fillColor('#1e293b')
                    .text(`${data.currency} ${data.tax.toLocaleString()}`, 470, yPos, { width: 70, align: 'right' });
            }

            // Total line
            yPos += 15;
            doc.moveTo(380, yPos)
                .lineTo(550, yPos)
                .strokeColor('#e2e8f0')
                .stroke();

            yPos += 10;
            doc.fontSize(12)
                .fillColor(primaryColor)
                .text('TOTAL:', totalsX, yPos, { width: 90, align: 'left' })
                .fontSize(14)
                .text(`${data.currency} ${data.total.toLocaleString()}`, 470, yPos, { width: 70, align: 'right' });

            // Payment method
            if (data.paymentMethod) {
                yPos += 40;
                doc.fontSize(9)
                    .fillColor(secondaryColor)
                    .text(`Payment Method: ${data.paymentMethod}`, 50, yPos);
            }

            // Notes
            if (data.notes) {
                yPos += 40;
                doc.fontSize(10)
                    .fillColor(primaryColor)
                    .text('Notes:', 50, yPos);

                yPos += 20;
                doc.fontSize(9)
                    .fillColor(secondaryColor)
                    .text(data.notes, 50, yPos, { width: 500 });
            }

            // Footer
            const footerY = 750;
            doc.moveTo(50, footerY)
                .lineTo(550, footerY)
                .strokeColor('#e2e8f0')
                .stroke();

            doc.fontSize(8)
                .fillColor(secondaryColor)
                .text('Thank you for your business!', 50, footerY + 15, { align: 'center', width: 500 })
                .text('Sync School Management Platform', 50, footerY + 30, { align: 'center', width: 500 });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

/**
 * Generate invoice for subscription payment
 */
export const generateSubscriptionInvoice = async (paymentId: string): Promise<Buffer> => {
    const payment = await prisma.subscriptionPayment.findUnique({
        where: { id: paymentId },
        include: {
            tenant: true,
            plan: true,
        },
    });

    if (!payment) {
        throw new Error('Payment not found');
    }

    const items: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = [
        {
            description: `${payment.plan.name} Plan - ${payment.billingCycle}`,
            quantity: 1,
            unitPrice: Number(payment.baseAmount),
            amount: Number(payment.baseAmount),
        },
    ];

    if (payment.overageStudents > 0) {
        items.push({
            description: `Additional Students (${payment.overageStudents} students)`,
            quantity: payment.overageStudents,
            unitPrice: Number(payment.overageAmount) / payment.overageStudents,
            amount: Number(payment.overageAmount),
        });
    }

    const invoiceData: InvoiceData = {
        invoiceNumber: payment.receiptNumber || `INV-${payment.id.substring(0, 8).toUpperCase()}`,
        date: payment.createdAt,
        dueDate: payment.periodEnd,
        school: {
            name: payment.tenant.name,
            address: payment.tenant.address || undefined,
            email: payment.tenant.email,
            phone: payment.tenant.phone || undefined,
        },
        items,
        subtotal: Number(payment.totalAmount),
        total: Number(payment.totalAmount),
        currency: payment.currency,
        notes: `Subscription period: ${payment.periodStart.toLocaleDateString()} - ${payment.periodEnd.toLocaleDateString()}`,
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt || undefined,
    };

    return generateInvoicePDF(invoiceData);
};

/**
 * Save invoice to file system
 */
export const saveInvoiceToFile = async (paymentId: string, outputDir: string = './invoices'): Promise<string> => {
    const pdfBuffer = await generateSubscriptionInvoice(paymentId);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `invoice-${paymentId}.pdf`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, pdfBuffer);

    return filepath;
};

export default {
    generateInvoicePDF,
    generateSubscriptionInvoice,
    saveInvoiceToFile,
};
