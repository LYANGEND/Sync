import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../services/emailService';
import smsService from '../services/smsService';
import whatsappService from '../services/whatsappService';
import { sendPushToUser } from '../services/pushService';
import { enqueueTenantJob, getQueueRuntimeStatus } from './queueRuntime';
import { QUEUE_NAMES, TenantJobEnvelope } from './queueContracts';
import {
  buildDeliveryIdempotencyKey,
  executeIdempotentDelivery,
} from './deliveryIdempotency';
import { ProviderChannel, waitForProviderPermit } from './providerRateLimiter';

export const announcementChannelSchema = z.enum(['email', 'sms', 'whatsapp', 'push']);
export type AnnouncementChannel = z.infer<typeof announcementChannelSchema>;

export const announcementJobPayloadSchema = z.object({
  announcementId: z.string().uuid(),
  channel: announcementChannelSchema,
});
export type AnnouncementJobPayload = z.infer<typeof announcementJobPayloadSchema>;

export interface AnnouncementDeliveryResult {
  announcementId: string;
  channel: AnnouncementChannel;
  recipients: number;
  sent: number;
  failed: number;
}

export interface EnqueueAnnouncementOptions {
  announcementId: string;
  channels: AnnouncementChannel[];
  actorUserId?: string;
  correlationId?: string;
  delay?: number;
}

export const ANNOUNCEMENT_JOB_NAMES: Record<AnnouncementChannel, string> = {
  email: 'announcement.email',
  sms: 'announcement.sms',
  whatsapp: 'announcement.whatsapp',
  push: 'announcement.push',
};

export const ANNOUNCEMENT_RETRY_POLICIES: Record<
  AnnouncementChannel,
  { attempts: number; backoff: { type: 'exponential'; delay: number } }
> = {
  email: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
  sms: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
  whatsapp: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
  push: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const processInBatches = async <T>(
  items: T[],
  batchSize: number,
  operation: (item: T) => Promise<boolean>,
): Promise<{ sent: number; failed: number }> => {
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const outcomes = await Promise.allSettled(batch.map(operation));
    const errors: unknown[] = [];
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled' && outcome.value) sent += 1;
      else {
        failed += 1;
        if (outcome.status === 'rejected') errors.push(outcome.reason);
      }
    }
    if (errors.length > 0) {
      const firstError = errors[0];
      const detail = firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(`${errors.length} delivery operation(s) failed: ${detail}`);
    }
  }

  return { sent, failed };
};

const getAnnouncementAudience = async (announcementId: string) => {
  const announcement = await prisma.announcement.findFirst({
    where: { id: announcementId },
    select: {
      id: true,
      subject: true,
      message: true,
      targetRoles: true,
      priority: true,
      createdById: true,
    },
  });
  if (!announcement) {
    throw new Error(`Announcement ${announcementId} was not found in this tenant`);
  }

  const where: any = { isActive: true };
  if (announcement.targetRoles.length > 0 && !announcement.targetRoles.includes('ALL')) {
    where.role = { in: announcement.targetRoles };
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      fullName: true,
      children: { select: { guardianPhone: true } },
    },
  });

  return { announcement, users };
};

const deliverOnce = async (
  envelope: TenantJobEnvelope<AnnouncementJobPayload>,
  announcementId: string,
  channel: string,
  recipientId: string,
  operation: () => Promise<boolean>,
  providerChannel?: ProviderChannel,
): Promise<boolean> => {
  await executeIdempotentDelivery(
    buildDeliveryIdempotencyKey({
      tenantId: envelope.tenantId,
      messageId: `announcement:${announcementId}`,
      channel,
      recipientId,
    }),
    async () => {
      if (providerChannel) {
        await waitForProviderPermit(envelope.tenantId, providerChannel);
      }
      if (!await operation()) {
        throw new Error(`${channel} provider rejected recipient ${recipientId}`);
      }
    },
  );
  return true;
};

