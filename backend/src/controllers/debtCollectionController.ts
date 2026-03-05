import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  segmentDebtors,
  createCampaign,
  executeCampaign,
  sendQuickReminders,
  getCampaignAnalytics,
  reconcileCampaignPayments,
  generatePersonalizedMessage,
  DebtorProfile,
} from '../services/debtCollectionService';
import { prisma } from '../utils/prisma';

// ========================================
// DEBTOR SEGMENTATION
// ========================================

/**
 * GET /api/v1/debt-collection/debtors
 * Get all debtors with segmentation and payment analysis
 */
export const getDebtors = async (req: Request, res: Response) => {
  try {
    const { minAmount, minDaysOverdue, gradeLevels, segment } = req.query;

    let debtors = await segmentDebtors({
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
  } catch (error: any) {
    console.error('Get debtors error:', error);
    res.status(500).json({ error: 'Failed to fetch debtors' });
  }
};

// ========================================
// CAMPAIGNS
// ========================================

/**
 * GET /api/v1/debt-collection/campaigns
 */
export const listCampaigns = async (req: Request, res: Response) => {
  try {
    const campaigns = await (prisma as any).debtCollectionCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { messages: true } },
      },
    });
    res.json(campaigns);
  } catch (error: any) {
    console.error('List campaigns error:', error);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
};

/**
 * POST /api/v1/debt-collection/campaigns
 */
export const createNewCampaign = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, description, minAmountOwed, minDaysOverdue, targetSegments, targetGradeLevels } = req.body;

    if (!name) return res.status(400).json({ error: 'Campaign name is required' });

    const campaign = await createCampaign({
      name,
      description,
      minAmountOwed: minAmountOwed ? Number(minAmountOwed) : undefined,
      minDaysOverdue: minDaysOverdue ? Number(minDaysOverdue) : undefined,
      targetSegments,
      targetGradeLevels,
      createdById: user.userId,
    });

    res.status(201).json(campaign);
  } catch (error: any) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

/**
 * POST /api/v1/debt-collection/campaigns/:id/execute
 */
export const executeExistingCampaign = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const result = await executeCampaign(id, user.userId);

    res.json({ message: `Campaign executed. ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`, ...result });
  } catch (error: any) {
    console.error('Execute campaign error:', error);
    res.status(500).json({ error: error.message || 'Failed to execute campaign' });
  }
};

/**
 * GET /api/v1/debt-collection/campaigns/:id
 */
export const getCampaignDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await (prisma as any).debtCollectionCampaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Analytics for this campaign
    const analytics = await getCampaignAnalytics(id);

    res.json({ campaign, analytics });
  } catch (error: any) {
    console.error('Get campaign details error:', error);
    res.status(500).json({ error: 'Failed to get campaign details' });
  }
};

// ========================================
// QUICK SEND
// ========================================

/**
 * POST /api/v1/debt-collection/send
 * Quick send reminders to selected debtors
 */
export const sendReminders = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { studentIds, segments, minDaysOverdue, channels } = req.body;

    if (!channels?.length) return res.status(400).json({ error: 'At least one channel is required' });

    const result = await sendQuickReminders({
      studentIds,
      segments,
      minDaysOverdue,
      channels,
      sentById: user.userId,
    });

    res.json({ message: `Sent ${result.sent} reminders, ${result.failed} failed.`, ...result });
  } catch (error: any) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
};

// ========================================
// AI MESSAGE PREVIEW
// ========================================

/**
 * POST /api/v1/debt-collection/preview-message
 * Preview AI-generated message for a specific debtor before sending
 */
export const previewMessage = async (req: Request, res: Response) => {
  try {
    const { studentId, channel } = req.body;

    if (!studentId || !channel) {
      return res.status(400).json({ error: 'studentId and channel are required' });
    }

    const debtors = await segmentDebtors();
    const debtor = debtors.find(d => d.studentId === studentId);

    if (!debtor) return res.status(404).json({ error: 'Student not found in debtors list' });

    const settings = await prisma.schoolSettings.findFirst();
    const schoolName = settings?.schoolName || 'School';

    const message = await generatePersonalizedMessage(debtor, channel, schoolName);

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
  } catch (error: any) {
    console.error('Preview message error:', error);
    res.status(500).json({ error: 'Failed to generate message preview' });
  }
};

// ========================================
// ANALYTICS
// ========================================

/**
 * GET /api/v1/debt-collection/analytics
 */
export const getCollectionAnalytics = async (req: Request, res: Response) => {
  try {
    const analytics = await getCampaignAnalytics();
    res.json(analytics);
  } catch (error: any) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

/**
 * POST /api/v1/debt-collection/reconcile
 * Reconcile payments — detect which contacted debtors have paid
 */
export const reconcilePayments = async (req: Request, res: Response) => {
  try {
    const reconciled = await reconcileCampaignPayments();
    res.json({ message: `Reconciled ${reconciled} payments.`, reconciled });
  } catch (error: any) {
    console.error('Reconcile error:', error);
    res.status(500).json({ error: 'Failed to reconcile payments' });
  }
};

// ========================================
// ESCALATION SETTINGS
// ========================================

/**
 * GET /api/v1/debt-collection/settings
 */
export const getCollectionSettings = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.schoolSettings.findFirst({
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
  } catch (error: any) {
    console.error('Get collection settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

/**
 * PUT /api/v1/debt-collection/settings
 */
export const updateCollectionSettings = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const settings = await prisma.schoolSettings.findFirst();
    if (!settings) return res.status(404).json({ error: 'No settings found' });

    const updated = await prisma.schoolSettings.update({
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
  } catch (error: any) {
    console.error('Update collection settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
