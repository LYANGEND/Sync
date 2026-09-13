import type { Job } from 'bullmq';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';
import { getQueueRuntimeConfig } from '../src/queues/queueConfig';
import { buildTenantJobEnvelope, QUEUE_NAMES, TenantJobEnvelope } from '../src/queues/queueContracts';
import {
  DeliveryIdempotencyClient,
  DeliveryIdempotencyStore,
} from '../src/queues/deliveryIdempotency';
import {
  DEAD_LETTER_JOB_NAME,
  hasExhaustedAttempts,
  routeFinalFailureToDeadLetter,
} from '../src/queues/deadLetterService';
import {
  ProviderRateLimitClient,
  ProviderRateLimiter,
} from '../src/queues/providerRateLimiter';
import * as queueRuntime from '../src/queues/queueRuntime';
import { calculateQueueMetric } from '../src/queues/queueRuntime';
import platformRoutes from '../src/routes/platformRoutes';

class MemoryIdempotencyClient implements DeliveryIdempotencyClient {
  readonly values = new Map<string, string>();

  async set(
    key: string,
    value: string,
    _expiryMode: 'EX',
    _duration: number,
    condition?: 'NX',
  ): Promise<string | null> {
    if (condition === 'NX' && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) || null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-017 retry and idempotency policy', () => {
  it('TV-024 configures exponential retry defaults and bounded idempotency windows', () => {
    const config = getQueueRuntimeConfig({} as NodeJS.ProcessEnv);

    expect(config).toEqual(expect.objectContaining({
      defaultAttempts: 3,
      backoffDelayMs: 5_000,
      idempotencyTtlSeconds: 7 * 24 * 60 * 60,
      idempotencyLeaseSeconds: 5 * 60,
    }));
  });

  it('TV-024 executes a recipient-message key once and skips a completed retry', async () => {
    const client = new MemoryIdempotencyClient();
    const store = new DeliveryIdempotencyStore(client, 'sync-test', 3_600, 300);
    const operation = jest.fn(async () => 'sent');

    const first = await store.execute('tenant-a|message-1|email|user-1', operation);
    const retry = await store.execute('tenant-a|message-1|email|user-1', operation);

    expect(first).toEqual({ executed: true, result: 'sent' });
    expect(retry).toEqual({ executed: false });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('TV-024 releases a failed delivery so a later attempt can retry it', async () => {
    const client = new MemoryIdempotencyClient();
    const store = new DeliveryIdempotencyStore(client, 'sync-test', 3_600, 300);
    const operation = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary provider error'))
      .mockResolvedValueOnce('sent');

    await expect(store.execute('tenant-a|message-1|sms|user-1', operation))
      .rejects.toThrow('temporary provider error');
    await expect(store.execute('tenant-a|message-1|sms|user-1', operation))
      .resolves.toEqual({ executed: true, result: 'sent' });
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('T-017 dead-letter routing', () => {
  it('TV-025 routes only a final failed attempt with its tenant and correlation context', async () => {
    const envelope = buildTenantJobEnvelope({
      tenantId: 'tenant-a',
      actorUserId: 'user-1',
      correlationId: '00000000-0000-4000-8000-000000000025',
      payload: { announcementId: 'announcement-1', channel: 'email' },
    });
    const job = {
      id: 'job-25',
      name: 'announcement.email',
      data: envelope,
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as unknown as Job<TenantJobEnvelope, unknown, string>;
    const enqueue = jest.spyOn(queueRuntime, 'enqueueTenantJob').mockResolvedValue({
      jobId: 'dead-letter-job',
      correlationId: envelope.correlationId,
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(hasExhaustedAttempts(job)).toBe(true);
    await expect(routeFinalFailureToDeadLetter(
      QUEUE_NAMES.communications,
      job,
      new Error('provider unavailable'),
    )).resolves.toBe(true);

    expect(enqueue).toHaveBeenCalledWith(
      QUEUE_NAMES.deadLetter,
      DEAD_LETTER_JOB_NAME,
      expect.objectContaining({
        originalQueue: QUEUE_NAMES.communications,
        originalJobName: 'announcement.email',
        originalJobId: 'job-25',
        originalPayload: envelope.payload,
        attemptsMade: 3,
        errorMessage: 'provider unavailable',
      }),
      expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'user-1',
        correlationId: envelope.correlationId,
        jobOptions: expect.objectContaining({
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        }),
      }),
    );
  });

  it('TV-025 does not dead-letter a job while retry attempts remain', async () => {
    const envelope = buildTenantJobEnvelope({
      tenantId: 'tenant-a',
      payload: { marker: 'retry-me' },
    });
    const job = {
      id: 'job-retry',
      name: 'system.tenant-probe',
      data: envelope,
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as unknown as Job<TenantJobEnvelope, unknown, string>;
    const enqueue = jest.spyOn(queueRuntime, 'enqueueTenantJob');

    expect(hasExhaustedAttempts(job)).toBe(false);
    await expect(routeFinalFailureToDeadLetter(
      QUEUE_NAMES.system,
      job,
      new Error('temporary error'),
    )).resolves.toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('T-018 worker and provider rate controls', () => {
  it('TV-026 validates explicit worker concurrency and channel limits', () => {
    const config = getQueueRuntimeConfig({
      COMMUNICATION_WORKER_CONCURRENCY: '6',
      PAYMENT_WORKER_CONCURRENCY: '3',
      QUEUE_PROVIDER_RATE_DURATION_MS: '2000',
      QUEUE_EMAIL_RATE_MAX: '12',
      QUEUE_SMS_RATE_MAX: '4',
      QUEUE_WHATSAPP_RATE_MAX: '3',
      QUEUE_PUSH_RATE_MAX: '25',
    } as NodeJS.ProcessEnv);

    expect(config.communicationWorkerConcurrency).toBe(6);
    expect(config.paymentWorkerConcurrency).toBe(3);
    expect(config.providerRateDurationMs).toBe(2_000);
    expect(config.providerRateLimits).toEqual({
      email: 12,
      sms: 4,
      whatsapp: 3,
      push: 25,
    });
  });

  it('TV-026 waits for the current provider window before retrying a permit', async () => {
    const responses: Array<[number, number]> = [[0, 175], [1, 900]];
    const client: ProviderRateLimitClient = {
      eval: jest.fn(async () => responses.shift() || [1, 900]),
    };
    const sleep = jest.fn(async () => undefined);
    const limiter = new ProviderRateLimiter(
      client,
      'sync-test',
      { email: 2, sms: 1, whatsapp: 1, push: 5 },
      1_000,
      sleep,
    );
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await limiter.acquire('tenant-a', 'email');

    expect(client.eval).toHaveBeenCalledTimes(2);
    expect(client.eval).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      1,
      expect.stringContaining(':provider-rate:email:'),
      2,
      1_000,
    );
    expect(sleep).toHaveBeenCalledWith(175);
  });
});

describe('T-019 queue metrics and alerts', () => {
  it('TV-027 reports backlog age, retries, failure rate, and tenant distribution', () => {
    const now = Date.parse('2026-09-09T12:00:00.000Z');
    const metric = calculateQueueMetric(
      QUEUE_NAMES.communications,
      { waiting: 8, delayed: 2, active: 1, failed: 2, completed: 8 },
      [{ timestamp: now - 10 * 60 * 1_000, attemptsMade: 1, tenantId: 'tenant-a' }],
      [
        { timestamp: now - 10 * 60 * 1_000, attemptsMade: 3, tenantId: 'tenant-a' },
        { timestamp: now - 1_000, attemptsMade: 1, tenantId: 'tenant-b' },
        { timestamp: now - 500, attemptsMade: 2, tenantId: 'tenant-a' },
      ],
      { waitingCount: 10, oldestMs: 5 * 60 * 1_000, failureRatePercent: 10 },
      now,
    );

    expect(metric).toEqual(expect.objectContaining({
      backlog: 10,
      oldestPendingAgeMs: 10 * 60 * 1_000,
      failureRatePercent: 20,
      retryAttemptsObserved: 3,
      sampledJobs: 3,
      sampleTruncated: true,
      tenantDistribution: [
        { tenantId: 'tenant-a', count: 2 },
        { tenantId: 'tenant-b', count: 1 },
      ],
    }));
    expect(metric.alerts.map(alert => alert.code)).toEqual([
      'BACKLOG_HIGH',
      'OLDEST_JOB_HIGH',
      'FAILURE_RATE_HIGH',
    ]);
  });

  it('TV-027 raises a critical alert whenever dead-letter work is present', () => {
    const metric = calculateQueueMetric(
      QUEUE_NAMES.deadLetter,
      { waiting: 1, delayed: 0, active: 0, failed: 0, completed: 0 },
      [{ timestamp: Date.now(), attemptsMade: 1, tenantId: 'tenant-a' }],
      [{ timestamp: Date.now(), attemptsMade: 1, tenantId: 'tenant-a' }],
      { waitingCount: 100, oldestMs: 60_000, failureRatePercent: 10 },
    );

    expect(metric.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DEAD_LETTER_PRESENT', severity: 'critical', value: 1 }),
    ]));
  });

  it('TV-027 keeps detailed queue visibility behind platform authorization', async () => {
    const app = express();
    app.use('/platform', platformRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));

    try {
      const { port } = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${port}/platform/health`;
      const unauthenticated = await fetch(endpoint);
      expect(unauthenticated.status).toBe(401);
      expect(await unauthenticated.json()).toEqual({ error: 'Access token required' });

      const nonPlatformToken = jwt.sign(
        { userId: 'user-1', role: 'SUPER_ADMIN' },
        process.env.JWT_SECRET!,
      );
      const unauthorizedRole = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${nonPlatformToken}` },
      });
      expect(unauthorizedRole.status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });
});
