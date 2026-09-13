import crypto from 'crypto';
import type IORedis from 'ioredis';
import { getQueueRuntimeConfig } from './queueConfig';
import { createQueueRedisConnection } from './redisConnection';

export interface DeliveryIdempotencyResult<TResult> {
  executed: boolean;
  result?: TResult;
}

export interface DeliveryIdempotencyClient {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    duration: number,
    condition?: 'NX',
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

export class DeliveryInProgressError extends Error {
  constructor() {
    super('An equivalent recipient delivery is already in progress');
    this.name = 'DeliveryInProgressError';
  }
}

export class DeliveryIdempotencyStore {
  constructor(
    private readonly client: DeliveryIdempotencyClient,
    private readonly keyPrefix: string,
    private readonly completedTtlSeconds: number,
    private readonly leaseSeconds: number,
  ) {}

  private redisKey(idempotencyKey: string): string {
    const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    return `${this.keyPrefix}:delivery-idempotency:${digest}`;
  }

  async execute<TResult>(
    idempotencyKey: string,
    operation: () => Promise<TResult>,
  ): Promise<DeliveryIdempotencyResult<TResult>> {
    const key = this.redisKey(idempotencyKey);
    const leaseToken = `processing:${crypto.randomUUID()}`;
    const claimed = await this.client.set(
      key,
      leaseToken,
      'EX',
      this.leaseSeconds,
      'NX',
    );

    if (claimed !== 'OK') {
      const current = await this.client.get(key);
      if (current === 'completed') return { executed: false };
      throw new DeliveryInProgressError();
    }

    try {
      const result = await operation();
      const current = await this.client.get(key);
      if (current !== leaseToken) {
        throw new Error('Delivery idempotency lease expired before completion');
      }
      await this.client.set(key, 'completed', 'EX', this.completedTtlSeconds);
      return { executed: true, result };
    } catch (error) {
      try {
        if (await this.client.get(key) === leaseToken) {
          await this.client.del(key);
        }
      } catch (cleanupError) {
        console.error('Failed to release delivery idempotency lease:', cleanupError);
      }
      throw error;
    }
  }
}

export interface DeliveryIdempotencyKeyOptions {
  tenantId: string;
  messageId: string;
  channel: string;
  recipientId: string;
}

export const buildDeliveryIdempotencyKey = (
  options: DeliveryIdempotencyKeyOptions,
): string => [
  options.tenantId,
  options.messageId,
  options.channel,
  options.recipientId,
].join('\u001f');

let connection: IORedis | undefined;
let store: DeliveryIdempotencyStore | undefined;
let initialization: Promise<DeliveryIdempotencyStore> | undefined;

const initializeStore = async (): Promise<DeliveryIdempotencyStore> => {
  const config = getQueueRuntimeConfig();
  if (!config.enabled || !config.redisUrl) {
    throw new Error('Delivery idempotency requires QUEUE_ENABLED=true and REDIS_URL');
  }

  connection = createQueueRedisConnection(config, 'idempotency');
  await connection.connect();
  await connection.ping();
  store = new DeliveryIdempotencyStore(
    connection,
    config.prefix,
    config.idempotencyTtlSeconds,
    config.idempotencyLeaseSeconds,
  );
  return store;
};

const getStore = async (): Promise<DeliveryIdempotencyStore> => {
  if (store) return store;
  if (!initialization) {
    initialization = initializeStore().finally(() => {
      initialization = undefined;
    });
  }
  return initialization;
};

export const executeIdempotentDelivery = async <TResult>(
  idempotencyKey: string,
  operation: () => Promise<TResult>,
): Promise<DeliveryIdempotencyResult<TResult>> => {
  const activeStore = await getStore();
  return activeStore.execute(idempotencyKey, operation);
};

export const closeDeliveryIdempotencyStore = async (): Promise<void> => {
  store = undefined;
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
