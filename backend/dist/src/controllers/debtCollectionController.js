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
exports.updateCollectionSettings = exports.getCollectionSettings = exports.reconcilePayments = exports.getCollectionAnalytics = exports.previewMessage = exports.sendReminders = exports.getCampaignDetails = exports.executeExistingCampaign = exports.createNewCampaign = exports.listCampaigns = exports.getDebtors = void 0;
const debtCollectionService_1 = require("../services/debtCollectionService");
const prisma_1 = require("../utils/prisma");
// ========================================
// DEBTOR SEGMENTATION
// ========================================
/**
 * GET /api/v1/debt-collection/debtors
 * Get all debtors with segmentation and payment analysis
 */
const getDebtors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { minAmount, minDaysOverdue, gradeLevels, segment } = req.query;
        let debtors = yield (0, debtCollectionService_1.segmentDebtors)({
            minAmount: minAmount ? Number(minAmount) : undefined,
            minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined,
            gradeLevels: gradeLevels ? String(gradeLevels).split(',').map(Number) : undefined,
        });
        // Optional client-side segment filter
        if (segment) {
            debtors = debtors.filter(d => d.segment === segment);
        }
        // Summary stats
        const summary = {
            totalDebtors: debtors.length,
            totalOwed: debtors.reduce((sum, d) => sum + d.amountOwed, 0),
            segments: {
                WILL_PAY: debtors.filter(d => d.segment === 'WILL_PAY').length,
                NEEDS_NUDGE: debtors.filter(d => d.segment === 'NEEDS_NUDGE').length,
                AT_RISK: debtors.filter(d => d.segment === 'AT_RISK').length,
                HARDSHIP: debtors.filter(d => d.segment === 'HARDSHIP').length,
            },
            byEscalation: {
                level1: debtors.filter(d => d.escalationLevel === 1).length,
                level2: debtors.filter(d => d.escalationLevel === 2).length,
                level3: debtors.filter(d => d.escalationLevel === 3).length,
                level4: debtors.filter(d => d.escalationLevel === 4).length,
            },
        };
        res.json({ summary, debtors });
    }
    catch (error) {
        console.error('Get debtors error:', error);
        res.status(500).json({ error: 'Failed to fetch debtors' });
    }
});
exports.getDebtors = getDebtors;
// ========================================
// CAMPAIGNS
// ========================================
/**
 * GET /api/v1/debt-collection/campaigns
 */
const listCampaigns = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const campaigns = yield prisma_1.prisma.debtCollectionCampaign.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, fullName: true } },
                _count: { select: { messages: true } },
            },
        });
        res.json(campaigns);
    }
    catch (error) {
        console.error('List campaigns error:', error);
        res.status(500).json({ error: 'Failed to list campaigns' });
    }
});
exports.listCampaigns = listCampaigns;
/**
 * POST /api/v1/debt-collection/campaigns
 */
const createNewCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { name, description, minAmountOwed, minDaysOverdue, targetSegments, targetGradeLevels } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Campaign name is required' });
        const campaign = yield (0, debtCollectionService_1.createCampaign)({
            name,
            description,
            minAmountOwed: minAmountOwed ? Number(minAmountOwed) : undefined,
            minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined,
            targetSegments,
            targetGradeLevels,
            createdById: user.userId,
        });
        res.status(201).json(campaign);
    }
    catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});
exports.createNewCampaign = createNewCampaign;
/**
 * POST /api/v1/debt-collection/campaigns/:id/execute
 */
const executeExistingCampaign = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { id } = req.params;
        const result = yield (0, debtCollectionService_1.executeCampaign)(id, user.userId);
        res.json(Object.assign({ message: `Campaign executed. ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.` }, result));
    }
    catch (error) {
        console.error('Execute campaign error:', error);
        res.status(500).json({ error: error.message || 'Failed to execute campaign' });
    }
});
exports.executeExistingCampaign = executeExistingCampaign;
/**
 * GET /api/v1/debt-collection/campaigns/:id
 */
const getCampaignDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const campaign = yield prisma_1.prisma.debtCollectionCampaign.findUnique({
            where: { id },
            include: {
                createdBy: { select: { id: true, fullName: true } },
                messages: {
                    orderBy: { sentAt: 'desc' },
                    take: 100,
                },
            },
        });
        if (!campaign)
            return res.status(404).json({ error: 'Campaign not found' });
        // Analytics for this campaign
        const analytics = yield (0, debtCollectionService_1.getCampaignAnalytics)(id);
        res.json({ campaign, analytics });
    }
    catch (error) {
        console.error('Get campaign details error:', error);
        res.status(500).json({ error: 'Failed to get campaign details' });
    }
});
exports.getCampaignDetails = getCampaignDetails;
// ========================================
// QUICK SEND
// ========================================
/**
 * POST /api/v1/debt-collection/send
 * Quick send reminders to selected debtors
 */
