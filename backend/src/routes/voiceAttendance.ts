import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import multer from 'multer';
import * as controller from '../controllers/voiceAttendanceController';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// Voice attendance
router.post('/take-by-voice', authMiddleware, upload.single('audio'), controller.takeAttendanceByVoice);

// Text attendance
router.post('/take-by-text', authMiddleware, controller.takeAttendanceByText);

// Verify attendance
router.get('/verify/:classId', authMiddleware, controller.verifyAttendance);

export default router;
