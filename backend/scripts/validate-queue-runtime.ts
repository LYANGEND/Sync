import crypto from 'crypto';
import IORedis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import type { Job, Worker } from 'bullmq';
import { getCurrentTenantId } from '../src/middleware/tenantContext';
import { QUEUE_NAMES, TenantJobEnvelope } from '../src/queues/queueContracts';
import { getQueueRuntimeConfig } from '../src/queues/queueConfig';
import { getQueueRedisOptions } from '../src/queues/redisConnection';
import {
  buildDeliveryIdempotencyKey,
  closeDeliveryIdempotencyStore,
  executeIdempotentDelivery,
} from '../src/queues/deliveryIdempotency';
import {
  closeProviderRateLimiter,
  waitForProviderPermit,
} from '../src/queues/providerRateLimiter';
import {
  enqueueTenantJob,
  getQueueHealthSnapshot,
  getQueueMetricsSnapshot,
  initializeQueueRuntime,
  shutdownQueueRuntime,
} from '../src/queues/queueRuntime';
import { createTenantWorker } from '../src/queues/tenantWorker';

type ProbePayload = { marker: string };
type ProbeResult = { tenantId: string; marker: string };

async function main(): Promise<void> {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required for queue runtime validation');
  }

  process.env.QUEUE_ENABLED = 'true';
  process.env.QUEUE_REQUIRED = 'true';
  process.env.QUEUE_PREFIX ||= `sync-validation-${crypto.randomUUID()}`;
  process.env.QUEUE_PROVIDER_RATE_DURATION_MS = '200';
  process.env.QUEUE_EMAIL_RATE_MAX = '2';

  let worker: Worker<TenantJobEnvelope<ProbePayload>, ProbeResult, string> | undefined;
  let deadLetterEvents: QueueEvents | undefined;
  let deadLetterQueue: Queue | undefined;
  const cleanupConnection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
  });

  try {
    const runtime = await initializeQueueRuntime();
    if (runtime.state !== 'ready') {
      throw new Error(`Queue runtime did not become ready: ${runtime.state}`);
    }

    const correlationId = crypto.randomUUID();
    worker = createTenantWorker<ProbePayload, ProbeResult>(
      QUEUE_NAMES.system,
      async (envelope, job) => {
        if (job.name === 'system.failure-probe') {
          throw new Error('intentional dead-letter validation failure');
        }
        return {
          tenantId: getCurrentTenantId() || 'MISSING',
          marker: envelope.payload.marker,
        };
      },
      { concurrency: 1 },
    );
    await worker.waitUntilReady();

    const completion = new Promise<{
      job: Job<TenantJobEnvelope<ProbePayload>, ProbeResult, string>;
      result: ProbeResult;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Queue probe timed out')), 10_000);
      worker!.on('completed', (job, result) => {
        if (job.data.correlationId !== correlationId) return;
        clearTimeout(timeout);
        resolve({ job, result });
      });
      worker!.on('failed', (job, error) => {
        if (job?.data.correlationId !== correlationId) return;
        clearTimeout(timeout);
        reject(error);
      });
    });

    const enqueued = await enqueueTenantJob(
      QUEUE_NAMES.system,
      'system.tenant-probe',
      { marker: 'queue-foundation-ok' },
      {
        tenantId: 'queue-validation-tenant',
        correlationId,
        actorUserId: 'queue-validation-script',
      },
    );
    const completed = await completion;

    if (
      enqueued.correlationId !== correlationId
      || completed.result.tenantId !== 'queue-validation-tenant'
      || completed.result.marker !== 'queue-foundation-ok'
    ) {
      throw new Error(`Unexpected queue probe result: ${JSON.stringify(completed.result)}`);
    }

    await completed.job.remove();

    let deliveryExecutions = 0;
    const deliveryKey = buildDeliveryIdempotencyKey({
      tenantId: 'queue-validation-tenant',
      messageId: 'validation-message',
      channel: 'email',
      recipientId: 'validation-recipient',
    });
    const firstDelivery = await executeIdempotentDelivery(deliveryKey, async () => {
      deliveryExecutions += 1;
      return 'sent';
    });
    const duplicateDelivery = await executeIdempotentDelivery(deliveryKey, async () => {
      deliveryExecutions += 1;
      return 'duplicate';
    });
    if (!firstDelivery.executed || duplicateDelivery.executed || deliveryExecutions !== 1) {
      throw new Error('Recipient delivery idempotency validation failed');
    }

    const rateLimitStartedAt = Date.now();
    await Promise.all([
      waitForProviderPermit('queue-validation-tenant', 'email'),
      waitForProviderPermit('queue-validation-tenant', 'email'),
      waitForProviderPermit('queue-validation-tenant', 'email'),
    ]);
    const rateLimitElapsedMs = Date.now() - rateLimitStartedAt;
    if (rateLimitElapsedMs < 150) {
      throw new Error(`Provider rate limiter did not delay excess work (${rateLimitElapsedMs}ms)`);
    }

    const config = getQueueRuntimeConfig();
    deadLetterEvents = new QueueEvents(QUEUE_NAMES.deadLetter, {
      connection: getQueueRedisOptions(config, 'worker'),
      prefix: config.prefix,
    });
    deadLetterQueue = new Queue(QUEUE_NAMES.deadLetter, {
      connection: getQueueRedisOptions(config, 'producer'),
      prefix: config.prefix,
    });
    await Promise.all([
      deadLetterEvents.waitUntilReady(),
      deadLetterQueue.waitUntilReady(),
    ]);

    const failureCorrelationId = crypto.randomUUID();
    const deadLetterArrival = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Dead-letter probe timed out')), 10_000);
      deadLetterEvents!.on('waiting', ({ jobId }) => {
        clearTimeout(timeout);
        resolve(jobId);
      });
    });
    const failedJob = await enqueueTenantJob(
      QUEUE_NAMES.system,
      'system.failure-probe',
      { marker: 'route-to-dead-letter' },
      {
        tenantId: 'queue-validation-tenant',
        correlationId: failureCorrelationId,
        actorUserId: 'queue-validation-script',
        jobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 100 },
          removeOnFail: false,
        },
      },
    );
    const deadLetterJobId = await deadLetterArrival;
    const deadLetterJob = await deadLetterQueue.getJob(deadLetterJobId);
    if (
      !deadLetterJob
      || deadLetterJob.data.tenantId !== 'queue-validation-tenant'
      || deadLetterJob.data.correlationId !== failureCorrelationId
      || deadLetterJob.data.payload.originalJobId !== failedJob.jobId
    ) {
      throw new Error('Dead-letter job did not preserve the original job context');
    }

    const health = await getQueueHealthSnapshot();
    const metrics = await getQueueMetricsSnapshot();
    if (
      metrics.overall !== 'critical'
      || !metrics.alerts.some(alert => alert.code === 'DEAD_LETTER_PRESENT')
    ) {
      throw new Error('Queue metrics did not surface the dead-letter alert');
    }
    console.log(JSON.stringify({
      validation: 'PASS',
      jobId: enqueued.jobId,
      correlationId,
      tenantContext: completed.result.tenantId,
      idempotentDeliveryExecutions: deliveryExecutions,
      rateLimitElapsedMs,
      deadLetterJobId,
      runtimeState: health.state,
      queues: health.queues,
      metricsOverall: metrics.overall,
      metricAlerts: metrics.alerts,
    }));
  } finally {
    if (deadLetterEvents) await deadLetterEvents.close();
    if (deadLetterQueue) await deadLetterQueue.close();
    if (worker) await worker.close();
    await Promise.all([
      closeDeliveryIdempotencyStore(),
      closeProviderRateLimiter(),
    ]);
    await shutdownQueueRuntime();

    const keys = await cleanupConnection.keys(`${process.env.QUEUE_PREFIX}:*`);
    if (keys.length > 0) await cleanupConnection.del(...keys);
    await cleanupConnection.quit();
  }
}

main().catch((error) => {
  console.error('Queue runtime validation failed:', error);
  process.exitCode = 1;
});
