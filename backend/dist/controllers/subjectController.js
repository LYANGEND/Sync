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
exports.bulkCreateSubjects = exports.deleteSubject = exports.updateSubject = exports.createSubject = exports.getSubjects = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const subjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    code: zod_1.z.string().min(2),
    teacherId: zod_1.z.string().uuid().optional().nullable(),
});
const getSubjects = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subjects = yield prisma.subject.findMany({
            orderBy: { name: 'asc' },
            include: {
                teacher: {
                    select: { id: true, fullName: true }
                }
            }
        });
        res.json(subjects);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
});
exports.getSubjects = getSubjects;
const createSubject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, code, teacherId } = subjectSchema.parse(req.body);
        const existingSubject = yield prisma.subject.findUnique({
            where: { code },
        });
        if (existingSubject) {
            return res.status(400).json({ error: 'Subject with this code already exists' });
        }
        const subject = yield prisma.subject.create({
            data: {
                name,
                code,
                teacherId: teacherId || undefined
            },
            include: {
                teacher: {
                    select: { id: true, fullName: true }
                }
            }
        });
        res.status(201).json(subject);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create subject' });
    }
});
exports.createSubject = createSubject;
const updateSubject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, code, teacherId } = subjectSchema.parse(req.body);
        const subject = yield prisma.subject.update({
            where: { id },
            data: {
                name,
                code,
                teacherId: teacherId === null ? null : (teacherId || undefined)
            },
            include: {
                teacher: {
                    select: { id: true, fullName: true }
                }
            }
        });
        res.json(subject);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update subject' });
    }
});
exports.updateSubject = updateSubject;
const deleteSubject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.subject.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete subject' });
    }
});
exports.deleteSubject = deleteSubject;
const bulkCreateSubjects = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subjectsData = zod_1.z.array(subjectSchema).parse(req.body);
        const result = yield prisma.subject.createMany({
            data: subjectsData,
            skipDuplicates: true,
        });
        res.status(201).json({
            message: `Successfully imported ${result.count} subjects`,
            count: result.count,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Bulk create subjects error:', error);
        res.status(500).json({ error: 'Failed to import subjects' });
    }
});
exports.bulkCreateSubjects = bulkCreateSubjects;
