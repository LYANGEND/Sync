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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.updateProfilePicture = exports.getProfile = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const getProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const user = yield prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                profilePictureUrl: true,
                createdAt: true
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
});
exports.getProfile = getProfile;
const updateProfilePicture = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // In a real app, you'd upload to S3/Cloudinary here and get a URL.
        // For local dev, we'll serve from the static uploads folder.
        const fileUrl = `/uploads/profiles/${req.file.filename}`;
        const user = yield prisma.user.update({
            where: { id: userId },
            data: { profilePictureUrl: fileUrl },
            select: { profilePictureUrl: true }
        });
        res.json({ message: 'Profile picture updated', profilePictureUrl: user.profilePictureUrl });
    }
    catch (error) {
        console.error('Update profile picture error:', error);
        res.status(500).json({ message: 'Failed to update profile picture' });
    }
});
exports.updateProfilePicture = updateProfilePicture;
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(6),
});
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
        const user = yield prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const isValid = yield bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!isValid) {
            return res.status(400).json({ message: 'Invalid current password' });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        yield prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hashedPassword }
        });
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        res.status(500).json({ message: 'Failed to change password' });
    }
});
exports.changePassword = changePassword;
