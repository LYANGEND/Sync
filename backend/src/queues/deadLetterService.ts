import crypto from 'crypto';
import type { Job } from 'bullmq';
import { z } from 'zod';
import {
  QUEUE_NAMES,
  QueueName,
  TenantJobEnvelope,
  tenantJobEnvelopeSchema,
} from './queueContracts';
import { enqueueTenantJob } from './queueRuntime';

export const DEAD_LETTER_JOB_NAME = 'queue.dead-letter';

export const deadLetterJobPayloadSchema = z.object({
  originalQueue: z.string().min(1),
  originalJobName: z.string().min(1),
  originalJobId: z.string().min(1),
  originalPayload: z.record(z.unknown()),
  attemptsMade: z.number().int().positive(),
  failedAt: z.string().datetime(),
  errorName: z.string().min(1),
  errorMessage: z.string().min(1),
});
export type DeadLetterJobPayload = z.infer<typeof deadLetterJobPayloadSchema>;

export const hasExhaustedAttempts = (
  job: Pick<Job, 'attemptsMade' | 'opts'>,
): boolean => job.attemptsMade >= Math.max(1, Number(job.opts.attempts) || 1);

export const routeFinalFailureToDeadLetter = async (
  originalQueue: QueueName,
  job: Job<TenantJobEnvelope, unknown, string>,
  error: Error,
): Promise<boolean> => {
  if (originalQueue === QUEUE_NAMES.deadLetter || !hasExhaustedAttempts(job)) return false;

  const parsedEnvelope = tenantJobEnvelopeSchema.safeParse(job.data);
  if (!parsedEnvelope.success) {
    console.error(JSON.stringify({
      event: 'queue.dead-letter.rejected',
      timestamp: new Date().toISOString(),
      queue: originalQueue,
      jobId: job.id ? String(job.id) : undefined,
      error: 'Invalid tenant envelope',
    }));
    return false;
  }

  const envelope = parsedEnvelope.data;
  const originalJobId = job.id ? String(job.id) : 'unknown';
  const payload: DeadLetterJobPayload = {
    originalQueue,
    originalJobName: job.name,
    originalJobId,
    originalPayload: envelope.payload,
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
    errorName: error.name || 'Error',
    errorMessage: error.message.substring(0, 2_000) || 'Unknown worker failure',
  };
  deadLetterJobPayloadSchema.parse(payload);
  const idDigest = crypto
    .createHash('sha256')
    .update(`${originalQueue}\u001f${originalJobId}`)
    .digest('hex')
    .slice(0, 40);

  await enqueueTenantJob(
    QUEUE_NAMES.deadLetter,
    DEAD_LETTER_JOB_NAME,
    payload,
    {
      tenantId: envelope.tenantId,
      actorUserId: envelope.actorUserId,
      correlationId: envelope.correlationId,
      jobOptions: {
        jobId: `dead-letter-${idDigest}`,
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    },
  );

  console.error(JSON.stringify({
    event: 'queue.job.dead-lettered',
    timestamp: new Date().toISOString(),
    queue: originalQueue,
    jobName: job.name,
    jobId: originalJobId,
    tenantId: envelope.tenantId,
    correlationId: envelope.correlationId,
  }));
  return true;
};
