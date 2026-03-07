"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReportRemarks = exports.getAIStatus = exports.getStudentInsights = exports.getTeachingContext = exports.deleteFavoritePrompt = exports.saveFavoritePrompt = exports.getFavoritePrompts = exports.publishArtifactToHomework = exports.deleteArtifact = exports.getArtifacts = exports.saveArtifact = exports.handleSlashCommand = exports.sendMessage = exports.getConversation = exports.deleteConversation = exports.getConversations = exports.createConversation = void 0;
const prisma_1 = require("../utils/prisma");
const aiService_1 = __importDefault(require("../services/aiService"));
const aiUsageTracker_1 = __importDefault(require("../services/aiUsageTracker"));
const convoService = __importStar(require("../services/conversationService"));
// ==========================================
// Conversation Management
// ==========================================
const createConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { title, context } = req.body;
        const conversation = yield convoService.createConversation(userId, 'teaching-assistant', title || 'New Conversation', context || {});
        res.status(201).json(conversation);
    }
    catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});
exports.createConversation = createConversation;
const getConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const conversations = yield convoService.listConversationsExcluding(userId, 'financial-advisor');
        res.json(conversations);
    }
    catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});
exports.getConversations = getConversations;
const deleteConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        yield convoService.deleteConversation(req.params.id, userId);
        res.json({ message: 'Conversation deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});
exports.deleteConversation = deleteConversation;
const getConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const result = yield convoService.getConversation(req.params.id, userId);
        if (!result)
            return res.status(404).json({ error: 'Conversation not found' });
        res.json(result);
    }
    catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});
