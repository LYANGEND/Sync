"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const virtualClassroomController_1 = require("../controllers/virtualClassroomController");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// ==========================================
// CLASSROOM CRUD
// ==========================================
router.post('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.createClassroom);
router.get('/', virtualClassroomController_1.getClassrooms);
router.get('/voices', virtualClassroomController_1.getAvailableVoices);
router.get('/:id', virtualClassroomController_1.getClassroom);
router.put('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.updateClassroom);
router.delete('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), virtualClassroomController_1.deleteClassroom);
// ==========================================
// CLASSROOM LIFECYCLE
// ==========================================
router.post('/:id/start', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.startClassroom);
router.post('/:id/end', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.endClassroom);
// ==========================================
// AI TUTOR
// ==========================================
router.post('/:id/ai-tutor/start', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.startAITutor);
router.post('/:id/ai-tutor/stop', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.stopAITutor);
router.post('/:id/ai-tutor/chat', virtualClassroomController_1.chatWithAITutor);
router.post('/:id/ai-tutor/advance-phase', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.advanceTutorPhase);
router.post('/:id/ai-tutor/speak', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.tutorSpeak);
router.post('/:id/ai-tutor/quiz', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), virtualClassroomController_1.tutorQuiz);
router.get('/:id/ai-tutor/status', virtualClassroomController_1.getTutorStatus);
// ==========================================
// PARTICIPANTS & CHAT
// ==========================================
router.post('/:id/participants', virtualClassroomController_1.recordParticipant);
router.get('/:id/chat', virtualClassroomController_1.getChatHistory);
router.get('/:id/transcript', virtualClassroomController_1.getSessionTranscript);
exports.default = router;
