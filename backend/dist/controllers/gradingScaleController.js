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
exports.deleteGradingScale = exports.updateGradingScale = exports.createGradingScale = exports.getGradingScales = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const gradingScaleSchema = zod_1.z.object({
    grade: zod_1.z.string().min(1),
    minScore: zod_1.z.number().min(0).max(100),
    maxScore: zod_1.z.number().min(0).max(100),
    remark: zod_1.z.string().optional(),
});
const getGradingScales = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scales = yield prisma.gradingScale.findMany({
            orderBy: { minScore: 'desc' },
        });
        res.json(scales);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch grading scales' });
    }
});
exports.getGradingScales = getGradingScales;
const createGradingScale = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = gradingScaleSchema.parse(req.body);
        // Check for overlap
        const existing = yield prisma.gradingScale.findFirst({
            where: {
                OR: [
                    {
                        AND: [
                            { minScore: { lte: data.minScore } },
                            { maxScore: { gte: data.minScore } }
                        ]
                    },
                    {
                        AND: [
                            { minScore: { lte: data.maxScore } },
                            { maxScore: { gte: data.maxScore } }
                        ]
                    }
                ]
            }
        });
        if (existing) {
            return res.status(400).json({ error: 'Score range overlaps with existing grade' });
        }
        const scale = yield prisma.gradingScale.create({
            data,
        });
        res.status(201).json(scale);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create grading scale' });
    }
});
exports.createGradingScale = createGradingScale;
const updateGradingScale = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const data = gradingScaleSchema.parse(req.body);
        const scale = yield prisma.gradingScale.update({
            where: { id },
            data,
        });
        res.json(scale);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update grading scale' });
    }
});
exports.updateGradingScale = updateGradingScale;
const deleteGradingScale = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.gradingScale.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete grading scale' });
    }
});
exports.deleteGradingScale = deleteGradingScale;
