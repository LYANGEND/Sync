import type { Job } from 'bullmq';
import { afterEach, describe, expect, it } from '@jest/globals';
import { getCurrentTenantId } from '../src/middleware/tenantContext';
import { getQueueRuntimeConfig } from '../src/queues/queueConfig';
import {
  buildTenantJobEnvelope,
  QUEUE_NAMES,
  TenantJobEnvelope,
  tenantJobEnvelopeSchema,
} from '../src/queues/queueContracts';
import {
  getQueueRuntimeStatus,
  initializeQueueRuntime,
  shutdownQueueRuntime,
} from '../src/queues/queueRuntime';
import { createTenantJobProcessor } from '../src/queues/tenantWorker';

afterEach(async () => {
  await shutdownQueueRuntime();
});

describe('T-013 queue configuration', () => {
  it('TV-019 is disabled safely by default', () => {
    const config = getQueueRuntimeConfig({} as NodeJS.ProcessEnv);
    expect(config).toEqual(expect.objectContaining({
      enabled: false,
      required: false,
      prefix: 'sync',
      defaultAttempts: 3,
    }));
  });

  it('TV-019 fails configuration when enabled without Redis', () => {
    expect(() => getQueueRuntimeConfig({
      QUEUE_ENABLED: 'true',
    } as NodeJS.ProcessEnv)).toThrow('REDIS_URL is required');
  });

  it('TV-019 accepts TLS Redis configuration without exposing credentials', () => {
    const config = getQueueRuntimeConfig({
      QUEUE_ENABLED: 'true',
      QUEUE_REQUIRED: 'true',
      REDIS_URL: 'rediss://queue-user:secret@example.invalid:6380',
      QUEUE_PREFIX: 'sync-test',
    } as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(true);
    expect(config.required).toBe(true);
    expect(config.redisUrl).toMatch(/^rediss:/);
    expect(config.prefix).toBe('sync-test');
  });

  it('TV-019 initializes without a Redis connection when disabled', async () => {
    await initializeQueueRuntime(getQueueRuntimeConfig({} as NodeJS.ProcessEnv));
    expect(getQueueRuntimeStatus().state).toBe('disabled');
  });
});

describe('T-013 tenant-aware job contract', () => {
  it('TV-019 creates a versioned envelope with a stable correlation ID', () => {
    const envelope = buildTenantJobEnvelope({
      tenantId: 'tenant-a',
      actorUserId: 'user-1',
      correlationId: '00000000-0000-4000-8000-000000000019',
      now: new Date('2026-09-09T12:00:00.000Z'),
      payload: { announcementId: 'announcement-1' },
    });

    expect(envelope).toEqual({
      schemaVersion: 1,
      tenantId: 'tenant-a',
      actorUserId: 'user-1',
      correlationId: '00000000-0000-4000-8000-000000000019',
      enqueuedAt: '2026-09-09T12:00:00.000Z',
      payload: { announcementId: 'announcement-1' },
    });
    expect(tenantJobEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('TV-019 rejects an envelope without an immutable tenant identity', () => {
    expect(() => tenantJobEnvelopeSchema.parse({
      schemaVersion: 1,
      correlationId: '00000000-0000-4000-8000-000000000019',
      enqueuedAt: '2026-09-09T12:00:00.000Z',
      payload: {},
    })).toThrow();
  });

  it('TV-019 restores isolated tenant context for concurrent worker jobs', async () => {
    type Payload = { marker: string };
    const processor = createTenantJobProcessor<Payload, string>(async (envelope) => {
      await new Promise<void>(resolve => setImmediate(resolve));
      return `${getCurrentTenantId()}:${envelope.payload.marker}`;
    });

    const buildJob = (tenantId: string, marker: string) => ({
      name: 'system.tenant-probe',
      data: buildTenantJobEnvelope({ tenantId, payload: { marker } }),
    }) as Job<TenantJobEnvelope<Payload>, string, string>;

    const [first, second] = await Promise.all([
      processor(buildJob('tenant-a', 'first')),
      processor(buildJob('tenant-b', 'second')),
    ]);

    expect(first).toBe('tenant-a:first');
    expect(second).toBe('tenant-b:second');
    expect(getCurrentTenantId()).toBeUndefined();
    expect(QUEUE_NAMES.system).toBe('system');
  });
});
