import { Job, Processor, Worker, WorkerOptions } from 'bullmq';
import { runWithTenant } from '../middleware/tenantContext';
import {
  jobNameSchema,
  QueueName,
  queueNameSchema,
  TenantJobEnvelope,
  tenantJobEnvelopeSchema,
} from './queueContracts';
import { getQueueRuntimeConfig } from './queueConfig';
import { getQueueRedisOptions } from './redisConnection';
import { routeFinalFailureToDeadLetter } from './deadLetterService';

export type TenantJobHandler<
  TPayload extends Record<string, unknown>,
  TResult,
> = (
  envelope: TenantJobEnvelope<TPayload>,
  job: Job<TenantJobEnvelope<TPayload>, TResult, string>,
) => Promise<TResult>;

/**
 * Validates every queued envelope and restores AsyncLocalStorage tenant context
 * before any handler can access the tenant-scoped Prisma client.
 */
export const createTenantJobProcessor = <
  TPayload extends Record<string, unknown>,
  TResult,
>(handler: TenantJobHandler<TPayload, TResult>): Processor<TenantJobEnvelope<TPayload>, TResult, string> =>
  async (job) => {
    jobNameSchema.parse(job.name);
    const envelope = tenantJobEnvelopeSchema.parse(job.data) as TenantJobEnvelope<TPayload>;
    return runWithTenant(envelope.tenantId, () => handler(envelope, job));
  };

export const createTenantWorker = <
  TPayload extends Record<string, unknown>,
  TResult,
>(
  queueName: QueueName,
  handler: TenantJobHandler<TPayload, TResult>,
  options: Omit<WorkerOptions, 'connection' | 'prefix'> = {},
): Worker<TenantJobEnvelope<TPayload>, TResult, string> => {
  const parsedQueueName = queueNameSchema.parse(queueName);
  const config = getQueueRuntimeConfig();
  if (!config.enabled || !config.redisUrl) {
    throw new Error('Queue workers require QUEUE_ENABLED=true and REDIS_URL');
  }

  const worker = new Worker<TenantJobEnvelope<TPayload>, TResult, string>(
    parsedQueueName,
    createTenantJobProcessor(handler),
    {
      ...options,
      // Pass options rather than a shared client so BullMQ owns and closes
      // every worker connection during graceful shutdown.
      connection: getQueueRedisOptions(config, 'worker'),
      prefix: config.prefix,
    },
  );

  worker.on('completed', (job) => {
    console.log(JSON.stringify({
      event: 'queue.job.completed',
      timestamp: new Date().toISOString(),
      queue: parsedQueueName,
      jobName: job.name,
      jobId: String(job.id),
      tenantId: job.data.tenantId,
      correlationId: job.data.correlationId,
    }));
  });

  worker.on('failed', (job, error) => {
    console.error(JSON.stringify({
      event: 'queue.job.failed',
      timestamp: new Date().toISOString(),
      queue: parsedQueueName,
      jobName: job?.name,
      jobId: job?.id ? String(job.id) : undefined,
      tenantId: job?.data.tenantId,
      correlationId: job?.data.correlationId,
      attempt: job?.attemptsMade,
      error: error.message,
    }));

    if (job) {
      routeFinalFailureToDeadLetter(
        parsedQueueName,
        job as Job<TenantJobEnvelope, unknown, string>,
        error,
      ).catch((deadLetterError) => {
        console.error(JSON.stringify({
          event: 'queue.dead-letter.failed',
          timestamp: new Date().toISOString(),
          queue: parsedQueueName,
          jobName: job.name,
          jobId: job.id ? String(job.id) : undefined,
          tenantId: job.data.tenantId,
          correlationId: job.data.correlationId,
          error: deadLetterError instanceof Error ? deadLetterError.message : String(deadLetterError),
        }));
      });
    }
  });

  worker.on('error', (error) => {
    console.error(JSON.stringify({
      event: 'queue.worker.error',
      timestamp: new Date().toISOString(),
      queue: parsedQueueName,
      error: error.message,
    }));
  });

  return worker;
};
