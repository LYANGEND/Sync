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
exports.segmentDebtors = segmentDebtors;
exports.generatePersonalizedMessage = generatePersonalizedMessage;
exports.createCampaign = createCampaign;
exports.executeCampaign = executeCampaign;
exports.sendQuickReminders = sendQuickReminders;
exports.getCampaignAnalytics = getCampaignAnalytics;
exports.reconcileCampaignPayments = reconcileCampaignPayments;
exports.runScheduledCollection = runScheduledCollection;
const prisma_1 = require("../utils/prisma");
const emailService_1 = require("./emailService");
const smsService_1 = require("./smsService");
const whatsappService_1 = require("./whatsappService");
const communicationLogService_1 = require("./communicationLogService");
const aiService_1 = __importDefault(require("./aiService"));
/**
 * Segment all debtors by analyzing their payment behaviour
 */
function segmentDebtors(options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const students = yield prisma_1.prisma.student.findMany({
            where: { status: 'ACTIVE' },
            include: {
                class: true,
                feeStructures: { include: { feeTemplate: true } },
                payments: {
                    where: { status: 'COMPLETED' },
                    orderBy: { paymentDate: 'desc' },
                },
                parent: { select: { fullName: true, email: true } },
            },
        });
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        const day1 = (settings === null || settings === void 0 ? void 0 : settings.escalationDay1Days) || 7;
        const day2 = (settings === null || settings === void 0 ? void 0 : settings.escalationDay2Days) || 14;
        const day3 = (settings === null || settings === void 0 ? void 0 : settings.escalationDay3Days) || 21;
        const day4 = (settings === null || settings === void 0 ? void 0 : settings.escalationDay4Days) || 30;
        const debtors = [];
        for (const student of students) {
            const totalDue = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
            const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
            const amountOwed = totalDue - totalPaid;
            if (amountOwed <= 0)
                continue;
            if ((options === null || options === void 0 ? void 0 : options.minAmount) && amountOwed < options.minAmount)
                continue;
            // Calculate days overdue from earliest overdue fee
            const overdueFees = student.feeStructures.filter(f => f.dueDate && new Date(f.dueDate) < new Date() && Number(f.amountPaid) < Number(f.amountDue));
            const daysOverdue = overdueFees.length > 0
                ? Math.max(...overdueFees.map(f => Math.floor((Date.now() - new Date(f.dueDate).getTime()) / (1000 * 60 * 60 * 24))))
                : 0;
            if ((options === null || options === void 0 ? void 0 : options.minDaysOverdue) && daysOverdue < options.minDaysOverdue)
                continue;
            if (((_a = options === null || options === void 0 ? void 0 : options.gradeLevels) === null || _a === void 0 ? void 0 : _a.length) && !options.gradeLevels.includes(student.class.gradeLevel))
                continue;
            const paymentRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;
            const paymentCount = student.payments.length;
            const lastPayment = student.payments[0];
            const lastPaymentDate = lastPayment ? lastPayment.paymentDate.toISOString().split('T')[0] : null;
            const daysSinceLastPayment = lastPayment
                ? Math.floor((Date.now() - lastPayment.paymentDate.getTime()) / (1000 * 60 * 60 * 24))
                : null;
            // --- Segment classification ---
            let segment = 'NEEDS_NUDGE';
            let paymentLikelihood = 'MEDIUM';
            if (paymentCount === 0 && totalDue > 0) {
                segment = 'HARDSHIP';
                paymentLikelihood = 'LOW';
            }
            else if (paymentRate < 20) {
                segment = 'AT_RISK';
                paymentLikelihood = 'LOW';
            }
            else if (paymentRate >= 70 || (daysSinceLastPayment !== null && daysSinceLastPayment < 30)) {
                segment = 'WILL_PAY';
                paymentLikelihood = 'HIGH';
            }
            else {
                segment = 'NEEDS_NUDGE';
                paymentLikelihood = 'MEDIUM';
            }
            // --- Escalation level based on days overdue ---
            let escalationLevel = 1;
            if (daysOverdue >= day4)
                escalationLevel = 4;
            else if (daysOverdue >= day3)
                escalationLevel = 3;
            else if (daysOverdue >= day2)
                escalationLevel = 2;
            else
                escalationLevel = 1;
            debtors.push({
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`,
                className: student.class.name,
                gradeLevel: student.class.gradeLevel,
                parentName: ((_b = student.parent) === null || _b === void 0 ? void 0 : _b.fullName) || student.guardianName || null,
                parentEmail: ((_c = student.parent) === null || _c === void 0 ? void 0 : _c.email) || student.guardianEmail || null,
                parentPhone: student.guardianPhone || null,
                amountOwed,
                totalDue,
                totalPaid,
                paymentRate: Math.round(paymentRate),
                daysOverdue: Math.max(0, daysOverdue),
                paymentCount,
                lastPaymentDate,
                daysSinceLastPayment,
                segment,
                paymentLikelihood,
                escalationLevel,
            });
        }
        // Sort: highest debt first within each escalation level
        debtors.sort((a, b) => b.escalationLevel - a.escalationLevel || b.amountOwed - a.amountOwed);
        return debtors;
    });
}
// ========================================
// AI MESSAGE GENERATION
// ========================================
/**
 * Use AI to craft a personalized reminder message for a specific debtor
 */
function generatePersonalizedMessage(debtor, channel, schoolName) {
    return __awaiter(this, void 0, void 0, function* () {
        const isAiAvailable = yield aiService_1.default.isAvailable();
        if (!isAiAvailable) {
            return generateTemplateMessage(debtor, channel, schoolName);
        }
        const toneMap = {
            1: 'friendly and gentle — this is a first reminder',
            2: 'polite but firm — this is a second reminder, they need to pay soon',
            3: 'urgent and concerned — offer a payment plan, express understanding',
            4: 'formal and serious — this is a final notice before further action',
        };
        const segmentContext = {
            WILL_PAY: 'This parent usually pays on time but is late this term. A gentle nudge should suffice.',
            NEEDS_NUDGE: 'This parent pays irregularly. They respond to reminders but need encouragement.',
            AT_RISK: 'Very low payment rate. Consider offering flexible payment options.',
            HARDSHIP: 'No payments at all. They may be in genuine financial difficulty. Be empathetic.',
        };
        const maxLength = channel === 'SMS' ? '160 characters' : channel === 'WHATSAPP' ? '300 words' : '400 words';
        const formatNote = channel === 'EMAIL'
            ? 'Return JSON with "subject" and "htmlBody" (professional HTML email with inline styles) and "message" (plain text version).'
            : 'Return JSON with "message" only (plain text).';
        const prompt = `You are a school finance officer at "${schoolName}" in Zambia. Write a ${channel} message to remind a parent about outstanding school fees.

PARENT CONTEXT:
- Parent Name: ${debtor.parentName || 'Parent/Guardian'}
- Student: ${debtor.studentName} (${debtor.className})
- Amount Owed: ZMW ${debtor.amountOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Days Overdue: ${debtor.daysOverdue}
- Payment History: ${debtor.paymentCount} payments, ${debtor.paymentRate}% paid so far
- Last Payment: ${debtor.lastPaymentDate || 'Never'}
- Segment: ${segmentContext[debtor.segment]}

TONE: ${toneMap[debtor.escalationLevel]}
ESCALATION LEVEL: ${debtor.escalationLevel} of 4
MAX LENGTH: ${maxLength}
CURRENCY: ZMW (Zambian Kwacha)

${formatNote}

Important:
- Address the parent by name if available
- Include the specific amount owed
- Be culturally appropriate for a Zambian school context
- Do NOT threaten or be aggressive
${debtor.escalationLevel >= 3 ? '- Mention the option to set up a payment plan' : ''}
${debtor.escalationLevel === 4 ? '- Mention this is a final notice before the matter is escalated' : ''}

Return ONLY valid JSON, no other text.`;
        try {
            const messages = [
                { role: 'system', content: 'You generate school fee reminder messages in JSON format. Always return valid JSON only.' },
                { role: 'user', content: prompt },
            ];
            const response = yield aiService_1.default.chat(messages, { temperature: 0.7, maxTokens: 1500 });
            // Parse the AI response as JSON
            let parsed;
            try {
                const jsonStr = response.content.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
                parsed = JSON.parse(jsonStr);
            }
            catch (_a) {
                // If JSON parse fails, use content as-is
                return generateTemplateMessage(debtor, channel, schoolName);
            }
            return {
                subject: parsed.subject || undefined,
                message: parsed.message || response.content,
                htmlBody: parsed.htmlBody || undefined,
            };
        }
        catch (error) {
            console.error('AI message generation failed, falling back to template:', error);
            return generateTemplateMessage(debtor, channel, schoolName);
        }
    });
}
/**
 * Fallback: generate a template-based message when AI is unavailable
 */
function generateTemplateMessage(debtor, channel, schoolName) {
    var _a;
    const parentName = ((_a = debtor.parentName) === null || _a === void 0 ? void 0 : _a.split(' ')[0]) || 'Parent/Guardian';
    const amount = `ZMW ${debtor.amountOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (channel === 'SMS') {
        const smsTemplates = {
            1: `Hi ${parentName}, friendly reminder: ${debtor.studentName}'s fees of ${amount} are due at ${schoolName}. Please arrange payment. Thank you!`,
            2: `Dear ${parentName}, ${debtor.studentName}'s fees of ${amount} are now ${debtor.daysOverdue} days overdue at ${schoolName}. Kindly settle soon.`,
            3: `URGENT: ${parentName}, ${amount} outstanding for ${debtor.studentName} at ${schoolName} (${debtor.daysOverdue} days overdue). Contact us for a payment plan.`,
            4: `FINAL NOTICE: ${parentName}, ${amount} for ${debtor.studentName} at ${schoolName} is ${debtor.daysOverdue} days overdue. Contact the school immediately.`,
        };
        return { message: smsTemplates[debtor.escalationLevel] || smsTemplates[1] };
    }
    if (channel === 'WHATSAPP') {
        const waTemplates = {
            1: `Hello ${parentName} 👋\n\nThis is a friendly reminder from ${schoolName}. ${debtor.studentName}'s school fees of *${amount}* are now due.\n\nPlease arrange payment at your earliest convenience. Thank you! 🙏`,
            2: `Dear ${parentName},\n\nWe notice that ${debtor.studentName}'s fees of *${amount}* are now *${debtor.daysOverdue} days overdue*.\n\nPlease make payment as soon as possible to avoid any inconvenience.\n\nThank you,\n${schoolName}`,
            3: `Dear ${parentName},\n\n⚠️ *Urgent Reminder*\n\n${debtor.studentName}'s outstanding fees of *${amount}* are now *${debtor.daysOverdue} days overdue*.\n\nWe understand circumstances can be difficult. If you need help, we can arrange a *flexible payment plan*. Please contact the school's finance office.\n\n${schoolName}`,
            4: `Dear ${parentName},\n\n🔴 *Final Notice*\n\nThis is our final reminder regarding ${debtor.studentName}'s outstanding balance of *${amount}* (${debtor.daysOverdue} days overdue).\n\nPlease contact ${schoolName} immediately to resolve this matter. We are willing to work with you on a payment arrangement.\n\nThank you.`,
        };
        return { message: waTemplates[debtor.escalationLevel] || waTemplates[1] };
    }
    // EMAIL
    const subject = debtor.escalationLevel <= 2
        ? `📋 Fee Reminder — ${debtor.studentName} — ${schoolName}`
        : debtor.escalationLevel === 3
            ? `⚠️ Urgent: Outstanding Fees — ${debtor.studentName}`
            : `🔴 Final Notice: Fee Payment Required — ${debtor.studentName}`;
    const toneStyles = {
        1: { bg: '#3b82f6', accent: '#2563eb', label: 'Friendly Reminder' },
        2: { bg: '#f59e0b', accent: '#d97706', label: 'Payment Reminder' },
        3: { bg: '#ef4444', accent: '#dc2626', label: 'Urgent Notice' },
        4: { bg: '#991b1b', accent: '#7f1d1d', label: 'Final Notice' },
    };
    const style = toneStyles[debtor.escalationLevel] || toneStyles[1];
    const paymentPlanNote = debtor.escalationLevel >= 3
        ? `<p style="margin: 20px 0; padding: 16px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
        <strong>💡 Need help?</strong> We can arrange a flexible payment plan. Please contact the school finance office to discuss options.
      </p>` : '';
    const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
<tr><td><table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:${style.bg};padding:30px 40px;"><h1 style="margin:0;color:#fff;font-size:24px;">${style.label}</h1><p style="margin:8px 0 0;color:rgba(255,255,255,0.9);">${schoolName}</p></td></tr>
<tr><td style="background:${style.accent};padding:20px;text-align:center;"><p style="margin:0;color:rgba(255,255,255,0.9);font-size:12px;text-transform:uppercase;letter-spacing:1px;">Outstanding Balance</p><p style="margin:8px 0 0;color:#fff;font-size:36px;font-weight:700;">${amount}</p></td></tr>
<tr><td style="padding:40px;">
<p style="color:#334155;font-size:16px;">Dear ${parentName},</p>
<p style="color:#475569;font-size:15px;">${debtor.escalationLevel === 1
        ? `This is a friendly reminder that school fees for <strong>${debtor.studentName}</strong> (${debtor.className}) are now due.`
        : debtor.escalationLevel === 2
            ? `We note that fees for <strong>${debtor.studentName}</strong> (${debtor.className}) are now <strong>${debtor.daysOverdue} days overdue</strong>. Please arrange payment soon.`
            : debtor.escalationLevel === 3
                ? `We are concerned that fees for <strong>${debtor.studentName}</strong> (${debtor.className}) remain unpaid after <strong>${debtor.daysOverdue} days</strong>. We urge you to act promptly.`
                : `This is our <strong>final notice</strong> regarding outstanding fees for <strong>${debtor.studentName}</strong> (${debtor.className}), now <strong>${debtor.daysOverdue} days overdue</strong>.`}</p>
${paymentPlanNote}
<p style="color:#475569;margin-top:20px;">Best regards,<br/><strong>${schoolName} Finance Office</strong></p>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#94a3b8;font-size:11px;">This is an automated message from ${schoolName}.</p></td></tr>
</table></td></tr></table></body></html>`;
    const message = `Dear ${parentName},\n\nOutstanding fees for ${debtor.studentName} (${debtor.className}): ${amount} (${debtor.daysOverdue} days overdue).\n\nPlease arrange payment. Contact the finance office if you need assistance.\n\n${schoolName}`;
    return { subject, message, htmlBody };
}
// ========================================
// CAMPAIGN EXECUTION
// ========================================
/**
 * Create a new debt collection campaign
 */
function createCampaign(data) {
    return __awaiter(this, void 0, void 0, function* () {
        const campaign = yield prisma_1.prisma.debtCollectionCampaign.create({
            data: {
                name: data.name,
                description: data.description || null,
                minAmountOwed: data.minAmountOwed || null,
                minDaysOverdue: data.minDaysOverdue || null,
                targetSegments: data.targetSegments || [],
                targetGradeLevels: data.targetGradeLevels || [],
                createdById: data.createdById,
            },
        });
        return campaign;
    });
}
/**
 * Execute a campaign — send messages to all targeted debtors
 */
function executeCampaign(campaignId, sentById) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const campaign = yield prisma_1.prisma.debtCollectionCampaign.findUnique({
            where: { id: campaignId },
        });
        if (!campaign)
            throw new Error('Campaign not found');
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
        const useAI = (settings === null || settings === void 0 ? void 0 : settings.aiPersonalizedMessages) !== false;
        // Get debtors matching campaign criteria
        const debtors = yield segmentDebtors({
            minAmount: campaign.minAmountOwed ? Number(campaign.minAmountOwed) : undefined,
            minDaysOverdue: campaign.minDaysOverdue || undefined,
            gradeLevels: ((_a = campaign.targetGradeLevels) === null || _a === void 0 ? void 0 : _a.length) ? campaign.targetGradeLevels : undefined,
        });
        // Filter by target segments if specified
        const targetSegments = campaign.targetSegments;
        const filtered = (targetSegments === null || targetSegments === void 0 ? void 0 : targetSegments.length)
            ? debtors.filter(d => targetSegments.includes(d.segment))
            : debtors;
        let sent = 0;
        let failed = 0;
        let skipped = 0;
        // Mark campaign as active
        yield prisma_1.prisma.debtCollectionCampaign.update({
            where: { id: campaignId },
            data: { status: 'ACTIVE', startedAt: new Date(), totalTargeted: filtered.length },
        });
        for (const debtor of filtered) {
            // Determine channel based on escalation level
            const channelForLevel = getChannelForEscalation(debtor.escalationLevel, settings);
            if (!channelForLevel) {
                skipped++;
                continue;
            }
            const channels = channelForLevel === 'ALL'
                ? ['EMAIL', 'SMS', 'WHATSAPP']
                : [channelForLevel];
            for (const channel of channels) {
                // Check if we have contact info for this channel
                if (channel === 'EMAIL' && !debtor.parentEmail) {
                    skipped++;
                    continue;
                }
                if ((channel === 'SMS' || channel === 'WHATSAPP') && !debtor.parentPhone) {
                    skipped++;
                    continue;
                }
                try {
                    // Generate message (AI or template)
                    const msg = useAI
                        ? yield generatePersonalizedMessage(debtor, channel, schoolName)
                        : generateTemplateMessage(debtor, channel, schoolName);
                    // Send via appropriate channel
                    let success = false;
                    if (channel === 'EMAIL' && debtor.parentEmail) {
                        success = yield (0, emailService_1.sendEmail)(debtor.parentEmail, msg.subject || 'Fee Reminder', msg.htmlBody || msg.message, {
                            source: 'debt_collection',
                            sentById,
                            recipientName: debtor.parentName || undefined,
                        });
                    }
                    else if (channel === 'SMS' && debtor.parentPhone) {
                        const smsResult = yield smsService_1.smsService.send(debtor.parentPhone, msg.message);
                        success = smsResult.success;
                        // Log SMS
                        yield (0, communicationLogService_1.logCommunication)({
                            channel: 'SMS',
                            status: success ? 'SENT' : 'FAILED',
                            recipientPhone: debtor.parentPhone,
                            recipientName: debtor.parentName || undefined,
                            subject: msg.subject,
                            message: msg.message,
                            source: 'debt_collection',
                            sentById,
                        });
                    }
                    else if (channel === 'WHATSAPP' && debtor.parentPhone) {
                        const waResult = yield whatsappService_1.whatsappService.sendMessage(debtor.parentPhone, msg.message);
                        success = waResult.success;
                        yield (0, communicationLogService_1.logCommunication)({
                            channel: 'WHATSAPP',
                            status: success ? 'SENT' : 'FAILED',
                            recipientPhone: debtor.parentPhone,
                            recipientName: debtor.parentName || undefined,
                            subject: msg.subject,
                            message: msg.message,
                            source: 'debt_collection',
                            sentById,
                        });
                    }
                    // Record campaign message
                    yield prisma_1.prisma.campaignMessage.create({
                        data: {
                            campaignId,
                            studentId: debtor.studentId,
                            studentName: debtor.studentName,
                            parentName: debtor.parentName,
                            parentEmail: debtor.parentEmail,
                            parentPhone: debtor.parentPhone,
                            channel,
                            escalationLevel: debtor.escalationLevel,
                            subject: msg.subject || null,
                            messageContent: msg.message,
                            aiGenerated: useAI,
                            amountOwed: debtor.amountOwed,
                            daysOverdue: debtor.daysOverdue,
                            segment: debtor.segment,
                            paymentLikelihood: debtor.paymentLikelihood,
                            status: success ? 'SENT' : 'FAILED',
                            errorMessage: success ? null : 'Delivery failed',
                        },
                    });
                    if (success)
                        sent++;
                    else
                        failed++;
                }
                catch (error) {
                    console.error(`Campaign message failed for ${debtor.studentName}:`, error.message);
                    failed++;
                }
            }
        }
        // Update campaign results
        yield prisma_1.prisma.debtCollectionCampaign.update({
            where: { id: campaignId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                totalContacted: sent,
            },
        });
        return { sent, failed, skipped };
    });
}
/**
 * Quick send — no campaign, just send reminders to specific debtors
 */
function sendQuickReminders(options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
        const useAI = (settings === null || settings === void 0 ? void 0 : settings.aiPersonalizedMessages) !== false;
        let debtors = yield segmentDebtors({
            minDaysOverdue: options.minDaysOverdue,
        });
        // Filter by specific students if provided
        if ((_a = options.studentIds) === null || _a === void 0 ? void 0 : _a.length) {
            debtors = debtors.filter(d => options.studentIds.includes(d.studentId));
        }
        // Filter by segments
        if ((_b = options.segments) === null || _b === void 0 ? void 0 : _b.length) {
            debtors = debtors.filter(d => options.segments.includes(d.segment));
        }
        let sent = 0;
        let failed = 0;
        for (const debtor of debtors) {
            for (const channel of options.channels) {
                if (channel === 'EMAIL' && !debtor.parentEmail)
                    continue;
                if ((channel === 'SMS' || channel === 'WHATSAPP') && !debtor.parentPhone)
                    continue;
                try {
                    const msg = useAI
                        ? yield generatePersonalizedMessage(debtor, channel, schoolName)
                        : generateTemplateMessage(debtor, channel, schoolName);
                    let success = false;
                    if (channel === 'EMAIL' && debtor.parentEmail) {
                        success = yield (0, emailService_1.sendEmail)(debtor.parentEmail, msg.subject || 'Fee Reminder', msg.htmlBody || msg.message, {
                            source: 'quick_reminder',
                            sentById: options.sentById,
                            recipientName: debtor.parentName || undefined,
                        });
                    }
                    else if (channel === 'SMS' && debtor.parentPhone) {
                        const smsR = yield smsService_1.smsService.send(debtor.parentPhone, msg.message);
                        success = smsR.success;
                        yield (0, communicationLogService_1.logCommunication)({ channel: 'SMS', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'quick_reminder', sentById: options.sentById });
                    }
                    else if (channel === 'WHATSAPP' && debtor.parentPhone) {
                        const waR = yield whatsappService_1.whatsappService.sendMessage(debtor.parentPhone, msg.message);
                        success = waR.success;
                        yield (0, communicationLogService_1.logCommunication)({ channel: 'WHATSAPP', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'quick_reminder', sentById: options.sentById });
                    }
                    if (success)
                        sent++;
                    else
                        failed++;
                }
                catch (_c) {
                    failed++;
                }
            }
        }
        return { sent, failed };
    });
}
// ========================================
// CAMPAIGN ANALYTICS
// ========================================
/**
 * Get collection effectiveness — how many paid after being contacted
 */
function getCampaignAnalytics(campaignId) {
    return __awaiter(this, void 0, void 0, function* () {
        const where = campaignId ? { campaignId } : {};
        const messages = yield prisma_1.prisma.campaignMessage.findMany({ where });
        const totalSent = messages.filter((m) => m.status === 'SENT').length;
        const totalFailed = messages.filter((m) => m.status === 'FAILED').length;
        const totalPaid = messages.filter((m) => m.status === 'PAID').length;
        const totalAmount = messages.reduce((sum, m) => sum + Number(m.amountOwed), 0);
        const amountCollected = messages.filter((m) => m.paidAmount).reduce((sum, m) => sum + Number(m.paidAmount), 0);
        // Channel effectiveness
        const byChannel = {};
        for (const msg of messages) {
            const ch = msg.channel;
            if (!byChannel[ch])
                byChannel[ch] = { sent: 0, paid: 0, amount: 0 };
            if (msg.status === 'SENT' || msg.status === 'PAID')
                byChannel[ch].sent++;
            if (msg.status === 'PAID') {
                byChannel[ch].paid++;
                byChannel[ch].amount += Number(msg.paidAmount || 0);
            }
        }
        // Segment effectiveness
        const bySegment = {};
        for (const msg of messages) {
            const seg = msg.segment;
            if (!bySegment[seg])
                bySegment[seg] = { contacted: 0, paid: 0 };
            bySegment[seg].contacted++;
            if (msg.status === 'PAID')
                bySegment[seg].paid++;
        }
        return {
            totalSent,
            totalFailed,
            totalPaid,
            responseRate: totalSent > 0 ? Math.round((totalPaid / totalSent) * 100) : 0,
            totalAmountTargeted: totalAmount,
            amountCollected,
            collectionRate: totalAmount > 0 ? Math.round((amountCollected / totalAmount) * 100) : 0,
            byChannel,
            bySegment,
        };
    });
}
/**
 * Auto-detect payments from debtors who were contacted and mark as PAID
 */
function reconcileCampaignPayments() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get all SENT campaign messages that haven't been marked paid
        const pendingMessages = yield prisma_1.prisma.campaignMessage.findMany({
            where: { status: 'SENT' },
        });
        let reconciled = 0;
        for (const msg of pendingMessages) {
            // Check if any payment was made by this student after the message was sent
            const payment = yield prisma_1.prisma.payment.findFirst({
                where: {
                    studentId: msg.studentId,
                    status: 'COMPLETED',
                    paymentDate: { gte: msg.sentAt },
                },
                orderBy: { paymentDate: 'desc' },
            });
            if (payment) {
                yield prisma_1.prisma.campaignMessage.update({
                    where: { id: msg.id },
                    data: {
                        status: 'PAID',
                        paidAmount: payment.amount,
                        paidAt: payment.paymentDate,
                    },
                });
                reconciled++;
            }
        }
        // Also update campaign totals
        const campaigns = yield prisma_1.prisma.debtCollectionCampaign.findMany({
            where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
            include: { messages: { where: { status: 'PAID' } } },
        });
        for (const campaign of campaigns) {
            const totalResponded = campaign.messages.length;
            const amountCollected = campaign.messages.reduce((sum, m) => sum + Number(m.paidAmount || 0), 0);
            yield prisma_1.prisma.debtCollectionCampaign.update({
                where: { id: campaign.id },
                data: { totalResponded, amountCollected },
            });
        }
        return reconciled;
    });
}
// ========================================
// SCHEDULED COLLECTION (for cron)
// ========================================
/**
 * Run the daily debt collection check — called by scheduler
 */
function runScheduledCollection() {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        if (!(settings === null || settings === void 0 ? void 0 : settings.debtCollectionEnabled)) {
            console.log('[Debt Collection] Disabled in settings, skipping...');
            return;
        }
        console.log('[Debt Collection] Running scheduled collection check...');
        const debtors = yield segmentDebtors({
            minAmount: settings.debtCollectionMinAmount ? Number(settings.debtCollectionMinAmount) : 0,
        });
        if (debtors.length === 0) {
            console.log('[Debt Collection] No debtors found matching criteria.');
            return;
        }
        const schoolName = settings.schoolName || 'School';
        const useAI = settings.aiPersonalizedMessages !== false;
        let sent = 0;
        for (const debtor of debtors) {
            // Check if we already sent a message at this escalation level recently (within the frequency period)
            const recentMessage = yield prisma_1.prisma.campaignMessage.findFirst({
                where: {
                    studentId: debtor.studentId,
                    escalationLevel: debtor.escalationLevel,
                    sentAt: { gte: new Date(Date.now() - (settings.overdueReminderFrequency || 7) * 24 * 60 * 60 * 1000) },
                },
                orderBy: { sentAt: 'desc' },
            });
            if (recentMessage)
                continue; // Already sent at this level recently
            // Determine channel for this escalation level
            const channel = getChannelForEscalation(debtor.escalationLevel, settings);
            if (!channel)
                continue;
            const channels = channel === 'ALL'
                ? ['EMAIL', 'SMS', 'WHATSAPP']
                : [channel];
            for (const ch of channels) {
                if (ch === 'EMAIL' && !debtor.parentEmail)
                    continue;
                if ((ch === 'SMS' || ch === 'WHATSAPP') && !debtor.parentPhone)
                    continue;
                try {
                    const msg = useAI
                        ? yield generatePersonalizedMessage(debtor, ch, schoolName)
                        : generateTemplateMessage(debtor, ch, schoolName);
                    let success = false;
                    if (ch === 'EMAIL' && debtor.parentEmail) {
                        success = yield (0, emailService_1.sendEmail)(debtor.parentEmail, msg.subject || 'Fee Reminder', msg.htmlBody || msg.message, {
                            source: 'scheduled_collection',
                            recipientName: debtor.parentName || undefined,
                        });
                    }
                    else if (ch === 'SMS' && debtor.parentPhone) {
                        const smsR = yield smsService_1.smsService.send(debtor.parentPhone, msg.message);
                        success = smsR.success;
                        yield (0, communicationLogService_1.logCommunication)({ channel: 'SMS', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'scheduled_collection' });
                    }
                    else if (ch === 'WHATSAPP' && debtor.parentPhone) {
                        const waR = yield whatsappService_1.whatsappService.sendMessage(debtor.parentPhone, msg.message);
                        success = waR.success;
                        yield (0, communicationLogService_1.logCommunication)({ channel: 'WHATSAPP', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'scheduled_collection' });
                    }
                    if (success) {
                        // Record as campaign message for tracking
                        yield prisma_1.prisma.campaignMessage.create({
                            data: {
                                campaignId: null, // No campaign, scheduled
                                studentId: debtor.studentId,
                                studentName: debtor.studentName,
                                parentName: debtor.parentName,
                                parentEmail: debtor.parentEmail,
                                parentPhone: debtor.parentPhone,
                                channel: ch,
                                escalationLevel: debtor.escalationLevel,
                                subject: msg.subject || null,
                                messageContent: msg.message,
                                aiGenerated: useAI,
                                amountOwed: debtor.amountOwed,
                                daysOverdue: debtor.daysOverdue,
                                segment: debtor.segment,
                                paymentLikelihood: debtor.paymentLikelihood,
                                status: 'SENT',
                            },
                        });
                        sent++;
                    }
                }
                catch (error) {
                    console.error(`[Debt Collection] Failed for ${debtor.studentName}:`, error.message);
                }
            }
        }
        console.log(`[Debt Collection] Completed. Sent ${sent} messages.`);
    });
}
// ========================================
// HELPERS
// ========================================
function getChannelForEscalation(level, settings) {
    switch (level) {
        case 1: return (settings === null || settings === void 0 ? void 0 : settings.escalationDay1Channel) || 'EMAIL';
        case 2: return (settings === null || settings === void 0 ? void 0 : settings.escalationDay2Channel) || 'SMS';
        case 3: return (settings === null || settings === void 0 ? void 0 : settings.escalationDay3Channel) || 'WHATSAPP';
        case 4: return (settings === null || settings === void 0 ? void 0 : settings.escalationDay4Channel) || 'ALL';
        default: return 'EMAIL';
    }
}
