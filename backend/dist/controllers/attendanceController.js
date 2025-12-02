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
exports.getStudentAttendance = exports.getClassAttendance = exports.recordAttendance = void 0;
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
