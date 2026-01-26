"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceAnalytics = exports.getStudentAttendance = exports.getClassAttendance = exports.recordAttendance = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const recordAttendanceSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    date: zod_1.z.string().datetime(),
    records: zod_1.z.array(zod_1.z.object({
        studentId: zod_1.z.string().uuid(),
        status: zod_1.z.enum(['PRESENT', 'ABSENT', 'LATE']),
    })),
});
const recordAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { classId, date, records } = recordAttendanceSchema.parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const attendanceDate = new Date(date);
        const nextDay = new Date(attendanceDate);
        nextDay.setDate(nextDay.getDate() + 1);
        // Use a transaction to ensure all records are created or none
        const result = yield prisma.$transaction((prisma) => __awaiter(void 0, void 0, void 0, function* () {
            // Delete existing attendance for this class and date to avoid duplicates
            yield prisma.attendance.deleteMany({
                where: {
                    classId,
                    date: {
                        gte: attendanceDate,
                        lt: nextDay,
                    },
                },
            });
            // Create new records
            return Promise.all(records.map((record) => prisma.attendance.create({
                data: {
                    classId,
                    date: attendanceDate,
                    studentId: record.studentId,
                    status: record.status,
                    recordedByUserId: userId,
                },
            })));
        }));
        res.status(201).json({ message: 'Attendance recorded successfully', count: result.length });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Record attendance error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.recordAttendance = recordAttendance;
const getClassAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, date } = req.query;
        if (!classId || typeof classId !== 'string') {
            return res.status(400).json({ message: 'Class ID is required' });
        }
        const whereClause = { classId };
        if (date && typeof date === 'string') {
            // Filter by date (ignoring time for simplicity in this example, 
            // but in production you'd want to handle timezones carefully)
            const searchDate = new Date(date);
            const nextDay = new Date(searchDate);
            nextDay.setDate(nextDay.getDate() + 1);
            whereClause.date = {
                gte: searchDate,
                lt: nextDay,
            };
        }
        const attendance = yield prisma.attendance.findMany({
            where: whereClause,
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    },
                },
            },
            orderBy: {
                student: {
                    lastName: 'asc',
                },
            },
        });
        res.json(attendance);
    }
    catch (error) {
        console.error('Get class attendance error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getClassAttendance = getClassAttendance;
const getStudentAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const attendance = yield prisma.attendance.findMany({
            where: { studentId },
            orderBy: {
                date: 'desc',
            },
        });
        res.json(attendance);
    }
    catch (error) {
        console.error('Get student attendance error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getStudentAttendance = getStudentAttendance;
const getAttendanceAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, startDate, endDate } = req.query;
        if (!classId || !startDate || !endDate) {
            return res.status(400).json({ message: 'classId, startDate, and endDate are required' });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        // Get all students in the class
        const students = yield prisma.student.findMany({
            where: { classId: classId, status: 'ACTIVE' },
            select: { id: true, firstName: true, lastName: true, admissionNumber: true }
        });
        // Get all attendance records for the date range
        const records = yield prisma.attendance.findMany({
            where: {
                classId: classId,
                date: { gte: start, lte: end }
            },
            orderBy: { date: 'asc' }
        });
        // Group by date for daily summary
        const dailyMap = {};
        records.forEach(r => {
            const dateKey = r.date.toISOString().split('T')[0];
            if (!dailyMap[dateKey]) {
                dailyMap[dateKey] = { present: 0, absent: 0, late: 0, total: 0 };
            }
            dailyMap[dateKey].total++;
            if (r.status === 'PRESENT')
                dailyMap[dateKey].present++;
            else if (r.status === 'ABSENT')
                dailyMap[dateKey].absent++;
            else if (r.status === 'LATE')
                dailyMap[dateKey].late++;
        });
        const dailyData = Object.entries(dailyMap).map(([date, data]) => (Object.assign({ date }, data)));
        // Student summaries
        const studentMap = {};
        students.forEach(s => {
            studentMap[s.id] = { present: 0, absent: 0, late: 0 };
        });
        records.forEach(r => {
            if (studentMap[r.studentId]) {
                if (r.status === 'PRESENT')
                    studentMap[r.studentId].present++;
                else if (r.status === 'ABSENT')
                    studentMap[r.studentId].absent++;
                else if (r.status === 'LATE')
                    studentMap[r.studentId].late++;
            }
        });
        const totalDays = dailyData.length;
        const studentSummaries = students.map(s => {
            const data = studentMap[s.id];
            const totalRecorded = data.present + data.absent + data.late;
            return {
                studentId: s.id,
                studentName: `${s.firstName} ${s.lastName}`,
                admissionNumber: s.admissionNumber,
                presentDays: data.present,
                absentDays: data.absent,
                lateDays: data.late,
                attendanceRate: totalRecorded > 0 ? (data.present / totalRecorded) * 100 : 0
            };
        });
        res.json({ dailyData, studentSummaries, totalDays });
    }
    catch (error) {
        console.error('Get attendance analytics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getAttendanceAnalytics = getAttendanceAnalytics;
