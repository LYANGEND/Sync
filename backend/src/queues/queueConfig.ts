import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).default('false').transform(value => value === 'true');
const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const percentage = (fallback: number) => z.coerce.number().min(0).max(100).default(fallback);

const queueEnvironmentSchema = z.object({
  QUEUE_ENABLED: booleanString,
  QUEUE_REQUIRED: booleanString,
  REDIS_URL: z.string().trim().optional(),
  QUEUE_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).default('sync'),
  QUEUE_DEFAULT_ATTEMPTS: positiveInteger(3),
  QUEUE_BACKOFF_DELAY_MS: positiveInteger(5_000),
  QUEUE_REMOVE_COMPLETE_COUNT: positiveInteger(1_000),
  QUEUE_REMOVE_FAIL_COUNT: positiveInteger(5_000),
  QUEUE_CONNECT_TIMEOUT_MS: positiveInteger(10_000),
  QUEUE_IDEMPOTENCY_TTL_SECONDS: positiveInteger(7 * 24 * 60 * 60),
  QUEUE_IDEMPOTENCY_LEASE_SECONDS: positiveInteger(5 * 60),
  QUEUE_PROVIDER_RATE_DURATION_MS: positiveInteger(1_000),
  QUEUE_EMAIL_RATE_MAX: positiveInteger(20),
  QUEUE_SMS_RATE_MAX: positiveInteger(5),
  QUEUE_WHATSAPP_RATE_MAX: positiveInteger(5),
  QUEUE_PUSH_RATE_MAX: positiveInteger(50),
  COMMUNICATION_WORKER_CONCURRENCY: positiveInteger(4),
  PAYMENT_WORKER_CONCURRENCY: positiveInteger(4),
  QUEUE_METRICS_SAMPLE_SIZE: positiveInteger(1_000),
  QUEUE_ALERT_WAITING_COUNT: positiveInteger(1_000),
  QUEUE_ALERT_OLDEST_MS: positiveInteger(5 * 60 * 1_000),
  QUEUE_ALERT_FAILURE_RATE_PERCENT: percentage(10),
}).superRefine((value, context) => {
  if (value.QUEUE_ENABLED && !value.REDIS_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL is required when QUEUE_ENABLED=true',
    });
  }

  if (value.REDIS_URL && !/^rediss?:\/\//i.test(value.REDIS_URL)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL must use redis:// or rediss://',
    });
  }
});

export interface QueueRuntimeConfig {
  enabled: boolean;
  required: boolean;
  redisUrl?: string;
  prefix: string;
  defaultAttempts: number;
  backoffDelayMs: number;
  removeCompleteCount: number;
  removeFailCount: number;
  connectTimeoutMs: number;
  idempotencyTtlSeconds: number;
  idempotencyLeaseSeconds: number;
  providerRateDurationMs: number;
  providerRateLimits: {
    email: number;
    sms: number;
    whatsapp: number;
    push: number;
  };
  communicationWorkerConcurrency: number;
  paymentWorkerConcurrency: number;
  metricsSampleSize: number;
  alertWaitingCount: number;
  alertOldestMs: number;
  alertFailureRatePercent: number;
}

export const getQueueRuntimeConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): QueueRuntimeConfig => {
  const parsed = queueEnvironmentSchema.parse(environment);
  return {
    enabled: parsed.QUEUE_ENABLED,
    required: parsed.QUEUE_REQUIRED,
    redisUrl: parsed.REDIS_URL,
    prefix: parsed.QUEUE_PREFIX,
    defaultAttempts: parsed.QUEUE_DEFAULT_ATTEMPTS,
    backoffDelayMs: parsed.QUEUE_BACKOFF_DELAY_MS,
    removeCompleteCount: parsed.QUEUE_REMOVE_COMPLETE_COUNT,
    removeFailCount: parsed.QUEUE_REMOVE_FAIL_COUNT,
    connectTimeoutMs: parsed.QUEUE_CONNECT_TIMEOUT_MS,
    idempotencyTtlSeconds: parsed.QUEUE_IDEMPOTENCY_TTL_SECONDS,
    idempotencyLeaseSeconds: parsed.QUEUE_IDEMPOTENCY_LEASE_SECONDS,
    providerRateDurationMs: parsed.QUEUE_PROVIDER_RATE_DURATION_MS,
    providerRateLimits: {
      email: parsed.QUEUE_EMAIL_RATE_MAX,
      sms: parsed.QUEUE_SMS_RATE_MAX,
      whatsapp: parsed.QUEUE_WHATSAPP_RATE_MAX,
      push: parsed.QUEUE_PUSH_RATE_MAX,
    },
    communicationWorkerConcurrency: parsed.COMMUNICATION_WORKER_CONCURRENCY,
    paymentWorkerConcurrency: parsed.PAYMENT_WORKER_CONCURRENCY,
    metricsSampleSize: parsed.QUEUE_METRICS_SAMPLE_SIZE,
    alertWaitingCount: parsed.QUEUE_ALERT_WAITING_COUNT,
    alertOldestMs: parsed.QUEUE_ALERT_OLDEST_MS,
    alertFailureRatePercent: parsed.QUEUE_ALERT_FAILURE_RATE_PERCENT,
  };
};
