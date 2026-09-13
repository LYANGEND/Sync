import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { runWithTenant } from '../src/middleware/tenantContext';
import { prisma } from '../src/utils/prisma';
import * as emailService from '../src/services/emailService';
import * as notificationService from '../src/services/notificationService';
import smsService from '../src/services/smsService';
import whatsappService from '../src/services/whatsappService';
import * as queueRuntime from '../src/queues/queueRuntime';
import * as deliveryIdempotency from '../src/queues/deliveryIdempotency';
import * as providerRateLimiter from '../src/queues/providerRateLimiter';
import {
  ANNOUNCEMENT_JOB_NAMES,
  enqueueAnnouncementDeliveries,
  processAnnouncementDelivery,
} from '../src/queues/announcementQueueService';
import { buildTenantJobEnvelope, QUEUE_NAMES } from '../src/queues/queueContracts';
import {
  processScheduledAnnouncements,
  sendAnnouncement,
} from '../src/controllers/communicationController';

const createResponse = (): Response => {
  const response: any = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  response.send = jest.fn(() => response);
  return response as Response;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-014 announcement queue contracts', () => {
  it('TV-020 enqueues each selected channel with one shared correlation ID', async () => {
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    const enqueue = jest.spyOn(queueRuntime, 'enqueueTenantJob') as any;
    enqueue
      .mockResolvedValueOnce({ jobId: 'email-job', correlationId: 'correlation-1' })
      .mockResolvedValueOnce({ jobId: 'sms-job', correlationId: 'correlation-1' })
      .mockResolvedValueOnce({ jobId: 'whatsapp-job', correlationId: 'correlation-1' })
      .mockResolvedValueOnce({ jobId: 'push-job', correlationId: 'correlation-1' });

    const result = await runWithTenant('tenant-a', () => enqueueAnnouncementDeliveries({
      announcementId: '00000000-0000-4000-8000-000000000014',
      channels: ['email', 'sms', 'whatsapp', 'push', 'email'],
      actorUserId: 'user-1',
      correlationId: '00000000-0000-4000-8000-000000000020',
    }));

    expect(enqueue).toHaveBeenCalledTimes(4);
    expect(enqueue.mock.calls.map((call: any[]) => call[0])).toEqual([
      QUEUE_NAMES.communications,
      QUEUE_NAMES.communications,
      QUEUE_NAMES.communications,
      QUEUE_NAMES.communications,
    ]);
    expect(enqueue.mock.calls.map((call: any[]) => call[1])).toEqual([
      ANNOUNCEMENT_JOB_NAMES.email,
      ANNOUNCEMENT_JOB_NAMES.sms,
      ANNOUNCEMENT_JOB_NAMES.whatsapp,
      ANNOUNCEMENT_JOB_NAMES.push,
    ]);
    expect(enqueue.mock.calls.map((call: any[]) => call[3].jobOptions.attempts)).toEqual([
      3,
      5,
      5,
      3,
    ]);
    expect(enqueue.mock.calls.every(
      (call: any[]) => call[3].jobOptions.backoff.type === 'exponential',
    )).toBe(true);
    expect(result.jobs).toHaveLength(4);
    expect(result.correlationId).toBe('00000000-0000-4000-8000-000000000020');
  });

  it('TV-021 returns 202 for a 10,000-recipient broadcast without calling providers', async () => {
    const countUsers = jest.spyOn(prisma.user, 'count').mockResolvedValue(10_000);
    const findUsers = jest.spyOn(prisma.user, 'findMany');
    jest.spyOn(prisma.announcement, 'create').mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000014',
    } as any);
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    const enqueue = jest.spyOn(
      require('../src/queues/announcementQueueService'),
      'enqueueAnnouncementDeliveries',
    ).mockResolvedValue({
      correlationId: '00000000-0000-4000-8000-000000000020',
      jobs: [{ channel: 'email', jobId: 'email-job' }],
    });
    const sendEmail = jest.spyOn(emailService, 'sendEmail');
    const broadcast = jest.spyOn(notificationService, 'broadcastNotification');
    const sendSms = jest.spyOn(smsService, 'send');
    const sendWhatsApp = jest.spyOn(whatsappService, 'sendMessage');
    const response = createResponse();

    await runWithTenant('tenant-a', () => sendAnnouncement({
      user: { userId: 'user-1' },
      body: {
        subject: 'School update',
        message: 'A message for the school community.',
        sendEmail: true,
        sendSms: false,
        sendWhatsApp: false,
        sendNotification: false,
        priority: 'NORMAL',
      },
    } as unknown as Request, response));

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Announcement queued for 10000 users',
    }));
    expect(countUsers).toHaveBeenCalledTimes(1);
    expect(findUsers).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      announcementId: '00000000-0000-4000-8000-000000000014',
      channels: ['email'],
    }));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });
});

