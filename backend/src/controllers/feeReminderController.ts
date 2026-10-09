import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { getTermStudentBalances } from '../services/termFinancialService';
import {
    sendNotification,
    generatePaymentReceiptEmail,
    generateFeeReminderEmail
} from '../services/notificationService';

const getBranchScope = (req: Request): string | undefined => {
    const user = (req as any).user;
    return user?.role !== 'SUPER_ADMIN' ? user?.branchId : (req.query.branchId as string | undefined);
};

// Send payment receipt notification
export const sendPaymentReceipt = async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;

        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                student: true,
            },
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const settings = await prisma.schoolSettings.findFirst();
        const schoolName = settings?.schoolName || 'School';

        const guardianName = payment.student.guardianName || 'Parent';

        const { subject, text, html, sms } = generatePaymentReceiptEmail(
            guardianName,
            `${payment.student.firstName} ${payment.student.lastName}`,
            Number(payment.amount),
            payment.paymentDate,
            payment.method,
            payment.transactionId || payment.id.substring(0, 8).toUpperCase(),
            schoolName
        );

        const result = await sendNotification(
            payment.student.guardianEmail ?? undefined,
            payment.student.guardianPhone ?? undefined,
            subject,
            text,
            html,
            sms
        );

        res.json({
            success: true,
            emailSent: result.emailSent,
            smsSent: result.smsSent,
            message: 'Payment receipt notification sent',
        });
    } catch (error) {
        console.error('Send payment receipt error:', error);
        res.status(500).json({ error: 'Failed to send payment receipt' });
    }
};

// Send fee reminders to students with outstanding fees
export const sendFeeReminders = async (req: Request, res: Response) => {
    try {
        const { studentIds, isOverdue = false, academicTermId } = req.body;
        if (!academicTermId || typeof academicTermId !== 'string') {
            return res.status(400).json({ error: 'academicTermId is required' });
        }

        const settings = await prisma.schoolSettings.findFirst();
        const schoolName = settings?.schoolName || 'School';

        const balances = await getTermStudentBalances(
            academicTermId,
            getBranchScope(req),
            Array.isArray(studentIds) ? studentIds : undefined
        );
        const studentsWithBalances = balances.filter(student => student.balance > 0);

        const results = {
            total: studentsWithBalances.length,
            delivered: 0,
            emailsSent: 0,
            smsSent: 0,
            failed: 0,
            noContact: 0,
            details: [] as { studentId: string; studentName: string; status: 'SENT' | 'FAILED' | 'NO_CONTACT'; reason?: string }[],
        };

        for (const student of studentsWithBalances) {
            const { subject, text, html } = generateFeeReminderEmail(
                `${student.firstName} ${student.lastName}`,
                student.balance,
                student.earliestDueDate,
                schoolName,
                isOverdue
            );

            try {
                const studentName = `${student.firstName} ${student.lastName}`;
                const hasEmail = Boolean(student.guardianEmail);
                const hasPhone = Boolean(student.guardianPhone);

                if (!hasEmail && !hasPhone) {
                    results.failed++;
                    results.noContact++;
                    results.details.push({
                        studentId: student.id,
                        studentName,
                        status: 'NO_CONTACT',
                        reason: 'Guardian contact information unavailable',
                    });
                    continue;
                }

                const result = await sendNotification(
                    student.guardianEmail ?? undefined,
                    student.guardianPhone ?? undefined,
                    subject,
                    text,
                    html
                );

                if (result.emailSent) results.emailsSent++;
                if (result.smsSent) results.smsSent++;
                if (result.emailSent || result.smsSent) {
                    results.delivered++;
                    results.details.push({
                        studentId: student.id,
                        studentName,
                        status: 'SENT',
                    });
                } else {
                    results.failed++;
                    results.details.push({
                        studentId: student.id,
                        studentName,
                        status: 'FAILED',
                        reason: 'Delivery unsuccessful. Please verify notification settings and communication logs.',
                    });
                }
            } catch (error) {
                console.error(`Failed to send reminder to ${student.id}:`, error);
                results.failed++;
                results.details.push({
                    studentId: student.id,
                    studentName: `${student.firstName} ${student.lastName}`,
                    status: 'FAILED',
                    reason: error instanceof Error ? error.message : 'Delivery error occurred',
                });
            }
        }

        const message = results.total === 0
            ? 'No students with outstanding fees matched the selected criteria.'
            : results.delivered === 0
                ? 'Fee reminders could not be delivered. Please verify SMTP/SMS configuration in Settings and ensure guardian contact information is complete.'
                : results.failed > 0
                    ? `Successfully delivered ${results.delivered} of ${results.total} fee reminders. ${results.failed} delivery attempt(s) failed.`
                    : `Successfully delivered ${results.delivered} fee reminder(s).`;

        res.json({
            success: results.delivered > 0,
            message,
            results,
        });
    } catch (error) {
        console.error('Send fee reminders error:', error);
        res.status(500).json({ error: 'Failed to send fee reminders' });
    }
};

// Get students with outstanding fees for reminder preview
export const getStudentsWithOutstandingFees = async (req: Request, res: Response) => {
    try {
        const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
        if (!academicTermId) {
            return res.status(400).json({ error: 'academicTermId is required' });
        }
        const balances = await getTermStudentBalances(academicTermId, getBranchScope(req));
        const now = new Date();
        const studentsWithBalances = balances
            .filter(student => student.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .map(student => ({
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNumber: student.admissionNumber,
                className: student.className,
                guardianName: student.guardianName,
                guardianEmail: student.guardianEmail,
                guardianPhone: student.guardianPhone,
                outstandingAmount: student.balance,
                earliestDueDate: student.earliestDueDate,
                isOverdue: Boolean(student.earliestDueDate && student.earliestDueDate < now),
                feeCount: student.feeCount,
            }));

        res.json(studentsWithBalances);
    } catch (error) {
        console.error('Get students with outstanding fees error:', error);
        res.status(500).json({ error: 'Failed to get students with outstanding fees' });
    }
};

// Test notification settings
export const testNotification = async (req: Request, res: Response) => {
    try {
        const { channel, recipient } = req.body;

        if (!channel || !recipient) {
            return res.status(400).json({ error: 'Channel and recipient are required' });
        }

        const settings = await prisma.schoolSettings.findFirst();
        const schoolName = settings?.schoolName || 'School';

        let result = { emailSent: false, smsSent: false };

        if (channel === 'email') {
            result = await sendNotification(
                recipient,
                undefined,
                `Test Email - ${schoolName}`,
                `This is a test email from ${schoolName} to verify your email notification configuration.`
            );
        } else if (channel === 'sms') {
            result = await sendNotification(
                undefined,
                recipient,
                '',
                `Test SMS from ${schoolName}: Your SMS notification configuration is operational.`
            );
        }

        if (result.emailSent || result.smsSent) {
            res.json({ success: true, message: `Test ${channel} delivered successfully` });
        } else {
            res.status(400).json({ success: false, message: `Test ${channel} delivery failed. Please verify your configuration.` });
        }
    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
};
