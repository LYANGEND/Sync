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
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = require("../utils/prisma");
const communicationLogService_1 = require("./communicationLogService");
/**
 * Send an email and log it to the communication audit trail.
 * This is the SINGLE source of truth for sending emails in the app.
 */
const sendEmail = (to, subject, html, options) => __awaiter(void 0, void 0, void 0, function* () {
    const source = (options === null || options === void 0 ? void 0 : options.source) || 'manual';
    const sentById = (options === null || options === void 0 ? void 0 : options.sentById) || undefined;
    const recipientName = (options === null || options === void 0 ? void 0 : options.recipientName) || undefined;
    // 1. Create a PENDING log entry
    const logId = yield (0, communicationLogService_1.logCommunication)({
        channel: 'EMAIL',
        status: 'PENDING',
        recipientEmail: to,
        recipientName,
        subject,
        message: html.replace(/<[^>]*>/g, '').substring(0, 500), // Plain text preview
        htmlBody: html,
        source,
        sentById,
    });
    try {
        // 2. Fetch SMTP settings
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
            console.warn('SMTP settings not configured. Email not sent.');
            if (logId)
                yield (0, communicationLogService_1.updateCommunicationLogStatus)(logId, 'FAILED', 'SMTP settings not configured');
            return false;
        }
        // 3. Create Transporter
        const port = settings.smtpPort || 587;
        const isSecure = port === 465;
        const transporter = nodemailer_1.default.createTransport({
            host: settings.smtpHost,
            port: port,
            secure: isSecure,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });
        // 4. Send Email
        const info = yield transporter.sendMail({
            from: `"${settings.smtpFromName || 'School Admin'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
            to,
            subject,
            html,
        });
        console.log('Email sent successfully: %s', info.messageId);
        // 5. Update log to SENT
        if (logId)
            yield (0, communicationLogService_1.updateCommunicationLogStatus)(logId, 'SENT');
        return true;
    }
    catch (error) {
        console.error('Error sending email:', error);
        const errorMsg = error.code === 'EAUTH'
            ? 'SMTP authentication failed — check username/password'
            : error.message || 'Unknown email error';
        // 5b. Update log to FAILED
        if (logId)
            yield (0, communicationLogService_1.updateCommunicationLogStatus)(logId, 'FAILED', errorMsg);
        return false;
    }
});
exports.sendEmail = sendEmail;
