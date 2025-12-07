import express from 'express';
import multer from 'multer';
import {
  startVoiceSession,
  processVoiceMessage,
  endVoiceSession,
  getSessionHistory,
  explainLesson,
} from '../controllers/voiceTutorController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// Configure multer for audio uploads
const upload = multer({
  dest: 'uploads/audio/temp/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// All routes require authentication
router.use(authenticateToken);

// Start a new voice tutoring session
router.post('/sessions/start', startVoiceSession);

// Send voice message and get response
router.post('/sessions/message', upload.single('audio'), processVoiceMessage);

// End a session
router.post('/sessions/:sessionId/end', endVoiceSession);

// Get session history
router.get('/sessions/history', getSessionHistory);

// Get lesson explanation with voice
router.post('/explain-lesson', explainLesson);

export default router;
