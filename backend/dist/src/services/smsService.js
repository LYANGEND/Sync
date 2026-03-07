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
exports.smsService = void 0;
const prisma_1 = require("../utils/prisma");
/**
 * SMS Service - Dedicated service for sending SMS messages
 * Supports Africa's Talking and Twilio providers
 */
class SmsService {
    /**
     * Send a single SMS message
     */
    send(phone, message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const settings = yield prisma_1.prisma.schoolSettings.findFirst();
                if (!settings)
                    return { success: false, error: 'No school settings found' };
                if (!settings.smsNotificationsEnabled) {
                    return { success: false, error: 'SMS notifications are disabled' };
                }
                if (!settings.smsProvider || !settings.smsApiKey) {
                    return { success: false, error: 'SMS provider not configured' };
                }
                const formattedPhone = this.formatPhone(phone);
                switch (settings.smsProvider.toUpperCase()) {
                    case 'AFRICASTALKING':
                        return yield this.sendViaAfricasTalking(formattedPhone, message, settings);
                    case 'TWILIO':
                        return yield this.sendViaTwilio(formattedPhone, message, settings);
                    default:
                        return { success: false, error: `Unknown SMS provider: ${settings.smsProvider}` };
                }
            }
            catch (error) {
                console.error('SMS send error:', error);
                return { success: false, error: error.message };
            }
        });
    }
    /**
     * Send bulk SMS messages
     */
    sendBulk(recipients) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = [];
            let sent = 0;
            let failed = 0;
            for (const recipient of recipients) {
                // Add small delay between messages to avoid rate limiting
                if (results.length > 0) {
                    yield new Promise(resolve => setTimeout(resolve, 200));
                }
                const result = yield this.send(recipient.phone, recipient.message);
                results.push(result);
                if (result.success)
                    sent++;
                else
                    failed++;
            }
            return { total: recipients.length, sent, failed, results };
        });
    }
    /**
     * Send attendance alert SMS to parent
     */
    sendAttendanceAlert(parentPhone, studentName, absentDays, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = `Dear Parent, ${studentName} has been absent for ${absentDays} consecutive days at ${schoolName}. Please contact the school. Reply STOP to unsubscribe.`;
            return this.send(parentPhone, message);
        });
    }
    /**
     * Send fee reminder SMS
     */
    sendFeeReminder(parentPhone, studentName, amount, dueDate, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
            const message = `Dear Parent, a fee of ZMW ${formattedAmount} for ${studentName} is due on ${dueDate} at ${schoolName}. Pay via mobile money or visit the school.`;
            return this.send(parentPhone, message);
        });
    }
    /**
     * Send payment confirmation SMS
     */
    sendPaymentConfirmation(parentPhone, studentName, amount, transactionId, schoolName) {
        return __awaiter(this, void 0, void 0, function* () {
            const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
            const message = `Payment received: ZMW ${formattedAmount} for ${studentName} at ${schoolName}. Ref: ${transactionId}. Thank you!`;
            return this.send(parentPhone, message);
        });
    }
    /**
     * Format phone number for Zambian format
     */
    formatPhone(phone) {
        let cleaned = phone.replace(/[\s\-\(\)]/g, '');
        // If starts with 0, replace with +260 (Zambia)
        if (cleaned.startsWith('0')) {
            cleaned = '+260' + cleaned.substring(1);
        }
        // If doesn't start with +, add +
        if (!cleaned.startsWith('+')) {
            cleaned = '+' + cleaned;
        }
        return cleaned;
    }
    sendViaAfricasTalking(to, message, settings) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const response = yield fetch('https://api.africastalking.com/version1/messaging', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'apiKey': settings.smsApiKey || '',
                    },
                    body: new URLSearchParams({
                        username: settings.smsApiSecret || '',
                        to,
                        message,
                        from: settings.smsSenderId || '',
                    }),
                });
                const result = yield response.json();
                const recipient = (_b = (_a = result.SMSMessageData) === null || _a === void 0 ? void 0 : _a.Recipients) === null || _b === void 0 ? void 0 : _b[0];
                if ((recipient === null || recipient === void 0 ? void 0 : recipient.status) === 'Success') {
                    return { success: true, messageId: recipient.messageId };
                }
                return { success: false, error: (recipient === null || recipient === void 0 ? void 0 : recipient.status) || 'Unknown error' };
            }
            catch (error) {
                return { success: false, error: error.message };
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
                        To: to,
                        From: settings.smsSenderId || '',
                        Body: message,
                    }),
                });
                const result = yield response.json();
                if (result.sid) {
                    return { success: true, messageId: result.sid };
                }
                return { success: false, error: result.message || 'Twilio error' };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });
    }
}
exports.smsService = new SmsService();
exports.default = exports.smsService;
