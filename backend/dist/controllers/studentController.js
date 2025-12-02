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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyChildren = exports.deleteStudent = exports.updateStudent = exports.getStudentById = exports.bulkDeleteStudents = exports.bulkCreateStudents = exports.createStudent = exports.getStudents = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const emailService_1 = require("../services/emailService");
const prisma = new client_1.PrismaClient();
const createStudentSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(2),
    lastName: zod_1.z.string().min(2),
    admissionNumber: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().transform((str) => new Date(str)),
    gender: zod_1.z.enum(['MALE', 'FEMALE']),
    guardianName: zod_1.z.string(),
    guardianPhone: zod_1.z.string(),
    guardianEmail: zod_1.z.string().email().optional(),
    address: zod_1.z.string().optional(),
    classId: zod_1.z.string().uuid(),
    scholarshipId: zod_1.z.string().uuid().optional().nullable(),
});
const updateStudentSchema = createStudentSchema.partial().extend({
    status: zod_1.z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT']).optional(),
    reason: zod_1.z.string().optional(), // For audit trail
});
const getStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const students = yield prisma.student.findMany({
            include: {
                class: true,
            },
            orderBy: {
                lastName: 'asc',
            },
        });
        res.json(students);
    }
    catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});
exports.getStudents = getStudents;
const createStudent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = createStudentSchema.parse(req.body);
        let parentId = null;
        // Auto-generate admission number if not provided
        let admissionNumber = data.admissionNumber;
        if (!admissionNumber) {
            const year = new Date().getFullYear();
            // Find the last student created this year to increment the number
            const lastStudent = yield prisma.student.findFirst({
                where: {
                    admissionNumber: {
                        startsWith: `${year}-`
                    }
                },
                orderBy: {
                    admissionNumber: 'desc'
                }
            });
            let nextNum = 1;
            if (lastStudent) {
                const parts = lastStudent.admissionNumber.split('-');
                if (parts.length === 2) {
                    const lastNum = parseInt(parts[1], 10);
                    if (!isNaN(lastNum)) {
                        nextNum = lastNum + 1;
                    }
                }
            }
            admissionNumber = `${year}-${nextNum.toString().padStart(4, '0')}`;
        }
        // If guardian email is provided, try to link or create a parent account
        if (data.guardianEmail) {
            console.log('DEBUG: Processing guardian email:', data.guardianEmail);
            const existingParent = yield prisma.user.findUnique({
                where: { email: data.guardianEmail }
            });
            if (existingParent) {
                if (existingParent.role !== 'PARENT') {
                    return res.status(400).json({
                        error: `Email ${data.guardianEmail} is already in use by a ${existingParent.role}. Cannot use as Guardian Email.`
                    });
                }
                console.log('DEBUG: Existing parent found:', existingParent.id);
                parentId = existingParent.id;
            }
            else {
                console.log('DEBUG: Creating new parent account');
                // Create new parent account
                const password = Math.random().toString(36).slice(-8);
                const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
                try {
                    const newParent = yield prisma.user.create({
                        data: {
                            email: data.guardianEmail,
                            fullName: data.guardianName,
                            role: 'PARENT',
                            passwordHash: hashedPassword,
                        }
                    });
                    parentId = newParent.id;
                    // Send email with credentials
                    console.log('DEBUG: Preparing to send welcome email to new parent');
                    const emailSubject = 'Welcome to Sync - Your Parent Account';
                    const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Welcome to Sync School Management</h2>
              <p>Dear ${data.guardianName},</p>
              <p>A parent account has been automatically created for you to track your child's progress.</p>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold;">Your Login Credentials:</p>
                <p style="margin: 10px 0;">Email: <strong>${data.guardianEmail}</strong></p>
                <p style="margin: 0;">Password: <strong>${password}</strong></p>
              </div>
              <p>Please login at <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Sync Portal</a> and change your password immediately.</p>
              <p>Best regards,<br>School Administration</p>
            </div>
          `;
                    // Don't await this to avoid blocking the response if email fails
                    (0, emailService_1.sendEmail)(data.guardianEmail, emailSubject, emailBody).catch(err => console.error('Failed to send parent welcome email:', err));
                }
                catch (createError) {
                    // Handle race condition where user was created between findUnique and create
                    if (createError.code === 'P2002') {
                        console.log('DEBUG: Race condition detected - parent created by another request');
                        const retryParent = yield prisma.user.findUnique({
                            where: { email: data.guardianEmail }
                        });
                        if (retryParent) {
                            parentId = retryParent.id;
                        }
                    }
                    else {
                        throw createError;
                    }
                }
            }
        }
        else {
            console.log('DEBUG: No guardian email provided');
        }
        const student = yield prisma.student.create({
            data: Object.assign(Object.assign({}, data), { admissionNumber, status: 'ACTIVE', parentId }),
        });
        res.status(201).json(student);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Create student error:', error);
        res.status(500).json({ error: 'Failed to create student' });
    }
});
exports.createStudent = createStudent;
const bulkCreateStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const studentsData = zod_1.z.array(createStudentSchema).parse(req.body);
        // Generate admission numbers for those missing
        const year = new Date().getFullYear();
        // Find last admission number to start incrementing
        const lastStudent = yield prisma.student.findFirst({
            where: { admissionNumber: { startsWith: `${year}-` } },
            orderBy: { admissionNumber: 'desc' }
        });
        let nextNum = 1;
        if (lastStudent) {
            const parts = lastStudent.admissionNumber.split('-');
            if (parts.length === 2) {
                const lastNum = parseInt(parts[1], 10);
                if (!isNaN(lastNum))
                    nextNum = lastNum + 1;
            }
        }
        const dataToCreate = studentsData.map((s, index) => {
            let admissionNumber = s.admissionNumber;
            if (!admissionNumber) {
                admissionNumber = `${year}-${(nextNum + index).toString().padStart(4, '0')}`;
            }
            // Remove guardianEmail from the object passed to createMany as it might not be in the DB schema yet
            // and createMany doesn't support creating relations anyway.
            const { guardianEmail } = s, studentData = __rest(s, ["guardianEmail"]);
            return Object.assign(Object.assign({}, studentData), { admissionNumber: admissionNumber, status: 'ACTIVE' });
        });
        const result = yield prisma.student.createMany({
            data: dataToCreate,
            skipDuplicates: true,
        });
        res.status(201).json({ message: `Successfully imported ${result.count} students`, count: result.count });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Bulk create error:', error);
        res.status(500).json({ error: 'Failed to import students' });
    }
});
exports.bulkCreateStudents = bulkCreateStudents;
const bulkDeleteStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { ids } = zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string()) }).parse(req.body);
        const result = yield prisma.student.deleteMany({
            where: {
                id: {
                    in: ids
                }
            }
        });
        res.json({ message: `Successfully deleted ${result.count} students`, count: result.count });
    }
    catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ error: 'Failed to delete students' });
    }
});
exports.bulkDeleteStudents = bulkDeleteStudents;
const getStudentById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const student = yield prisma.student.findUnique({
            where: { id },
            include: {
                class: true,
                scholarship: true,
                payments: {
                    orderBy: { paymentDate: 'desc' }
                },
                attendance: {
                    take: 5,
                    orderBy: { date: 'desc' }
                },
                feeStructures: {
                    include: {
                        feeTemplate: true
                    }
                }
            }
        });
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(student);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch student' });
    }
});
exports.getStudentById = getStudentById;
const updateStudent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const _b = updateStudentSchema.parse(req.body), { reason } = _b, data = __rest(_b, ["reason"]);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        // If class is changing, we need to log it
        if (data.classId) {
            const currentStudent = yield prisma.student.findUnique({
                where: { id },
                select: { classId: true }
            });
            if (currentStudent && currentStudent.classId !== data.classId) {
                yield prisma.classMovementLog.create({
                    data: {
                        studentId: id,
                        fromClassId: currentStudent.classId,
                        toClassId: data.classId,
                        reason: reason || 'Class update',
                        changedByUserId: userId
                    }
                });
            }
        }
        const student = yield prisma.student.update({
            where: { id },
            data,
        });
        res.json(student);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update student' });
    }
});
exports.updateStudent = updateStudent;
const deleteStudent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // 1. Get student to find parent
        const student = yield prisma.student.findUnique({
            where: { id },
            select: { parentId: true }
        });
        if (!student)
            return res.status(404).json({ error: 'Student not found' });
        // 2. Delete student
        yield prisma.student.delete({
            where: { id },
        });
        // 3. Check parent
        if (student.parentId) {
            const remainingChildren = yield prisma.student.count({
                where: { parentId: student.parentId }
            });
            if (remainingChildren === 0) {
                try {
                    yield prisma.user.delete({ where: { id: student.parentId } });
                    console.log(`Deleted orphan parent account: ${student.parentId}`);
                }
                catch (err) {
                    console.warn(`Could not delete parent account ${student.parentId} - likely has other data linked`);
                }
            }
        }
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete student' });
    }
});
exports.deleteStudent = deleteStudent;
const getMyChildren = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const students = yield prisma.student.findMany({
            where: {
                parentId: userId
            },
            include: {
                class: true,
                attendance: {
                    take: 5,
                    orderBy: { date: 'desc' }
                },
                payments: {
                    orderBy: { paymentDate: 'desc' }
                },
                feeStructures: {
                    include: {
                        feeTemplate: true
                    }
                },
                assessmentResults: {
                    take: 5,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        assessment: {
                            include: {
                                subject: true
                            }
                        }
                    }
                },
                termResults: {
                    include: {
                        subject: true,
                        term: true
                    },
                    orderBy: {
                        term: { startDate: 'asc' }
                    }
                },
                termReports: {
                    include: {
                        term: true
                    },
                    orderBy: {
                        term: { startDate: 'desc' }
                    }
                }
            }
        });
        const studentsWithBalance = students.map(student => {
            const totalFees = student.feeStructures.reduce((sum, fee) => sum + Number(fee.amountDue), 0);
            const totalPaid = student.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
            const balance = totalFees - totalPaid;
            // We only want to send the last 5 payments to the frontend to keep payload small, 
            // but we needed all of them for calculation.
            const recentPayments = student.payments.slice(0, 5);
            return Object.assign(Object.assign({}, student), { payments: recentPayments, balance });
        });
        res.json(studentsWithBalance);
    }
    catch (error) {
        console.error('Get my children error:', error);
        res.status(500).json({ error: 'Failed to fetch children' });
    }
});
exports.getMyChildren = getMyChildren;
