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
exports.getMySubmissions = exports.gradeSubmission = exports.submitHomework = exports.getSubmissions = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
// Get homework submissions for an assessment
const getSubmissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { assessmentId } = req.params;
        const submissions = yield prisma_1.prisma.homeworkSubmission.findMany({
            where: { assessmentId },
            include: {
                student: {
                    select: { id: true, firstName: true, lastName: true, admissionNumber: true }
                }
            },
            orderBy: { student: { lastName: 'asc' } },
        });
        res.json(submissions);
    }
    catch (error) {
        console.error('Get submissions error:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});
exports.getSubmissions = getSubmissions;
// Student submits homework
const submitHomework = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { assessmentId } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { content, fileUrl } = req.body;
        // Get student record from user
        const student = yield prisma_1.prisma.student.findFirst({ where: { userId } });
        if (!student) {
            return res.status(404).json({ error: 'Student profile not found' });
        }
        // Check assessment exists and get due date
        const assessment = yield prisma_1.prisma.assessment.findUnique({ where: { id: assessmentId } });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        const now = new Date();
        const isLate = assessment.dueDate ? now > assessment.dueDate : false;
        const submission = yield prisma_1.prisma.homeworkSubmission.upsert({
            where: {
                assessmentId_studentId: { assessmentId, studentId: student.id }
            },
            update: {
                content,
                fileUrl,
                status: isLate ? 'LATE_SUBMITTED' : 'SUBMITTED',
                submittedAt: now,
                isLate,
            },
            create: {
                assessmentId,
                studentId: student.id,
                content,
                fileUrl,
                status: isLate ? 'LATE_SUBMITTED' : 'SUBMITTED',
                submittedAt: now,
                isLate,
            },
        });
        res.status(201).json(submission);
    }
    catch (error) {
        console.error('Submit homework error:', error);
        res.status(500).json({ error: 'Failed to submit homework' });
    }
});
exports.submitHomework = submitHomework;
// Teacher grades a homework submission
const gradeSubmission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { score, feedback } = zod_1.z.object({
            score: zod_1.z.number().min(0),
            feedback: zod_1.z.string().optional(),
        }).parse(req.body);
        const submission = yield prisma_1.prisma.homeworkSubmission.update({
            where: { id },
            data: {
                score,
                feedback,
                status: 'GRADED',
                gradedAt: new Date(),
                gradedBy: userId,
            },
        });
        res.json(submission);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Grade submission error:', error);
        res.status(500).json({ error: 'Failed to grade submission' });
    }
});
exports.gradeSubmission = gradeSubmission;
// Get student's own submissions
const getMySubmissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const student = yield prisma_1.prisma.student.findFirst({ where: { userId } });
        if (!student) {
            return res.status(404).json({ error: 'Student profile not found' });
        }
        const submissions = yield prisma_1.prisma.homeworkSubmission.findMany({
            where: { studentId: student.id },
            include: {
                assessment: {
                    include: {
                        subject: { select: { name: true, code: true } },
                        class: { select: { name: true } },
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(submissions);
    }
    catch (error) {
        console.error('Get my submissions error:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});
exports.getMySubmissions = getMySubmissions;
