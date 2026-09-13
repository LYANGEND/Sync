import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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
import teachingHubRoutes from './routes/teachingHubRoutes';
import adaptWorkspaceRoutes from './routes/adaptWorkspaceRoutes';
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
import academicsRoutes from './routes/academicsRoutes';
import branchRoutes from './routes/branchRoutes';
import branchAssignmentRoutes from './routes/branchAssignmentRoutes';
// New AI & Intelligence Routes
import analyticsRoutes from './routes/analyticsRoutes';
import aiAssistantRoutes from './routes/aiAssistantRoutes';
import intelligenceRoutes from './routes/intelligenceRoutes';
import auditRoutes from './routes/auditRoutes';
import aiAnalyticsRoutes from './routes/aiAnalyticsRoutes';
// Academic Improvement Routes
import academicCalendarRoutes from './routes/academicCalendarRoutes';
import homeworkRoutes from './routes/homeworkRoutes';
import studentPortalRoutes from './routes/studentPortalRoutes';
// Accounting Module Routes
import expenseRoutes from './routes/expenseRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import payrollRoutes from './routes/payrollRoutes';
import budgetRoutes from './routes/budgetRoutes';
import pettyCashRoutes from './routes/pettyCashRoutes';
import financialRoutes from './routes/financialRoutes';
import debtCollectionRoutes from './routes/debtCollectionRoutes';
// Virtual Classroom & AI Tutor
import virtualClassroomRoutes from './routes/virtualClassroomRoutes';
// Master AI Ops
import masterAIRoutes from './routes/masterAIRoutes';
// New AI Intelligence Features
import aiIntelligenceRoutes from './routes/aiIntelligenceRoutes';
// SMS Gateway Routes
import smsRoutes from './routes/smsRoutes';
// Tenant Management
import tenantRoutes from './routes/tenantRoutes';
// Platform Administration
import platformRoutes from './routes/platformRoutes';
import subscriptionBillingRoutes from './routes/subscriptionBillingRoutes';
import tenantFileRoutes from './routes/tenantFileRoutes';
// Middleware
import { generalLimiter, getApiRateLimitRuntimeStatus } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { getQueueRuntimeStatus } from './queues/queueRuntime';
import { getFinancialSnapshotCacheStatus } from './cache/financialSnapshotCache';
import { getSmsRateLimitRuntimeStatus } from './services/smsRateLimitService';

const app: Application = express();

// Trust proxy — required behind Azure Container Apps / nginx
app.set('trust proxy', 1);

// Security Middleware
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Tenant-Id'],
  credentials: true,
}));
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving images
}));
app.use(morgan('dev'));

// Apply rate limiting to all routes
app.use('/api/', generalLimiter);

// Uploaded files are capability-protected with short-lived, tenant/path-bound signatures.
app.use('/uploads', generalLimiter, tenantFileRoutes);

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
app.use('/api/v1/teaching-hub', teachingHubRoutes);
app.use('/api/v1/adapt-workspace', adaptWorkspaceRoutes);
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
app.use('/api/v1/academics', academicsRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/branch-assignments', branchAssignmentRoutes);

// AI & Intelligence Routes
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/ai-assistant', aiAssistantRoutes);
app.use('/api/v1/intelligence', intelligenceRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/ai-analytics', aiAnalyticsRoutes);

// Academic Improvement Routes
app.use('/api/v1/academic-calendar', academicCalendarRoutes);
app.use('/api/v1/homework', homeworkRoutes);
app.use('/api/v1/student-portal', studentPortalRoutes);

// Accounting Module Routes
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/payroll', payrollRoutes);
app.use('/api/v1/budgets', budgetRoutes);
app.use('/api/v1/petty-cash', pettyCashRoutes);
app.use('/api/v1/financial', financialRoutes);
app.use('/api/v1/debt-collection', debtCollectionRoutes);

// Virtual Classroom & AI Tutor
app.use('/api/v1/virtual-classroom', virtualClassroomRoutes);

// Master AI Ops
app.use('/api/v1/master-ai', masterAIRoutes);

// New AI Intelligence Features (grade forecast, fee defaulters, timetable, exam scheduling, parent letters)
app.use('/api/v1/ai', aiIntelligenceRoutes);

// SMS Gateway
app.use('/api/v1/sms', smsRoutes);

// Tenant Management
app.use('/api/v1/tenant', tenantRoutes);

// Platform Administration (cross-tenant)
app.use('/api/v1/platform', platformRoutes);

// Tenant self-service subscription billing (pay platform invoices via Lenco)
app.use('/api/v1/billing/subscription', subscriptionBillingRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  const rateLimit = getApiRateLimitRuntimeStatus();
  const snapshotCache = getFinancialSnapshotCacheStatus();
  const smsRateLimit = getSmsRateLimitRuntimeStatus();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    queue: getQueueRuntimeStatus(),
    rateLimit: { state: rateLimit.state, distributed: rateLimit.distributed },
    financialSnapshotCache: {
      state: snapshotCache.state,
      distributed: snapshotCache.distributed,
    },
    smsRateLimit: {
      state: smsRateLimit.state,
      distributed: smsRateLimit.distributed,
    },
  });
});

// Basic Route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to Sync School Management System API' });
});

// Health Check
app.get('/health', (req: Request, res: Response) => {
  const rateLimit = getApiRateLimitRuntimeStatus();
  const snapshotCache = getFinancialSnapshotCacheStatus();
  const smsRateLimit = getSmsRateLimitRuntimeStatus();
  res.status(200).json({
    status: 'ok',
    queue: getQueueRuntimeStatus(),
    rateLimit: { state: rateLimit.state, distributed: rateLimit.distributed },
    financialSnapshotCache: {
      state: snapshotCache.state,
      distributed: snapshotCache.distributed,
    },
    smsRateLimit: {
      state: smsRateLimit.state,
      distributed: smsRateLimit.distributed,
    },
  });
});

// 404 handler for unknown routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