describe('T-014 announcement worker processing', () => {
  it('TV-020 processes email recipients in bounded batches', async () => {
    const users = Array.from({ length: 45 }, (_, index) => ({
      id: `user-${index}`,
      email: `user-${index}@example.com`,
      fullName: `User <${index}>`,
      children: [],
    }));
    jest.spyOn(prisma.announcement, 'findFirst').mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000014',
      subject: 'School update',
      message: '<strong>Safe text</strong>',
      targetRoles: ['ALL'],
      priority: 'NORMAL',
      createdById: 'user-1',
    } as any);
    jest.spyOn(prisma.user, 'findMany').mockResolvedValue(users as any);
    jest.spyOn(deliveryIdempotency, 'executeIdempotentDelivery').mockImplementation(
      async (_key, operation) => ({ executed: true, result: await operation() }),
    );
    const waitForPermit = jest.spyOn(providerRateLimiter, 'waitForProviderPermit')
      .mockResolvedValue(undefined);

    let active = 0;
    let maximumActive = 0;
    const sendEmail = jest.spyOn(emailService, 'sendEmail').mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      active -= 1;
      return true;
    });

    const envelope = buildTenantJobEnvelope({
      tenantId: 'tenant-a',
      actorUserId: 'user-1',
      payload: {
        announcementId: '00000000-0000-4000-8000-000000000014',
        channel: 'email' as const,
      },
    });
    const result = await runWithTenant('tenant-a', () => processAnnouncementDelivery(envelope));

    expect(sendEmail).toHaveBeenCalledTimes(45);
    expect(waitForPermit).toHaveBeenCalledTimes(45);
    expect(waitForPermit).toHaveBeenCalledWith('tenant-a', 'email');
    expect(maximumActive).toBeLessThanOrEqual(20);
    expect(sendEmail.mock.calls[0][2]).toContain('Dear User &lt;0&gt;');
    expect(sendEmail.mock.calls[0][2]).toContain('&lt;strong&gt;Safe text&lt;/strong&gt;');
    expect(result).toEqual(expect.objectContaining({
      channel: 'email',
      recipients: 45,
      sent: 45,
      failed: 0,
    }));
  });

  it('TV-024 does not resend successful recipients when a failed batch is retried', async () => {
    const users = [
      { id: 'user-1', email: 'one@example.com', fullName: 'User One', children: [] },
      { id: 'user-2', email: 'two@example.com', fullName: 'User Two', children: [] },
    ];
    jest.spyOn(prisma.announcement, 'findFirst').mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000014',
      subject: 'School update',
      message: 'Safe text',
      targetRoles: ['ALL'],
      priority: 'NORMAL',
      createdById: 'user-1',
    } as any);
    jest.spyOn(prisma.user, 'findMany').mockResolvedValue(users as any);

    const completedKeys = new Set<string>();
    jest.spyOn(deliveryIdempotency, 'executeIdempotentDelivery').mockImplementation(
      async (key, operation) => {
        if (completedKeys.has(key)) return { executed: false };
        const result = await operation();
        completedKeys.add(key);
        return { executed: true, result };
      },
    );
    jest.spyOn(providerRateLimiter, 'waitForProviderPermit').mockResolvedValue(undefined);
    let secondRecipientAttempts = 0;
    const sendEmail = jest.spyOn(emailService, 'sendEmail').mockImplementation(async (to) => {
      if (to === 'two@example.com') {
        secondRecipientAttempts += 1;
        return secondRecipientAttempts > 1;
      }
      return true;
    });
    const envelope = buildTenantJobEnvelope({
      tenantId: 'tenant-a',
      payload: {
        announcementId: '00000000-0000-4000-8000-000000000014',
        channel: 'email' as const,
      },
    });

    await expect(runWithTenant('tenant-a', () => processAnnouncementDelivery(envelope)))
      .rejects.toThrow('delivery operation');
    await expect(runWithTenant('tenant-a', () => processAnnouncementDelivery(envelope)))
      .resolves.toEqual(expect.objectContaining({ sent: 2, failed: 0 }));

    expect(sendEmail.mock.calls.filter(call => call[0] === 'one@example.com')).toHaveLength(1);
    expect(sendEmail.mock.calls.filter(call => call[0] === 'two@example.com')).toHaveLength(2);
  });
});

