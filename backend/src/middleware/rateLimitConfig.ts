import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).default('false').transform(value => value === 'true');
const enabledByDefault = z.enum(['true', 'false']).default('true').transform(value => value === 'true');
const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const optionalRedisUrl = z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().optional(),
);

const rateLimitEnvironmentSchema = z.object({
  API_RATE_LIMIT_ENABLED: enabledByDefault,
  API_RATE_LIMIT_REQUIRED: booleanString,
  API_RATE_LIMIT_REDIS_URL: optionalRedisUrl,
  REDIS_URL: optionalRedisUrl,
  API_RATE_LIMIT_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  QUEUE_PREFIX: z.string().trim().regex(/^[a-zA-Z0-9:_-]+$/).default('sync'),
  API_RATE_LIMIT_CONNECT_TIMEOUT_MS: positiveInteger(3_000),
  API_RATE_LIMIT_FALLBACK_MAX_KEYS: positiveInteger(10_000),
  API_GENERAL_RATE_WINDOW_MS: positiveInteger(15 * 60 * 1_000),
  API_GENERAL_RATE_MAX: positiveInteger(1_000),
  API_AUTH_RATE_WINDOW_MS: positiveInteger(15 * 60 * 1_000),
  API_AUTH_RATE_MAX: positiveInteger(20),
  API_AUTH_IP_RATE_MAX: positiveInteger(100),
  API_AI_RATE_WINDOW_MS: positiveInteger(60 * 1_000),
  API_AI_RATE_MAX: positiveInteger(30),
  API_RATE_LIMIT_IPV6_SUBNET: z.coerce.number().int().min(32).max(64).default(56),
}).superRefine((value, context) => {
  const redisUrl = value.API_RATE_LIMIT_REDIS_URL || value.REDIS_URL;
  if (value.API_RATE_LIMIT_ENABLED && value.API_RATE_LIMIT_REQUIRED && !redisUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['API_RATE_LIMIT_REDIS_URL'],
      message: 'API_RATE_LIMIT_REDIS_URL or REDIS_URL is required when API_RATE_LIMIT_REQUIRED=true',
    });
  }

  if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['API_RATE_LIMIT_REDIS_URL'],
      message: 'API rate-limit Redis URL must use redis:// or rediss://',
    });
  }

  if (value.API_AUTH_IP_RATE_MAX < value.API_AUTH_RATE_MAX) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['API_AUTH_IP_RATE_MAX'],
      message: 'API_AUTH_IP_RATE_MAX must be greater than or equal to API_AUTH_RATE_MAX',
    });
  }
});

export interface ApiRateLimitConfig {
  enabled: boolean;
  required: boolean;
  redisUrl?: string;
  prefix: string;
  connectTimeoutMs: number;
  fallbackMaxKeys: number;
  ipv6Subnet: number;
  general: {
    windowMs: number;
    maxRequests: number;
  };
  auth: {
    windowMs: number;
    maxRequests: number;
    ipMaxRequests: number;
  };
  ai: {
    windowMs: number;
    maxRequests: number;
  };
}

export const getApiRateLimitConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ApiRateLimitConfig => {
  const parsed = rateLimitEnvironmentSchema.parse(environment);
  return {
    enabled: parsed.API_RATE_LIMIT_ENABLED,
    required: parsed.API_RATE_LIMIT_REQUIRED,
    redisUrl: parsed.API_RATE_LIMIT_REDIS_URL || parsed.REDIS_URL,
    prefix: parsed.API_RATE_LIMIT_PREFIX || `${parsed.QUEUE_PREFIX}:api-rate`,
    connectTimeoutMs: parsed.API_RATE_LIMIT_CONNECT_TIMEOUT_MS,
    fallbackMaxKeys: parsed.API_RATE_LIMIT_FALLBACK_MAX_KEYS,
    ipv6Subnet: parsed.API_RATE_LIMIT_IPV6_SUBNET,
    general: {
      windowMs: parsed.API_GENERAL_RATE_WINDOW_MS,
      maxRequests: parsed.API_GENERAL_RATE_MAX,
    },
    auth: {
      windowMs: parsed.API_AUTH_RATE_WINDOW_MS,
      maxRequests: parsed.API_AUTH_RATE_MAX,
      ipMaxRequests: parsed.API_AUTH_IP_RATE_MAX,
    },
    ai: {
      windowMs: parsed.API_AI_RATE_WINDOW_MS,
      maxRequests: parsed.API_AI_RATE_MAX,
    },
  };
};
