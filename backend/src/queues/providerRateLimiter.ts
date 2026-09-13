import crypto from 'crypto';
import type IORedis from 'ioredis';
import { getQueueRuntimeConfig } from './queueConfig';
import { createQueueRedisConnection } from './redisConnection';

export type ProviderChannel = 'email' | 'sms' | 'whatsapp' | 'push';

export interface ProviderRateLimitClient {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    maximum: number,
    durationMs: number,
  ): Promise<unknown>;
}

export type RateLimitSleeper = (durationMs: number) => Promise<void>;

const TAKE_PERMIT_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local maximum = tonumber(ARGV[1])
local duration = tonumber(ARGV[2])
if current < maximum then
  current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], duration)
  end
  return {1, redis.call('PTTL', KEYS[1])}
end
return {0, redis.call('PTTL', KEYS[1])}
`;

const defaultSleeper: RateLimitSleeper = (durationMs) =>
  new Promise(resolve => setTimeout(resolve, durationMs));

export class ProviderRateLimiter {
  constructor(
    private readonly client: ProviderRateLimitClient,
    private readonly keyPrefix: string,
    private readonly limits: Record<ProviderChannel, number>,
    private readonly durationMs: number,
    private readonly sleep: RateLimitSleeper = defaultSleeper,
  ) {}

  async acquire(tenantId: string, channel: ProviderChannel): Promise<void> {
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').slice(0, 24);
    const key = `${this.keyPrefix}:provider-rate:${channel}:${tenantHash}`;
    let loggedWait = false;

    while (true) {
      const response = await this.client.eval(
        TAKE_PERMIT_SCRIPT,
        1,
        key,
        this.limits[channel],
        this.durationMs,
      );
      const [granted, ttl] = response as [number, number];
      if (Number(granted) === 1) return;

      const waitMs = Math.max(25, Number(ttl) > 0 ? Number(ttl) : this.durationMs);
      if (!loggedWait) {
        loggedWait = true;
        console.log(JSON.stringify({
          event: 'queue.provider.rate-limited',
          timestamp: new Date().toISOString(),
          tenantId,
          channel,
          waitMs,
        }));
      }
      await this.sleep(waitMs);
    }
  }
}

let connection: IORedis | undefined;
let limiter: ProviderRateLimiter | undefined;
let initialization: Promise<ProviderRateLimiter> | undefined;

const initializeLimiter = async (): Promise<ProviderRateLimiter> => {
  const config = getQueueRuntimeConfig();
  if (!config.enabled || !config.redisUrl) {
    throw new Error('Provider rate limiting requires QUEUE_ENABLED=true and REDIS_URL');
  }

  connection = createQueueRedisConnection(config, 'rate-limit');
  await connection.connect();
  await connection.ping();
  limiter = new ProviderRateLimiter(
    connection,
    config.prefix,
    config.providerRateLimits,
    config.providerRateDurationMs,
  );
  return limiter;
};

const getLimiter = async (): Promise<ProviderRateLimiter> => {
  if (limiter) return limiter;
  if (!initialization) {
    initialization = initializeLimiter().finally(() => {
      initialization = undefined;
    });
  }
  return initialization;
};

export const waitForProviderPermit = async (
  tenantId: string,
  channel: ProviderChannel,
): Promise<void> => {
  const activeLimiter = await getLimiter();
  await activeLimiter.acquire(tenantId, channel);
};

export const closeProviderRateLimiter = async (): Promise<void> => {
  limiter = undefined;
  initialization = undefined;
  if (!connection) return;

  const activeConnection = connection;
  connection = undefined;
  try {
    await activeConnection.quit();
  } catch {
    activeConnection.disconnect(false);
  }
};
