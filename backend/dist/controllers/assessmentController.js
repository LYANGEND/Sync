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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGradebook = exports.getStudentResults = exports.getAssessmentResults = exports.recordResults = exports.bulkDeleteAssessments = exports.deleteAssessment = exports.getAssessmentById = exports.getAssessments = exports.createAssessment = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
// Prisma Client should be generated. If you see errors here, try reloading the window.
const prisma = new client_1.PrismaClient();
const createAssessmentSchema = zod_1.z.object({
    title: zod_1.z.string().min(2),
    type: zod_1.z.enum(['EXAM', 'TEST', 'QUIZ', 'HOMEWORK', 'PROJECT']),
    description: zod_1.z.string().optional(),
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    termId: zod_1.z.string().uuid(),
    totalMarks: zod_1.z.number().positive(),
    weight: zod_1.z.number().min(0).max(100),
    date: zod_1.z.string().datetime(),
});
const recordResultsSchema = zod_1.z.object({
    assessmentId: zod_1.z.string().uuid(),
    results: zod_1.z.array(zod_1.z.object({
        studentId: zod_1.z.string().uuid(),
        score: zod_1.z.number().min(0),
        remarks: zod_1.z.string().optional(),
    })),
});
const createAssessment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = createAssessmentSchema.parse(req.body);
        const { date } = data, restData = __rest(data, ["date"]);
        const assessment = yield prisma.assessment.create({
            data: Object.assign(Object.assign({}, restData), { date: new Date(date) }),
        });
        res.status(201).json(assessment);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Create assessment error:', error);
        res.status(500).json({ error: 'Failed to create assessment' });
    }
});
exports.createAssessment = createAssessment;
const getAssessments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, subjectId, termId } = req.query;
        const where = {};
        if (classId)
            where.classId = String(classId);
        if (subjectId)
            where.subjectId = String(subjectId);
        if (termId)
            where.termId = String(termId);
        const assessments = yield prisma.assessment.findMany({
            where,
            include: {
                subject: true,
                class: true,
                _count: {
                    select: { results: true }
                }
            },
            orderBy: { date: 'desc' },
        });
        res.json(assessments);
    }
    catch (error) {
        console.error('Get assessments error:', error);
        res.status(500).json({ error: 'Failed to fetch assessments' });
    }
});
exports.getAssessments = getAssessments;
const getAssessmentById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const assessment = yield prisma.assessment.findUnique({
            where: { id },
            include: {
                subject: true,
                class: true,
                term: true,
            }
        });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        res.json(assessment);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch assessment' });
    }
});
exports.getAssessmentById = getAssessmentById;
const deleteAssessment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.assessment.delete({ where: { id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete assessment' });
    }
});
exports.deleteAssessment = deleteAssessment;
const bulkDeleteAssessments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { ids } = zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string().uuid()) }).parse(req.body);
        yield prisma.assessment.deleteMany({
            where: { id: { in: ids } }
        });
        res.json({ message: `Successfully deleted ${ids.length} assessments` });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to delete assessments' });
    }
});
exports.bulkDeleteAssessments = bulkDeleteAssessments;
const recordResults = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { assessmentId, results } = recordResultsSchema.parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Verify assessment exists
        const assessment = yield prisma.assessment.findUnique({
            where: { id: assessmentId }
        });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        // Use transaction to upsert results
        const operations = results.map(result => prisma.assessmentResult.upsert({
            where: {
                assessmentId_studentId: {
                    assessmentId,
                    studentId: result.studentId
                }
            },
            update: {
                score: result.score,
                remarks: result.remarks,
                gradedByUserId: userId,
            },
            create: {
                assessmentId,
                studentId: result.studentId,
                score: result.score,
                remarks: result.remarks,
                gradedByUserId: userId,
            }
        }));
        yield prisma.$transaction(operations);
        res.json({ message: 'Results recorded successfully' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Record results error:', error);
        res.status(500).json({ error: 'Failed to record results' });
    }
});
exports.recordResults = recordResults;
const getAssessmentResults = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params; // assessmentId
        const results = yield prisma.assessmentResult.findMany({
            where: { assessmentId: id },
            include: {
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    }
                }
            },
            orderBy: {
                student: { lastName: 'asc' }
            }
        });
        res.json(results);
    }
    catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});
exports.getAssessmentResults = getAssessmentResults;
const getStudentResults = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const { termId } = req.query;
        const where = { studentId };
        if (termId) {
            where.assessment = { termId: String(termId) };
        }
        const results = yield prisma.assessmentResult.findMany({
            where,
            include: {
                assessment: {
                    include: {
                        subject: true
                    }
                }
            },
            orderBy: {
                assessment: { date: 'desc' }
            }
        });
        res.json(results);
    }
    catch (error) {
        console.error('Get student results error:', error);
        res.status(500).json({ error: 'Failed to fetch student results' });
    }
});
exports.getStudentResults = getStudentResults;
const getGradebook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, subjectId, termId } = req.query;
        if (!classId || !subjectId || !termId) {
            return res.status(400).json({ error: 'Class, Subject and Term IDs are required' });
        }
        // 1. Get Assessments
        const assessments = yield prisma.assessment.findMany({
            where: {
                classId: String(classId),
                subjectId: String(subjectId),
                termId: String(termId)
            },
            orderBy: { date: 'asc' }
        });
        // 2. Get Students (using specific ID/String casting to be safe)
        const students = yield prisma.student.findMany({
            where: { classId: String(classId) },
            orderBy: { lastName: 'asc' },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                admissionNumber: true
            }
        });
        // 3. Get All Results for these assessments
        const assessmentIds = assessments.map(a => a.id);
        const results = yield prisma.assessmentResult.findMany({
            where: { assessmentId: { in: assessmentIds } }
        });
        res.json({ assessments, students, results });
    }
    catch (error) {
        console.error('Get gradebook error:', error);
        res.status(500).json({ error: 'Failed to fetch gradebook data' });
    }
});
exports.getGradebook = getGradebook;
