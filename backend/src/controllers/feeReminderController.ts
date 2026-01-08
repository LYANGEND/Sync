import { Request, Response } from 'express';
import { PrismaClient, StudentFeeStructure, FeeTemplate, Student, Class } from '@prisma/client';
import {
    sendNotification,
    generatePaymentReceiptEmail,
    generateFeeReminderEmail
} from '../services/notificationService';
import { TenantRequest, getTenantId } from '../utils/tenantContext';

const prisma = new PrismaClient();

type StudentWithFees = Student & {
    class: Class | null;
    feeStructures: (StudentFeeStructure & { feeTemplate: FeeTemplate })[];
};

// Send payment receipt notification
export const sendPaymentReceipt = async (req: TenantRequest, res: Response) => {
    try {
        const { paymentId } = req.params;
        const tenantId = getTenantId(req);

        const payment = await prisma.payment.findFirst({
            where: {
                id: paymentId,
                tenantId // Ensure ownership
            },
            include: {
                student: true,
            },
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const schoolName = req.tenant?.name || 'School';
        const guardianName = payment.student.guardianName || 'Parent';

        const { subject, text, html, sms } = generatePaymentReceiptEmail(
            guardianName,
            `${payment.student.firstName} ${payment.student.lastName}`,
            Number(payment.amount),
            payment.paymentDate,
            payment.method,
            payment.referenceNumber || payment.id.substring(0, 8).toUpperCase(),
            schoolName
        );

        const result = await sendNotification(
            tenantId,
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
export const sendFeeReminders = async (req: TenantRequest, res: Response) => {
    try {
        const { studentIds, isOverdue = false } = req.body;
        const tenantId = getTenantId(req);

        const schoolName = req.tenant?.name || 'School';

        // Get students with outstanding fees
        let studentsWithFees: StudentWithFees[];

        if (studentIds && studentIds.length > 0) {
            // Send to specific students
            studentsWithFees = await prisma.student.findMany({
                where: {
                    id: { in: studentIds },
                    tenantId, // Filter by tenant
                    status: 'ACTIVE',
                },
                include: {
                    class: true,
                    feeStructures: {
                        // Filter by tenant implicitly via student relation
                        include: {
                            feeTemplate: true,
                        },
                    },
                },
            });
        } else {
            // Send to all students with outstanding fees
            studentsWithFees = await prisma.student.findMany({
                where: {
                    status: 'ACTIVE',
                    tenantId, // Filter by tenant
                },
                include: {
                    class: true,
                    feeStructures: {
                        // Filter by tenant implicitly via student relation
                        include: {
                            feeTemplate: true,
                        },
                    },
                },
            });
        }

        // Filter to only those with outstanding balances
        studentsWithFees = studentsWithFees.filter(student => {
            const outstanding = student.feeStructures.reduce((total: number, fee: StudentFeeStructure) => {
                return total + (Number(fee.amountDue) - Number(fee.amountPaid));
            }, 0);
            return outstanding > 0;
        });

        const results = {
            total: studentsWithFees.length,
            emailsSent: 0,
            smsSent: 0,
            failed: 0,
        };

        for (const student of studentsWithFees) {
            // Calculate total outstanding amount
            const outstandingAmount = student.feeStructures.reduce((total: number, fee: StudentFeeStructure) => {
                return total + (Number(fee.amountDue) - Number(fee.amountPaid));
            }, 0);

            if (outstandingAmount <= 0) continue;

            // Get earliest due date
            const feesWithDueDate = student.feeStructures.filter((f: StudentFeeStructure) => f.dueDate);
            const sortedFees = feesWithDueDate.sort((a: StudentFeeStructure, b: StudentFeeStructure) =>
                new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
            );
            const earliestDueDate = sortedFees[0]?.dueDate || null;

            const { subject, text, html } = generateFeeReminderEmail(
                `${student.firstName} ${student.lastName}`,
                outstandingAmount,
                earliestDueDate,
                schoolName,
                isOverdue
            );

            try {
                const result = await sendNotification(
                    tenantId,
                    student.guardianEmail ?? undefined,
                    student.guardianPhone ?? undefined,
                    subject,
                    text,
                    html
                );

                if (result.emailSent) results.emailsSent++;
                if (result.smsSent) results.smsSent++;
                if (!result.emailSent && !result.smsSent) results.failed++;
            } catch (error) {
                console.error(`Failed to send reminder to ${student.id}:`, error);
                results.failed++;
            }
        }

        res.json({
            success: true,
            message: `Fee reminders sent to ${results.total} students`,
            results,
        });
    } catch (error) {
        console.error('Send fee reminders error:', error);
        res.status(500).json({ error: 'Failed to send fee reminders' });
    }
};

// Get students with outstanding fees for reminder preview
export const getStudentsWithOutstandingFees = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);

        const students = await prisma.student.findMany({
            where: {
                status: 'ACTIVE',
                tenantId // Filter by tenant
            },
            include: {
                class: true,
                feeStructures: {
                    // Filter by tenant implicitly via student relation
                    include: {
                        feeTemplate: true,
                    },
                },
            },
        });

        const studentsWithBalances = students.map(student => {
            const outstandingAmount = student.feeStructures.reduce((total: number, fee: StudentFeeStructure) => {
                return total + (Number(fee.amountDue) - Number(fee.amountPaid));
            }, 0);

            const feesWithDueDate = student.feeStructures.filter((f: StudentFeeStructure) => f.dueDate);
            const sortedFees = feesWithDueDate.sort((a: StudentFeeStructure, b: StudentFeeStructure) =>
                new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
            );
            const earliestDueDate = sortedFees[0]?.dueDate || null;

            const isOverdue = earliestDueDate && new Date(earliestDueDate) < new Date();

            return {
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNumber: student.admissionNumber,
                className: student.class?.name,
                guardianName: student.guardianName,
                guardianEmail: student.guardianEmail,
                guardianPhone: student.guardianPhone,
                outstandingAmount,
                earliestDueDate,
                isOverdue,
                feeCount: student.feeStructures.length,
            };
        }).filter(s => s.outstandingAmount > 0);

        res.json(studentsWithBalances);
    } catch (error) {
        console.error('Get students with outstanding fees error:', error);
        res.status(500).json({ error: 'Failed to get students with outstanding fees' });
    }
};

// Test notification settings
export const testNotification = async (req: TenantRequest, res: Response) => {
    try {
        const { channel, recipient } = req.body;
        const tenantId = getTenantId(req);

        if (!channel || !recipient) {
            return res.status(400).json({ error: 'Channel and recipient are required' });
        }

        const schoolName = req.tenant?.name || 'School';

        let result = { emailSent: false, smsSent: false };

        if (channel === 'email') {
            result = await sendNotification(
                tenantId,
                recipient,
                undefined,
                `Test Email from ${schoolName}`,
                `This is a test email from ${schoolName} to verify your email notification settings are working correctly.`
            );
        } else if (channel === 'sms') {
            result = await sendNotification(
                tenantId,
                undefined,
                recipient,
                '',
                `Test SMS from ${schoolName}: Your SMS notification settings are working correctly.`
            );
        }

        if (result.emailSent || result.smsSent) {
            res.json({ success: true, message: `Test ${channel} sent successfully` });
        } else {
            res.status(400).json({ success: false, message: `Failed to send test ${channel}. Check your settings.` });
        }
    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
};
