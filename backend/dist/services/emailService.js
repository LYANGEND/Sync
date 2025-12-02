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
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const sendEmail = (to, subject, html) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Fetch SMTP settings
        const settings = yield prisma.schoolSettings.findFirst();
        if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
            console.warn('SMTP settings not configured. Email not sent.');
            return false;
        }
        console.log('DEBUG: SMTP Settings found:', {
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser,
            dbSecureSetting: settings.smtpSecure
        });
        // 2. Create Transporter
        // Auto-detect secure connection based on port if not explicitly clear
        // Port 465 requires secure: true (Implicit TLS)
        // Port 587 requires secure: false (STARTTLS)
        const port = settings.smtpPort || 587;
        const isSecure = port === 465;
        console.log(`DEBUG: Configuring Transporter: Host=${settings.smtpHost}, Port=${port}, Secure=${isSecure}`);
        const transporter = nodemailer_1.default.createTransport({
            host: settings.smtpHost,
            port: port,
            secure: isSecure,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });
        // 3. Send Email
        console.log(`DEBUG: Attempting to send email to ${to}`);
        const info = yield transporter.sendMail({
            from: `"${settings.smtpFromName || 'School Admin'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
            to,
            subject,
            html,
        });
        console.log('DEBUG: Message sent successfully: %s', info.messageId);
        return true;
    }
    catch (error) {
        console.error('DEBUG: Error sending email:', error);
        if (error.code === 'EAUTH') {
            console.error('---------------------------------------------------');
            console.error('AUTHENTICATION ERROR:');
            console.error('The SMTP server rejected your username or password.');
            console.error('1. Ensure "Username" is your full email address (e.g. user@gmail.com).');
            console.error('2. If using Gmail, you MUST use an "App Password" if 2FA is enabled.');
            console.error('   (Your regular Gmail password will NOT work)');
            console.error('---------------------------------------------------');
        }
        return false;
    }
});
exports.sendEmail = sendEmail;
