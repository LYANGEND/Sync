import { Router } from 'express';
import {
  getSchoolInfo,
  searchStudentPublic,
  initiatePublicPayment,
  checkPaymentStatus,
} from '../controllers/publicPaymentController';
import { publicRateLimiter, strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes - no authentication required but rate limited

// Get school information by slug (light rate limit)
router.get('/school/:slug', publicRateLimiter, getSchoolInfo);

// Search for student by admission number (stricter limit to prevent enumeration)
router.get('/student/search', strictRateLimiter, searchStudentPublic);

// Initiate a payment (strict limit - financial operation)
router.post('/school/:slug/pay', strictRateLimiter, initiatePublicPayment);

// Check payment status
router.get('/status/:transactionId', publicRateLimiter, checkPaymentStatus);

export default router;