export const enqueueAnnouncementDeliveries = async (
  options: EnqueueAnnouncementOptions,
): Promise<{
  correlationId: string;
  jobs: Array<{ channel: AnnouncementChannel; jobId: string }>;
}> => {
  if (getQueueRuntimeStatus().state !== 'ready') {
    throw new Error('Announcement queue is not ready');
  }

  const channels = [...new Set(options.channels.map(channel => announcementChannelSchema.parse(channel)))];
  const correlationId = options.correlationId || crypto.randomUUID();
  const jobs = await Promise.all(channels.map(async channel => {
    const result = await enqueueTenantJob(
      QUEUE_NAMES.communications,
      ANNOUNCEMENT_JOB_NAMES[channel],
      {
        announcementId: options.announcementId,
        channel,
      },
      {
        actorUserId: options.actorUserId,
        correlationId,
        jobOptions: {
          ...ANNOUNCEMENT_RETRY_POLICIES[channel],
          jobId: `announcement-${options.announcementId}-${channel}`,
          delay: options.delay,
        },
      },
    );
    return { channel, jobId: result.jobId };
  }));

  return { correlationId, jobs };
};

export const processAnnouncementDelivery = async (
  envelope: TenantJobEnvelope<AnnouncementJobPayload>,
): Promise<AnnouncementDeliveryResult> => {
  const payload = announcementJobPayloadSchema.parse(envelope.payload);
  const { announcement, users } = await getAnnouncementAudience(payload.announcementId);
  const recipients = users.length;

  if (payload.channel === 'email') {
    const result = await processInBatches(users, 20, user => deliverOnce(
      envelope,
      announcement.id,
      'email',
      user.id,
      () => sendEmail(
        user.email,
        announcement.subject,
        `<p>Dear ${escapeHtml(user.fullName)},</p><p>${escapeHtml(announcement.message)}</p>`,
        {
          source: 'announcement_queue',
          sentById: envelope.actorUserId || announcement.createdById,
          recipientName: user.fullName,
        },
      ),
      'email',
    ));
    return { announcementId: announcement.id, channel: payload.channel, recipients, ...result };
  }

  if (payload.channel === 'sms' || payload.channel === 'whatsapp') {
    const usersWithPhones = users.flatMap(user => {
      const phone = user.children.find(child => child.guardianPhone?.trim())?.guardianPhone?.trim();
      return phone ? [{ ...user, phone }] : [];
    });

    const result = await processInBatches(usersWithPhones, 20, async user => {
      if (payload.channel === 'sms') {
        return deliverOnce(
          envelope,
          announcement.id,
          'sms',
          user.id,
          async () => {
            const sent = await smsService.send(
              user.phone,
              `${announcement.subject}: ${announcement.message.substring(0, 140)}`,
              {
                source: 'announcement_queue',
                sentById: envelope.actorUserId || announcement.createdById,
                recipientName: user.fullName,
              },
            );
            return sent.success;
          },
          'sms',
        );
      }

      return deliverOnce(
        envelope,
        announcement.id,
        'whatsapp',
        user.id,
        async () => {
          const sent = await whatsappService.sendMessage(
            user.phone,
            `📢 *${announcement.subject}*\n\n${announcement.message}`,
            {
              source: 'announcement_queue',
              sentById: envelope.actorUserId || announcement.createdById,
              recipientName: user.fullName,
            },
          );
          return sent.success;
        },
        'whatsapp',
      );
    });

    return {
      announcementId: announcement.id,
      channel: payload.channel,
      recipients: usersWithPhones.length,
      ...result,
    };
  }

  const result = await processInBatches(users, 20, async user => {
    await deliverOnce(
      envelope,
      announcement.id,
      'in-app',
      user.id,
      async () => {
        await prisma.notification.create({
          data: {
            userId: user.id,
            title: announcement.subject,
            message: announcement.message,
            type: announcement.priority === 'EMERGENCY' ? 'ERROR' : 'INFO',
            isRead: false,
          },
        });
        return true;
      },
    );

    return deliverOnce(
      envelope,
      announcement.id,
      'push',
      user.id,
      async () => {
        const push = await sendPushToUser(
          user.id,
          announcement.subject,
          announcement.message,
          {
            source: 'announcement_queue',
            sentById: envelope.actorUserId || announcement.createdById,
          },
        );
        return push.failed === 0;
      },
      'push',
    );
  });

  return {
    announcementId: announcement.id,
    channel: payload.channel,
    recipients,
    ...result,
  };
};
