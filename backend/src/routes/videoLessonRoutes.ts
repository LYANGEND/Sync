import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant } from '../middleware/tenantMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import {
  createVideoLesson,
  getTeacherVideoLessons,
  getStudentVideoLessons,
  getVideoLesson,
  startVideoLesson,
  endVideoLesson,
  cancelVideoLesson,
  updateVideoLesson,
  joinVideoLesson,
  leaveVideoLesson,
  getVideoLessonAttendance,
  deleteVideoLesson,
  getTeacherJitsiConfig,
  // Chat features
  sendChatMessage,
  getChatMessages,
  // Raise hand features
  raiseHand,
  lowerHand,
  getRaisedHands,
  acknowledgeHand,
  dismissAllHands,
} from '../controllers/videoLessonController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);
router.use(resolveTenant);

// Teacher routes
router.post('/', tenantHandler(createVideoLesson));
router.get('/teacher', tenantHandler(getTeacherVideoLessons));
router.get('/:lessonId/jitsi-config', tenantHandler(getTeacherJitsiConfig));
router.patch('/:lessonId', tenantHandler(updateVideoLesson));
router.post('/:lessonId/start', tenantHandler(startVideoLesson));
router.post('/:lessonId/end', tenantHandler(endVideoLesson));
router.post('/:lessonId/cancel', tenantHandler(cancelVideoLesson));
router.delete('/:lessonId', tenantHandler(deleteVideoLesson));
router.get('/:lessonId/attendance', tenantHandler(getVideoLessonAttendance));

// Chat routes
router.post('/:lessonId/chat', tenantHandler(sendChatMessage));
router.get('/:lessonId/chat', tenantHandler(getChatMessages));

// Raise hand routes
router.post('/:lessonId/raise-hand', tenantHandler(raiseHand));
router.post('/:lessonId/lower-hand', tenantHandler(lowerHand));
router.get('/:lessonId/raised-hands', tenantHandler(getRaisedHands));
router.post('/:lessonId/raised-hands/:handId/acknowledge', tenantHandler(acknowledgeHand));
router.post('/:lessonId/raised-hands/dismiss-all', tenantHandler(dismissAllHands));

// Student/Parent routes
router.get('/student', tenantHandler(getStudentVideoLessons));
router.post('/:lessonId/join', tenantHandler(joinVideoLesson));
router.post('/:lessonId/leave', tenantHandler(leaveVideoLesson));

// Common routes
router.get('/:lessonId', tenantHandler(getVideoLesson));

export default router;
