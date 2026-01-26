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
exports.getAllPeriods = exports.deleteTimetablePeriod = exports.createTimetablePeriod = exports.getTimetableByTeacher = exports.getTimetableByClass = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const createPeriodSchema = zod_1.z.object({
    classIds: zod_1.z.array(zod_1.z.string().uuid()).min(1), // Support multiple classes
    subjectId: zod_1.z.string().uuid(),
    teacherId: zod_1.z.string().uuid().optional(), // Optional - will use subject's teacher if not provided
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
        // Find periods that include this class
        const periods = yield prisma.timetablePeriod.findMany({
            where: {
                academicTermId: termId,
                classes: {
                    some: {
                        classId: classId
                    }
                }
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
                classes: {
                    include: {
                        class: {
                            select: {
                                id: true,
                                name: true,
                                gradeLevel: true,
                            }
                        }
                    }
                }
            },
            orderBy: {
                startTime: 'asc',
            },
        });
        // Transform to include class names for display
        const transformedPeriods = periods.map(period => (Object.assign(Object.assign({}, period), { classNames: period.classes.map(c => c.class.name), isCombined: period.classes.length > 1 })));
        res.json(transformedPeriods);
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
                subject: true,
                classes: {
                    include: {
                        class: {
                            select: {
                                id: true,
                                name: true,
                                gradeLevel: true,
                            }
                        }
                    }
                }
            },
            orderBy: {
                startTime: 'asc',
            },
        });
        // Transform to include class names for display
        const transformedPeriods = periods.map(period => (Object.assign(Object.assign({}, period), { classNames: period.classes.map(c => c.class.name), isCombined: period.classes.length > 1 })));
        res.json(transformedPeriods);
    }
    catch (error) {
        console.error('Get teacher timetable error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getTimetableByTeacher = getTimetableByTeacher;
const createTimetablePeriod = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const data = createPeriodSchema.parse(req.body);
        const { classIds, subjectId, dayOfWeek, startTime, endTime, academicTermId } = data;
        let { teacherId } = data;
        // If teacherId not provided, get it from the subject's assigned teacher
        if (!teacherId) {
            const subject = yield prisma.subject.findUnique({
                where: { id: subjectId },
                select: { teacherId: true, name: true }
            });
            if (!(subject === null || subject === void 0 ? void 0 : subject.teacherId)) {
                return res.status(400).json({
                    message: `Subject "${(subject === null || subject === void 0 ? void 0 : subject.name) || 'Unknown'}" has no assigned teacher. Please assign a teacher to this subject first.`
                });
            }
            teacherId = subject.teacherId;
        }
        // 1. Check for Teacher Conflict
        const teacherConflict = yield prisma.timetablePeriod.findFirst({
            where: {
                teacherId,
                dayOfWeek,
                academicTermId,
                OR: [
                    {
                        AND: [
                            { startTime: { lte: startTime } },
                            { endTime: { gt: startTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { lt: endTime } },
                            { endTime: { gte: endTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { gte: startTime } },
                            { endTime: { lte: endTime } },
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
        // 2. Check for Class Conflicts (any of the selected classes)
        for (const classId of classIds) {
            const classConflict = yield prisma.timetablePeriod.findFirst({
                where: {
                    dayOfWeek,
                    academicTermId,
                    classes: {
                        some: {
                            classId
                        }
                    },
                    OR: [
                        {
                            AND: [
                                { startTime: { lte: startTime } },
                                { endTime: { gt: startTime } },
                            ],
                        },
                        {
                            AND: [
                                { startTime: { lt: endTime } },
                                { endTime: { gte: endTime } },
                            ],
                        },
                        {
                            AND: [
                                { startTime: { gte: startTime } },
                                { endTime: { lte: endTime } },
                            ],
                        },
                    ],
                },
                include: {
                    classes: {
                        include: {
                            class: true
                        }
                    }
                }
            });
            if (classConflict) {
                const conflictingClassName = ((_a = classConflict.classes.find(c => c.classId === classId)) === null || _a === void 0 ? void 0 : _a.class.name) || 'A class';
                return res.status(409).json({
                    message: `${conflictingClassName} already has a period in this time slot`,
                    conflict: classConflict
                });
            }
        }
        // 3. Create the period with linked classes
        const period = yield prisma.timetablePeriod.create({
            data: {
                subjectId,
                teacherId,
                dayOfWeek,
                startTime,
                endTime,
                academicTermId,
                classes: {
                    create: classIds.map(classId => ({
                        classId
                    }))
                }
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
                classes: {
                    include: {
                        class: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                }
            },
        });
        const result = Object.assign(Object.assign({}, period), { classNames: period.classes.map(c => c.class.name), isCombined: period.classes.length > 1 });
        res.status(201).json(result);
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
        // The join table entries will cascade delete
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
// Get all periods for a term (for admin view)
const getAllPeriods = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { termId } = req.query;
        if (!termId) {
            return res.status(400).json({ message: 'Academic Term ID is required' });
        }
        const periods = yield prisma.timetablePeriod.findMany({
            where: {
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
                classes: {
                    include: {
                        class: {
                            select: {
                                id: true,
                                name: true,
                                gradeLevel: true,
                            }
                        }
                    }
                }
            },
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' },
            ],
        });
        const transformedPeriods = periods.map(period => (Object.assign(Object.assign({}, period), { classNames: period.classes.map(c => c.class.name), isCombined: period.classes.length > 1 })));
        res.json(transformedPeriods);
    }
    catch (error) {
        console.error('Get all periods error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getAllPeriods = getAllPeriods;
