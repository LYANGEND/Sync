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
exports.deleteEvent = exports.updateEvent = exports.createEvent = exports.getEvents = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
const eventSchema = zod_1.z.object({
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    eventType: zod_1.z.enum([
        'HOLIDAY', 'EXAM_PERIOD', 'PARENT_MEETING', 'SPORTS_DAY',
        'CULTURAL_EVENT', 'DEADLINE', 'STAFF_DEVELOPMENT', 'SCHOOL_CLOSURE', 'OTHER'
    ]),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string(),
    isAllDay: zod_1.z.boolean().optional(),
    color: zod_1.z.string().optional(),
});
const getEvents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, eventType } = req.query;
        const where = {};
        if (startDate && endDate) {
            where.OR = [
                {
                    startDate: { gte: new Date(startDate), lte: new Date(endDate) }
                },
                {
                    endDate: { gte: new Date(startDate), lte: new Date(endDate) }
                },
                {
                    AND: [
                        { startDate: { lte: new Date(startDate) } },
                        { endDate: { gte: new Date(endDate) } }
                    ]
                }
            ];
        }
        if (eventType)
            where.eventType = eventType;
        const events = yield prisma_1.prisma.academicEvent.findMany({
            where,
            orderBy: { startDate: 'asc' },
        });
        res.json(events);
    }
    catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});
exports.getEvents = getEvents;
const createEvent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const data = eventSchema.parse(req.body);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const event = yield prisma_1.prisma.academicEvent.create({
            data: Object.assign(Object.assign({}, data), { startDate: new Date(data.startDate), endDate: new Date(data.endDate), isAllDay: (_b = data.isAllDay) !== null && _b !== void 0 ? _b : true, createdBy: userId }),
        });
        res.status(201).json(event);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Create event error:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});
exports.createEvent = createEvent;
const updateEvent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const data = eventSchema.partial().parse(req.body);
        const updateData = Object.assign({}, data);
        if (data.startDate)
            updateData.startDate = new Date(data.startDate);
        if (data.endDate)
            updateData.endDate = new Date(data.endDate);
        const event = yield prisma_1.prisma.academicEvent.update({
            where: { id },
            data: updateData,
        });
        res.json(event);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Update event error:', error);
        res.status(500).json({ error: 'Failed to update event' });
    }
});
exports.updateEvent = updateEvent;
const deleteEvent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma_1.prisma.academicEvent.delete({ where: { id } });
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});
exports.deleteEvent = deleteEvent;
