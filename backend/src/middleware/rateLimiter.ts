import crypto from 'crypto';
import IORedis from 'ioredis';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  ipKeyGenerator,
  rateLimit,
  type ClientRateLimitInfo,
  type Options,
  type RateLimitInfo,
  type RateLimitRequestHandler,
  type Store,
} from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { AuthRequest } from './authMiddleware';
import { ApiRateLimitConfig, getApiRateLimitConfig } from './rateLimitConfig';

export type ApiRateLimitPolicy = 'general' | 'auth-ip' | 'auth-identity' | 'ai';
export type ApiRateLimitRuntimeState =
  | 'uninitialized'
  | 'disabled'
  | 'memory'
  | 'redis'
  | 'degraded'
  | 'error';

export interface ApiRateLimitRuntimeStatus {
  state: ApiRateLimitRuntimeState;
  backend: 'none' | 'memory' | 'redis';
  enabled: boolean;
  required: boolean;
  distributed: boolean;
  lastTransitionAt: string;
  lastStoreErrorAt?: string;
}

export type ApiRateLimitStoreFactory = (policy: ApiRateLimitPolicy) => Store;

export interface ApiRateLimitHandlers {
  general: RequestHandler;
  auth: RequestHandler;
  ai: RequestHandler;
  policies: Record<ApiRateLimitPolicy, RateLimitRequestHandler>;
  shutdown(): Promise<void>;
}

interface MemoryEntry {
  totalHits: number;
  resetTime: Date;
}

/**
 * Emergency/local mode must not expose an unbounded Map to attacker-controlled
 * identifiers. Production uses Redis; this bounded store is for development and
 * controlled degradation when Redis is optional.
 */
export class BoundedMemoryRateLimitStore implements Store {
  readonly localKeys = true;
  private readonly entries = new Map<string, MemoryEntry>();
  private windowMs = 60_000;

  constructor(private readonly maximumKeys: number) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.resetTime.getTime() <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return { ...entry };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || entry.resetTime.getTime() <= now) {
      this.evictIfNeeded(now);
      entry = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
    } else {
      // Reinsertion keeps the oldest entry first for deterministic LRU eviction.
      this.entries.delete(key);
    }

    entry.totalHits += 1;
    this.entries.set(key, entry);
    return { ...entry };
  }

  async decrement(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }

  async resetKey(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async resetAll(): Promise<void> {
    this.entries.clear();
  }

  shutdown(): void {
    this.entries.clear();
  }

  private evictIfNeeded(now: number): void {
    if (this.entries.size < this.maximumKeys) return;

    for (const [key, entry] of this.entries) {
      if (entry.resetTime.getTime() <= now) this.entries.delete(key);
      if (this.entries.size < this.maximumKeys) return;
    }

    const oldestKey = this.entries.keys().next().value as string | undefined;
    if (oldestKey) this.entries.delete(oldestKey);
  }
}

const normalizeHeader = (value: string | string[] | undefined): string | undefined => {
  const normalized = Array.isArray(value) ? value[0] : value;
  const trimmed = normalized?.trim().toLowerCase();
  return trimmed ? trimmed.slice(0, 256) : undefined;
};

const getTenantHint = (request: Request): string => {
  const tenantId = (request as AuthRequest).user?.tenantId?.trim();
  if (tenantId) return `id:${tenantId}`;

  const headerTenantId = normalizeHeader(request.headers['x-tenant-id']);
  if (headerTenantId) return `id:${headerTenantId}`;

  const tenantSlug = normalizeHeader(request.headers['x-tenant-slug']);
  return tenantSlug ? `slug:${tenantSlug}` : 'public';
};

const getNetworkIdentity = (request: Request, ipv6Subnet: number): string => {
  const address = request.ip || request.socket.remoteAddress || 'unknown';
  try {
    return ipKeyGenerator(address, ipv6Subnet);
  } catch {
    return address.trim().toLowerCase().slice(0, 128) || 'unknown';
  }
};

