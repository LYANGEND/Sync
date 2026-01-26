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
exports.deleteLogo = exports.uploadLogo = exports.getPublicSettings = exports.updateSettings = exports.getSettings = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const updateSettingsSchema = zod_1.z.object({
    schoolName: zod_1.z.string().min(2),
    schoolAddress: zod_1.z.string().optional(),
    schoolPhone: zod_1.z.string().optional(),
    schoolEmail: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    schoolWebsite: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    currentTermId: zod_1.z.string().uuid().optional().nullable(),
    // Theme
    primaryColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
    secondaryColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
    accentColor: zod_1.z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
    // Notification Channel Toggles
    emailNotificationsEnabled: zod_1.z.boolean().optional(),
    smsNotificationsEnabled: zod_1.z.boolean().optional(),
    // Fee Reminder Settings
    feeReminderEnabled: zod_1.z.boolean().optional(),
    feeReminderDaysBefore: zod_1.z.number().min(1).max(30).optional(),
    overdueReminderEnabled: zod_1.z.boolean().optional(),
    overdueReminderFrequency: zod_1.z.number().min(1).max(30).optional(),
    // SMTP
    smtpHost: zod_1.z.string().optional().or(zod_1.z.literal('')),
    smtpPort: zod_1.z.number().optional().nullable(),
    smtpSecure: zod_1.z.boolean().optional(),
    smtpUser: zod_1.z.string().optional().or(zod_1.z.literal('')),
    smtpPassword: zod_1.z.string().optional().or(zod_1.z.literal('')),
    smtpFromEmail: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    smtpFromName: zod_1.z.string().optional().or(zod_1.z.literal('')),
    // SMS
    smsProvider: zod_1.z.string().optional().or(zod_1.z.literal('')),
    smsApiKey: zod_1.z.string().optional().or(zod_1.z.literal('')),
    smsApiSecret: zod_1.z.string().optional().or(zod_1.z.literal('')),
    smsSenderId: zod_1.z.string().optional().or(zod_1.z.literal('')),
    // Lenco Payment Gateway
    lencoApiKey: zod_1.z.string().optional().or(zod_1.z.literal('')),
    lencoEnvironment: zod_1.z.string().optional().or(zod_1.z.literal('')),
    lencoDefaultBearer: zod_1.z.string().optional().or(zod_1.z.literal('')),
});
const getSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let settings = yield prisma.schoolSettings.findFirst({
            include: {
                currentTerm: true
            }
        });
        if (!settings) {
            settings = yield prisma.schoolSettings.create({
                data: {
                    schoolName: 'My School',
                },
                include: {
                    currentTerm: true
                }
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getSettings = getSettings;
const updateSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = updateSettingsSchema.parse(req.body);
        const existing = yield prisma.schoolSettings.findFirst();
        let settings;
        if (existing) {
            settings = yield prisma.schoolSettings.update({
                where: { id: existing.id },
                data,
            });
        }
        else {
            settings = yield prisma.schoolSettings.create({
                data,
            });
        }
        res.json(settings);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Update settings error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateSettings = updateSettings;
const getPublicSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settings = yield prisma.schoolSettings.findFirst({
            select: {
                schoolName: true,
                logoUrl: true,
                primaryColor: true,
                secondaryColor: true,
                accentColor: true,
            }
        });
        if (!settings) {
            return res.json({
                schoolName: 'My School',
                primaryColor: '#2563eb',
                secondaryColor: '#475569',
                accentColor: '#f59e0b',
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error('Get public settings error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getPublicSettings = getPublicSettings;
const uploadLogo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const logoUrl = `/uploads/logos/${req.file.filename}`;
        const existing = yield prisma.schoolSettings.findFirst();
        let settings;
        if (existing) {
            settings = yield prisma.schoolSettings.update({
                where: { id: existing.id },
                data: { logoUrl },
            });
        }
        else {
            settings = yield prisma.schoolSettings.create({
                data: {
                    schoolName: 'My School',
                    logoUrl
                },
            });
        }
        res.json({ logoUrl, message: 'Logo uploaded successfully' });
    }
    catch (error) {
        console.error('Upload logo error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.uploadLogo = uploadLogo;
const deleteLogo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existing = yield prisma.schoolSettings.findFirst();
        if (existing && existing.logoUrl) {
            // Update settings to remove logo URL
            yield prisma.schoolSettings.update({
                where: { id: existing.id },
                data: { logoUrl: null },
            });
            // Optionally delete the file from disk
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../../', existing.logoUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        res.json({ message: 'Logo deleted successfully' });
    }
    catch (error) {
        console.error('Delete logo error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteLogo = deleteLogo;
