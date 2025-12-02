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
exports.createAcademicTerm = exports.getAcademicTerms = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const termSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    isActive: zod_1.z.boolean().optional(),
});
const getAcademicTerms = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const terms = yield prisma.academicTerm.findMany({
            orderBy: { startDate: 'desc' },
        });
        res.json(terms);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch academic terms' });
    }
});
exports.getAcademicTerms = getAcademicTerms;
const createAcademicTerm = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, startDate, endDate, isActive } = termSchema.parse(req.body);
        const term = yield prisma.academicTerm.create({
            data: {
                name,
                startDate,
                endDate,
                isActive: isActive || false,
            },
        });
        res.status(201).json(term);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create academic term' });
    }
});
exports.createAcademicTerm = createAcademicTerm;
