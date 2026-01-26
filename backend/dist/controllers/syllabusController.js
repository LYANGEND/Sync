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
exports.createLessonPlan = exports.getLessonPlans = exports.updateTopicProgress = exports.getClassProgress = exports.deleteTopic = exports.createTopic = exports.getTopics = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
// --- Schemas ---
const createTopicSchema = zod_1.z.object({
    title: zod_1.z.string().min(3),
    description: zod_1.z.string().optional(),
    subjectId: zod_1.z.string().uuid(),
    gradeLevel: zod_1.z.number().int().min(-3).max(12), // Allow negative values for ECD (Baby, Middle, Reception)
    orderIndex: zod_1.z.number().int().optional(),
});
const updateTopicProgressSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});
const createLessonPlanSchema = zod_1.z.object({
    classId: zod_1.z.string().uuid(),
    subjectId: zod_1.z.string().uuid(),
    termId: zod_1.z.string().uuid(),
    weekStartDate: zod_1.z.string(), // Allow YYYY-MM-DD formatted strings
    title: zod_1.z.string().min(3),
    content: zod_1.z.string().min(10),
    fileUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
});
// --- Topics (Syllabus) ---
const getTopics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { subjectId, gradeLevel } = req.query;
        if (!subjectId || !gradeLevel) {
            return res.status(400).json({ message: 'Subject ID and Grade Level are required' });
        }
        const topics = yield prisma.topic.findMany({
            where: {
                subjectId: subjectId,
                gradeLevel: Number(gradeLevel),
            },
            orderBy: {
                orderIndex: 'asc',
            },
        });
        res.json(topics);
    }
    catch (error) {
        console.error('Get topics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getTopics = getTopics;
const createTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = createTopicSchema.parse(req.body);
        const topic = yield prisma.topic.create({
            data,
        });
        res.status(201).json(topic);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Create topic error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createTopic = createTopic;
const deleteTopic = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.topic.delete({ where: { id } });
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete topic error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteTopic = deleteTopic;
// --- Topic Progress ---
const getClassProgress = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, subjectId } = req.query;
        if (!classId || !subjectId) {
            return res.status(400).json({ message: 'Class ID and Subject ID are required' });
        }
        // 1. Get the class to know the grade level
        const classInfo = yield prisma.class.findUnique({
            where: { id: classId },
        });
        if (!classInfo) {
            return res.status(404).json({ message: 'Class not found' });
        }
        // 2. Get all topics for this subject and grade
        const topics = yield prisma.topic.findMany({
            where: {
                subjectId: subjectId,
                gradeLevel: classInfo.gradeLevel,
            },
            orderBy: {
                orderIndex: 'asc',
            },
            include: {
                progress: {
                    where: {
                        classId: classId,
                    },
                },
            },
        });
        // 3. Format response to include status directly
        const formattedTopics = topics.map(topic => {
            var _a, _b;
            return (Object.assign(Object.assign({}, topic), { status: ((_a = topic.progress[0]) === null || _a === void 0 ? void 0 : _a.status) || 'PENDING', completedAt: ((_b = topic.progress[0]) === null || _b === void 0 ? void 0 : _b.completedAt) || null }));
        });
        res.json(formattedTopics);
    }
    catch (error) {
        console.error('Get class progress error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getClassProgress = getClassProgress;
const updateTopicProgress = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { topicId, classId } = req.params;
        const { status } = updateTopicProgressSchema.parse(req.body);
        const progress = yield prisma.topicProgress.upsert({
            where: {
                topicId_classId: {
                    topicId,
                    classId,
                },
            },
            update: {
                status: status,
                completedAt: status === 'COMPLETED' ? new Date() : null,
            },
            create: {
                topicId,
                classId,
                status: status,
                completedAt: status === 'COMPLETED' ? new Date() : null,
            },
        });
        res.json(progress);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Update topic progress error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateTopicProgress = updateTopicProgress;
// --- Lesson Plans ---
const getLessonPlans = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, subjectId } = req.query;
        if (!classId || !subjectId) {
            return res.status(400).json({ message: 'Class ID and Subject ID are required' });
        }
        const plans = yield prisma.lessonPlan.findMany({
            where: {
                classId: classId,
                subjectId: subjectId,
            },
            orderBy: {
                weekStartDate: 'desc',
            },
            include: {
                teacher: {
                    select: { fullName: true },
                },
            },
        });
        res.json(plans);
    }
    catch (error) {
        console.error('Get lesson plans error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getLessonPlans = getLessonPlans;
const createLessonPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const data = createLessonPlanSchema.parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const plan = yield prisma.lessonPlan.create({
            data: Object.assign(Object.assign({}, data), { teacherId: userId }),
        });
        res.status(201).json(plan);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Create lesson plan error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createLessonPlan = createLessonPlan;