const hashKey = (...parts: string[]): string => crypto
  .createHash('sha256')
  .update(parts.join('\u001f'))
  .digest('hex');

/** General traffic remains network-scoped so changing tenant headers cannot evade it. */
export const createGeneralRateLimitKey = (
  request: Request,
  ipv6Subnet = 56,
): string => hashKey(
  'general',
  request.baseUrl || '/',
  getNetworkIdentity(request, ipv6Subnet),
);

/** A broad network ceiling prevents credential rotation from bypassing auth protection. */
export const createAuthIpRateLimitKey = (
  request: Request,
  ipv6Subnet = 56,
): string => hashKey('auth-ip', getNetworkIdentity(request, ipv6Subnet));

/** The narrow auth key is tenant-aware and hashes the supplied identifier. */
export const createAuthIdentityRateLimitKey = (
  request: Request,
): string => {
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase().normalize('NFKC').slice(0, 320)
    : 'invalid';
  return hashKey(
    'auth-identity',
    getTenantHint(request),
    email,
  );
};

/** Authenticated AI quotas are isolated by immutable tenant and user claims. */
export const createAiRateLimitKey = (
  request: Request,
  ipv6Subnet = 56,
): string => {
  const identity = (request as AuthRequest).user;
  if (identity?.tenantId && identity.userId) {
    return hashKey('ai', identity.tenantId, identity.userId);
  }
  return hashKey('ai-anonymous', getNetworkIdentity(request, ipv6Subnet));
};

const compose = (handlers: RequestHandler[]): RequestHandler =>
  (request, response, next) => {
    const invoke = (index: number): void => {
      if (index >= handlers.length) {
        next();
        return;
      }
      try {
        handlers[index](request, response, error => {
          if (error) {
            next(error);
            return;
          }
          invoke(index + 1);
        });
      } catch (error) {
        next(error);
      }
    };
    invoke(0);
  };

const createPolicyLimiter = (
  policy: ApiRateLimitPolicy,
  windowMs: number,
  maxRequests: number,
  message: string,
  keyGenerator: (request: Request) => string,
  store: Store,
): RateLimitRequestHandler => {
  const requestPropertyName = `rateLimit_${policy.replace('-', '_')}`;
  return rateLimit({
    windowMs,
    limit: maxRequests,
    identifier: policy,
    keyGenerator,
    store,
    requestPropertyName,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    handler: (request, response) => {
      const info = (request as Request & Record<string, RateLimitInfo>)[requestPropertyName];
      const retryAfter = Math.max(1, Math.ceil(
        ((info?.resetTime?.getTime() || Date.now() + windowMs) - Date.now()) / 1_000,
      ));
      response.set('Retry-After', String(retryAfter));
      response.status(429).json({ error: message, retryAfter });
    },
  });
};

export const createApiRateLimitHandlers = (
  config: ApiRateLimitConfig,
  storeFactory: ApiRateLimitStoreFactory = () =>
    new BoundedMemoryRateLimitStore(config.fallbackMaxKeys),
): ApiRateLimitHandlers => {
  const stores: Store[] = [];
  const storeFor = (policy: ApiRateLimitPolicy): Store => {
    const store = storeFactory(policy);
    stores.push(store);
    return store;
  };

  const policies: Record<ApiRateLimitPolicy, RateLimitRequestHandler> = {
    general: createPolicyLimiter(
      'general',
      config.general.windowMs,
      config.general.maxRequests,
      'Too many requests. Please try again later.',
      request => createGeneralRateLimitKey(request, config.ipv6Subnet),
      storeFor('general'),
    ),
    'auth-ip': createPolicyLimiter(
      'auth-ip',
      config.auth.windowMs,
      config.auth.ipMaxRequests,
      'Too many authentication attempts from this network. Please try again later.',
      request => createAuthIpRateLimitKey(request, config.ipv6Subnet),
      storeFor('auth-ip'),
    ),
    'auth-identity': createPolicyLimiter(
      'auth-identity',
      config.auth.windowMs,
      config.auth.maxRequests,
      'Too many login attempts. Please try again later.',
      createAuthIdentityRateLimitKey,
      storeFor('auth-identity'),
    ),
    ai: createPolicyLimiter(
      'ai',
      config.ai.windowMs,
      config.ai.maxRequests,
      'AI rate limit exceeded. Please wait a moment.',
      request => createAiRateLimitKey(request, config.ipv6Subnet),
      storeFor('ai'),
    ),
  };

  return {
    general: policies.general,
    auth: compose([policies['auth-ip'], policies['auth-identity']]),
    ai: policies.ai,
    policies,
    async shutdown(): Promise<void> {
      await Promise.all(stores.map(async store => store.shutdown?.()));
    },
  };
};

