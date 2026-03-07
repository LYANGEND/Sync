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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionTranscript = exports.getAvailableVoices = exports.getChatHistory = exports.recordParticipant = exports.getTutorStatus = exports.tutorQuiz = exports.tutorSpeak = exports.advanceTutorPhase = exports.chatWithAITutor = exports.stopAITutor = exports.startAITutor = exports.endClassroom = exports.startClassroom = exports.deleteClassroom = exports.updateClassroom = exports.getClassroom = exports.getClassrooms = exports.createClassroom = void 0;
const prisma_1 = require("../utils/prisma");
const aiTutorService_1 = require("../services/aiTutorService");
const elevenLabsService_1 = require("../services/elevenLabsService");
const crypto_1 = __importDefault(require("crypto"));
// ==========================================
// HELPERS
// ==========================================
/**
 * Build a structured lesson plan string from topic + subtopics in the DB.
 * This is used both by createClassroom and the AI tutor system prompt.
 */
function buildLessonPlanFromSyllabus(topicId, selectedSubTopicIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const topic = yield prisma_1.prisma.topic.findUnique({
            where: { id: topicId },
            include: {
                subtopics: {
                    where: (selectedSubTopicIds === null || selectedSubTopicIds === void 0 ? void 0 : selectedSubTopicIds.length) ? { id: { in: selectedSubTopicIds } } : undefined,
                    orderBy: { orderIndex: 'asc' },
                },
                subject: { select: { name: true } },
            },
        });
        if (!topic)
            return '';
        let plan = `📚 SUBJECT: ${topic.subject.name}\n`;
        plan += `📖 TOPIC: ${topic.title}\n`;
        if (topic.description)
            plan += `📝 Description: ${topic.description}\n`;
        plan += `📊 Grade Level: ${topic.gradeLevel}\n\n`;
        if (topic.subtopics.length > 0) {
            plan += `--- SUBTOPICS TO COVER ---\n\n`;
            topic.subtopics.forEach((st, i) => {
                plan += `${i + 1}. ${st.title}\n`;
                if (st.description)
                    plan += `   ${st.description}\n`;
                if (st.learningObjectives) {
                    try {
                        const objectives = JSON.parse(st.learningObjectives);
                        if (Array.isArray(objectives) && objectives.length) {
                            plan += `   Learning Objectives:\n`;
                            objectives.forEach((obj) => {
                                plan += `   • ${obj}\n`;
                            });
                        }
                    }
                    catch (_a) { }
                }
                if (st.duration)
                    plan += `   ⏱ Duration: ~${st.duration} minutes\n`;
                plan += '\n';
            });
        }
        plan += `--- LESSON FLOW ---\n`;
        plan += `1. INTRODUCTION: Review previous knowledge, introduce today's topic\n`;
        plan += `2. TEACHING: Cover the subtopics above with examples and explanations\n`;
        plan += `3. ACTIVITY: Interactive exercise related to the subtopics\n`;
        plan += `4. ASSESSMENT: Check understanding with questions\n`;
        plan += `5. WRAP-UP: Summarize key points, preview next topic\n`;
        return plan;
    });
}
// ==========================================
// VIRTUAL CLASSROOM CONTROLLER
// ==========================================
/**
 * Create a new virtual classroom
 */
