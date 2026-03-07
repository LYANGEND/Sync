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
exports.whatsappService = void 0;
const prisma_1 = require("../utils/prisma");
const axios_1 = __importDefault(require("axios"));
/**
 * WhatsApp Service - Send messages via WhatsApp Business API
 * Supports Meta (Cloud API) and Twilio WhatsApp providers
 */
class WhatsAppService {
    /**
     * Send a WhatsApp text message
     */
    sendMessage(phone, message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const settings = yield prisma_1.prisma.schoolSettings.findFirst();
                if (!settings)
                    return { success: false, error: 'No school settings found' };
                const whatsappEnabled = settings.whatsappEnabled;
                if (!whatsappEnabled)
                    return { success: false, error: 'WhatsApp is disabled' };
                const provider = settings.whatsappProvider;
                const apiKey = settings.whatsappApiKey;
                const phoneId = settings.whatsappPhoneId;
                if (!provider || !apiKey) {
                    return { success: false, error: 'WhatsApp not configured' };
                }
                const formattedPhone = this.formatPhone(phone);
                switch (provider.toUpperCase()) {
                    case 'META':
                        return yield this.sendViaMeta(formattedPhone, message, apiKey, phoneId);
                    case 'TWILIO_WHATSAPP':
                        return yield this.sendViaTwilio(formattedPhone, message, settings);
                    default:
                        return { success: false, error: `Unknown WhatsApp provider: ${provider}` };
                }
            }
            catch (error) {
                console.error('WhatsApp send error:', error);
                return { success: false, error: error.message };
            }
        });
    }
    /**
     * Send a WhatsApp template message (required for first-time messages)
     */
    sendTemplate(phone, templateName, parameters) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            try {
                const settings = yield prisma_1.prisma.schoolSettings.findFirst();
                if (!settings)
                    return { success: false, error: 'No settings found' };
                const apiKey = settings.whatsappApiKey;
                const phoneId = settings.whatsappPhoneId;
                if (!apiKey || !phoneId)
                    return { success: false, error: 'WhatsApp not configured' };
                const formattedPhone = this.formatPhone(phone);
                const response = yield axios_1.default.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                    messaging_product: 'whatsapp',
                    to: formattedPhone,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: 'en' },
                        components: parameters.length > 0 ? [{
                                type: 'body',
                                parameters: parameters.map(p => ({ type: 'text', text: p })),
                            }] : undefined,
                    },
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                return {
                    success: true,
                    messageId: (_b = (_a = response.data.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id,
                };
            }
            catch (error) {
                return { success: false, error: ((_e = (_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || error.message };
            }
        });
    }
    /**
     * Send fee reminder via WhatsApp
     */
    sendFeeReminder(phone, studentName, amount, dueDate, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = `📚 *Fee Reminder - ${schoolName}*\n\nDear Parent/Guardian,\n\nA fee of *ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}* for *${studentName}* is due on *${dueDate}*.\n\nPlease make payment via mobile money or visit the school office.\n\nThank you! 🙏`;
            return this.sendMessage(phone, message);
        });
    }
    /**
     * Send attendance alert via WhatsApp
     */
    sendAttendanceAlert(phone, studentName, absentDays, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = `⚠️ *Attendance Alert - ${schoolName}*\n\nDear Parent/Guardian,\n\n*${studentName}* has been absent for *${absentDays} consecutive day(s)*.\n\nPlease contact the school if there are any concerns.\n\nKind regards,\n${schoolName}`;
            return this.sendMessage(phone, message);
        });
    }
    /**
     * Send payment confirmation via WhatsApp
     */
    sendPaymentConfirmation(phone, studentName, amount, transactionId, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = `✅ *Payment Received - ${schoolName}*\n\nDear Parent/Guardian,\n\nWe have received your payment:\n\n• Student: *${studentName}*\n• Amount: *ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}*\n• Reference: *${transactionId}*\n\nThank you for your payment! 🎉`;
            return this.sendMessage(phone, message);
        });
    }
    /**
     * Send report card notification via WhatsApp
     */
    sendReportNotification(phone, studentName, termName, averageScore, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const emoji = averageScore >= 80 ? '🌟' : averageScore >= 60 ? '👍' : averageScore >= 50 ? '📖' : '📝';
            const message = `${emoji} *Report Card Available - ${schoolName}*\n\nDear Parent/Guardian,\n\n*${studentName}*'s report card for *${termName}* is now available.\n\n• Average Score: *${averageScore.toFixed(1)}%*\n\nPlease log in to the parent portal to view the full report.\n\nKind regards,\n${schoolName}`;
            return this.sendMessage(phone, message);
        });
    }
    formatPhone(phone) {
        let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '260' + cleaned.substring(1);
        }
        return cleaned;
    }
    sendViaMeta(to, message, apiKey, phoneId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            try {
                const response = yield axios_1.default.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'text',
                    text: { body: message },
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                return {
                    success: true,
                    messageId: (_b = (_a = response.data.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id,
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: ((_e = (_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || error.message,
                };
            }
        });
    }
    sendViaTwilio(to, message, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const accountSid = settings.smsApiKey || '';
                const authToken = settings.smsApiSecret || '';
                const response = yield fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        To: `whatsapp:+${to}`,
                        From: `whatsapp:${settings.smsSenderId || ''}`,
                        Body: message,
                    }),
                });
                const result = yield response.json();
                if (result.sid) {
                    return { success: true, messageId: result.sid };
                }
                return { success: false, error: result.message || 'Twilio WhatsApp error' };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });
    }
}
exports.whatsappService = new WhatsAppService();
exports.default = exports.whatsappService;
