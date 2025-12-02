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
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
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
        // 1. Fetch students in the class
        const students = yield prisma.student.findMany({
            where: {
                classId: classId,
                status: 'ACTIVE',
            },
            include: {
                termResults: {
                    where: termId ? { termId: termId } : undefined,
                },
            },
        });
        // 2. Calculate averages and determine recommendation
        const candidates = students.map(student => {
            const results = student.termResults;
            let averageScore = 0;
            if (results.length > 0) {
                const totalScore = results.reduce((sum, result) => sum + Number(result.totalScore), 0);
                averageScore = totalScore / results.length;
            }
            // Rule: Average < 50% -> Retain
            const recommendedAction = averageScore >= 50 ? 'PROMOTE' : 'RETAIN';
            const reason = averageScore >= 50 ? 'Met academic requirements' : 'Did not meet academic requirements (Avg < 50%)';
            return {
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`,
                admissionNumber: student.admissionNumber,
                averageScore: parseFloat(averageScore.toFixed(2)),
                recommendedAction,
                reason,
            };
        });
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
        yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
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
