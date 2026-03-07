"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const studentRoutes_1 = __importDefault(require("./routes/studentRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const attendanceRoutes_1 = __importDefault(require("./routes/attendanceRoutes"));
const subjectRoutes_1 = __importDefault(require("./routes/subjectRoutes"));
const classRoutes_1 = __importDefault(require("./routes/classRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const academicTermRoutes_1 = __importDefault(require("./routes/academicTermRoutes"));
const feeRoutes_1 = __importDefault(require("./routes/feeRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const assessmentRoutes_1 = __importDefault(require("./routes/assessmentRoutes"));
const reportCardRoutes_1 = __importDefault(require("./routes/reportCardRoutes"));
const onlineAssessmentRoutes_1 = __importDefault(require("./routes/onlineAssessmentRoutes"));
const timetableRoutes_1 = __importDefault(require("./routes/timetableRoutes"));
const syllabusRoutes_1 = __importDefault(require("./routes/syllabusRoutes"));
const promotionRoutes_1 = __importDefault(require("./routes/promotionRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const communicationRoutes_1 = __importDefault(require("./routes/communicationRoutes"));
const scholarshipRoutes_1 = __importDefault(require("./routes/scholarshipRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const feeReminderRoutes_1 = __importDefault(require("./routes/feeReminderRoutes"));
const academicsRoutes_1 = __importDefault(require("./routes/academicsRoutes"));
const branchRoutes_1 = __importDefault(require("./routes/branchRoutes"));
const branchAssignmentRoutes_1 = __importDefault(require("./routes/branchAssignmentRoutes"));
// New AI & Intelligence Routes
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const aiAssistantRoutes_1 = __importDefault(require("./routes/aiAssistantRoutes"));
const intelligenceRoutes_1 = __importDefault(require("./routes/intelligenceRoutes"));
const auditRoutes_1 = __importDefault(require("./routes/auditRoutes"));
const aiAnalyticsRoutes_1 = __importDefault(require("./routes/aiAnalyticsRoutes"));
// Academic Improvement Routes
const academicCalendarRoutes_1 = __importDefault(require("./routes/academicCalendarRoutes"));
const homeworkRoutes_1 = __importDefault(require("./routes/homeworkRoutes"));
const studentPortalRoutes_1 = __importDefault(require("./routes/studentPortalRoutes"));
// Accounting Module Routes
const expenseRoutes_1 = __importDefault(require("./routes/expenseRoutes"));
const invoiceRoutes_1 = __importDefault(require("./routes/invoiceRoutes"));
const payrollRoutes_1 = __importDefault(require("./routes/payrollRoutes"));
const budgetRoutes_1 = __importDefault(require("./routes/budgetRoutes"));
const pettyCashRoutes_1 = __importDefault(require("./routes/pettyCashRoutes"));
const financialRoutes_1 = __importDefault(require("./routes/financialRoutes"));
const debtCollectionRoutes_1 = __importDefault(require("./routes/debtCollectionRoutes"));
// Virtual Classroom & AI Tutor
const virtualClassroomRoutes_1 = __importDefault(require("./routes/virtualClassroomRoutes"));
// Master AI Ops
const masterAIRoutes_1 = __importDefault(require("./routes/masterAIRoutes"));
// Middleware
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
// Trust proxy — required behind Azure Container Apps / nginx
app.set('trust proxy', 1);
// Security Middleware
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(express_1.default.json({ limit: '50mb' })); // Increased limit for bulk imports
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving images
}));
app.use((0, morgan_1.default)('dev'));
// Apply rate limiting to all routes
app.use('/api/', rateLimiter_1.generalLimiter);
// Serve static files (uploaded images)
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Routes
app.use('/api/v1/auth', authRoutes_1.default);
app.use('/api/v1/profile', profileRoutes_1.default);
app.use('/api/v1/students', studentRoutes_1.default);
app.use('/api/v1/payments', paymentRoutes_1.default);
app.use('/api/v1/attendance', attendanceRoutes_1.default);
app.use('/api/v1/subjects', subjectRoutes_1.default);
app.use('/api/v1/classes', classRoutes_1.default);
app.use('/api/v1/users', userRoutes_1.default);
app.use('/api/v1/academic-terms', academicTermRoutes_1.default);
app.use('/api/v1/fees', feeRoutes_1.default);
app.use('/api/v1/dashboard', dashboardRoutes_1.default);
app.use('/api/v1/assessments', assessmentRoutes_1.default);
app.use('/api/v1/online-assessments', onlineAssessmentRoutes_1.default);
app.use('/api/v1/reports', reportCardRoutes_1.default);
app.use('/api/v1/timetables', timetableRoutes_1.default);
app.use('/api/v1/syllabus', syllabusRoutes_1.default);
app.use('/api/v1/promotions', promotionRoutes_1.default);
app.use('/api/v1/settings', settingsRoutes_1.default);
app.use('/api/v1/communication', communicationRoutes_1.default);
app.use('/api/v1/scholarships', scholarshipRoutes_1.default);
app.use('/api/v1/fee-reminders', feeReminderRoutes_1.default);
app.use('/api/v1/academics', academicsRoutes_1.default);
app.use('/api/v1/branches', branchRoutes_1.default);
app.use('/api/v1/branch-assignments', branchAssignmentRoutes_1.default);
// AI & Intelligence Routes
app.use('/api/v1/analytics', analyticsRoutes_1.default);
app.use('/api/v1/ai-assistant', aiAssistantRoutes_1.default);
app.use('/api/v1/intelligence', intelligenceRoutes_1.default);
app.use('/api/v1/audit', auditRoutes_1.default);
app.use('/api/v1/ai-analytics', aiAnalyticsRoutes_1.default);
// Academic Improvement Routes
app.use('/api/v1/academic-calendar', academicCalendarRoutes_1.default);
app.use('/api/v1/homework', homeworkRoutes_1.default);
app.use('/api/v1/student-portal', studentPortalRoutes_1.default);
// Accounting Module Routes
app.use('/api/v1/expenses', expenseRoutes_1.default);
app.use('/api/v1/invoices', invoiceRoutes_1.default);
app.use('/api/v1/payroll', payrollRoutes_1.default);
app.use('/api/v1/budgets', budgetRoutes_1.default);
app.use('/api/v1/petty-cash', pettyCashRoutes_1.default);
app.use('/api/v1/financial', financialRoutes_1.default);
app.use('/api/v1/debt-collection', debtCollectionRoutes_1.default);
// Virtual Classroom & AI Tutor
app.use('/api/v1/virtual-classroom', virtualClassroomRoutes_1.default);
// Master AI Ops
app.use('/api/v1/master-ai', masterAIRoutes_1.default);
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Sync School Management System API' });
});
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
// 404 handler for unknown routes
app.use(errorHandler_1.notFoundHandler);
// Global error handler (must be last)
app.use(errorHandler_1.errorHandler);
exports.default = app;
