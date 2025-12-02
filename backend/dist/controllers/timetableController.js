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
exports.deleteTimetablePeriod = exports.createTimetablePeriod = exports.getTimetableByTeacher = exports.getTimetableByClass = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const createPeriodSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid(),
    dayOfWeek: zod_1.z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    startTime: zod_1.z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM
    endTime: zod_1.z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM
    academicTermId: zod_1.z.string().uuid(),
});
const getTimetableByClass = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId } = req.params;
        const { termId } = req.query;
        if (!termId) {
            return res.status(400).json({ message: 'Academic Term ID is required' });
        }
        const periods = yield prisma.timetablePeriod.findMany({
            where: {
                classId,
                academicTermId: termId,
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
            },
            orderBy: {
                startTime: 'asc',
            },
        });
        res.json(periods);
    }
    catch (error) {
        console.error('Get class timetable error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getTimetableByClass = getTimetableByClass;
const getTimetableByTeacher = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teacherId } = req.params;
        const { termId } = req.query;
        if (!termId) {
            return res.status(400).json({ message: 'Academic Term ID is required' });
        }
        const periods = yield prisma.timetablePeriod.findMany({
            where: {
                teacherId,
                academicTermId: termId,
            },
            include: {
                class: true,
                subject: true,
            },
            orderBy: {
                startTime: 'asc',
            },
        });
        res.json(periods);
    }
    catch (error) {
        console.error('Get teacher timetable error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getTimetableByTeacher = getTimetableByTeacher;
const createTimetablePeriod = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = createPeriodSchema.parse(req.body);
        // 1. Check for Teacher Conflict
        const teacherConflict = yield prisma.timetablePeriod.findFirst({
            where: {
                teacherId: data.teacherId,
                dayOfWeek: data.dayOfWeek,
                academicTermId: data.academicTermId,
                OR: [
                    {
                        AND: [
                            { startTime: { lte: data.startTime } },
                            { endTime: { gt: data.startTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { lt: data.endTime } },
                            { endTime: { gte: data.endTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { gte: data.startTime } },
                            { endTime: { lte: data.endTime } },
                        ],
                    },
                ],
            },
        });
        if (teacherConflict) {
            return res.status(409).json({
                message: 'Teacher is already booked for this time slot',
                conflict: teacherConflict
            });
        }
        // 2. Check for Class Conflict
        const classConflict = yield prisma.timetablePeriod.findFirst({
            where: {
                classId: data.classId,
                dayOfWeek: data.dayOfWeek,
                academicTermId: data.academicTermId,
                OR: [
                    {
                        AND: [
                            { startTime: { lte: data.startTime } },
                            { endTime: { gt: data.startTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { lt: data.endTime } },
                            { endTime: { gte: data.endTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { gte: data.startTime } },
                            { endTime: { lte: data.endTime } },
                        ],
                    },
                ],
            },
        });
        if (classConflict) {
            return res.status(409).json({
                message: 'Class already has a period in this time slot',
                conflict: classConflict
            });
        }
        const period = yield prisma.timetablePeriod.create({
            data,
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
            },
        });
        res.status(201).json(period);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Create timetable period error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createTimetablePeriod = createTimetablePeriod;
const deleteTimetablePeriod = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.timetablePeriod.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete timetable period error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteTimetablePeriod = deleteTimetablePeriod;
