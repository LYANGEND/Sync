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
exports.smartFeeService = void 0;
const prisma_1 = require("../utils/prisma");
const smsService_1 = require("./smsService");
const whatsappService_1 = require("./whatsappService");
const notificationService_1 = require("./notificationService");
/**
 * Smart Fee Collection Engine
 * Payment prediction, smart reminders, payment plans, and financial intelligence
 */
class SmartFeeService {
    /**
     * Get fee collection analytics
     */
    getCollectionAnalytics(termId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all fee structures
            const feeStructures = yield prisma_1.prisma.studentFeeStructure.findMany({
                include: {
                    student: { include: { class: true } },
                    feeTemplate: true,
                },
            });
            // Filter by term if specified
            const filteredFees = termId
                ? feeStructures.filter(f => f.feeTemplate.academicTermId === termId)
                : feeStructures;
            const totalFees = filteredFees.reduce((sum, f) => sum + Number(f.amountDue), 0);
            const totalPaid = filteredFees.reduce((sum, f) => sum + Number(f.amountPaid), 0);
            let studentsFullyPaid = 0;
            let studentsPartiallyPaid = 0;
            let studentsNotPaid = 0;
            // Group by student
            const studentFeeMap = new Map();
            filteredFees.forEach(f => {
                const current = studentFeeMap.get(f.studentId) || { due: 0, paid: 0 };
                current.due += Number(f.amountDue);
                current.paid += Number(f.amountPaid);
                studentFeeMap.set(f.studentId, current);
            });
            studentFeeMap.forEach(({ due, paid }) => {
                if (paid >= due)
                    studentsFullyPaid++;
                else if (paid > 0)
                    studentsPartiallyPaid++;
                else
                    studentsNotPaid++;
            });
            // By grade level
            const gradeMap = new Map();
            filteredFees.forEach(f => {
                const grade = f.student.class.gradeLevel;
                const current = gradeMap.get(grade) || { totalFees: 0, collected: 0 };
                current.totalFees += Number(f.amountDue);
                current.collected += Number(f.amountPaid);
                gradeMap.set(grade, current);
            });
            const byGradeLevel = Array.from(gradeMap.entries())
                .map(([gradeLevel, data]) => ({
                gradeLevel,
                totalFees: data.totalFees,
                collected: data.collected,
                rate: data.totalFees > 0 ? Math.round((data.collected / data.totalFees) * 100) : 0,
            }))
                .sort((a, b) => a.gradeLevel - b.gradeLevel);
            // Monthly payment trends
            const payments = yield prisma_1.prisma.payment.findMany({
                where: { status: 'COMPLETED' },
                orderBy: { paymentDate: 'asc' },
            });
            const monthlyMap = new Map();
            payments.forEach(p => {
                const month = p.paymentDate.toISOString().substring(0, 7); // YYYY-MM
                monthlyMap.set(month, (monthlyMap.get(month) || 0) + Number(p.amount));
            });
            const monthlyTrends = Array.from(monthlyMap.entries()).map(([month, collected]) => ({
                month,
                collected,
                target: totalFees / 12, // Simplified monthly target
            }));
            // Payment method breakdown
            const methodMap = new Map();
            payments.forEach(p => {
                const current = methodMap.get(p.method) || { total: 0, count: 0 };
                current.total += Number(p.amount);
                current.count++;
                methodMap.set(p.method, current);
            });
            const paymentMethodBreakdown = Array.from(methodMap.entries()).map(([method, data]) => ({
                method,
                total: data.total,
                count: data.count,
            }));
            return {
                summary: {
                    totalFees,
                    totalCollected: totalPaid,
                    totalOutstanding: Math.max(0, totalFees - totalPaid),
                    collectionRate: totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 0,
                    studentsFullyPaid,
                    studentsPartiallyPaid,
                    studentsNotPaid,
                },
                byGradeLevel,
                monthlyTrends,
                paymentMethodBreakdown,
            };
        });
    }
    /**
     * Predict payment likelihood for students with outstanding fees
     */
    predictPayments(classId) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = { status: 'ACTIVE' };
            if (classId)
                where.classId = classId;
            const students = yield prisma_1.prisma.student.findMany({
                where,
                include: {
                    class: true,
                    feeStructures: { include: { feeTemplate: true } },
                    payments: {
                        where: { status: 'COMPLETED' },
                        orderBy: { paymentDate: 'desc' },
                    },
                    parent: { select: { fullName: true } },
                },
            });
            const predictions = [];
            for (const student of students) {
                const totalDue = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
                const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
                const outstanding = totalDue - totalPaid;
                if (outstanding <= 0)
                    continue; // Skip fully paid
                // Analyze payment history
                const paymentHistory = student.payments;
                let paymentLikelihood = 'MEDIUM';
                let predictedDate = null;
                if (paymentHistory.length === 0) {
                    paymentLikelihood = 'LOW';
                }
                else {
                    // Calculate average days between payments
                    const paymentDates = paymentHistory.map(p => p.paymentDate.getTime());
                    if (paymentDates.length >= 2) {
                        const intervals = [];
                        for (let i = 1; i < paymentDates.length; i++) {
                            intervals.push(Math.abs(paymentDates[i - 1] - paymentDates[i]) / (1000 * 60 * 60 * 24));
                        }
                        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                        // Predict next payment date
                        const lastPayment = new Date(paymentDates[0]);
                        const predicted = new Date(lastPayment.getTime() + avgInterval * 24 * 60 * 60 * 1000);
                        predictedDate = predicted.toISOString().split('T')[0];
                        // Determine likelihood
                        if (avgInterval <= 30)
                            paymentLikelihood = 'HIGH';
                        else if (avgInterval <= 60)
                            paymentLikelihood = 'MEDIUM';
                        else
                            paymentLikelihood = 'LOW';
                    }
                    else {
                        // Only one payment - medium likelihood
                        paymentLikelihood = 'MEDIUM';
                    }
                }
                // Days overdue
                const overdueFees = student.feeStructures.filter(f => f.dueDate && new Date(f.dueDate) < new Date() && Number(f.amountPaid) < Number(f.amountDue));
                const daysOverdue = overdueFees.length > 0
                    ? Math.max(...overdueFees.map(f => Math.floor((Date.now() - new Date(f.dueDate).getTime()) / (1000 * 60 * 60 * 24))))
                    : 0;
                predictions.push({
                    studentId: student.id,
                    studentName: `${student.firstName} ${student.lastName}`,
                    amountDue: outstanding,
                    predictedPaymentDate: predictedDate,
                    paymentLikelihood,
                    daysOverdue: Math.max(0, daysOverdue),
                    parentContact: student.guardianPhone || null,
                });
            }
            // Sort by likelihood (LOW first = need attention)
            const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
            predictions.sort((a, b) => order[a.paymentLikelihood] - order[b.paymentLikelihood]);
            return predictions;
        });
    }
    /**
     * Create a payment plan for a student
     */
    createPaymentPlan(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { studentId, totalAmount, installments, frequency, startDate, notes } = data;
            const installmentAmount = Math.ceil((totalAmount / installments) * 100) / 100;
            const start = new Date(startDate);
            // Create plan with schedules in a transaction
            const plan = yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const createdPlan = yield tx.paymentPlan.create({
                    data: {
                        studentId,
                        totalAmount,
                        installments,
                        frequency,
                        startDate: start,
                        notes: notes || null,
                    },
                });
                // Generate schedule entries
                const schedules = [];
                for (let i = 0; i < installments; i++) {
                    const dueDate = new Date(start);
                    switch (frequency) {
                        case 'weekly':
                            dueDate.setDate(dueDate.getDate() + i * 7);
                            break;
                        case 'monthly':
                            dueDate.setMonth(dueDate.getMonth() + i);
                            break;
                        case 'termly':
                            dueDate.setMonth(dueDate.getMonth() + i * 4);
                            break;
                        default:
                            dueDate.setMonth(dueDate.getMonth() + i);
                    }
                    // Last installment takes the remainder
                    const amount = i === installments - 1
                        ? totalAmount - installmentAmount * (installments - 1)
                        : installmentAmount;
                    schedules.push(tx.paymentPlanSchedule.create({
                        data: {
                            planId: createdPlan.id,
                            dueDate,
                            amountDue: Math.max(0, amount),
                        },
                    }));
                }
                yield Promise.all(schedules);
                return tx.paymentPlan.findUnique({
                    where: { id: createdPlan.id },
                    include: { schedules: { orderBy: { dueDate: 'asc' } } },
                });
            }));
            return plan;
        });
    }
    /**
     * Send smart fee reminders - targets parents based on payment history
     */
    sendSmartReminders() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const settings = yield prisma_1.prisma.schoolSettings.findFirst();
            if (!settings)
                return { sent: 0, skipped: 0 };
            const schoolName = settings.schoolName || 'School';
            // Get students with outstanding fees
            const studentsWithFees = yield prisma_1.prisma.student.findMany({
                where: {
                    status: 'ACTIVE',
                    feeStructures: {
                        some: {
                            dueDate: { lte: new Date() }, // Due or overdue
                        },
                    },
                },
                include: {
                    feeStructures: { include: { feeTemplate: true } },
                    parent: { select: { email: true, fullName: true } },
                    payments: {
                        where: { status: 'COMPLETED' },
                        orderBy: { paymentDate: 'desc' },
                        take: 1,
                    },
                },
            });
            let sent = 0;
            let skipped = 0;
            for (const student of studentsWithFees) {
                const totalDue = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
                const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
                const outstanding = totalDue - totalPaid;
                if (outstanding <= 0) {
                    skipped++;
                    continue;
                }
                // Don't send if they paid recently (within 7 days)
                const lastPayment = student.payments[0];
                if (lastPayment) {
                    const daysSincePayment = Math.floor((Date.now() - lastPayment.paymentDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSincePayment < 7) {
                        skipped++;
                        continue;
                    }
                }
                const studentName = `${student.firstName} ${student.lastName}`;
                const parentEmail = ((_a = student.parent) === null || _a === void 0 ? void 0 : _a.email) || student.guardianEmail;
                const parentPhone = student.guardianPhone;
                // Get the earliest overdue fee for due date
                const overdueFee = student.feeStructures
                    .filter(f => f.dueDate && Number(f.amountPaid) < Number(f.amountDue))
                    .sort((a, b) => { var _a, _b; return (((_a = a.dueDate) === null || _a === void 0 ? void 0 : _a.getTime()) || 0) - (((_b = b.dueDate) === null || _b === void 0 ? void 0 : _b.getTime()) || 0); })[0];
                const dueDate = ((_b = overdueFee === null || overdueFee === void 0 ? void 0 : overdueFee.dueDate) === null || _b === void 0 ? void 0 : _b.toLocaleDateString('en-GB')) || 'N/A';
                // Send via available channels
                if (parentEmail) {
                    try {
                        const overdueFeeDate = (overdueFee === null || overdueFee === void 0 ? void 0 : overdueFee.dueDate) || null;
                        const isOverdue = (overdueFee === null || overdueFee === void 0 ? void 0 : overdueFee.dueDate) ? overdueFee.dueDate < new Date() : true;
                        const emailData = (0, notificationService_1.generateFeeReminderEmail)(studentName, outstanding, overdueFeeDate, schoolName, isOverdue);
                        yield (0, notificationService_1.sendEmail)({
                            to: parentEmail,
                            subject: emailData.subject,
                            text: emailData.text,
                            html: emailData.html,
                        });
                    }
                    catch (e) { /* continue */ }
                }
                if (parentPhone) {
                    yield smsService_1.smsService.sendFeeReminder(parentPhone, studentName, outstanding, dueDate, schoolName);
                    yield whatsappService_1.whatsappService.sendFeeReminder(parentPhone, studentName, outstanding, dueDate, schoolName);
                }
                sent++;
            }
            return { sent, skipped };
        });
    }
    /**
     * Identify students who may need financial aid
     */
    identifyFinancialAidCandidates() {
        return __awaiter(this, void 0, void 0, function* () {
            const students = yield prisma_1.prisma.student.findMany({
                where: { status: 'ACTIVE' },
                include: {
                    class: true,
                    feeStructures: true,
                    payments: { where: { status: 'COMPLETED' } },
                    scholarship: true,
                },
            });
            const candidates = [];
            for (const student of students) {
                // Skip students already on scholarship
                if (student.scholarshipId)
                    continue;
                const totalDue = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
                const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
                const outstanding = totalDue - totalPaid;
                if (totalDue === 0 || outstanding <= 0)
                    continue;
                const paidPercentage = (totalPaid / totalDue) * 100;
                const paymentCount = student.payments.length;
                // Flag if paid less than 30% or no payments in 2+ months
                if (paidPercentage < 30 || (paymentCount === 0 && totalDue > 0)) {
                    let recommendation = '';
                    if (paymentCount === 0) {
                        recommendation = 'No payments recorded. Consider reaching out to family to understand circumstances.';
                    }
                    else if (paidPercentage < 15) {
                        recommendation = 'Very low payment rate. Strong candidate for partial scholarship or fee waiver.';
                    }
                    else {
                        recommendation = 'Below 30% payment rate. Consider offering a structured payment plan.';
                    }
                    candidates.push({
                        studentId: student.id,
                        studentName: `${student.firstName} ${student.lastName}`,
                        className: student.class.name,
                        totalOutstanding: outstanding,
                        paymentHistory: `${paidPercentage.toFixed(0)}% paid (${paymentCount} payments)`,
                        recommendation,
                    });
                }
            }
            candidates.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
            return candidates;
        });
    }
}
exports.smartFeeService = new SmartFeeService();
exports.default = exports.smartFeeService;
