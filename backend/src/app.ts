import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { resolveTenant } from './middleware/tenantMiddleware';
import authRoutes from './routes/authRoutes';
import studentRoutes from './routes/studentRoutes';
import paymentRoutes from './routes/paymentRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import subjectRoutes from './routes/subjectRoutes';
import classRoutes from './routes/classRoutes';
import userRoutes from './routes/userRoutes';
import academicTermRoutes from './routes/academicTermRoutes';
import feeRoutes from './routes/feeRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import assessmentRoutes from './routes/assessmentRoutes';
import reportCardRoutes from './routes/reportCardRoutes';
import onlineAssessmentRoutes from './routes/onlineAssessmentRoutes';
import timetableRoutes from './routes/timetableRoutes';
import syllabusRoutes from './routes/syllabusRoutes';
import promotionRoutes from './routes/promotionRoutes';
import settingsRoutes from './routes/settingsRoutes';
import communicationRoutes from './routes/communicationRoutes';
import scholarshipRoutes from './routes/scholarshipRoutes';
import profileRoutes from './routes/profileRoutes';
import feeReminderRoutes from './routes/feeReminderRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import websiteRoutes from './routes/websiteRoutes';
import platformAdminRoutes from './routes/platformAdminRoutes';
import crmRoutes from './routes/crmRoutes';
import uploadRoutes from './routes/uploadRoutes';
import auditRoutes from './routes/auditRoutes';
import webhookRoutes from './routes/webhookRoutes';
import securityRoutes from './routes/securityRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import homeworkRoutes from './routes/homeworkRoutes';
import resourceRoutes from './routes/resourceRoutes';
import parentRoutes from './routes/parentRoutes';
import forumRoutes from './routes/forumRoutes';
import announcementRoutes from './routes/announcementRoutes';
import fileUploadRoutes from './routes/uploadRoutes';
import searchRoutes from './routes/searchRoutes';
import videoLessonRoutes from './routes/videoLessonRoutes';
import aiTeacherRoutes from './routes/aiTeacherRoutes';
import teacherAssistantRoutes from './routes/teacherAssistantRoutes';
import branchRoutes from './routes/branchRoutes';
import publicPaymentRoutes from './routes/publicPaymentRoutes';

import path from 'path';

const app: Application = express();

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : process.env.NODE_ENV === 'production'
      ? allowedOrigins
      : '*', // Allow all origins only in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for bulk imports
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving images
}));
app.use(morgan('dev'));
app.use(resolveTenant);

// Serve static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Public routes (no authentication required)
app.use('/api/public/payments', publicPaymentRoutes);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/academic-terms', academicTermRoutes);
app.use('/api/v1/fees', feeRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/online-assessments', onlineAssessmentRoutes);
app.use('/api/v1/reports', reportCardRoutes);
app.use('/api/v1/timetables', timetableRoutes);
app.use('/api/v1/syllabus', syllabusRoutes);
app.use('/api/v1/promotions', promotionRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/communication', communicationRoutes);
app.use('/api/v1/scholarships', scholarshipRoutes);
app.use('/api/v1/fee-reminders', feeReminderRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/website', websiteRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/audit-logs', auditRoutes);

// Platform Admin Routes (separate admin portal)
app.use('/api/platform', platformAdminRoutes);
app.use('/api/platform/crm', crmRoutes);

app.use('/api/platform/security', securityRoutes);
app.use('/api/platform/finance', invoiceRoutes);
app.use('/api/webhooks', webhookRoutes);

// LMS Routes
app.use('/api/v1/homework', homeworkRoutes);
app.use('/api/v1/resources', resourceRoutes);
app.use('/api/v1/parent', parentRoutes);
app.use('/api/v1/forums', forumRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/upload', fileUploadRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/video-lessons', videoLessonRoutes);
app.use('/api/v1/ai-teacher', aiTeacherRoutes);
app.use('/api/v1/teacher-assistant', teacherAssistantRoutes);
app.use('/api/v1/branches', branchRoutes);

// Health check endpoint - basic
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Health check endpoint - detailed (for monitoring)
app.get('/api/health', async (req: Request, res: Response) => {
  const healthCheck: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: 'unknown',
      redis: 'unknown',
      memory: 'unknown'
    }
  };

  try {
    // Check database connection
    const prisma = (await import('@prisma/client')).PrismaClient;
    const db = new prisma();
    await db.$queryRaw`SELECT 1`;
    await db.$disconnect();
    healthCheck.checks.database = 'healthy';
  } catch (error) {
    healthCheck.checks.database = 'unhealthy';
    healthCheck.status = 'degraded';
  }

  try {
    // Check Redis connection if available
    if (process.env.REDIS_URL) {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(process.env.REDIS_URL);
      await redis.ping();
      await redis.quit();
      healthCheck.checks.redis = 'healthy';
    } else {
      healthCheck.checks.redis = 'not configured';
    }
  } catch (error) {
    healthCheck.checks.redis = 'unhealthy';
    healthCheck.status = 'degraded';
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  healthCheck.checks.memory = {
    used: `${memoryUsedMB}MB`,
    total: `${memoryTotalMB}MB`,
    percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
  };

  const statusCode = healthCheck.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Basic Route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to Sync School Management System API' });
});

export default app;
