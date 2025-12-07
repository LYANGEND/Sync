import express from 'express';
import {
  createVideoLesson,
  getVideoLessons,
  getVideoLesson,
  updateVideoProgress,
  togglePublishVideo,
  deleteVideoLesson,
  getMyVideoLibrary,
  getVideoAnalytics,
  searchVideos,
} from '../controllers/videoLessonController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Video management
router.post('/videos', createVideoLesson);
router.get('/videos', getVideoLessons);
router.get('/videos/search', searchVideos);
router.get('/videos/:videoId', getVideoLesson);
router.patch('/videos/:videoId/publish', togglePublishVideo);
router.delete('/videos/:videoId', deleteVideoLesson);

// Progress tracking
router.post('/videos/:videoId/progress', updateVideoProgress);

// Student routes
router.get('/my-library', getMyVideoLibrary);

// Analytics
router.get('/videos/:videoId/analytics', getVideoAnalytics);

export default router;
