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
exports.processPromotions = exports.getPromotionCandidates = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
// --- Schemas ---
const processPromotionSchema = zod_1.z.object({
    promotions: zod_1.z.array(zod_1.z.object({
        studentId: zod_1.z.string().uuid(),
        targetClassId: zod_1.z.string().uuid(),
        reason: zod_1.z.string().optional(),
    })),
});
// --- Controllers ---
const getPromotionCandidates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, termId } = req.query;
        if (!classId) {
            return res.status(400).json({ message: 'Class ID is required' });
        }
        // 1. Fetch students in the class with comprehensive data
        const students = yield prisma_1.prisma.student.findMany({
            where: {
                classId: classId,
                status: 'ACTIVE',
            },
            include: {
                termResults: {
                    where: termId ? { termId: termId } : undefined,
                    include: { subject: true },
                },
                attendance: true,
                feeStructures: true,
            },
        });
        // Get active term for attendance date range
        const term = termId
            ? yield prisma_1.prisma.academicTerm.findUnique({ where: { id: termId } })
            : yield prisma_1.prisma.academicTerm.findFirst({ where: { isActive: true } });
        // 2. Calculate multi-factor scores and determine recommendation
        const candidates = students.map(student => {
            const results = student.termResults;
            let averageScore = 0;
            if (results.length > 0) {
                const totalScore = results.reduce((sum, result) => sum + Number(result.totalScore), 0);
                averageScore = totalScore / results.length;
            }
            // Subject-specific analysis
            const failingSubjects = results
                .filter(r => Number(r.totalScore) < 50)
                .map(r => { var _a; return ((_a = r.subject) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown'; });
            const strongSubjects = results
                .filter(r => Number(r.totalScore) >= 70)
                .map(r => { var _a; return ((_a = r.subject) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown'; });
            // Attendance factor
            const termAttendance = term
                ? student.attendance.filter(a => a.date >= term.startDate && a.date <= (term.endDate < new Date() ? term.endDate : new Date()))
                : student.attendance;
            const totalAttendanceDays = termAttendance.length;
            const absentDays = termAttendance.filter(a => a.status === 'ABSENT').length;
            const attendanceRate = totalAttendanceDays > 0
                ? Math.round(((totalAttendanceDays - absentDays) / totalAttendanceDays) * 100)
                : 0;
            // Financial factor
            const totalFees = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
            const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
            const feePaymentRate = totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 100;
            // Multi-factor promotion decision
            // Configurable pass mark (default 50%)
            const passMark = 50;
            const isBorderline = averageScore >= (passMark - 5) && averageScore < passMark;
            const meetsAcademic = averageScore >= passMark;
            const hasGoodAttendance = attendanceRate >= 75;
            let recommendedAction;
            let reason;
            let confidence;
            if (meetsAcademic && hasGoodAttendance) {
                recommendedAction = 'PROMOTE';
                reason = `Met academic requirements (${averageScore.toFixed(1)}%) with ${attendanceRate}% attendance`;
                confidence = 'HIGH';
            }
            else if (meetsAcademic && !hasGoodAttendance) {
                recommendedAction = 'PROMOTE';
                reason = `Met academic requirements (${averageScore.toFixed(1)}%) but attendance is low (${attendanceRate}%). Monitor in next term.`;
                confidence = 'MEDIUM';
            }
            else if (isBorderline) {
                recommendedAction = 'REVIEW';
                reason = `Borderline performance (${averageScore.toFixed(1)}%). ${failingSubjects.length} failing subject(s): ${failingSubjects.join(', ')}. Teacher review recommended.`;
                confidence = 'LOW';
            }
            else {
                recommendedAction = 'RETAIN';
                reason = `Below academic requirements (${averageScore.toFixed(1)}% < ${passMark}%). Failing: ${failingSubjects.join(', ')}`;
                confidence = averageScore < (passMark - 15) ? 'HIGH' : 'MEDIUM';
            }
            return {
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`,
                admissionNumber: student.admissionNumber,
                averageScore: parseFloat(averageScore.toFixed(2)),
                recommendedAction,
                reason,
                confidence,
                details: {
                    failingSubjects,
                    strongSubjects,
                    attendanceRate,
                    feePaymentRate,
                    totalSubjects: results.length,
                    isBorderline,
                },
            };
        });
        // Sort: REVIEW first, then RETAIN, then PROMOTE
        const actionOrder = { REVIEW: 0, RETAIN: 1, PROMOTE: 2 };
        candidates.sort((a, b) => { var _a, _b; return ((_a = actionOrder[a.recommendedAction]) !== null && _a !== void 0 ? _a : 3) - ((_b = actionOrder[b.recommendedAction]) !== null && _b !== void 0 ? _b : 3); });
        res.json(candidates);
    }
    catch (error) {
        console.error('Get promotion candidates error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getPromotionCandidates = getPromotionCandidates;
const processPromotions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { promotions } = processPromotionSchema.parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        // Use a transaction to ensure data integrity
        yield prisma_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            for (const promo of promotions) {
                const student = yield tx.student.findUnique({
                    where: { id: promo.studentId },
                    select: { classId: true }
                });
                if (!student)
                    continue;
                // 1. Log the movement
                yield tx.classMovementLog.create({
                    data: {
                        studentId: promo.studentId,
                        fromClassId: student.classId,
                        toClassId: promo.targetClassId,
                        reason: promo.reason || 'End of Year Promotion',
                        changedByUserId: userId,
                    },
                });
                // 2. Update the student's class
                yield tx.student.update({
                    where: { id: promo.studentId },
                    data: { classId: promo.targetClassId },
                });
            }
        }));
        res.json({ message: 'Promotions processed successfully', count: promotions.length });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Process promotions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.processPromotions = processPromotions;