export const createRedisRateLimitStoreFactory = (
  client: IORedis,
  prefix: string,
): ApiRateLimitStoreFactory => policy => new RedisStore({
  prefix: `${prefix}:${policy}:`,
  sendCommand: (command: string, ...args: string[]) =>
    client.call(command, ...args) as Promise<RedisReply>,
});

let runtimeConfig = getApiRateLimitConfig();
let memoryHandlers = createApiRateLimitHandlers(runtimeConfig);
let redisHandlers: ApiRateLimitHandlers | undefined;
let redisConnection: IORedis | undefined;
let redisHealthy = false;
let runtimeState: ApiRateLimitRuntimeState = runtimeConfig.enabled ? 'uninitialized' : 'disabled';
let lastTransitionAt = new Date().toISOString();
let lastStoreErrorAt: string | undefined;
let lastStoreWarningAt = 0;
let nextRecoveryAttemptAt = 0;

const setRuntimeState = (state: ApiRateLimitRuntimeState): void => {
  if (runtimeState !== state) lastTransitionAt = new Date().toISOString();
  runtimeState = state;
};

const markStoreFailure = (error: unknown): void => {
  redisHealthy = false;
  lastStoreErrorAt = new Date().toISOString();
  setRuntimeState('degraded');
  const now = Date.now();
  if (now - lastStoreWarningAt >= 60_000) {
    lastStoreWarningAt = now;
    console.error(JSON.stringify({
      event: 'api.rate-limit.redis-error',
      timestamp: lastStoreErrorAt,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
};

const activateRedisHandlers = (connection: IORedis): void => {
  if (connection !== redisConnection || connection.status !== 'ready') return;
  if (!redisHandlers) {
    redisHandlers = createApiRateLimitHandlers(
      runtimeConfig,
      createRedisRateLimitStoreFactory(connection, runtimeConfig.prefix),
    );
  }
  redisHealthy = true;
  setRuntimeState('redis');
};

const attemptRedisRecovery = async (): Promise<void> => {
  const connection = redisConnection;
  const now = Date.now();
  if (!connection || redisHealthy || now < nextRecoveryAttemptAt) return;
  nextRecoveryAttemptAt = now + 5_000;
  try {
    if (connection.status === 'wait' || connection.status === 'end') {
      await connection.connect();
    }
    await connection.ping();
    activateRedisHandlers(connection);
  } catch (error) {
    markStoreFailure(error);
  }
};

const closeRedisConnection = async (): Promise<void> => {
  const connection = redisConnection;
  redisConnection = undefined;
  redisHealthy = false;
  if (!connection) return;

  connection.removeAllListeners();
  try {
    if (connection.status === 'ready') await connection.quit();
    else connection.disconnect(false);
  } catch {
    connection.disconnect(false);
  }
};

export const initializeApiRateLimitRuntime = async (
  config: ApiRateLimitConfig = getApiRateLimitConfig(),
): Promise<ApiRateLimitRuntimeStatus> => {
  await closeRedisConnection();
  await redisHandlers?.shutdown();
  await memoryHandlers.shutdown();

  runtimeConfig = config;
  memoryHandlers = createApiRateLimitHandlers(config);
  redisHandlers = undefined;
  lastStoreErrorAt = undefined;
  lastStoreWarningAt = 0;
  nextRecoveryAttemptAt = 0;

  if (!config.enabled) {
    setRuntimeState('disabled');
    return getApiRateLimitRuntimeStatus();
  }

  if (!config.redisUrl) {
    setRuntimeState('memory');
    return getApiRateLimitRuntimeStatus();
  }

  const connection = new IORedis(config.redisUrl, {
    connectionName: `${config.prefix}-http-${process.pid}`,
    connectTimeout: config.connectTimeoutMs,
    disconnectTimeout: Math.min(config.connectTimeoutMs, 500),
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redisConnection = connection;
  connection.on('ready', () => activateRedisHandlers(connection));
  connection.on('error', markStoreFailure);
  connection.on('close', () => {
    if (connection === redisConnection) markStoreFailure(new Error('Redis connection closed'));
  });
  connection.on('reconnecting', () => {
    if (connection === redisConnection) markStoreFailure(new Error('Redis reconnecting'));
  });

  try {
    await connection.connect();
    await connection.ping();
    activateRedisHandlers(connection);
    return getApiRateLimitRuntimeStatus();
  } catch (error) {
    markStoreFailure(error);
    if (config.required) {
      await closeRedisConnection();
      setRuntimeState('error');
      throw new Error('Required API rate-limit Redis connection is unavailable');
    }
    return getApiRateLimitRuntimeStatus();
  }
};

export const shutdownApiRateLimitRuntime = async (): Promise<void> => {
  await closeRedisConnection();
  await redisHandlers?.shutdown();
  await memoryHandlers.shutdown();
  redisHandlers = undefined;
  setRuntimeState('uninitialized');
};

export const getApiRateLimitRuntimeStatus = (): ApiRateLimitRuntimeStatus => ({
  state: runtimeState,
  backend: runtimeState === 'redis'
    ? 'redis'
    : runtimeState === 'memory' || runtimeState === 'degraded'
      ? 'memory'
      : 'none',
  enabled: runtimeConfig.enabled,
  required: runtimeConfig.required,
  distributed: runtimeState === 'redis',
  lastTransitionAt,
  ...(lastStoreErrorAt ? { lastStoreErrorAt } : {}),
});

const serviceUnavailable = (response: Response): void => {
  response.set('Retry-After', '1');
  response.status(503).json({
    error: 'Request protection service is temporarily unavailable',
    retryAfter: 1,
  });
};

const invokeRuntimeHandler = (
  handlerName: 'general' | 'auth' | 'ai',
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (!runtimeConfig.enabled) {
    next();
    return;
  }

  if (!redisHealthy || !redisHandlers) {
    void attemptRedisRecovery();
    if (runtimeConfig.required && runtimeConfig.redisUrl) {
      serviceUnavailable(response);
      return;
    }
    memoryHandlers[handlerName](request, response, next);
    return;
  }

  redisHandlers[handlerName](request, response, error => {
    if (!error) {
      setRuntimeState('redis');
      next();
      return;
    }

    markStoreFailure(error);
    if (runtimeConfig.required) {
      serviceUnavailable(response);
      return;
    }
    memoryHandlers[handlerName](request, response, next);
  });
};

export const generalLimiter: RequestHandler = (request, response, next) =>
  invokeRuntimeHandler('general', request, response, next);

export const authLimiter: RequestHandler = (request, response, next) =>
  invokeRuntimeHandler('auth', request, response, next);

export const aiLimiter: RequestHandler = (request, response, next) =>
  invokeRuntimeHandler('ai', request, response, next);
