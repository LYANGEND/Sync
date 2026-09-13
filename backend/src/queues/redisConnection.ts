import IORedis from 'ioredis';
import type { RedisOptions } from 'bullmq';
import { QueueRuntimeConfig } from './queueConfig';

export type RedisConnectionRole = 'producer' | 'worker' | 'idempotency' | 'rate-limit';

export const getQueueRedisOptions = (
  config: QueueRuntimeConfig,
  role: RedisConnectionRole,
): RedisOptions => {
  if (!config.redisUrl) {
    throw new Error('Cannot create queue Redis options without REDIS_URL');
  }

  return {
    url: config.redisUrl,
    connectionName: `${config.prefix}-${role}-${process.pid}`,
    connectTimeout: config.connectTimeoutMs,
    enableReadyCheck: true,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
  };
};

export const createQueueRedisConnection = (
  config: QueueRuntimeConfig,
  role: RedisConnectionRole,
): IORedis => {
  if (!config.redisUrl) {
    throw new Error('Cannot create a queue Redis connection without REDIS_URL');
  }

  return new IORedis(config.redisUrl, {
    connectionName: `${config.prefix}-${role}-${process.pid}`,
    connectTimeout: config.connectTimeoutMs,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
  });
};
