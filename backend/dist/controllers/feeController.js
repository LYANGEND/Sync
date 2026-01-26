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
exports.getStudentStatement = exports.bulkCreateFeeTemplates = exports.deleteFeeTemplate = exports.updateFeeTemplate = exports.getFeeTemplateById = exports.assignFeeToClass = exports.createFeeTemplate = exports.getFeeTemplates = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const feeTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    amount: zod_1.z.number().positive(),
    academicTermId: zod_1.z.string().uuid(),
    applicableGrade: zod_1.z.number().int().min(0).max(12), // 0: Nursery, 1-12: Grades
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
        const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        // 1. Get the fee template to know the amount
        const feeTemplate = yield prisma.feeTemplate.findUnique({
            where: { id: feeTemplateId },
            include: { academicTerm: true },
        });
        if (!feeTemplate) {
            return res.status(404).json({ error: 'Fee template not found' });
        }
        // 2. Get all students in the class with their scholarship info
        const students = yield prisma.student.findMany({
            where: { classId: classId, status: 'ACTIVE' },
            include: {
                scholarship: true,
                feeStructures: {
                    where: { feeTemplateId: feeTemplateId }
                }
            },
        });
        if (students.length === 0) {
            return res.status(404).json({ error: 'No active students found in this class' });
        }
        // 3. Filter out students who already have this fee assigned
        const studentsToAssign = students.filter(student => student.feeStructures.length === 0);
        if (studentsToAssign.length === 0) {
            return res.status(400).json({
                error: 'All students in this class already have this fee assigned',
                alreadyAssigned: students.length
            });
        }
        // 4. Create StudentFeeStructure records for students who don't have it yet
        const createdRecords = [];
        const errors = [];
        for (const student of studentsToAssign) {
            try {
                let amountDue = Number(feeTemplate.amount);
                // Apply scholarship if exists
                if (student.scholarship) {
                    const discountPercentage = Number(student.scholarship.percentage);
                    const discountAmount = (amountDue * discountPercentage) / 100;
                    amountDue = Math.max(0, amountDue - discountAmount);
                }
                const record = yield prisma.studentFeeStructure.create({
                    data: {
                        studentId: student.id,
                        feeTemplateId: feeTemplate.id,
                        amountDue: amountDue,
                        amountPaid: 0,
                        dueDate: dueDate,
                    },
                });
                createdRecords.push(record);
            }
            catch (error) {
                errors.push({
                    studentId: student.id,
                    studentName: `${student.firstName} ${student.lastName}`,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        res.status(200).json({
            message: `Successfully assigned fee to ${createdRecords.length} students`,
            feeTemplate: {
                name: feeTemplate.name,
                amount: feeTemplate.amount,
                term: feeTemplate.academicTerm.name
            },
            assigned: createdRecords.length,
            alreadyAssigned: students.length - studentsToAssign.length,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined,
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
const getFeeTemplateById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const template = yield prisma.feeTemplate.findUnique({
            where: { id },
            include: {
                academicTerm: true,
            }
        });
        if (!template) {
            return res.status(404).json({ error: 'Fee template not found' });
        }
        res.json(template);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch fee template' });
    }
});
exports.getFeeTemplateById = getFeeTemplateById;
const updateFeeTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const data = feeTemplateSchema.partial().parse(req.body);
        const template = yield prisma.feeTemplate.update({
            where: { id },
            data,
        });
        res.json(template);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update fee template' });
    }
});
exports.updateFeeTemplate = updateFeeTemplate;
const deleteFeeTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Check if it's in use
        const usageCount = yield prisma.studentFeeStructure.count({
            where: { feeTemplateId: id }
        });
        if (usageCount > 0) {
            return res.status(400).json({
                error: 'Cannot delete fee template as it has already been assigned to students. Consider archiving or modifying it instead.'
            });
        }
        yield prisma.feeTemplate.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete fee template' });
    }
});
exports.deleteFeeTemplate = deleteFeeTemplate;
const bulkFeeTemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    amount: zod_1.z.number().positive(),
    academicTermId: zod_1.z.string().uuid().optional(),
    applicableGrade: zod_1.z.number().int().min(-2).max(12),
});
const bulkCreateFeeTemplates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templatesData = zod_1.z.array(bulkFeeTemplateSchema).parse(req.body);
        // Get current academic term if not provided
        const currentTerm = yield prisma.academicTerm.findFirst({
            where: { isActive: true },
            orderBy: { startDate: 'desc' }
        });
        if (!currentTerm) {
            return res.status(400).json({ error: 'No active academic term found' });
        }
        const dataToCreate = templatesData.map(t => ({
            name: t.name,
            amount: t.amount,
            academicTermId: t.academicTermId || currentTerm.id,
            applicableGrade: t.applicableGrade,
        }));
        const result = yield prisma.feeTemplate.createMany({
            data: dataToCreate,
            skipDuplicates: true,
        });
        res.status(201).json({
            message: `Successfully imported ${result.count} fee templates`,
            count: result.count,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Bulk create fee templates error:', error);
        res.status(500).json({ error: 'Failed to import fee templates' });
    }
});
exports.bulkCreateFeeTemplates = bulkCreateFeeTemplates;
const getStudentStatement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        // 1. Get School Info
        const settings = yield prisma.schoolSettings.findFirst();
        // 2. Get Student Info
        // 2. Get Student Info
        const student = yield prisma.student.findUnique({
            where: { id: studentId },
            include: {
                class: true,
            }
        });
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        // SECURITY: Access Control
        const user = req.user;
        if (user.role === 'PARENT' && student.parentId !== user.userId) {
            return res.status(403).json({ error: 'Unauthorized: This student does not belong to your account.' });
        }
        // Restrict other roles if necessary (e.g. STUDENT shouldn't see this)
        if (!['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER', 'PARENT'].includes(user.role)) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }
        // 3. Get Fees (Debits)
        const fees = yield prisma.studentFeeStructure.findMany({
            where: { studentId },
            include: {
                feeTemplate: {
                    include: { academicTerm: true }
                }
            }
        });
        // 4. Get Payments (Credits) - Only COMPLETED payments
        const payments = yield prisma.payment.findMany({
            where: {
                studentId,
                status: 'COMPLETED'
            },
            orderBy: { paymentDate: 'asc' }
        });
        // 5. Combine and Sort
        const transactions = [
            ...fees.map(f => ({
                id: f.id,
                date: f.createdAt, // Or dueDate if preferred
                type: 'DEBIT',
                description: f.feeTemplate.name,
                term: f.feeTemplate.academicTerm.name,
                amount: Number(f.amountDue),
                ref: '-'
            })),
            ...payments.map(p => ({
                id: p.id,
                date: p.paymentDate,
                type: 'CREDIT',
                description: `Payment (${p.method.replace('_', ' ')})`,
                term: '-', // Could infer term based on date
                amount: Number(p.amount),
                ref: p.transactionId || '-'
            }))
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        res.json({
            school: {
                name: (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School Name',
                address: (settings === null || settings === void 0 ? void 0 : settings.schoolAddress) || '',
                email: (settings === null || settings === void 0 ? void 0 : settings.schoolEmail) || '',
                logoUrl: (settings === null || settings === void 0 ? void 0 : settings.logoUrl) || ''
            },
            student: {
                name: `${student.firstName} ${student.lastName}`,
                admissionNumber: student.admissionNumber,
                className: student.class.name,
                guardian: student.guardianName
            },
            transactions
        });
    }
    catch (error) {
        console.error('Get student statement error:', error);
        res.status(500).json({ error: 'Failed to generate statement' });
    }
});
exports.getStudentStatement = getStudentStatement;
