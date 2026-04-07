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
// New AI Enhancement Features
import aiTeacherAssistantRoutes from './routes/aiTeacherAssistantRoutes';
import aiParentEngagementRoutes from './routes/aiParentEngagementRoutes';
import voiceAttendanceRoutes from './routes/voiceAttendanceRoutes';
// Middleware
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import path from 'path';

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
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving images
}));
app.use(morgan('dev'));

// Apply rate limiting to all routes
app.use('/api/', generalLimiter);

// Serve static files (uploaded images) — use process.cwd() so it works in both dev and production
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

// New AI Enhancement Features (teacher assistant, parent engagement, voice attendance)
app.use('/api/v1/ai-teacher-assistant', aiTeacherAssistantRoutes);
app.use('/api/v1/ai-parent-engagement', aiParentEngagementRoutes);
app.use('/api/v1/voice-attendance', voiceAttendanceRoutes);

// SMS Gateway
app.use('/api/v1/sms', smsRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic Route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to Sync School Management System API' });
});

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler for unknown routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
