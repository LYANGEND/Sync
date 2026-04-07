import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import * as controller from '../controllers/voiceAttendanceController';

const router = Router();

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
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

// Voice Attendance endpoints
router.post('/process', authorizeRole(['SUPER_ADMIN', 'TEACHER']), upload.single('audio'), controller.processVoiceAttendance);
router.get('/summary/:classId', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'ADMIN']), controller.getAttendanceSummary);

export default router;
