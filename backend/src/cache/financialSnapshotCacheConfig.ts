import { z } from 'zod';

const enabledByDefault = z.enum(['true', 'false']).default('true').transform(value => value === 'true');
const positiveInteger = (fallback: number, maximum?: number) => {
  const schema = z.coerce.number().int().positive();
  return (maximum ? schema.max(maximum) : schema).default(fallback);
};
const optionalRedisUrl = z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().optional(),
);

const financialSnapshotCacheEnvironmentSchema = z.object({
  AI_FINANCIAL_SNAPSHOT_CACHE_ENABLED: enabledByDefault,
  AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL: optionalRedisUrl,
  REDIS_URL: optionalRedisUrl,
  AI_FINANCIAL_SNAPSHOT_CACHE_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  QUEUE_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).default('sync'),
  AI_FINANCIAL_SNAPSHOT_CACHE_TTL_SECONDS: positiveInteger(5 * 60, 60 * 60),
  AI_FINANCIAL_SNAPSHOT_CACHE_CONNECT_TIMEOUT_MS: positiveInteger(3_000, 30_000),
  AI_FINANCIAL_SNAPSHOT_CACHE_MAX_VALUE_BYTES: positiveInteger(1024 * 1024, 10 * 1024 * 1024),
}).superRefine((value, context) => {
  const redisUrl = value.AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL || value.REDIS_URL;
  if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL'],
      message: 'AI financial snapshot cache Redis URL must use redis:// or rediss://',
    });
  }
});

export interface FinancialSnapshotCacheConfig {
  enabled: boolean;
  redisUrl?: string;
  prefix: string;
  ttlSeconds: number;
  connectTimeoutMs: number;
  maxValueBytes: number;
}

export const getFinancialSnapshotCacheConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): FinancialSnapshotCacheConfig => {
  const parsed = financialSnapshotCacheEnvironmentSchema.parse(environment);
  return {
    enabled: parsed.AI_FINANCIAL_SNAPSHOT_CACHE_ENABLED,
    redisUrl: parsed.AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL || parsed.REDIS_URL,
    prefix: parsed.AI_FINANCIAL_SNAPSHOT_CACHE_PREFIX
      || `${parsed.QUEUE_PREFIX}:ai-financial-snapshot`,
    ttlSeconds: parsed.AI_FINANCIAL_SNAPSHOT_CACHE_TTL_SECONDS,
    connectTimeoutMs: parsed.AI_FINANCIAL_SNAPSHOT_CACHE_CONNECT_TIMEOUT_MS,
    maxValueBytes: parsed.AI_FINANCIAL_SNAPSHOT_CACHE_MAX_VALUE_BYTES,
  };
};
