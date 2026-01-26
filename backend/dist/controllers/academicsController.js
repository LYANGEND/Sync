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
exports.getTeacherSubjectAssignments = exports.getClassSubjectTeachers = exports.assignSubjectTeacher = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const assignTeacherSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid(),
});
const assignSubjectTeacher = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, subjectId, teacherId } = assignTeacherSchema.parse(req.body);
        // Verify entities exist
        const [classExists, subjectExists, teacherExists] = yield Promise.all([
            prisma.class.findUnique({ where: { id: classId } }),
            prisma.subject.findUnique({ where: { id: subjectId } }),
            prisma.user.findUnique({ where: { id: teacherId, role: { in: ['TEACHER', 'SUPER_ADMIN'] } } }),
        ]);
        if (!classExists)
            return res.status(404).json({ message: 'Class not found' });
        if (!subjectExists)
            return res.status(404).json({ message: 'Subject not found' });
        if (!teacherExists)
            return res.status(404).json({ message: 'Teacher not found' });
        // Upsert the assignment
        // Since we have a unique constraint on [classId, subjectId], upsert works perfectly.
        // However, Prisma upsert needs a unique 'where' clause.
        // The @@unique([classId, subjectId]) generates a compound unique index.
        const assignment = yield prisma.teacherSubject.upsert({
            where: {
                classId_subjectId: {
                    classId,
                    subjectId,
                },
            },
            update: {
                teacherId,
            },
            create: {
                classId,
                subjectId,
                teacherId,
            },
            include: {
                teacher: { select: { fullName: true } },
                subject: { select: { name: true } },
                class: { select: { name: true } },
            },
        });
        res.json(assignment);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Assign teacher error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.assignSubjectTeacher = assignSubjectTeacher;
const getClassSubjectTeachers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId } = req.params;
        const assignments = yield prisma.teacherSubject.findMany({
            where: { classId },
            include: {
                teacher: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                },
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    }
                }
            }
        });
        res.json(assignments);
    }
    catch (error) {
        console.error('Get class assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getClassSubjectTeachers = getClassSubjectTeachers;
const getTeacherSubjectAssignments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teacherId } = req.params;
        const assignments = yield prisma.teacherSubject.findMany({
            where: { teacherId },
            include: {
                class: {
                    select: {
                        id: true,
                        name: true,
                        gradeLevel: true
                    }
                },
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true
                    }
                }
            }
        });
        res.json(assignments);
    }
    catch (error) {
        console.error('Get teacher assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getTeacherSubjectAssignments = getTeacherSubjectAssignments;