const sendReminders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { studentIds, segments, minDaysOverdue, channels } = req.body;
        if (!(channels === null || channels === void 0 ? void 0 : channels.length))
            return res.status(400).json({ error: 'At least one channel is required' });
        const result = yield (0, debtCollectionService_1.sendQuickReminders)({
            studentIds,
            segments,
            minDaysOverdue,
            channels,
            sentById: user.userId,
        });
        res.json(Object.assign({ message: `Sent ${result.sent} reminders, ${result.failed} failed.` }, result));
    }
    catch (error) {
        console.error('Send reminders error:', error);
        res.status(500).json({ error: 'Failed to send reminders' });
    }
});
exports.sendReminders = sendReminders;
// ========================================
// AI MESSAGE PREVIEW
// ========================================
/**
 * POST /api/v1/debt-collection/preview-message
 * Preview AI-generated message for a specific debtor before sending
 */
const previewMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, channel } = req.body;
        if (!studentId || !channel) {
            return res.status(400).json({ error: 'studentId and channel are required' });
        }
        const debtors = yield (0, debtCollectionService_1.segmentDebtors)();
        const debtor = debtors.find(d => d.studentId === studentId);
        if (!debtor)
            return res.status(404).json({ error: 'Student not found in debtors list' });
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
        const message = yield (0, debtCollectionService_1.generatePersonalizedMessage)(debtor, channel, schoolName);
        res.json({
            debtor: {
                studentName: debtor.studentName,
                parentName: debtor.parentName,
                amountOwed: debtor.amountOwed,
                daysOverdue: debtor.daysOverdue,
                segment: debtor.segment,
                escalationLevel: debtor.escalationLevel,
            },
            preview: message,
        });
    }
    catch (error) {
        console.error('Preview message error:', error);
        res.status(500).json({ error: 'Failed to generate message preview' });
    }
});
exports.previewMessage = previewMessage;
// ========================================
// ANALYTICS
// ========================================
/**
 * GET /api/v1/debt-collection/analytics
 */
const getCollectionAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const analytics = yield (0, debtCollectionService_1.getCampaignAnalytics)();
        res.json(analytics);
    }
    catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});
exports.getCollectionAnalytics = getCollectionAnalytics;
/**
 * POST /api/v1/debt-collection/reconcile
 * Reconcile payments — detect which contacted debtors have paid
 */
const reconcilePayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const reconciled = yield (0, debtCollectionService_1.reconcileCampaignPayments)();
        res.json({ message: `Reconciled ${reconciled} payments.`, reconciled });
    }
    catch (error) {
        console.error('Reconcile error:', error);
        res.status(500).json({ error: 'Failed to reconcile payments' });
    }
});
exports.reconcilePayments = reconcilePayments;
// ========================================
// ESCALATION SETTINGS
// ========================================
/**
 * GET /api/v1/debt-collection/settings
 */
const getCollectionSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settings = yield prisma_1.prisma.schoolSettings.findFirst({
            select: {
                debtCollectionEnabled: true,
                escalationDay1Channel: true,
                escalationDay2Channel: true,
                escalationDay3Channel: true,
                escalationDay4Channel: true,
                escalationDay1Days: true,
                escalationDay2Days: true,
                escalationDay3Days: true,
                escalationDay4Days: true,
                debtCollectionMinAmount: true,
                aiPersonalizedMessages: true,
                feeReminderEnabled: true,
                feeReminderDaysBefore: true,
                overdueReminderEnabled: true,
                overdueReminderFrequency: true,
            },
        });
        res.json(settings || {});
    }
    catch (error) {
        console.error('Get collection settings error:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
exports.getCollectionSettings = getCollectionSettings;
/**
 * PUT /api/v1/debt-collection/settings
 */
const updateCollectionSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = req.body;
        const settings = yield prisma_1.prisma.schoolSettings.findFirst();
        if (!settings)
            return res.status(404).json({ error: 'No settings found' });
        const updated = yield prisma_1.prisma.schoolSettings.update({
            where: { id: settings.id },
            data: {
                debtCollectionEnabled: data.debtCollectionEnabled,
                escalationDay1Channel: data.escalationDay1Channel,
                escalationDay2Channel: data.escalationDay2Channel,
                escalationDay3Channel: data.escalationDay3Channel,
                escalationDay4Channel: data.escalationDay4Channel,
                escalationDay1Days: data.escalationDay1Days ? Number(data.escalationDay1Days) : undefined,
                escalationDay2Days: data.escalationDay2Days ? Number(data.escalationDay2Days) : undefined,
                escalationDay3Days: data.escalationDay3Days ? Number(data.escalationDay3Days) : undefined,
                escalationDay4Days: data.escalationDay4Days ? Number(data.escalationDay4Days) : undefined,
                debtCollectionMinAmount: data.debtCollectionMinAmount !== undefined ? Number(data.debtCollectionMinAmount) : undefined,
                aiPersonalizedMessages: data.aiPersonalizedMessages,
                overdueReminderFrequency: data.overdueReminderFrequency ? Number(data.overdueReminderFrequency) : undefined,
            },
        });
        res.json({ message: 'Settings updated', settings: updated });
    }
    catch (error) {
        console.error('Update collection settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
exports.updateCollectionSettings = updateCollectionSettings;
