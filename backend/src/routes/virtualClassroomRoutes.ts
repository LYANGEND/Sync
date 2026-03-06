import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  createClassroom,
  getClassrooms,
  getClassroom,
  updateClassroom,
  deleteClassroom,
  startClassroom,
  endClassroom,
  startAITutor,
  stopAITutor,
  chatWithAITutor,
  advanceTutorPhase,
  tutorSpeak,
  tutorQuiz,
  getTutorStatus,
  recordParticipant,
  getChatHistory,
  getAvailableVoices,
  getSessionTranscript,
} from '../controllers/virtualClassroomController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ==========================================
// CLASSROOM CRUD
// ==========================================
router.post('/', authorizeRole(['SUPER_ADMIN', 'TEACHER']), createClassroom);
router.get('/', getClassrooms);
router.get('/voices', getAvailableVoices);
router.get('/:id', getClassroom);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'TEACHER']), updateClassroom);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteClassroom);

// ==========================================
// CLASSROOM LIFECYCLE
// ==========================================
router.post('/:id/start', authorizeRole(['SUPER_ADMIN', 'TEACHER']), startClassroom);
router.post('/:id/end', authorizeRole(['SUPER_ADMIN', 'TEACHER']), endClassroom);

// ==========================================
// AI TUTOR
// ==========================================
router.post('/:id/ai-tutor/start', authorizeRole(['SUPER_ADMIN', 'TEACHER']), startAITutor);
router.post('/:id/ai-tutor/stop', authorizeRole(['SUPER_ADMIN', 'TEACHER']), stopAITutor);
router.post('/:id/ai-tutor/chat', chatWithAITutor);
router.post('/:id/ai-tutor/advance-phase', authorizeRole(['SUPER_ADMIN', 'TEACHER']), advanceTutorPhase);
router.post('/:id/ai-tutor/speak', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tutorSpeak);
router.post('/:id/ai-tutor/quiz', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tutorQuiz);
router.get('/:id/ai-tutor/status', getTutorStatus);

// ==========================================
// PARTICIPANTS & CHAT
// ==========================================
router.post('/:id/participants', recordParticipant);
router.get('/:id/chat', getChatHistory);
router.get('/:id/transcript', getSessionTranscript);

export default router;
