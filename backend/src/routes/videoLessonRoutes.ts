import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant } from '../middleware/tenantMiddleware';
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
} from '../controllers/videoLessonController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);
router.use(resolveTenant as any);

// Teacher routes
router.post('/', createVideoLesson);
router.get('/teacher', getTeacherVideoLessons);
router.get('/:lessonId/jitsi-config', getTeacherJitsiConfig);
router.patch('/:lessonId', updateVideoLesson);
router.post('/:lessonId/start', startVideoLesson);
router.post('/:lessonId/end', endVideoLesson);
router.post('/:lessonId/cancel', cancelVideoLesson);
router.delete('/:lessonId', deleteVideoLesson);
router.get('/:lessonId/attendance', getVideoLessonAttendance);

// Student/Parent routes
router.get('/student', getStudentVideoLessons);
router.post('/:lessonId/join', joinVideoLesson);
router.post('/:lessonId/leave', leaveVideoLesson);

// Common routes
router.get('/:lessonId', getVideoLesson);

export default router;