describe('T-016 scheduled announcement dispatch', () => {
  const scheduledAnnouncement = {
    id: '00000000-0000-4000-8000-000000000016',
    subject: 'Tomorrow schedule',
    message: 'Classes begin at 08:00.',
    targetRoles: ['ALL'],
    sentViaEmail: true,
    sentViaSms: true,
    sentViaWhatsApp: true,
    sentViaNotification: true,
    createdBy: { id: 'user-1' },
  };

  it('TV-023 enqueues due announcements without loading recipients or calling providers', async () => {
    jest.spyOn(prisma.announcement, 'findMany').mockResolvedValue([scheduledAnnouncement] as any);
    const markSent = jest.spyOn(prisma.announcement, 'update').mockResolvedValue({
      ...scheduledAnnouncement,
      sentAt: new Date(),
    } as any);
    const findUsers = jest.spyOn(prisma.user, 'findMany');
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    const enqueue = jest.spyOn(
      require('../src/queues/announcementQueueService'),
      'enqueueAnnouncementDeliveries',
    ).mockResolvedValue({
      correlationId: '00000000-0000-4000-8000-000000000023',
      jobs: [
        { channel: 'email', jobId: 'email-job' },
        { channel: 'sms', jobId: 'sms-job' },
        { channel: 'whatsapp', jobId: 'whatsapp-job' },
        { channel: 'push', jobId: 'push-job' },
      ],
    });
    const sendEmail = jest.spyOn(emailService, 'sendEmail');
    const broadcast = jest.spyOn(notificationService, 'broadcastNotification');

    await runWithTenant('tenant-a', () => processScheduledAnnouncements());

    expect(enqueue).toHaveBeenCalledWith({
      announcementId: scheduledAnnouncement.id,
      channels: ['email', 'sms', 'whatsapp', 'push'],
      actorUserId: 'user-1',
    });
    expect(markSent).toHaveBeenCalledWith({
      where: { id: scheduledAnnouncement.id },
      data: { sentAt: expect.any(Date) },
    });
    expect(findUsers).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('TV-023 leaves a due announcement pending when enqueue fails', async () => {
    jest.spyOn(prisma.announcement, 'findMany').mockResolvedValue([scheduledAnnouncement] as any);
    const markSent = jest.spyOn(prisma.announcement, 'update');
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    jest.spyOn(
      require('../src/queues/announcementQueueService'),
      'enqueueAnnouncementDeliveries',
    ).mockRejectedValue(new Error('Redis unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await runWithTenant('tenant-a', () => processScheduledAnnouncements());

    expect(markSent).not.toHaveBeenCalled();
  });
});
