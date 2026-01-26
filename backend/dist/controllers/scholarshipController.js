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
exports.bulkCreateScholarships = exports.deleteScholarship = exports.updateScholarship = exports.createScholarship = exports.getScholarships = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const scholarshipSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    percentage: zod_1.z.number().min(0).max(100),
    description: zod_1.z.string().optional(),
});
const getScholarships = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scholarships = yield prisma.scholarship.findMany({
            include: {
                _count: {
                    select: { students: true }
                }
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json(scholarships);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch scholarships' });
    }
});
exports.getScholarships = getScholarships;
const createScholarship = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = scholarshipSchema.parse(req.body);
        const scholarship = yield prisma.scholarship.create({
            data,
        });
        res.status(201).json(scholarship);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create scholarship' });
    }
});
exports.createScholarship = createScholarship;
const updateScholarship = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const data = scholarshipSchema.parse(req.body);
        const scholarship = yield prisma.scholarship.update({
            where: { id },
            data,
        });
        res.json(scholarship);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update scholarship' });
    }
});
exports.updateScholarship = updateScholarship;
const deleteScholarship = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield prisma.scholarship.delete({
            where: { id },
        });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete scholarship' });
    }
});
exports.deleteScholarship = deleteScholarship;
const bulkCreateScholarships = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scholarshipsData = zod_1.z.array(scholarshipSchema).parse(req.body);
        const result = yield prisma.scholarship.createMany({
            data: scholarshipsData,
            skipDuplicates: true,
        });
        res.status(201).json({
            message: `Successfully imported ${result.count} scholarships`,
            count: result.count,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Bulk create scholarships error:', error);
        res.status(500).json({ error: 'Failed to import scholarships' });
    }
});
exports.bulkCreateScholarships = bulkCreateScholarships;
