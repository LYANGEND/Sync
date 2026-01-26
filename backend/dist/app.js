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
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json({ limit: '50mb' })); // Increased limit for bulk imports
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving images
}));
app.use((0, morgan_1.default)('dev'));
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
exports.default = app;
