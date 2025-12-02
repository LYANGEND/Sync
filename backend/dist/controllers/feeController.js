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
exports.assignFeeToClass = exports.createFeeTemplate = exports.getFeeTemplates = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const feeTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    amount: zod_1.z.number().positive(),
    academicTermId: zod_1.z.string().uuid(),
    applicableGrade: zod_1.z.number().int().min(1).max(12), // Assuming grades 1-12
});
const assignFeeSchema = zod_1.z.object({
    feeTemplateId: zod_1.z.string().uuid(),
    classId: zod_1.z.string().uuid(),
});
const getFeeTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield prisma.feeTemplate.findMany({
            include: {
                academicTerm: true,
            },
            orderBy: {
                academicTerm: {
                    startDate: 'desc',
                },
            },
        });
        res.json(templates);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch fee templates' });
    }
});
exports.getFeeTemplates = getFeeTemplates;
const createFeeTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, amount, academicTermId, applicableGrade } = feeTemplateSchema.parse(req.body);
        const template = yield prisma.feeTemplate.create({
            data: {
                name,
                amount,
                academicTermId,
                applicableGrade,
            },
        });
        res.status(201).json(template);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create fee template' });
    }
});
exports.createFeeTemplate = createFeeTemplate;
const assignFeeToClass = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { feeTemplateId, classId } = assignFeeSchema.parse(req.body);
        // 1. Get the fee template to know the amount
        const feeTemplate = yield prisma.feeTemplate.findUnique({
            where: { id: feeTemplateId },
        });
        if (!feeTemplate) {
            return res.status(404).json({ error: 'Fee template not found' });
        }
        // 2. Get all students in the class with their scholarship info
        const students = yield prisma.student.findMany({
            where: { classId: classId, status: 'ACTIVE' },
            include: { scholarship: true },
        });
        if (students.length === 0) {
            return res.status(404).json({ error: 'No active students found in this class' });
        }
        // 3. Create StudentFeeStructure records for each student
        // We use a transaction to ensure all or nothing
        const result = yield prisma.$transaction(students.map((student) => {
            let amountDue = Number(feeTemplate.amount);
            // Apply scholarship if exists
            if (student.scholarship) {
                const discountPercentage = Number(student.scholarship.percentage);
                const discountAmount = (amountDue * discountPercentage) / 100;
                amountDue = Math.max(0, amountDue - discountAmount);
            }
            return prisma.studentFeeStructure.create({
                data: {
                    studentId: student.id,
                    feeTemplateId: feeTemplate.id,
                    amountDue: amountDue, // Prisma handles number to Decimal conversion
                    amountPaid: 0,
                },
            });
        }));
        res.status(200).json({
            message: `Successfully assigned fee to ${result.length} students`,
            assignedCount: result.length,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Error assigning fee:', error);
        res.status(500).json({ error: 'Failed to assign fee to class' });
    }
});
exports.assignFeeToClass = assignFeeToClass;
