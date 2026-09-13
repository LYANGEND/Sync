import { z } from 'zod';

const enabledByDefault = z.enum(['true', 'false']).default('true').transform(value => value === 'true');
const booleanString = z.enum(['true', 'false']).default('false').transform(value => value === 'true');
const positiveInteger = (fallback: number, maximum?: number) => {
  const schema = z.coerce.number().int().positive();
  return (maximum ? schema.max(maximum) : schema).default(fallback);
};
const optionalRedisUrl = z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().optional(),
);

const smsRateLimitEnvironmentSchema = z.object({
  SMS_RATE_LIMIT_ENABLED: enabledByDefault,
  SMS_RATE_LIMIT_REQUIRED: booleanString,
  SMS_RATE_LIMIT_REDIS_URL: optionalRedisUrl,
  REDIS_URL: optionalRedisUrl,
  SMS_RATE_LIMIT_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  QUEUE_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).default('sync'),
  SMS_DAILY_TENANT_LIMIT: positiveInteger(5_000, 10_000_000),
  SMS_DAILY_USER_LIMIT: positiveInteger(500, 1_000_000),
  SMS_RATE_LIMIT_CONNECT_TIMEOUT_MS: positiveInteger(3_000, 30_000),
  SMS_RATE_LIMIT_RECONCILE_INTERVAL_MS: positiveInteger(15 * 60 * 1_000, 24 * 60 * 60 * 1_000),
}).superRefine((value, context) => {
  const redisUrl = value.SMS_RATE_LIMIT_REDIS_URL || value.REDIS_URL;
  if (value.SMS_RATE_LIMIT_ENABLED && value.SMS_RATE_LIMIT_REQUIRED && !redisUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMS_RATE_LIMIT_REDIS_URL'],
      message: 'SMS_RATE_LIMIT_REDIS_URL or REDIS_URL is required when SMS_RATE_LIMIT_REQUIRED=true',
    });
  }

  if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMS_RATE_LIMIT_REDIS_URL'],
      message: 'SMS rate-limit Redis URL must use redis:// or rediss://',
    });
  }

  if (value.SMS_DAILY_USER_LIMIT > value.SMS_DAILY_TENANT_LIMIT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMS_DAILY_USER_LIMIT'],
      message: 'SMS_DAILY_USER_LIMIT cannot exceed SMS_DAILY_TENANT_LIMIT',
    });
  }
});

export interface SmsRateLimitConfig {
  enabled: boolean;
  required: boolean;
  redisUrl?: string;
  prefix: string;
  tenantLimit: number;
  userLimit: number;
  connectTimeoutMs: number;
  reconciliationIntervalMs: number;
  reconciliationLeaseMs: number;
}

export const getSmsRateLimitConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): SmsRateLimitConfig => {
  const parsed = smsRateLimitEnvironmentSchema.parse(environment);
  return {
    enabled: parsed.SMS_RATE_LIMIT_ENABLED,
    required: parsed.SMS_RATE_LIMIT_REQUIRED,
    redisUrl: parsed.SMS_RATE_LIMIT_REDIS_URL || parsed.REDIS_URL,
    prefix: parsed.SMS_RATE_LIMIT_PREFIX || `${parsed.QUEUE_PREFIX}:sms-daily-rate`,
    tenantLimit: parsed.SMS_DAILY_TENANT_LIMIT,
    userLimit: parsed.SMS_DAILY_USER_LIMIT,
    connectTimeoutMs: parsed.SMS_RATE_LIMIT_CONNECT_TIMEOUT_MS,
    reconciliationIntervalMs: parsed.SMS_RATE_LIMIT_RECONCILE_INTERVAL_MS,
    reconciliationLeaseMs: Math.min(parsed.SMS_RATE_LIMIT_RECONCILE_INTERVAL_MS, 5 * 60 * 1_000),
  };
};