const createClassroom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Not authenticated' });
        const { title, description, classId, subjectId, scheduledStart, scheduledEnd, aiTutorEnabled, aiTutorVoiceId, aiTutorName, aiTutorPersona, lessonPlanContent, aiTutorLanguage, maxParticipants, isRecordingEnabled, jitsiDomain, roomPassword, topicId, selectedSubTopicIds, } = req.body;
        if (!title || !scheduledStart || !scheduledEnd) {
            return res.status(400).json({ error: 'Title, scheduledStart, and scheduledEnd are required' });
        }
        // If topic is selected, build structured lesson plan from syllabus
        let finalLessonPlan = lessonPlanContent || null;
        if (topicId && !lessonPlanContent) {
            finalLessonPlan = yield buildLessonPlanFromSyllabus(topicId, selectedSubTopicIds);
        }
        // Generate a unique Jitsi room name
        const roomName = `sync-${crypto_1.default.randomBytes(4).toString('hex')}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`;
        const classroom = yield prisma_1.prisma.virtualClassroom.create({
            data: {
                title,
                description: description || null,
                classId: classId || null,
                subjectId: subjectId || null,
                teacherId: userId,
                roomName,
                roomPassword: roomPassword || null,
                jitsiDomain: jitsiDomain || 'meet.jit.si',
                scheduledStart: new Date(scheduledStart),
                scheduledEnd: new Date(scheduledEnd),
                topicId: topicId || null,
                selectedSubTopicIds: selectedSubTopicIds || null,
                aiTutorEnabled: aiTutorEnabled || false,
                aiTutorVoiceId: aiTutorVoiceId || null,
                aiTutorName: aiTutorName || 'AI Teacher',
                aiTutorPersona: aiTutorPersona || null,
                lessonPlanContent: finalLessonPlan,
                aiTutorLanguage: aiTutorLanguage || 'en',
                maxParticipants: maxParticipants || 50,
                isRecordingEnabled: isRecordingEnabled || false,
                createdById: userId,
            },
        });
        res.status(201).json(classroom);
    }
    catch (error) {
        console.error('[VirtualClassroom] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.createClassroom = createClassroom;
/**
 * Get all virtual classrooms (with filters)
 */
const getClassrooms = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { status, classId, upcoming } = req.query;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const where = {};
        if (status)
            where.status = status;
        if (classId)
            where.classId = classId;
        // If upcoming, get only future scheduled classes
        if (upcoming === 'true') {
            where.scheduledStart = { gte: new Date() };
            where.status = { in: ['SCHEDULED', 'LIVE'] };
        }
        // Teachers only see their own classrooms unless admin
        if (role === 'TEACHER') {
            where.OR = [
                { createdById: userId },
                { teacherId: userId },
            ];
        }
        const classrooms = yield prisma_1.prisma.virtualClassroom.findMany({
            where,
            orderBy: { scheduledStart: 'asc' },
            include: {
                _count: {
                    select: {
                        participants: true,
                        chatMessages: true,
                        tutorSessions: true,
                    },
                },
            },
        });
        // Enrich with class and subject names
        const enriched = yield Promise.all(classrooms.map((c) => __awaiter(void 0, void 0, void 0, function* () {
            let className = null;
            let subjectName = null;
            let teacherName = null;
            if (c.classId) {
                const cls = yield prisma_1.prisma.class.findUnique({
                    where: { id: c.classId },
                    select: { name: true },
                });
                className = cls === null || cls === void 0 ? void 0 : cls.name;
            }
            if (c.subjectId) {
                const subj = yield prisma_1.prisma.subject.findUnique({
                    where: { id: c.subjectId },
                    select: { name: true },
                });
                subjectName = subj === null || subj === void 0 ? void 0 : subj.name;
            }
            if (c.teacherId) {
                const teacher = yield prisma_1.prisma.user.findUnique({
                    where: { id: c.teacherId },
                    select: { fullName: true },
                });
                teacherName = teacher === null || teacher === void 0 ? void 0 : teacher.fullName;
            }
            return Object.assign(Object.assign({}, c), { className,
                subjectName,
                teacherName });
        })));
        res.json(enriched);
    }
    catch (error) {
        console.error('[VirtualClassroom] List error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getClassrooms = getClassrooms;
/**
 * Get a single virtual classroom by ID
 */
const getClassroom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const classroom = yield prisma_1.prisma.virtualClassroom.findUnique({
            where: { id },
            include: {
                participants: {
                    orderBy: { joinedAt: 'desc' },
                },
                chatMessages: {
                    orderBy: { createdAt: 'asc' },
                    take: 100,
                },
                tutorSessions: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                recordings: {
                    orderBy: { createdAt: 'desc' },
                },
                _count: {
                    select: {
                        participants: true,
                        chatMessages: true,
                    },
                },
            },
        });
        if (!classroom) {
            return res.status(404).json({ error: 'Classroom not found' });
        }
        // Enrich
        let className = null;
        let subjectName = null;
        let teacherName = null;
        if (classroom.classId) {
            const cls = yield prisma_1.prisma.class.findUnique({
                where: { id: classroom.classId },
                select: { name: true },
            });
            className = cls === null || cls === void 0 ? void 0 : cls.name;
        }
        if (classroom.subjectId) {
            const subj = yield prisma_1.prisma.subject.findUnique({
                where: { id: classroom.subjectId },
                select: { name: true },
            });
            subjectName = subj === null || subj === void 0 ? void 0 : subj.name;
        }
        if (classroom.teacherId) {
            const teacher = yield prisma_1.prisma.user.findUnique({
                where: { id: classroom.teacherId },
                select: { fullName: true },
            });
            teacherName = teacher === null || teacher === void 0 ? void 0 : teacher.fullName;
        }
        res.json(Object.assign(Object.assign({}, classroom), { className, subjectName, teacherName }));
    }
    catch (error) {
        console.error('[VirtualClassroom] Get error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getClassroom = getClassroom;
/**
 * Update a virtual classroom
 */
const updateClassroom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Don't allow updating certain fields
        delete updates.id;
        delete updates.roomName;
        delete updates.createdById;
        // Convert dates if present
        if (updates.scheduledStart)
            updates.scheduledStart = new Date(updates.scheduledStart);
        if (updates.scheduledEnd)
            updates.scheduledEnd = new Date(updates.scheduledEnd);
        const classroom = yield prisma_1.prisma.virtualClassroom.update({
            where: { id },
            data: updates,
        });
        res.json(classroom);
    }
    catch (error) {
        console.error('[VirtualClassroom] Update error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.updateClassroom = updateClassroom;
/**
 * Delete a virtual classroom
 */
const deleteClassroom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma_1.prisma.virtualClassroom.delete({ where: { id } });
        res.json({ message: 'Classroom deleted' });
    }
    catch (error) {
        console.error('[VirtualClassroom] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.deleteClassroom = deleteClassroom;
/**
 * Start a classroom (go LIVE)
 */
const startClassroom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const classroom = yield prisma_1.prisma.virtualClassroom.update({
            where: { id },
            data: {
                status: 'LIVE',
                actualStart: new Date(),
            },
        });
        res.json(classroom);
    }
    catch (error) {
        console.error('[VirtualClassroom] Start error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.startClassroom = startClassroom;
/**
 * End a classroom
 */
const endClassroom = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // End any active tutor sessions
        yield prisma_1.prisma.aITutorSession.updateMany({
            where: { classroomId: id, status: 'ACTIVE' },
            data: { status: 'ENDED', endedAt: new Date() },
        });
        const classroom = yield prisma_1.prisma.virtualClassroom.update({
            where: { id },
            data: {
                status: 'ENDED',
                actualEnd: new Date(),
            },
        });
        res.json(classroom);
    }
    catch (error) {
        console.error('[VirtualClassroom] End error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.endClassroom = endClassroom;
// ==========================================
// AI TUTOR ENDPOINTS
// ==========================================
/**
 * Start AI Tutor for a classroom
 */
const startAITutor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield aiTutorService_1.aiTutorService.startSession(id);
        // Return response without audio buffer in JSON (audio served separately)
        res.json({
            sessionId: result.sessionId,
            greeting: {
                text: result.greeting.text,
                phase: result.greeting.phase,
                suggestedActions: result.greeting.suggestedActions,
                hasAudio: !!result.greeting.audioBuffer,
            },
        });
    }
    catch (error) {
        console.error('[AITutor] Start error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.startAITutor = startAITutor;
/**
 * Stop AI Tutor for a classroom
 */
const stopAITutor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }
        const result = yield aiTutorService_1.aiTutorService.endSession(sessionId);
        res.json(result);
    }
    catch (error) {
        console.error('[AITutor] Stop error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.stopAITutor = stopAITutor;
/**
 * Send a message to the AI Tutor (student asks a question)
 */
const chatWithAITutor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { sessionId, studentName, message } = req.body;
        if (!sessionId || !message) {
            return res.status(400).json({ error: 'sessionId and message are required' });
        }
        const userName = studentName || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || 'Student';
        const result = yield aiTutorService_1.aiTutorService.processStudentMessage(sessionId, userName, message);
        // Convert audio buffer to base64 for JSON transport
        let audioBase64 = null;
        if (result.audioBuffer) {
            audioBase64 = result.audioBuffer.toString('base64');
        }
        res.json({
            text: result.text,
            audio: audioBase64,
            audioContentType: result.audioContentType,
            phase: result.phase,
            suggestedActions: result.suggestedActions,
            tokensUsed: result.tokensUsed,
            charactersUsed: result.charactersUsed,
        });
    }
    catch (error) {
        console.error('[AITutor] Chat error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.chatWithAITutor = chatWithAITutor;
/**
 * Advance the lesson to the next phase
 */
const advanceTutorPhase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }
        const result = yield aiTutorService_1.aiTutorService.advancePhase(sessionId);
        let audioBase64 = null;
        if (result.audioBuffer) {
            audioBase64 = result.audioBuffer.toString('base64');
        }
        res.json({
            text: result.text,
            audio: audioBase64,
            audioContentType: result.audioContentType,
            phase: result.phase,
            suggestedActions: result.suggestedActions,
        });
    }
    catch (error) {
        console.error('[AITutor] Advance phase error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.advanceTutorPhase = advanceTutorPhase;
/**
 * Make the AI Tutor say something specific
 */
const tutorSpeak = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId, text } = req.body;
        if (!sessionId || !text) {
            return res.status(400).json({ error: 'sessionId and text are required' });
        }
        const result = yield aiTutorService_1.aiTutorService.speak(sessionId, text);
        let audioBase64 = null;
        if (result.audioBuffer) {
            audioBase64 = result.audioBuffer.toString('base64');
        }
        res.json({
            text: result.text,
            audio: audioBase64,
            audioContentType: result.audioContentType,
            phase: result.phase,
        });
    }
    catch (error) {
        console.error('[AITutor] Speak error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.tutorSpeak = tutorSpeak;
/**
 * Generate a quick quiz in the current session
 */
const tutorQuiz = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId, topic } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }
        const result = yield aiTutorService_1.aiTutorService.generateQuiz(sessionId, topic);
        let audioBase64 = null;
        if (result.audioBuffer) {
            audioBase64 = result.audioBuffer.toString('base64');
        }
        res.json({
            text: result.text,
            audio: audioBase64,
            audioContentType: result.audioContentType,
            phase: result.phase,
            suggestedActions: result.suggestedActions,
        });
    }
    catch (error) {
        console.error('[AITutor] Quiz error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.tutorQuiz = tutorQuiz;
/**
 * Get AI Tutor session status
 */
const getTutorStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Get the active session for this classroom
        const session = yield prisma_1.prisma.aITutorSession.findFirst({
            where: {
                classroomId: id,
                status: 'ACTIVE',
            },
        });
        if (!session) {
            return res.json({ active: false });
        }
        const state = yield aiTutorService_1.aiTutorService.getSessionState(session.id);
        res.json(Object.assign({ active: true }, state));
    }
    catch (error) {
        console.error('[AITutor] Status error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getTutorStatus = getTutorStatus;
/**
 * Record participant join/leave
 */
const recordParticipant = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { action, displayName, userId, studentId, role } = req.body;
        if (action === 'join') {
            const participant = yield prisma_1.prisma.classroomParticipant.create({
                data: {
                    classroomId: id,
                    displayName: displayName || 'Anonymous',
                    userId: userId || null,
                    studentId: studentId || null,
                    role: role || 'STUDENT',
                },
            });
            return res.json(participant);
        }
        if (action === 'leave') {
            // Update the most recent participant entry that hasn't left
            const participant = yield prisma_1.prisma.classroomParticipant.findFirst({
                where: {
                    classroomId: id,
                    displayName,
                    leftAt: null,
                },
                orderBy: { joinedAt: 'desc' },
            });
            if (participant) {
                yield prisma_1.prisma.classroomParticipant.update({
                    where: { id: participant.id },
                    data: { leftAt: new Date() },
                });
            }
            return res.json({ message: 'Participant left recorded' });
        }
        res.status(400).json({ error: 'Invalid action. Use "join" or "leave"' });
    }
    catch (error) {
        console.error('[VirtualClassroom] Participant error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.recordParticipant = recordParticipant;
/**
 * Get chat history for a classroom
 */
const getChatHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { limit = '100' } = req.query;
        const messages = yield prisma_1.prisma.classroomChat.findMany({
            where: { classroomId: id },
            orderBy: { createdAt: 'asc' },
            take: parseInt(limit),
        });
        res.json(messages);
    }
    catch (error) {
        console.error('[VirtualClassroom] Chat history error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getChatHistory = getChatHistory;
/**
 * Get available ElevenLabs voices
 */
const getAvailableVoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isConfigured = yield elevenLabsService_1.elevenLabsService.isConfigured();
        if (!isConfigured) {
            // Return built-in voice suggestions
            return res.json({
                configured: false,
                voices: Object.entries(elevenLabsService_1.TEACHING_VOICES).map(([name, id]) => ({
                    voice_id: id,
                    name: name.charAt(0) + name.slice(1).toLowerCase(),
                    category: 'premade',
                })),
            });
        }
        const voices = yield elevenLabsService_1.elevenLabsService.getVoices();
        res.json({
            configured: true,
            voices: voices.map(v => ({
                voice_id: v.voice_id,
                name: v.name,
                category: v.category,
                labels: v.labels,
                preview_url: v.preview_url,
            })),
        });
    }
    catch (error) {
        console.error('[VirtualClassroom] Voices error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getAvailableVoices = getAvailableVoices;
/**
 * Get session transcript / recording
 */
const getSessionTranscript = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { sessionId } = req.query;
        let session;
        if (sessionId) {
            session = yield prisma_1.prisma.aITutorSession.findUnique({
                where: { id: sessionId },
            });
        }
        else {
            session = yield prisma_1.prisma.aITutorSession.findFirst({
                where: { classroomId: id },
                orderBy: { createdAt: 'desc' },
            });
        }
        if (!session) {
            return res.json({ transcript: [], metrics: null });
        }
        res.json({
            transcript: session.conversationLog || [],
            metrics: {
                tokensUsed: session.totalTokensUsed,
                ttsCharacters: session.totalTTSCharacters,
                questionsAsked: session.questionsAsked,
                questionsAnswered: session.questionsAnswered,
                startedAt: session.startedAt,
                endedAt: session.endedAt,
                phase: session.lessonPhase,
            },
        });
    }
    catch (error) {
        console.error('[VirtualClassroom] Transcript error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.getSessionTranscript = getSessionTranscript;
