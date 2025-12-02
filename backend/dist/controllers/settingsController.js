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
exports.updateSettings = exports.getSettings = void 0;
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
