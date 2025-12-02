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
exports.getStudentAssessments = exports.submitQuiz = exports.getQuizForStudent = exports.getAssessmentQuestions = exports.addQuestionsToAssessment = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
// Schema for creating/updating questions
const questionSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    type: zod_1.z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY']),
    points: zod_1.z.number().min(1),
    correctAnswer: zod_1.z.string().optional(),
    options: zod_1.z.array(zod_1.z.object({
        text: zod_1.z.string(),
        isCorrect: zod_1.z.boolean()
    })).optional()
});
const addQuestionsToAssessment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { assessmentId } = req.params;
        const { questions } = req.body;
        // Validate assessment exists
        const assessment = yield prisma.assessment.findUnique({
            where: { id: assessmentId }
        });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        // Create questions in transaction
        yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            for (const q of questions) {
                const questionData = questionSchema.parse(q);
                const createdQuestion = yield tx.question.create({
                    data: {
                        assessmentId,
                        text: questionData.text,
                        type: questionData.type,
                        points: questionData.points,
                        correctAnswer: questionData.correctAnswer,
                    }
                });
                if (questionData.options && questionData.options.length > 0) {
                    yield tx.questionOption.createMany({
                        data: questionData.options.map(opt => ({
                            questionId: createdQuestion.id,
                            text: opt.text,
                            isCorrect: opt.isCorrect
                        }))
                    });
                }
            }
        }));
        // Enable online mode for assessment
        yield prisma.assessment.update({
            where: { id: assessmentId },
            data: { isOnline: true }
        });
        res.json({ message: 'Questions added successfully' });
    }
    catch (error) {
        console.error('Add questions error:', error);
        res.status(500).json({ error: 'Failed to add questions' });
    }
});
exports.addQuestionsToAssessment = addQuestionsToAssessment;
const getAssessmentQuestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { assessmentId } = req.params;
        // Check if user is student or teacher
        // If student, don't return correct answers or isCorrect flags
        // For now, assuming teacher view or internal logic handles it
        // But wait, if this is for taking the quiz, we must hide answers.
        const questions = yield prisma.question.findMany({
            where: { assessmentId },
            include: {
                options: {
                    select: {
                        id: true,
                        text: true,
                        // Only include isCorrect if teacher? 
                        // For simplicity, let's make a separate endpoint for taking the quiz
                    }
                }
            }
        });
        res.json(questions);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});
exports.getAssessmentQuestions = getAssessmentQuestions;
// For Students taking the quiz
const getQuizForStudent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { assessmentId } = req.params;
        const assessment = yield prisma.assessment.findUnique({
            where: { id: assessmentId },
            include: {
                questions: {
                    include: {
                        options: {
                            select: {
                                id: true,
                                text: true
                            }
                        }
                    }
                }
            }
        });
        if (!assessment) {
            return res.status(404).json({ error: 'Assessment not found' });
        }
        // Remove sensitive data
        const sanitizedQuestions = assessment.questions.map((q) => ({
            id: q.id,
            text: q.text,
            type: q.type,
            points: q.points,
            options: q.options
        }));
        res.json({
            id: assessment.id,
            title: assessment.title,
            durationMinutes: assessment.durationMinutes,
            questions: sanitizedQuestions
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to load quiz' });
    }
});
exports.getQuizForStudent = getQuizForStudent;
const submitQuiz = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { assessmentId } = req.params;
        const { studentId, responses } = req.body; // responses: { questionId: string, answer: string | optionId }[]
        // If studentId is a User ID (from frontend auth), find the actual Student ID
        let actualStudentId = studentId;
        // Check if this ID looks like a User ID (UUID) and try to find a student linked to it
        // Or just try to find a student with this userId
        const studentProfile = yield prisma.student.findUnique({
            where: { userId: studentId }
        });
        if (studentProfile) {
            actualStudentId = studentProfile.id;
        }
        // Start transaction
        const result = yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // 1. Create Submission
            const submission = yield tx.assessmentSubmission.create({
                data: {
                    assessmentId,
                    studentId: actualStudentId,
                    submittedAt: new Date(),
                    status: 'SUBMITTED'
                }
            });
            // 2. Record Responses
            let totalScore = 0;
            for (const resp of responses) {
                const question = yield tx.question.findUnique({
                    where: { id: resp.questionId },
                    include: { options: true }
                });
                if (!question)
                    continue;
                let isCorrect = false;
                let score = 0;
                if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
                    const selectedOption = question.options.find((o) => o.id === resp.answer);
                    if (selectedOption && selectedOption.isCorrect) {
                        isCorrect = true;
                        score = question.points;
                    }
                    yield tx.studentResponse.create({
                        data: {
                            submissionId: submission.id,
                            questionId: question.id,
                            selectedOptionId: resp.answer
                        }
                    });
                }
                else {
                    // Manual grading needed for others
                    yield tx.studentResponse.create({
                        data: {
                            submissionId: submission.id,
                            questionId: question.id,
                            answerText: resp.answer
                        }
                    });
                }
                totalScore += score;
            }
            // Update submission score (auto-graded part)
            yield tx.assessmentSubmission.update({
                where: { id: submission.id },
                data: { score: totalScore }
            });
            return { submissionId: submission.id, score: totalScore };
        }));
        res.json(result);
    }
    catch (error) {
        console.error('Submit quiz error:', error);
        res.status(500).json({ error: 'Failed to submit quiz' });
    }
});
exports.submitQuiz = submitQuiz;
const getStudentAssessments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Find student profile
        const student = yield prisma.student.findUnique({
            where: { userId }
        });
        if (!student) {
            return res.status(404).json({ error: 'Student profile not found' });
        }
        // Get assessments for student's class
        const assessments = yield prisma.assessment.findMany({
            where: {
                classId: student.classId,
                // Optional: Filter by active term
            },
            include: {
                subject: true,
                submissions: {
                    where: { studentId: student.id },
                    take: 1
                }
            },
            orderBy: { date: 'desc' }
        });
        // Format response
        const formattedAssessments = assessments.map((a) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            date: a.date,
            subject: { name: a.subject.name },
            durationMinutes: a.durationMinutes,
            isOnline: a.isOnline,
            submission: a.submissions[0] ? {
                status: a.submissions[0].status,
                score: a.submissions[0].score
            } : null
        }));
        res.json(formattedAssessments);
    }
    catch (error) {
        console.error('Get student assessments error:', error);
        res.status(500).json({ error: 'Failed to fetch assessments' });
    }
});
exports.getStudentAssessments = getStudentAssessments;
