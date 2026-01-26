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
exports.bulkCreateClasses = exports.addStudentsToClass = exports.getClassStudents = exports.deleteClass = exports.updateClass = exports.createClass = exports.getClassById = exports.getClasses = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const classSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    gradeLevel: zod_1.z.number().int().min(0).max(12),
    teacherId: zod_1.z.string().uuid(),
    academicTermId: zod_1.z.string().uuid(),
    subjectIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
const getClasses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        let whereClause = {};
        if (userRole === 'TEACHER') {
            whereClause = { teacherId: userId };
        }
        const classes = yield prisma.class.findMany({
            where: whereClause,
            include: {
                teacher: {
                    select: { fullName: true },
                },
                subjects: true,
                _count: {
                    select: { students: true },
                },
            },
            orderBy: [
                { gradeLevel: 'asc' },
                { name: 'asc' },
            ],
        });
        res.json(classes);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch classes' });
    }
});
exports.getClasses = getClasses;
const getClassById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const classData = yield prisma.class.findUnique({
            where: { id },
            include: {
                teacher: {
                    select: { fullName: true },
                },
                subjects: true,
                students: {
                    where: { status: 'ACTIVE' },
                    orderBy: { lastName: 'asc' },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    }
                },
                _count: {
                    select: { students: true },
                },
            },
        });
        if (!classData) {
            return res.status(404).json({ error: 'Class not found' });
        }
        res.json(classData);
    }
    catch (error) {
        console.error('Error fetching class:', error);
        res.status(500).json({ error: 'Failed to fetch class' });
    }
});
exports.getClassById = getClassById;
const createClass = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);
        const newClass = yield prisma.class.create({
            data: {
                name,
                gradeLevel,
                teacherId,
                academicTermId,
                subjects: subjectIds ? {
                    connect: subjectIds.map(id => ({ id })),
                } : undefined,
            },
            include: {
                subjects: true,
            },
        });
        res.status(201).json(newClass);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create class' });
    }
});
exports.createClass = createClass;
const updateClass = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);
        const updatedClass = yield prisma.class.update({
            where: { id },
            data: {
                name,
                gradeLevel,
                teacherId,
                academicTermId,
                subjects: subjectIds ? {
                    set: subjectIds.map(id => ({ id })),
                } : undefined,
            },
            include: {
                subjects: true,
            },
        });
        res.json(updatedClass);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update class' });
    }
});
exports.updateClass = updateClass;
const deleteClass = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.class.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete class' });
    }
});
exports.deleteClass = deleteClass;
const getClassStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const students = yield prisma.student.findMany({
            where: { classId: id },
            orderBy: { lastName: 'asc' },
        });
        res.json(students);
    }
    catch (error) {
        console.error('Error fetching class students:', error);
        res.status(500).json({ error: 'Failed to fetch class students' });
    }
});
exports.getClassStudents = getClassStudents;
const addStudentsToClass = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { studentIds } = zod_1.z.object({ studentIds: zod_1.z.array(zod_1.z.string().uuid()) }).parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const classExists = yield prisma.class.findUnique({ where: { id } });
        if (!classExists) {
            return res.status(404).json({ error: 'Class not found' });
        }
        yield prisma.student.updateMany({
            where: {
                id: { in: studentIds },
            },
            data: {
                classId: id,
            },
        });
        res.json({ message: 'Students added to class successfully' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to add students to class' });
    }
});
exports.addStudentsToClass = addStudentsToClass;
const bulkClassSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    gradeLevel: zod_1.z.number().int().min(-2).max(12),
    teacherId: zod_1.z.string().uuid().optional(),
    academicTermId: zod_1.z.string().uuid().optional(),
});
const bulkCreateClasses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const classesData = zod_1.z.array(bulkClassSchema).parse(req.body);
        // Get current academic term
        const currentTerm = yield prisma.academicTerm.findFirst({
            where: { isActive: true },
            orderBy: { startDate: 'desc' }
        });
        if (!currentTerm) {
            return res.status(400).json({ error: 'No active academic term found' });
        }
        // Get default teacher
        const defaultTeacher = yield prisma.user.findFirst({
            where: { role: { in: ['TEACHER', 'SUPER_ADMIN'] } }
        });
        if (!defaultTeacher) {
            return res.status(400).json({ error: 'No teacher found' });
        }
        const dataToCreate = classesData.map(c => ({
            name: c.name,
            gradeLevel: c.gradeLevel,
            teacherId: c.teacherId || defaultTeacher.id,
            academicTermId: c.academicTermId || currentTerm.id,
        }));
        const result = yield prisma.class.createMany({
            data: dataToCreate,
            skipDuplicates: true,
        });
        res.status(201).json({
            message: `Successfully imported ${result.count} classes`,
            count: result.count,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Bulk create classes error:', error);
        res.status(500).json({ error: 'Failed to import classes' });
    }
});
exports.bulkCreateClasses = bulkCreateClasses;
