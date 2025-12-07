import express from 'express';
import multer from 'multer';
import {
  createClassSession,
  getClassSessions,
  getSessionDetails,
  getJoinToken,
  endSession,
  uploadMaterial,
  getMyUpcomingClasses,
  getSessionAnalytics,
} from '../controllers/liveClassController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/materials/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

// All routes require authentication
router.use(authenticateToken);

// Session management
router.post('/sessions', createClassSession);
router.get('/sessions', getClassSessions);
router.get('/sessions/:sessionId', getSessionDetails);
router.post('/sessions/:sessionId/end', endSession);

// Joining
router.get('/sessions/:sessionId/join-token', getJoinToken);

// Materials
router.post('/sessions/:sessionId/materials', upload.single('file'), uploadMaterial);

// Student routes
router.get('/my-classes', getMyUpcomingClasses);

// Analytics
router.get('/sessions/:sessionId/analytics', getSessionAnalytics);

export default router;