exports.getConversation = getConversation;
// ==========================================
// Chat / Message Handling
// ==========================================
const sendMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { conversationId, message, context } = req.body;
        if (!(message === null || message === void 0 ? void 0 : message.trim())) {
            return res.status(400).json({ error: 'Message is required' });
        }
        // Get or create conversation
        let conversation;
        if (conversationId) {
            conversation = yield prisma_1.prisma.aIConversation.findFirst({
                where: { id: conversationId, userId },
                include: { messages: { orderBy: { createdAt: 'asc' } } },
            });
        }
        if (!conversation) {
            conversation = yield prisma_1.prisma.aIConversation.create({
                data: {
                    userId,
                    title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
                    context: Object.assign(Object.assign({}, (context || {})), { type: 'teaching-assistant' }),
                },
                include: { messages: true },
            });
        }
        // Save user message
        yield prisma_1.prisma.aIMessage.create({
            data: {
                conversationId: conversation.id,
                role: 'user',
                content: message,
            },
        });
        // Build context for AI — load teacher's real data
        const teacherCtx = yield getTeacherContext(userId);
        let classInsights = '';
        if (context === null || context === void 0 ? void 0 : context.classId) {
            classInsights = yield getClassInsights(context.classId);
        }
        const systemPrompt = buildSystemPrompt(context, teacherCtx.summary, classInsights);
        const previousMessages = conversation.messages.slice(-20).map((m) => ({
            role: m.role,
            content: m.content,
        }));
        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...previousMessages,
            { role: 'user', content: message },
        ];
        // Call AI
        const startTime = Date.now();
        const aiResponse = yield aiService_1.default.chat(chatMessages, {
            temperature: 0.7,
            maxTokens: 3000,
        });
        const responseTimeMs = Date.now() - startTime;
        // Track usage
        aiUsageTracker_1.default.track({
            userId,
            branchId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.branchId,
            feature: 'teaching-assistant',
            action: (context === null || context === void 0 ? void 0 : context.systemOverride) ? 'slash-command' : 'chat',
            tokensUsed: aiResponse.tokensUsed,
            responseTimeMs,
            model: aiResponse.model,
            metadata: (context === null || context === void 0 ? void 0 : context.systemOverride) ? { command: message.split(' ')[0] } : undefined,
        });
        // Save assistant response
        const assistantMessage = yield prisma_1.prisma.aIMessage.create({
            data: {
                conversationId: conversation.id,
                role: 'assistant',
                content: aiResponse.content,
                tokenCount: aiResponse.tokensUsed || null,
            },
        });
        // Update conversation
        yield prisma_1.prisma.aIConversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
        });
        res.json({
            conversationId: conversation.id,
            message: assistantMessage,
            tokensUsed: aiResponse.tokensUsed,
        });
    }
    catch (error) {
        console.error('AI message error:', error);
        res.status(500).json({ error: error.message || 'Failed to process AI request' });
    }
});
exports.sendMessage = sendMessage;
// ==========================================
// Slash Commands
// ==========================================
const handleSlashCommand = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { command, params, conversationId } = req.body;
        let prompt = '';
        let systemOverride = '';
        switch (command) {
            case '/lesson':
                systemOverride = 'You are a Zambian curriculum expert. Create detailed, standards-aligned lesson plans.';
                prompt = `Create a detailed lesson plan for: ${params.topic || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Subject: ${params.subject || 'Not specified'}
Duration: ${params.duration || '40 minutes'}

Include: Objectives, Materials, Introduction (5 min), Development (25 min), Conclusion (10 min), Assessment, and Differentiation strategies.`;
                break;
            case '/quiz':
                systemOverride = 'You are an assessment expert. Create high-quality quiz questions with answer keys.';
                prompt = `Create a quiz with ${params.count || 10} questions on: ${params.topic || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Subject: ${params.subject || 'Not specified'}
Question Types: ${params.types || 'Mix of multiple choice, true/false, and short answer'}

Include answer key and point values. Vary difficulty across Bloom's taxonomy levels.`;
                break;
            case '/email':
                systemOverride = 'You are a professional school communicator. Write clear, warm, professional emails.';
                prompt = `Draft a professional email for a school context:
Purpose: ${params.purpose || params.text}
Audience: ${params.audience || 'Parents'}
Tone: ${params.tone || 'Professional and warm'}`;
                break;
            case '/tips':
                systemOverride = 'You are a teaching methodology expert specializing in Zambian education.';
                prompt = `Provide 5-7 practical teaching tips for: ${params.topic || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Context: Zambian classroom with limited resources`;
                break;
            case '/rubric':
                systemOverride = 'You are an assessment expert. Create detailed, fair rubrics.';
                prompt = `Create a detailed grading rubric for: ${params.assignment || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Subject: ${params.subject || 'Not specified'}
Criteria: ${params.criteria || '4-5 criteria with 4 performance levels each'}

Include point values and clear descriptions for each performance level.`;
                break;
            case '/differentiate':
                systemOverride = 'You are a differentiated instruction expert.';
                prompt = `Create differentiated versions of this content/activity: ${params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}

Create 3 versions:
1. Below grade level (simplified language, visual supports)
2. On grade level (standard)
3. Above grade level (extended challenge, deeper analysis)

Also add ELL (English Language Learner) modifications.`;
                break;
            default:
                return res.status(400).json({ error: `Unknown command: ${command}` });
        }
        // Forward to sendMessage logic
        req.body = { conversationId, message: prompt, context: { systemOverride } };
        return (0, exports.sendMessage)(req, res);
    }
    catch (error) {
        console.error('Slash command error:', error);
        res.status(500).json({ error: 'Failed to process command' });
    }
});
exports.handleSlashCommand = handleSlashCommand;
// ==========================================
// Artifacts
// ==========================================
const saveArtifact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { conversationId, type, title, content, metadata } = req.body;
        const artifact = yield prisma_1.prisma.aIArtifact.create({
            data: {
                conversationId,
                userId,
                type: type || 'OTHER',
                title: title || 'Untitled',
                content,
                metadata: metadata || null,
            },
        });
        res.status(201).json(artifact);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save artifact' });
    }
});
exports.saveArtifact = saveArtifact;
const getArtifacts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { type } = req.query;
        const where = { userId };
        if (type)
            where.type = type;
        const artifacts = yield prisma_1.prisma.aIArtifact.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
        });
        res.json(artifacts);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch artifacts' });
    }
});
exports.getArtifacts = getArtifacts;
const deleteArtifact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        yield prisma_1.prisma.aIArtifact.deleteMany({
            where: { id, userId },
        });
        res.json({ message: 'Artifact deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete artifact' });
    }
});
exports.deleteArtifact = deleteArtifact;
const publishArtifactToHomework = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { classId, subjectId, termId, dueDate } = req.body;
        const artifact = yield prisma_1.prisma.aIArtifact.findFirst({
            where: { id, userId },
        });
        if (!artifact)
            return res.status(404).json({ error: 'Artifact not found' });
        // Create an assessment from the artifact
        const assessment = yield prisma_1.prisma.assessment.create({
            data: {
                title: artifact.title,
                type: 'HOMEWORK',
                description: `AI-generated: ${artifact.title}`,
                classId,
                subjectId,
                termId,
                totalMarks: 100,
                weight: 10,
                date: new Date(dueDate || Date.now()),
            },
        });
        // Mark artifact as published
        yield prisma_1.prisma.aIArtifact.update({
            where: { id },
            data: { isPublished: true },
        });
        res.json({ message: 'Published to homework', assessmentId: assessment.id });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to publish artifact' });
    }
});
exports.publishArtifactToHomework = publishArtifactToHomework;
// ==========================================
// Favorite Prompts
// ==========================================
const getFavoritePrompts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const prompts = yield prisma_1.prisma.aIFavoritePrompt.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(prompts);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});
exports.getFavoritePrompts = getFavoritePrompts;
const saveFavoritePrompt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { title, prompt, category } = req.body;
        const saved = yield prisma_1.prisma.aIFavoritePrompt.create({
            data: {
                userId,
                title,
                prompt,
                category: category || 'general',
            },
        });
        res.status(201).json(saved);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to save prompt' });
    }
});
exports.saveFavoritePrompt = saveFavoritePrompt;
const deleteFavoritePrompt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        yield prisma_1.prisma.aIFavoritePrompt.deleteMany({
            where: { id, userId },
        });
        res.json({ message: 'Prompt deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete prompt' });
    }
});
exports.deleteFavoritePrompt = deleteFavoritePrompt;
// ==========================================
// Teacher Context (classes, subjects)
// ==========================================
const getTeachingContext = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const ctx = yield getTeacherContext(userId);
        res.json({ classes: ctx.classes, subjects: ctx.subjects });
    }
    catch (error) {
        console.error('Get teaching context error:', error);
        res.status(500).json({ error: 'Failed to load teaching context' });
    }
});
exports.getTeachingContext = getTeachingContext;
// ==========================================
// Student Performance Insights
// ==========================================
const getStudentInsights = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { classId, subjectId } = req.query;
        if (!classId)
            return res.status(400).json({ error: 'classId is required' });
        const cls = yield prisma_1.prisma.class.findUnique({
            where: { id: classId },
            include: {
                students: {
                    where: { status: 'ACTIVE' },
                    select: { id: true, firstName: true, lastName: true, gender: true },
                    orderBy: { lastName: 'asc' },
                },
                academicTerm: true,
            },
        });
        if (!cls)
            return res.status(404).json({ error: 'Class not found' });
        const studentIds = cls.students.map((s) => s.id);
        // Attendance last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const attendance = yield prisma_1.prisma.attendance.findMany({
            where: {
                studentId: { in: studentIds },
                date: { gte: thirtyDaysAgo },
            },
        });
        // Per-student attendance
        const attByStudent = {};
        for (const a of attendance) {
            if (!attByStudent[a.studentId])
                attByStudent[a.studentId] = { present: 0, late: 0, absent: 0, total: 0 };
            const entry = attByStudent[a.studentId];
            entry.total++;
            if (a.status === 'PRESENT')
                entry.present++;
            else if (a.status === 'LATE')
                entry.late++;
            else
                entry.absent++;
        }
        // Term results
        const termResultsWhere = { classId: classId };
        if (cls.academicTerm)
            termResultsWhere.termId = cls.academicTerm.id;
        if (subjectId)
            termResultsWhere.subjectId = subjectId;
        const termResults = yield prisma_1.prisma.termResult.findMany({
            where: termResultsWhere,
            include: { subject: { select: { name: true } } },
        });
        // Per-student scores
        const scoresByStudent = {};
        for (const r of termResults) {
            const sid = r.studentId;
            if (!scoresByStudent[sid])
                scoresByStudent[sid] = { subjects: {}, total: 0, count: 0 };
            const entry = scoresByStudent[sid];
            const score = Number(r.totalScore);
            entry.subjects[r.subject.name] = score;
            entry.total += score;
            entry.count++;
        }
        // Build student insights
        const students = cls.students.map((s) => {
            const att = attByStudent[s.id] || { present: 0, late: 0, absent: 0, total: 0 };
            const scores = scoresByStudent[s.id] || { subjects: {}, total: 0, count: 0 };
            const avgScore = scores.count > 0 ? scores.total / scores.count : null;
            const attendanceRate = att.total > 0 ? Math.round((att.present / att.total) * 100) : null;
            return {
                id: s.id,
                name: `${s.firstName} ${s.lastName}`,
                gender: s.gender,
                averageScore: avgScore ? Number(avgScore.toFixed(1)) : null,
                attendanceRate,
                attendanceDays: att,
                subjects: scores.subjects,
                riskLevel: avgScore !== null && avgScore < 40 ? 'high' : avgScore !== null && avgScore < 55 ? 'medium' : 'low',
            };
        });
        // Class summary
        const classAvg = students.filter((s) => s.averageScore !== null);
        const overallAvg = classAvg.length > 0 ? classAvg.reduce((sum, s) => sum + (s.averageScore || 0), 0) / classAvg.length : null;
        res.json({
            className: cls.name,
            gradeLevel: cls.gradeLevel,
            term: ((_b = cls.academicTerm) === null || _b === void 0 ? void 0 : _b.name) || null,
            totalStudents: cls.students.length,
            classAverage: overallAvg ? Number(overallAvg.toFixed(1)) : null,
            atRiskCount: students.filter((s) => s.riskLevel === 'high').length,
            students,
        });
    }
    catch (error) {
        console.error('Student insights error:', error);
        res.status(500).json({ error: 'Failed to load student insights' });
    }
});
exports.getStudentInsights = getStudentInsights;
// ==========================================
// AI Status Check
// ==========================================
const getAIStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isAvailable = yield aiService_1.default.isAvailable();
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        res.json({
            available: isAvailable,
            provider: (settings === null || settings === void 0 ? void 0 : settings.aiProvider) || 'not configured',
            model: (settings === null || settings === void 0 ? void 0 : settings.aiModel) || 'not configured',
            enabled: (settings === null || settings === void 0 ? void 0 : settings.aiEnabled) || false,
        });
    }
    catch (error) {
        res.json({ available: false, provider: 'error', model: 'error', enabled: false });
    }
});
exports.getAIStatus = getAIStatus;
// ==========================================
// AI Report Card Remarks
// ==========================================
const generateReportRemarks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { studentId, termId } = req.body;
        const student = yield prisma_1.prisma.student.findUnique({
            where: { id: studentId },
            include: { class: true },
        });
        if (!student)
            return res.status(404).json({ error: 'Student not found' });
        const termResults = yield prisma_1.prisma.termResult.findMany({
            where: { studentId, termId },
            include: { subject: true },
        });
        const attendance = yield prisma_1.prisma.attendance.findMany({
            where: { studentId },
        });
        const totalRecords = attendance.length;
        const presentCount = attendance.filter((a) => a.status !== 'ABSENT').length;
        const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
        const subjects = termResults.map((r) => ({
            name: r.subject.name,
            score: Number(r.totalScore),
            grade: r.grade || 'N/A',
        }));
        const avgScore = subjects.length > 0
            ? subjects.reduce((sum, s) => sum + s.score, 0) / subjects.length
            : 0;
        const prompt = `Generate a teacher's report card remark for this student:

Student: ${student.firstName} ${student.lastName}
Class: ${student.class.name}
Average Score: ${avgScore.toFixed(1)}%
Attendance Rate: ${attendanceRate}%
Subjects: ${subjects.map((s) => `${s.name}: ${s.score}% (${s.grade})`).join(', ')}

Write TWO remarks:
1. Class Teacher's Remark (2-3 sentences, encouraging, specific to performance)
2. Principal's Remark (1-2 sentences, formal, forward-looking)

Consider this is a Zambian school. Be professional, encouraging, and specific.
Respond with JSON: { "classTeacherRemark": "...", "principalRemark": "..." }`;
        const startTime = Date.now();
        const remarks = yield aiService_1.default.generateJSON(prompt, {
            systemPrompt: 'You are an experienced Zambian school teacher writing report card remarks.',
            temperature: 0.6,
        });
        aiUsageTracker_1.default.track({
            userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || 'unknown',
            branchId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.branchId,
            feature: 'teaching-assistant',
            action: 'generate-remarks',
            responseTimeMs: Date.now() - startTime,
            metadata: { studentId, termId },
        });
        res.json(remarks);
    }
    catch (error) {
        console.error('Generate remarks error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate remarks' });
    }
});
exports.generateReportRemarks = generateReportRemarks;
// ==========================================
// Helpers
// ==========================================
function getTeacherContext(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Get classes where user is class teacher
            const classTeacher = yield prisma_1.prisma.class.findMany({
                where: { teacherId: userId },
                include: {
                    subjects: { select: { id: true, name: true, code: true } },
                    _count: { select: { students: true } },
                    academicTerm: { select: { name: true, isActive: true } },
                },
            });
            // Get subjects assigned via TeacherSubject
            const teacherSubjects = yield prisma_1.prisma.teacherSubject.findMany({
                where: { teacherId: userId },
                include: {
                    subject: { select: { id: true, name: true, code: true } },
                    class: {
                        select: { id: true, name: true, gradeLevel: true, _count: { select: { students: true } } },
                    },
                },
            });
            // Build unique class list
            const classMap = new Map();
            for (const c of classTeacher) {
                classMap.set(c.id, {
                    id: c.id,
                    name: c.name,
                    gradeLevel: c.gradeLevel,
                    studentCount: c._count.students,
                    isClassTeacher: true,
                    subjects: c.subjects.map((s) => s.name),
                    term: (_a = c.academicTerm) === null || _a === void 0 ? void 0 : _a.name,
                });
            }
            for (const ts of teacherSubjects) {
                if (!classMap.has(ts.classId)) {
                    classMap.set(ts.classId, {
                        id: ts.classId,
                        name: ts.class.name,
                        gradeLevel: ts.class.gradeLevel,
                        studentCount: ts.class._count.students,
                        isClassTeacher: false,
                        subjects: [],
                        term: null,
                    });
                }
                const entry = classMap.get(ts.classId);
                if (!entry.subjects.includes(ts.subject.name)) {
                    entry.subjects.push(ts.subject.name);
                }
            }
            const classes = Array.from(classMap.values());
            const allSubjects = teacherSubjects.map((ts) => ({
                id: ts.subject.id,
                name: ts.subject.name,
                code: ts.subject.code,
                classId: ts.classId,
                className: ts.class.name,
            }));
            // Fetch recent lesson plans for this teacher
            const recentPlans = yield prisma_1.prisma.lessonPlan.findMany({
                where: { teacherId: userId },
                orderBy: { weekStartDate: 'desc' },
                take: 10,
                include: {
                    subject: { select: { name: true, code: true } },
                    class: { select: { name: true, gradeLevel: true } },
                },
            });
            // Build summary string for system prompt
            let summary = '';
            if (classes.length > 0) {
                summary = `\n\nYour teaching assignments:\n`;
                for (const c of classes) {
                    summary += `- ${c.name} (Grade ${c.gradeLevel}, ${c.studentCount} students${c.isClassTeacher ? ', you are class teacher' : ''}): ${c.subjects.join(', ') || 'No subjects assigned'}\n`;
                }
            }
            if (recentPlans.length > 0) {
                summary += `\n\nYour recent lesson plans:\n`;
                for (const plan of recentPlans) {
                    const date = new Date(plan.weekStartDate).toLocaleDateString();
                    summary += `- [${date}] ${plan.subject.name} / ${plan.class.name}: ${plan.title}\n`;
                }
                summary += `(You have ${recentPlans.length} recent plans available. When asked about lesson plans, you can reference these.)\n`;
            }
            return { classes, subjects: allSubjects, summary };
        }
        catch (error) {
            console.error('Error loading teacher context:', error);
            return { classes: [], subjects: [], summary: '' };
        }
    });
}
function getClassInsights(classId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cls = yield prisma_1.prisma.class.findUnique({
                where: { id: classId },
                include: {
                    students: {
                        where: { status: 'ACTIVE' },
                        select: { id: true, firstName: true, lastName: true },
                    },
                    academicTerm: true,
                },
            });
            if (!cls)
                return '';
            const studentIds = cls.students.map((s) => s.id);
            // Get recent attendance stats
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const attendance = yield prisma_1.prisma.attendance.findMany({
                where: {
                    studentId: { in: studentIds },
                    date: { gte: thirtyDaysAgo },
                },
            });
            const totalAttRecords = attendance.length;
            const presentCount = attendance.filter((a) => a.status === 'PRESENT').length;
            const lateCount = attendance.filter((a) => a.status === 'LATE').length;
            const absentCount = attendance.filter((a) => a.status === 'ABSENT').length;
            // Get term results if available
            const termResults = cls.academicTerm
                ? yield prisma_1.prisma.termResult.findMany({
                    where: { classId, termId: cls.academicTerm.id },
                    include: { student: { select: { firstName: true, lastName: true } }, subject: { select: { name: true } } },
                })
                : [];
            let insights = `\n\nClass Data for ${cls.name}:\n`;
            insights += `- Students: ${cls.students.length} active\n`;
            insights += `- Attendance (last 30 days): ${totalAttRecords} records — ${presentCount} present, ${lateCount} late, ${absentCount} absent`;
            if (totalAttRecords > 0) {
                insights += ` (${Math.round((presentCount / totalAttRecords) * 100)}% attendance rate)`;
            }
            insights += '\n';
            if (termResults.length > 0) {
                // Compute per-subject averages
                const subjectScores = {};
                for (const r of termResults) {
                    const subj = r.subject.name;
                    if (!subjectScores[subj])
                        subjectScores[subj] = { total: 0, count: 0 };
                    subjectScores[subj].total += Number(r.totalScore);
                    subjectScores[subj].count++;
                }
                insights += '- Subject averages: ';
                insights += Object.entries(subjectScores)
                    .map(([name, data]) => `${name}: ${(data.total / data.count).toFixed(1)}%`)
                    .join(', ');
                insights += '\n';
                // Find struggling students (avg < 40%)
                const studentScores = {};
                for (const r of termResults) {
                    const sid = r.studentId;
                    if (!studentScores[sid]) {
                        studentScores[sid] = {
                            name: `${r.student.firstName} ${r.student.lastName}`,
                            total: 0,
                            count: 0,
                        };
                    }
                    studentScores[sid].total += Number(r.totalScore);
                    studentScores[sid].count++;
                }
                const struggling = Object.values(studentScores)
                    .filter(s => s.total / s.count < 40)
                    .map(s => `${s.name} (${(s.total / s.count).toFixed(0)}%)`);
                if (struggling.length > 0) {
                    insights += `- Students needing support (avg < 40%): ${struggling.slice(0, 5).join(', ')}${struggling.length > 5 ? ` and ${struggling.length - 5} more` : ''}\n`;
                }
            }
            // Include recent lesson plans for this class
            const classLessonPlans = yield prisma_1.prisma.lessonPlan.findMany({
                where: { classId },
                orderBy: { weekStartDate: 'desc' },
                take: 5,
                include: {
                    subject: { select: { name: true, code: true } },
                    teacher: { select: { fullName: true } },
                },
            });
            if (classLessonPlans.length > 0) {
                insights += `\nRecent lesson plans for this class:\n`;
                for (const plan of classLessonPlans) {
                    const date = new Date(plan.weekStartDate).toLocaleDateString();
                    insights += `  - [${date}] ${plan.subject.name}: ${plan.title} (by ${plan.teacher.fullName})\n`;
                }
            }
            return insights;
        }
        catch (error) {
            console.error('Error getting class insights:', error);
            return '';
        }
    });
}
function buildSystemPrompt(context, teacherSummary, classInsights) {
    let prompt = `You are an AI Teaching Assistant for a Zambian school management system called Sync. You help teachers with:
- Creating lesson plans aligned to the Zambian curriculum
- Generating quizzes and assessments
- Writing professional emails to parents
- Providing teaching tips and strategies
- Creating rubrics and grading criteria
- Differentiating instruction for diverse learners
- Analyzing student performance and recommending interventions
- Referencing and building upon previously saved lesson plans

Be practical, culturally relevant to Zambia, and consider resource-limited classroom environments.
Format responses with clear headings, bullet points, numbered lists, and tables where appropriate.
Use markdown formatting (bold, headings, tables) to make responses easy to read.
When a teacher asks about lesson plans, reference their existing saved plans from the context below and offer to build upon them.`;
    if (context === null || context === void 0 ? void 0 : context.systemOverride) {
        prompt = context.systemOverride + '\n\n' + prompt;
    }
    // Inject teacher's real school data
    if (teacherSummary) {
        prompt += teacherSummary;
    }
    // Inject class-specific data when context specifies a class
    if (classInsights) {
        prompt += classInsights;
    }
    if (context === null || context === void 0 ? void 0 : context.subject)
        prompt += `\nCurrent Subject: ${context.subject}`;
    if (context === null || context === void 0 ? void 0 : context.gradeLevel)
        prompt += `\nCurrent Grade Level: ${context.gradeLevel}`;
    if (context === null || context === void 0 ? void 0 : context.className)
        prompt += `\nCurrent Class: ${context.className}`;
    return prompt;
}
