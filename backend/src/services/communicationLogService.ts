import { prisma } from '../utils/prisma';

type CommunicationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
type CommunicationStatus = 'SENT' | 'FAILED' | 'PENDING';

interface LogCommunicationParams {
  channel: CommunicationChannel;
  status: CommunicationStatus;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  subject?: string;
  message: string;
  htmlBody?: string;
  source: string;
  sentById?: string;
  errorMessage?: string;
}

/**
 * Log any outbound communication (email, SMS, WhatsApp, push) to the audit trail.
 */
export async function logCommunication(params: LogCommunicationParams): Promise<string | null> {
  try {
    const log = await (prisma as any).communicationLog.create({
      data: {
        channel: params.channel,
        status: params.status,
        recipientEmail: params.recipientEmail || null,
        recipientPhone: params.recipientPhone || null,
        recipientName: params.recipientName || null,
        subject: params.subject || null,
        message: params.message,
        htmlBody: params.htmlBody || null,
        source: params.source,
        sentById: params.sentById || null,
        errorMessage: params.errorMessage || null,
      },
    });
    return log.id;
  } catch (error) {
    console.error('Failed to log communication:', error);
    return null;
  }
}

/**
 * Update the status of a communication log entry (e.g. from PENDING to SENT or FAILED).
 */
export async function updateCommunicationLogStatus(
  logId: string,
  status: CommunicationStatus,
  errorMessage?: string
): Promise<void> {
  try {
    await (prisma as any).communicationLog.update({
      where: { id: logId },
      data: {
        status,
        errorMessage: errorMessage || null,
      },
    });
  } catch (error) {
    console.error('Failed to update communication log:', error);
  }
}

/**
 * Get communication logs with filtering and pagination
 */
export async function getCommunicationLogs(options: {
  channel?: CommunicationChannel;
  status?: CommunicationStatus;
  source?: string;
  sentById?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { channel, status, source, sentById, search, page = 1, limit = 25 } = options;

  const where: any = {};
  if (channel) where.channel = channel;
  if (status) where.status = status;
  if (source) where.source = source;
  if (sentById) where.sentById = sentById;
  if (search) {
    where.OR = [
      { recipientEmail: { contains: search, mode: 'insensitive' } },
      { recipientName: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { message: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [logs, total] = await Promise.all([
    (prisma as any).communicationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        sentBy: {
          select: { id: true, fullName: true, role: true },
        },
      },
    }),
    (prisma as any).communicationLog.count({ where }),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get communication statistics (for dashboard cards)
 */
export async function getCommunicationStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalSent, totalFailed, sentToday, sentThisMonth, byChannel] = await Promise.all([
    (prisma as any).communicationLog.count({ where: { status: 'SENT' } }),
    (prisma as any).communicationLog.count({ where: { status: 'FAILED' } }),
    (prisma as any).communicationLog.count({
      where: { status: 'SENT', createdAt: { gte: startOfDay } },
    }),
    (prisma as any).communicationLog.count({
      where: { status: 'SENT', createdAt: { gte: startOfMonth } },
    }),
    (prisma as any).communicationLog.groupBy({
      by: ['channel'],
      _count: { id: true },
      where: { status: 'SENT' },
    }),
  ]);

  const channelBreakdown = (byChannel as any[]).reduce((acc: Record<string, number>, item: any) => {
    acc[item.channel] = item._count.id;
    return acc;
  }, {});

  return {
    totalSent,
    totalFailed,
    sentToday,
    sentThisMonth,
    byChannel: channelBreakdown,
  };
}
