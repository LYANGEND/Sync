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
exports.testNotification = exports.getStudentsWithOutstandingFees = exports.sendFeeReminders = exports.sendPaymentReceipt = void 0;
const client_1 = require("@prisma/client");
const notificationService_1 = require("../services/notificationService");
const prisma = new client_1.PrismaClient();
// Send payment receipt notification
const sendPaymentReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { paymentId } = req.params;
        const payment = yield prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                student: true,
            },
        });
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        const settings = yield prisma.schoolSettings.findFirst();
        const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
        const guardianName = payment.student.guardianName || 'Parent';
        const { subject, text, html, sms } = (0, notificationService_1.generatePaymentReceiptEmail)(guardianName, `${payment.student.firstName} ${payment.student.lastName}`, Number(payment.amount), payment.paymentDate, payment.method, payment.transactionId || payment.id.substring(0, 8).toUpperCase(), schoolName);
        const result = yield (0, notificationService_1.sendNotification)((_a = payment.student.guardianEmail) !== null && _a !== void 0 ? _a : undefined, (_b = payment.student.guardianPhone) !== null && _b !== void 0 ? _b : undefined, subject, text, html, sms);
        res.json({
            success: true,
            emailSent: result.emailSent,
            smsSent: result.smsSent,
            message: 'Payment receipt notification sent',
        });
    }
    catch (error) {
        console.error('Send payment receipt error:', error);
        res.status(500).json({ error: 'Failed to send payment receipt' });
    }
});
exports.sendPaymentReceipt = sendPaymentReceipt;
// Send fee reminders to students with outstanding fees
const sendFeeReminders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { studentIds, isOverdue = false } = req.body;
        const settings = yield prisma.schoolSettings.findFirst();
        const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
        // Get students with outstanding fees
        let studentsWithFees;
        if (studentIds && studentIds.length > 0) {
            // Send to specific students
            studentsWithFees = yield prisma.student.findMany({
                where: {
                    id: { in: studentIds },
                    status: 'ACTIVE',
                },
                include: {
                    class: true,
                    feeStructures: {
                        include: {
                            feeTemplate: true,
                        },
                    },
                },
            });
        }
        else {
            // Send to all students with outstanding fees
            studentsWithFees = yield prisma.student.findMany({
                where: {
                    status: 'ACTIVE',
                },
                include: {
                    class: true,
                    feeStructures: {
                        include: {
                            feeTemplate: true,
                        },
                    },
                },
            });
        }
        // Filter to only those with outstanding balances
        studentsWithFees = studentsWithFees.filter(student => {
            const outstanding = student.feeStructures.reduce((total, fee) => {
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
            const outstandingAmount = student.feeStructures.reduce((total, fee) => {
                return total + (Number(fee.amountDue) - Number(fee.amountPaid));
            }, 0);
            if (outstandingAmount <= 0)
                continue;
            // Get earliest due date
            const feesWithDueDate = student.feeStructures.filter((f) => f.dueDate);
            const sortedFees = feesWithDueDate.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
            const earliestDueDate = ((_a = sortedFees[0]) === null || _a === void 0 ? void 0 : _a.dueDate) || null;
            const { subject, text, html } = (0, notificationService_1.generateFeeReminderEmail)(`${student.firstName} ${student.lastName}`, outstandingAmount, earliestDueDate, schoolName, isOverdue);
            try {
                const result = yield (0, notificationService_1.sendNotification)((_b = student.guardianEmail) !== null && _b !== void 0 ? _b : undefined, (_c = student.guardianPhone) !== null && _c !== void 0 ? _c : undefined, subject, text, html);
                if (result.emailSent)
                    results.emailsSent++;
                if (result.smsSent)
                    results.smsSent++;
                if (!result.emailSent && !result.smsSent)
                    results.failed++;
            }
            catch (error) {
                console.error(`Failed to send reminder to ${student.id}:`, error);
                results.failed++;
            }
        }
        res.json({
            success: true,
            message: `Fee reminders sent to ${results.total} students`,
            results,
        });
    }
    catch (error) {
        console.error('Send fee reminders error:', error);
        res.status(500).json({ error: 'Failed to send fee reminders' });
    }
});
exports.sendFeeReminders = sendFeeReminders;
// Get students with outstanding fees for reminder preview
const getStudentsWithOutstandingFees = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const students = yield prisma.student.findMany({
            where: {
                status: 'ACTIVE',
            },
            include: {
                class: true,
                feeStructures: {
                    include: {
                        feeTemplate: true,
                    },
                },
            },
        });
        const studentsWithBalances = students.map(student => {
            var _a, _b;
            const outstandingAmount = student.feeStructures.reduce((total, fee) => {
                return total + (Number(fee.amountDue) - Number(fee.amountPaid));
            }, 0);
            const feesWithDueDate = student.feeStructures.filter((f) => f.dueDate);
            const sortedFees = feesWithDueDate.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
            const earliestDueDate = ((_a = sortedFees[0]) === null || _a === void 0 ? void 0 : _a.dueDate) || null;
            const isOverdue = earliestDueDate && new Date(earliestDueDate) < new Date();
            return {
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNumber: student.admissionNumber,
                className: (_b = student.class) === null || _b === void 0 ? void 0 : _b.name,
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
    }
    catch (error) {
        console.error('Get students with outstanding fees error:', error);
        res.status(500).json({ error: 'Failed to get students with outstanding fees' });
    }
});
exports.getStudentsWithOutstandingFees = getStudentsWithOutstandingFees;
// Test notification settings
const testNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { channel, recipient } = req.body;
        if (!channel || !recipient) {
            return res.status(400).json({ error: 'Channel and recipient are required' });
        }
        const settings = yield prisma.schoolSettings.findFirst();
        const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
        let result = { emailSent: false, smsSent: false };
        if (channel === 'email') {
            result = yield (0, notificationService_1.sendNotification)(recipient, undefined, `Test Email from ${schoolName}`, `This is a test email from ${schoolName} to verify your email notification settings are working correctly.`);
        }
        else if (channel === 'sms') {
            result = yield (0, notificationService_1.sendNotification)(undefined, recipient, '', `Test SMS from ${schoolName}: Your SMS notification settings are working correctly.`);
        }
        if (result.emailSent || result.smsSent) {
            res.json({ success: true, message: `Test ${channel} sent successfully` });
        }
        else {
            res.status(400).json({ success: false, message: `Failed to send test ${channel}. Check your settings.` });
        }
    }
    catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});
exports.testNotification = testNotification;
