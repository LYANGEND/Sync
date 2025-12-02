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
exports.toggleUserStatus = exports.updateUser = exports.createUser = exports.getTeachers = exports.getUsers = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const auth_1 = require("../utils/auth");
const prisma = new client_1.PrismaClient();
const createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    fullName: zod_1.z.string().min(2),
    role: zod_1.z.nativeEnum(client_1.Role),
});
const updateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    fullName: zod_1.z.string().min(2).optional(),
    role: zod_1.z.nativeEnum(client_1.Role).optional(),
    password: zod_1.z.string().min(6).optional(),
});
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { role } = req.query;
        const whereClause = {};
        if (role) {
            whereClause.role = role;
        }
        const users = yield prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
exports.getUsers = getUsers;
const getTeachers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teachers = yield prisma.user.findMany({
            where: {
                role: client_1.Role.TEACHER,
                isActive: true,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
            },
            orderBy: {
                fullName: 'asc',
            },
        });
        res.json(teachers);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
});
exports.getTeachers = getTeachers;
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, fullName, role } = createUserSchema.parse(req.body);
        const existingUser = yield prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        const passwordHash = yield (0, auth_1.hashPassword)(password);
        const user = yield prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName,
                role,
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });
        res.status(201).json(user);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});
exports.createUser = createUser;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { email, fullName, role, password } = updateUserSchema.parse(req.body);
        const data = { email, fullName, role };
        if (password) {
            data.passwordHash = yield (0, auth_1.hashPassword)(password);
        }
        const user = yield prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                isActive: true,
            },
        });
        res.json(user);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Failed to update user' });
    }
});
exports.updateUser = updateUser;
const toggleUserStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const user = yield prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const updatedUser = yield prisma.user.update({
            where: { id },
            data: { isActive: !user.isActive },
            select: {
                id: true,
                isActive: true,
            },
        });
        res.json(updatedUser);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});
exports.toggleUserStatus = toggleUserStatus;
