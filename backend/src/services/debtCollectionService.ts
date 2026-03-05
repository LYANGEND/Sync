import { prisma } from '../utils/prisma';
import { sendEmail } from './emailService';
import { smsService } from './smsService';
import { whatsappService } from './whatsappService';
import { logCommunication, updateCommunicationLogStatus } from './communicationLogService';
import aiService from './aiService';

// ========================================
// DEBTOR SEGMENTATION
// ========================================

export interface DebtorProfile {
  studentId: string;
  studentName: string;
  className: string;
  gradeLevel: number;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  amountOwed: number;
  totalDue: number;
  totalPaid: number;
  paymentRate: number;       // 0-100%
  daysOverdue: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
  segment: 'WILL_PAY' | 'NEEDS_NUDGE' | 'AT_RISK' | 'HARDSHIP';
  paymentLikelihood: 'HIGH' | 'MEDIUM' | 'LOW';
  escalationLevel: number;   // 1-4 based on days overdue
}

/**
 * Segment all debtors by analyzing their payment behaviour
 */
export async function segmentDebtors(options?: {
  minAmount?: number;
  minDaysOverdue?: number;
  gradeLevels?: number[];
}): Promise<DebtorProfile[]> {
  const students = await prisma.student.findMany({
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

  const settings = await prisma.schoolSettings.findFirst();
  const day1 = settings?.escalationDay1Days || 7;
  const day2 = settings?.escalationDay2Days || 14;
  const day3 = settings?.escalationDay3Days || 21;
  const day4 = settings?.escalationDay4Days || 30;

  const debtors: DebtorProfile[] = [];

  for (const student of students) {
    const totalDue = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
    const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
    const amountOwed = totalDue - totalPaid;

    if (amountOwed <= 0) continue;
    if (options?.minAmount && amountOwed < options.minAmount) continue;

    // Calculate days overdue from earliest overdue fee
    const overdueFees = student.feeStructures.filter(
      f => f.dueDate && new Date(f.dueDate) < new Date() && Number(f.amountPaid) < Number(f.amountDue)
    );
    const daysOverdue = overdueFees.length > 0
      ? Math.max(...overdueFees.map(f => Math.floor((Date.now() - new Date(f.dueDate!).getTime()) / (1000 * 60 * 60 * 24))))
      : 0;

    if (options?.minDaysOverdue && daysOverdue < options.minDaysOverdue) continue;
    if (options?.gradeLevels?.length && !options.gradeLevels.includes(student.class.gradeLevel)) continue;

    const paymentRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;
    const paymentCount = student.payments.length;
    const lastPayment = student.payments[0];
    const lastPaymentDate = lastPayment ? lastPayment.paymentDate.toISOString().split('T')[0] : null;
    const daysSinceLastPayment = lastPayment
      ? Math.floor((Date.now() - lastPayment.paymentDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // --- Segment classification ---
    let segment: DebtorProfile['segment'] = 'NEEDS_NUDGE';
    let paymentLikelihood: DebtorProfile['paymentLikelihood'] = 'MEDIUM';

    if (paymentCount === 0 && totalDue > 0) {
      segment = 'HARDSHIP';
      paymentLikelihood = 'LOW';
    } else if (paymentRate < 20) {
      segment = 'AT_RISK';
      paymentLikelihood = 'LOW';
    } else if (paymentRate >= 70 || (daysSinceLastPayment !== null && daysSinceLastPayment < 30)) {
      segment = 'WILL_PAY';
      paymentLikelihood = 'HIGH';
    } else {
      segment = 'NEEDS_NUDGE';
      paymentLikelihood = 'MEDIUM';
    }

    // --- Escalation level based on days overdue ---
    let escalationLevel = 1;
    if (daysOverdue >= day4) escalationLevel = 4;
    else if (daysOverdue >= day3) escalationLevel = 3;
    else if (daysOverdue >= day2) escalationLevel = 2;
    else escalationLevel = 1;

    debtors.push({
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      className: student.class.name,
      gradeLevel: student.class.gradeLevel,
      parentName: student.parent?.fullName || student.guardianName || null,
      parentEmail: student.parent?.email || student.guardianEmail || null,
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
}

// ========================================
// AI MESSAGE GENERATION
// ========================================

/**
 * Use AI to craft a personalized reminder message for a specific debtor
 */
export async function generatePersonalizedMessage(
  debtor: DebtorProfile,
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
  schoolName: string,
): Promise<{ subject?: string; message: string; htmlBody?: string }> {

  const isAiAvailable = await aiService.isAvailable();

  if (!isAiAvailable) {
    return generateTemplateMessage(debtor, channel, schoolName);
  }

  const toneMap: Record<number, string> = {
    1: 'friendly and gentle — this is a first reminder',
    2: 'polite but firm — this is a second reminder, they need to pay soon',
    3: 'urgent and concerned — offer a payment plan, express understanding',
    4: 'formal and serious — this is a final notice before further action',
  };

  const segmentContext: Record<string, string> = {
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
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: 'You generate school fee reminder messages in JSON format. Always return valid JSON only.' },
      { role: 'user', content: prompt },
    ];

    const response = await aiService.chat(messages, { temperature: 0.7, maxTokens: 1500 });
    
    // Parse the AI response as JSON
    let parsed: any;
    try {
      const jsonStr = response.content.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // If JSON parse fails, use content as-is
      return generateTemplateMessage(debtor, channel, schoolName);
    }

    return {
      subject: parsed.subject || undefined,
      message: parsed.message || response.content,
      htmlBody: parsed.htmlBody || undefined,
    };
  } catch (error) {
    console.error('AI message generation failed, falling back to template:', error);
    return generateTemplateMessage(debtor, channel, schoolName);
  }
}

/**
 * Fallback: generate a template-based message when AI is unavailable
 */
function generateTemplateMessage(
  debtor: DebtorProfile,
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
  schoolName: string,
): { subject?: string; message: string; htmlBody?: string } {
  const parentName = debtor.parentName?.split(' ')[0] || 'Parent/Guardian';
  const amount = `ZMW ${debtor.amountOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (channel === 'SMS') {
    const smsTemplates: Record<number, string> = {
      1: `Hi ${parentName}, friendly reminder: ${debtor.studentName}'s fees of ${amount} are due at ${schoolName}. Please arrange payment. Thank you!`,
      2: `Dear ${parentName}, ${debtor.studentName}'s fees of ${amount} are now ${debtor.daysOverdue} days overdue at ${schoolName}. Kindly settle soon.`,
      3: `URGENT: ${parentName}, ${amount} outstanding for ${debtor.studentName} at ${schoolName} (${debtor.daysOverdue} days overdue). Contact us for a payment plan.`,
      4: `FINAL NOTICE: ${parentName}, ${amount} for ${debtor.studentName} at ${schoolName} is ${debtor.daysOverdue} days overdue. Contact the school immediately.`,
    };
    return { message: smsTemplates[debtor.escalationLevel] || smsTemplates[1] };
  }

  if (channel === 'WHATSAPP') {
    const waTemplates: Record<number, string> = {
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

  const toneStyles: Record<number, { bg: string; accent: string; label: string }> = {
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
        : `This is our <strong>final notice</strong> regarding outstanding fees for <strong>${debtor.studentName}</strong> (${debtor.className}), now <strong>${debtor.daysOverdue} days overdue</strong>.`
  }</p>
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
export async function createCampaign(data: {
  name: string;
  description?: string;
  minAmountOwed?: number;
  minDaysOverdue?: number;
  targetSegments?: string[];
  targetGradeLevels?: number[];
  createdById: string;
}) {
  const campaign = await (prisma as any).debtCollectionCampaign.create({
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
}

/**
 * Execute a campaign — send messages to all targeted debtors
 */
export async function executeCampaign(campaignId: string, sentById: string): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const campaign = await (prisma as any).debtCollectionCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw new Error('Campaign not found');

  const settings = await prisma.schoolSettings.findFirst();
  const schoolName = settings?.schoolName || 'School';
  const useAI = settings?.aiPersonalizedMessages !== false;

  // Get debtors matching campaign criteria
  const debtors = await segmentDebtors({
    minAmount: campaign.minAmountOwed ? Number(campaign.minAmountOwed) : undefined,
    minDaysOverdue: campaign.minDaysOverdue || undefined,
    gradeLevels: campaign.targetGradeLevels?.length ? campaign.targetGradeLevels : undefined,
  });

  // Filter by target segments if specified
  const targetSegments = campaign.targetSegments as string[];
  const filtered = targetSegments?.length
    ? debtors.filter(d => targetSegments.includes(d.segment))
    : debtors;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Mark campaign as active
  await (prisma as any).debtCollectionCampaign.update({
    where: { id: campaignId },
    data: { status: 'ACTIVE', startedAt: new Date(), totalTargeted: filtered.length },
  });

  for (const debtor of filtered) {
    // Determine channel based on escalation level
    const channelForLevel = getChannelForEscalation(debtor.escalationLevel, settings);

    if (!channelForLevel) { skipped++; continue; }

    const channels = channelForLevel === 'ALL'
      ? (['EMAIL', 'SMS', 'WHATSAPP'] as const)
      : [channelForLevel as 'EMAIL' | 'SMS' | 'WHATSAPP'];

    for (const channel of channels) {
      // Check if we have contact info for this channel
      if (channel === 'EMAIL' && !debtor.parentEmail) { skipped++; continue; }
      if ((channel === 'SMS' || channel === 'WHATSAPP') && !debtor.parentPhone) { skipped++; continue; }

      try {
        // Generate message (AI or template)
        const msg = useAI
          ? await generatePersonalizedMessage(debtor, channel, schoolName)
          : generateTemplateMessage(debtor, channel, schoolName);

        // Send via appropriate channel
        let success = false;

        if (channel === 'EMAIL' && debtor.parentEmail) {
          success = await sendEmail(debtor.parentEmail, msg.subject || 'Fee Reminder', msg.htmlBody || msg.message, {
            source: 'debt_collection',
            sentById,
            recipientName: debtor.parentName || undefined,
          });
        } else if (channel === 'SMS' && debtor.parentPhone) {
          const smsResult = await smsService.send(debtor.parentPhone, msg.message);
          success = smsResult.success;
          // Log SMS
          await logCommunication({
            channel: 'SMS',
            status: success ? 'SENT' : 'FAILED',
            recipientPhone: debtor.parentPhone,
            recipientName: debtor.parentName || undefined,
            subject: msg.subject,
            message: msg.message,
            source: 'debt_collection',
            sentById,
          });
        } else if (channel === 'WHATSAPP' && debtor.parentPhone) {
          const waResult = await whatsappService.sendMessage(debtor.parentPhone, msg.message);
          success = waResult.success;
          await logCommunication({
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
        await (prisma as any).campaignMessage.create({
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

        if (success) sent++;
        else failed++;
      } catch (error: any) {
        console.error(`Campaign message failed for ${debtor.studentName}:`, error.message);
        failed++;
      }
    }
  }

  // Update campaign results
  await (prisma as any).debtCollectionCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      totalContacted: sent,
    },
  });

  return { sent, failed, skipped };
}

/**
 * Quick send — no campaign, just send reminders to specific debtors
 */
export async function sendQuickReminders(options: {
  studentIds?: string[];
  segments?: string[];
  minDaysOverdue?: number;
  channels: ('EMAIL' | 'SMS' | 'WHATSAPP')[];
  sentById: string;
}): Promise<{ sent: number; failed: number }> {
  const settings = await prisma.schoolSettings.findFirst();
  const schoolName = settings?.schoolName || 'School';
  const useAI = settings?.aiPersonalizedMessages !== false;

  let debtors = await segmentDebtors({
    minDaysOverdue: options.minDaysOverdue,
  });

  // Filter by specific students if provided
  if (options.studentIds?.length) {
    debtors = debtors.filter(d => options.studentIds!.includes(d.studentId));
  }
  // Filter by segments
  if (options.segments?.length) {
    debtors = debtors.filter(d => options.segments!.includes(d.segment));
  }

  let sent = 0;
  let failed = 0;

  for (const debtor of debtors) {
    for (const channel of options.channels) {
      if (channel === 'EMAIL' && !debtor.parentEmail) continue;
      if ((channel === 'SMS' || channel === 'WHATSAPP') && !debtor.parentPhone) continue;

      try {
        const msg = useAI
          ? await generatePersonalizedMessage(debtor, channel, schoolName)
          : generateTemplateMessage(debtor, channel, schoolName);

        let success = false;

        if (channel === 'EMAIL' && debtor.parentEmail) {
          success = await sendEmail(debtor.parentEmail, msg.subject || 'Fee Reminder', msg.htmlBody || msg.message, {
            source: 'quick_reminder',
            sentById: options.sentById,
            recipientName: debtor.parentName || undefined,
          });
        } else if (channel === 'SMS' && debtor.parentPhone) {
          const smsR = await smsService.send(debtor.parentPhone, msg.message);
          success = smsR.success;
          await logCommunication({ channel: 'SMS', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'quick_reminder', sentById: options.sentById });
        } else if (channel === 'WHATSAPP' && debtor.parentPhone) {
          const waR = await whatsappService.sendMessage(debtor.parentPhone, msg.message);
          success = waR.success;
          await logCommunication({ channel: 'WHATSAPP', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'quick_reminder', sentById: options.sentById });
        }

        if (success) sent++;
        else failed++;
      } catch { failed++; }
    }
  }

  return { sent, failed };
}

// ========================================
// CAMPAIGN ANALYTICS
// ========================================

/**
 * Get collection effectiveness — how many paid after being contacted
 */
export async function getCampaignAnalytics(campaignId?: string) {
  const where: any = campaignId ? { campaignId } : {};

  const messages = await (prisma as any).campaignMessage.findMany({ where });
  const totalSent = messages.filter((m: any) => m.status === 'SENT').length;
  const totalFailed = messages.filter((m: any) => m.status === 'FAILED').length;
  const totalPaid = messages.filter((m: any) => m.status === 'PAID').length;
  const totalAmount = messages.reduce((sum: number, m: any) => sum + Number(m.amountOwed), 0);
  const amountCollected = messages.filter((m: any) => m.paidAmount).reduce((sum: number, m: any) => sum + Number(m.paidAmount), 0);

  // Channel effectiveness
  const byChannel: Record<string, { sent: number; paid: number; amount: number }> = {};
  for (const msg of messages) {
    const ch = msg.channel;
    if (!byChannel[ch]) byChannel[ch] = { sent: 0, paid: 0, amount: 0 };
    if (msg.status === 'SENT' || msg.status === 'PAID') byChannel[ch].sent++;
    if (msg.status === 'PAID') {
      byChannel[ch].paid++;
      byChannel[ch].amount += Number(msg.paidAmount || 0);
    }
  }

  // Segment effectiveness
  const bySegment: Record<string, { contacted: number; paid: number }> = {};
  for (const msg of messages) {
    const seg = msg.segment;
    if (!bySegment[seg]) bySegment[seg] = { contacted: 0, paid: 0 };
    bySegment[seg].contacted++;
    if (msg.status === 'PAID') bySegment[seg].paid++;
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
}

/**
 * Auto-detect payments from debtors who were contacted and mark as PAID
 */
export async function reconcileCampaignPayments(): Promise<number> {
  // Get all SENT campaign messages that haven't been marked paid
  const pendingMessages = await (prisma as any).campaignMessage.findMany({
    where: { status: 'SENT' },
  });

  let reconciled = 0;

  for (const msg of pendingMessages) {
    // Check if any payment was made by this student after the message was sent
    const payment = await prisma.payment.findFirst({
      where: {
        studentId: msg.studentId,
        status: 'COMPLETED',
        paymentDate: { gte: msg.sentAt },
      },
      orderBy: { paymentDate: 'desc' },
    });

    if (payment) {
      await (prisma as any).campaignMessage.update({
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
  const campaigns = await (prisma as any).debtCollectionCampaign.findMany({
    where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
    include: { messages: { where: { status: 'PAID' } } },
  });

  for (const campaign of campaigns) {
    const totalResponded = campaign.messages.length;
    const amountCollected = campaign.messages.reduce((sum: number, m: any) => sum + Number(m.paidAmount || 0), 0);
    await (prisma as any).debtCollectionCampaign.update({
      where: { id: campaign.id },
      data: { totalResponded, amountCollected },
    });
  }

  return reconciled;
}

// ========================================
// SCHEDULED COLLECTION (for cron)
// ========================================

/**
 * Run the daily debt collection check — called by scheduler
 */
export async function runScheduledCollection(): Promise<void> {
  const settings = await prisma.schoolSettings.findFirst();
  if (!settings?.debtCollectionEnabled) {
    console.log('[Debt Collection] Disabled in settings, skipping...');
    return;
  }

  console.log('[Debt Collection] Running scheduled collection check...');

  const debtors = await segmentDebtors({
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
    const recentMessage = await (prisma as any).campaignMessage.findFirst({
      where: {
        studentId: debtor.studentId,
        escalationLevel: debtor.escalationLevel,
        sentAt: { gte: new Date(Date.now() - (settings.overdueReminderFrequency || 7) * 24 * 60 * 60 * 1000) },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (recentMessage) continue; // Already sent at this level recently

    // Determine channel for this escalation level
    const channel = getChannelForEscalation(debtor.escalationLevel, settings);
    if (!channel) continue;

    const channels = channel === 'ALL'
      ? (['EMAIL', 'SMS', 'WHATSAPP'] as const)
      : [channel as 'EMAIL' | 'SMS' | 'WHATSAPP'];

    for (const ch of channels) {
      if (ch === 'EMAIL' && !debtor.parentEmail) continue;
      if ((ch === 'SMS' || ch === 'WHATSAPP') && !debtor.parentPhone) continue;

      try {
        const msg = useAI
          ? await generatePersonalizedMessage(debtor, ch, schoolName)
          : generateTemplateMessage(debtor, ch, schoolName);

        let success = false;
        if (ch === 'EMAIL' && debtor.parentEmail) {
          success = await sendEmail(debtor.parentEmail, msg.subject || 'Fee Reminder', msg.htmlBody || msg.message, {
            source: 'scheduled_collection',
            recipientName: debtor.parentName || undefined,
          });
        } else if (ch === 'SMS' && debtor.parentPhone) {
          const smsR = await smsService.send(debtor.parentPhone, msg.message);
          success = smsR.success;
          await logCommunication({ channel: 'SMS', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'scheduled_collection' });
        } else if (ch === 'WHATSAPP' && debtor.parentPhone) {
          const waR = await whatsappService.sendMessage(debtor.parentPhone, msg.message);
          success = waR.success;
          await logCommunication({ channel: 'WHATSAPP', status: success ? 'SENT' : 'FAILED', recipientPhone: debtor.parentPhone, recipientName: debtor.parentName || undefined, message: msg.message, source: 'scheduled_collection' });
        }

        if (success) {
          // Record as campaign message for tracking
          await (prisma as any).campaignMessage.create({
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
      } catch (error: any) {
        console.error(`[Debt Collection] Failed for ${debtor.studentName}:`, error.message);
      }
    }
  }

  console.log(`[Debt Collection] Completed. Sent ${sent} messages.`);
}

// ========================================
// HELPERS
// ========================================

function getChannelForEscalation(level: number, settings: any): string | null {
  switch (level) {
    case 1: return settings?.escalationDay1Channel || 'EMAIL';
    case 2: return settings?.escalationDay2Channel || 'SMS';
    case 3: return settings?.escalationDay3Channel || 'WHATSAPP';
    case 4: return settings?.escalationDay4Channel || 'ALL';
    default: return 'EMAIL';
  }
}
