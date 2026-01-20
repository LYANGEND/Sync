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

import path from 'path';

const app: Application = express();

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
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

export default app;
