import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendNotification, generatePaymentReceiptEmail } from '../services/notificationService';
import { activateSubscriptionFromPayment } from './subscriptionController';
import { createAuditLog, AuditAction } from '../services/auditService';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Verify Lenco webhook signature
 * Lenco sends a signature in the X-Lenco-Signature header
 */
const verifyLencoSignature = (payload: string, signature: string | undefined): boolean => {
    const webhookSecret = process.env.LENCO_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
        console.warn('LENCO_WEBHOOK_SECRET not configured - skipping signature verification');
        return true; // Allow in dev if not configured
    }

    if (!signature) {
        console.error('Webhook Error: No signature provided');
        return false;
    }

    // Calculate expected signature
    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
};

// This controller specifically handles Lenco Webhooks
export const handleLencoWebhook = async (req: Request, res: Response) => {
    try {
        // Verify webhook signature
        const signature = req.headers['x-lenco-signature'] as string;
        const rawBody = JSON.stringify(req.body);
        
        if (!verifyLencoSignature(rawBody, signature)) {
            console.error('Webhook Error: Invalid signature');
            return res.status(401).send('Invalid signature');
        }

        const event = req.body;

        // Log the incoming event for debugging
        console.log('Received Lenco Webhook:', JSON.stringify(event, null, 2));

        // Lenco structure: { status: boolean, data: { ... status: "successful", reference: "...", ... } }
        const data = event.data || event;
        const status = data.status; // "successful" | "failed"
        const reference = data.reference;

        if (!reference) {
            console.error('Webhook Error: No reference found in payload');
            return res.status(400).send('No reference provided');
        }

        // Determine payment type based on reference prefix
        if (reference.startsWith('SUB-')) {
            // Handle Subscription Payment
            await handleSubscriptionPaymentWebhook(reference, status, res);
        } else if (reference.startsWith('TXN-')) {
            // Handle Student Fee Payment
            await handleStudentPaymentWebhook(reference, status, res);
        } else {
            console.error(`Webhook Error: Unknown reference format: ${reference}`);
            return res.status(400).send('Unknown reference format');
        }

    } catch (error) {
        console.error('Webhook Handler Error:', error);
        res.status(500).send('Internal Server Error');
    }
};

/**
 * Handle subscription payment webhook
 */
const handleSubscriptionPaymentWebhook = async (reference: string, status: string, res: Response) => {
    const payment = await prisma.subscriptionPayment.findFirst({
        where: { externalRef: reference },
        include: { plan: true, tenant: true }
    });

    if (!payment) {
        console.error(`Webhook Error: Subscription payment with reference ${reference} not found`);
        return res.status(404).send('Subscription payment not found');
    }

    // Idempotency Check
    if (payment.status === 'COMPLETED') {
        return res.status(200).send('Payment already processed');
    }

    if (status === 'successful') {
        try {
            // Use the helper to activate the subscription
            await activateSubscriptionFromPayment(payment.id);
            console.log(`Subscription payment ${reference} marked as COMPLETED. Tenant ${payment.tenantId} upgraded to ${payment.plan.tier}.`);
        } catch (err) {
            console.error('Failed to activate subscription:', err);
            return res.status(500).send('Failed to activate subscription');
        }
    } else if (status === 'failed') {
        await prisma.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
                status: 'FAILED',
                failureReason: 'Payment failed via mobile money'
            }
        });
        console.log(`Subscription payment ${reference} marked as FAILED.`);
    }

    res.status(200).send('Webhook received');
};

/**
 * Handle student fee payment webhook
 */
const handleStudentPaymentWebhook = async (transactionId: string, status: string, res: Response) => {
    const payment = await prisma.payment.findUnique({
        where: { transactionId },
        include: {
            student: {
                select: {
                    firstName: true,
                    lastName: true,
                    guardianEmail: true,
                    guardianPhone: true,
                    guardianName: true,
                    parent: { select: { email: true, fullName: true } }
                }
            },
            tenant: { select: { name: true } }
        }
    });

    if (!payment) {
        console.error(`Webhook Error: Payment with transactionId ${transactionId} not found`);
        return res.status(404).send('Payment not found');
    }

    // Idempotency Check
    // @ts-ignore
    if (payment.status === 'COMPLETED') {
        return res.status(200).send('Payment already processed');
    }

    if (status === 'successful') {
        // Update Database Status
        await prisma.payment.update({
            where: { id: payment.id },
            // @ts-ignore
            data: { 
                status: 'COMPLETED', 
                paymentDate: new Date(),
                mobileMoneyConfirmedAt: new Date()
            }
        });

        // Audit log the successful payment confirmation
        await createAuditLog({
            tenantId: payment.tenantId,
            userId: 'SYSTEM',
            action: AuditAction.PAYMENT,
            entityType: 'Payment',
            entityId: payment.id,
            newValue: {
                transactionId,
                status: 'COMPLETED',
                confirmedVia: 'webhook',
                amount: payment.amount,
            },
            metadata: { source: 'lenco_webhook' }
        });

        console.log(`Payment ${transactionId} marked as COMPLETED.`);

        // Send Receipt
        try {
            const guardianName = payment.student.parent?.fullName || payment.student.guardianName || 'Parent';
            const parentEmail = payment.student.parent?.email || payment.student.guardianEmail;
            const parentPhone = payment.student.guardianPhone;
            const schoolName = payment.tenant.name;

            if (parentEmail || parentPhone) {
                const { subject, text, html, sms } = generatePaymentReceiptEmail(
                    guardianName,
                    `${payment.student.firstName} ${payment.student.lastName}`,
                    Number(payment.amount),
                    new Date(),
                    payment.method,
                    transactionId,
                    schoolName
                );

                await sendNotification(
                    payment.tenantId,
                    parentEmail || undefined,
                    parentPhone || undefined,
                    subject,
                    text,
                    html,
                    sms
                );
                console.log(`Receipt sent for verified payment ${transactionId}`);
            }
        } catch (notifyErr) {
            console.error('Failed to send receipt for webhook payment:', notifyErr);
        }

    } else if (status === 'failed') {
        await prisma.payment.update({
            where: { id: payment.id },
            // @ts-ignore
            data: { status: 'FAILED' }
        });
        console.log(`Payment ${transactionId} marked as FAILED.`);
    }

    res.status(200).send('Webhook received');
};
