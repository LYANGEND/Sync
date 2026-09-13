import express, { Request, Response } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { getApiRateLimitConfig } from '../src/middleware/rateLimitConfig';
import {
  BoundedMemoryRateLimitStore,
  createAiRateLimitKey,
  createApiRateLimitHandlers,
  createAuthIdentityRateLimitKey,
  createGeneralRateLimitKey,
  getApiRateLimitRuntimeStatus,
  initializeApiRateLimitRuntime,
  shutdownApiRateLimitRuntime,
} from '../src/middleware/rateLimiter';

interface SharedEntry {
  totalHits: number;
  resetTime: Date;
}

class SharedRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60_000;

  constructor(
    readonly prefix: string,
    private readonly entries: Map<string, SharedEntry>,
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private storageKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const storageKey = this.storageKey(key);
    const now = Date.now();
    let entry = this.entries.get(storageKey);
    if (!entry || entry.resetTime.getTime() <= now) {
      entry = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
      this.entries.set(storageKey, entry);
    }
    entry.totalHits += 1;
    return { ...entry };
  }

  async decrement(key: string): Promise<void> {
    const entry = this.entries.get(this.storageKey(key));
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }

  async resetKey(key: string): Promise<void> {
    this.entries.delete(this.storageKey(key));
  }
}

const servers: Server[] = [];
const handlerSets: Array<ReturnType<typeof createApiRateLimitHandlers>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
  await Promise.all(handlerSets.splice(0).map(handlers => handlers.shutdown()));
  await shutdownApiRateLimitRuntime();
});

const buildConfig = (overrides: NodeJS.ProcessEnv = {}) => getApiRateLimitConfig({
  API_RATE_LIMIT_ENABLED: 'true',
  API_RATE_LIMIT_REQUIRED: 'false',
  API_RATE_LIMIT_PREFIX: 'sync-test:api-rate',
  API_GENERAL_RATE_WINDOW_MS: '60000',
  API_GENERAL_RATE_MAX: '10',
  API_AUTH_RATE_WINDOW_MS: '60000',
  API_AUTH_RATE_MAX: '2',
  API_AUTH_IP_RATE_MAX: '10',
  API_AI_RATE_WINDOW_MS: '60000',
  API_AI_RATE_MAX: '2',
  API_RATE_LIMIT_FALLBACK_MAX_KEYS: '100',
  ...overrides,
} as NodeJS.ProcessEnv);

const requestForKey = (input: {
  ip: string;
  tenantId?: string;
  tenantSlug?: string;
  userId?: string;
  email?: string;
}): Request => ({
  ip: input.ip,
  baseUrl: '/api/v1',
  socket: { remoteAddress: input.ip },
  headers: input.tenantSlug ? { 'x-tenant-slug': input.tenantSlug } : {},
  body: input.email ? { email: input.email } : {},
  user: input.userId || input.tenantId
    ? { userId: input.userId || '', role: 'TEACHER', tenantId: input.tenantId }
    : undefined,
} as unknown as Request);

const startAiReplica = async (
  config: ReturnType<typeof buildConfig>,
  sharedEntries: Map<string, SharedEntry>,
): Promise<string> => {
  const handlers = createApiRateLimitHandlers(
    config,
    policy => new SharedRateLimitStore(`shared:${policy}:`, sharedEntries),
  );
  handlerSets.push(handlers);

  const app = express();
  app.set('trust proxy', 1);
  app.use((request, _response, next) => {
    (request as any).user = {
      userId: String(request.get('x-test-user') || ''),
      tenantId: String(request.get('x-test-tenant') || ''),
      role: 'TEACHER',
    };
    next();
  });
  app.get('/ai', handlers.ai, (_request: Request, response: Response) => {
    response.json({ ok: true });
  });

  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

describe('F-008 / T-023 distributed API rate-limit configuration', () => {
  it('TV-019 extension defaults to bounded local protection outside required deployments', async () => {
    const config = getApiRateLimitConfig({} as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      enabled: true,
      required: false,
      redisUrl: undefined,
      prefix: 'sync:api-rate',
    });

    await initializeApiRateLimitRuntime(config);
    expect(getApiRateLimitRuntimeStatus()).toMatchObject({
      state: 'memory',
      backend: 'memory',
      distributed: false,
    });
  });

  it('TV-019 extension rejects required mode without Redis and accepts TLS Redis', () => {
    expect(() => getApiRateLimitConfig({
      API_RATE_LIMIT_REQUIRED: 'true',
    } as NodeJS.ProcessEnv)).toThrow('is required when API_RATE_LIMIT_REQUIRED=true');

    const config = getApiRateLimitConfig({
      API_RATE_LIMIT_REQUIRED: 'true',
      API_RATE_LIMIT_REDIS_URL: 'rediss://rate-user:secret@example.invalid:6380',
      API_RATE_LIMIT_PREFIX: 'sync-prod:api-rate',
    } as NodeJS.ProcessEnv);
    expect(config.redisUrl).toMatch(/^rediss:/);
    expect(config.prefix).toBe('sync-prod:api-rate');
  });

  it('TV-019 extension degrades to bounded memory when optional Redis is unavailable', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await initializeApiRateLimitRuntime(buildConfig({
        API_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:1',
        API_RATE_LIMIT_CONNECT_TIMEOUT_MS: '50',
      }));

      expect(getApiRateLimitRuntimeStatus()).toMatchObject({
        state: 'degraded',
        backend: 'memory',
        distributed: false,
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('TV-019 extension fails startup when required Redis is unavailable', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(initializeApiRateLimitRuntime(buildConfig({
        API_RATE_LIMIT_REQUIRED: 'true',
        API_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:1',
        API_RATE_LIMIT_CONNECT_TIMEOUT_MS: '50',
      }))).rejects.toThrow('Required API rate-limit Redis connection is unavailable');
      expect(getApiRateLimitRuntimeStatus()).toMatchObject({
        state: 'error',
        backend: 'none',
        distributed: false,
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe('F-008 / T-023 tenant-safe identities', () => {
  it('TV-019 extension canonicalizes IPv6 network identities', () => {
    const compressed = requestForKey({ ip: '2001:db8::1' });
    const expanded = requestForKey({ ip: '2001:0db8:0000:0000:0000:0000:0000:0001' });

    expect(createGeneralRateLimitKey(compressed))
      .toBe(createGeneralRateLimitKey(expanded));
  });

  it('TV-019 extension isolates AI users and auth identities by tenant without exposing email', () => {
    const tenantA = requestForKey({
      ip: '192.0.2.10',
      tenantId: 'tenant-a',
      userId: 'shared-user-id',
      email: 'Parent@Example.com',
    });
    const tenantB = requestForKey({
      ip: '192.0.2.10',
      tenantId: 'tenant-b',
      userId: 'shared-user-id',
      email: 'parent@example.com',
    });
    const tenantAOtherNetwork = requestForKey({
      ip: '198.51.100.20',
      tenantId: 'tenant-a',
      email: 'parent@example.com',
    });

    expect(createAiRateLimitKey(tenantA)).not.toBe(createAiRateLimitKey(tenantB));
    const authKey = createAuthIdentityRateLimitKey(tenantA);
    expect(authKey).not.toBe(createAuthIdentityRateLimitKey(tenantB));
    expect(authKey).toBe(createAuthIdentityRateLimitKey(tenantAOtherNetwork));
    expect(authKey).not.toContain('parent@example.com');
  });
});

describe('F-008 / T-023 shared replica counters', () => {
  it('TV-019 extension enforces one quota across two API replicas and preserves tenant isolation', async () => {
    const config = buildConfig();
    const sharedEntries = new Map<string, SharedEntry>();
    const [replicaA, replicaB] = await Promise.all([
      startAiReplica(config, sharedEntries),
      startAiReplica(config, sharedEntries),
    ]);
    const headers = { 'x-test-tenant': 'tenant-a', 'x-test-user': 'user-1' };

    const first = await fetch(`${replicaA}/ai`, { headers });
    const second = await fetch(`${replicaB}/ai`, { headers });
    const blocked = await fetch(`${replicaA}/ai`, { headers });
    const otherTenant = await fetch(`${replicaB}/ai`, {
      headers: { 'x-test-tenant': 'tenant-b', 'x-test-user': 'user-1' },
    });
    const blockedBody = await blocked.json();
    await Promise.all([first, second, otherTenant].map(response => response.arrayBuffer()));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(blocked.headers.get('ratelimit')).toContain('"ai"');
    expect(blockedBody).toEqual(expect.objectContaining({
      error: 'AI rate limit exceeded. Please wait a moment.',
      retryAfter: expect.any(Number),
    }));
    expect(otherTenant.status).toBe(200);
  });

  it('TV-019 extension bounds local fallback cardinality', async () => {
    const store = new BoundedMemoryRateLimitStore(2);
    store.init({ windowMs: 60_000 } as Options);

    await store.increment('first');
    await store.increment('second');
    await store.increment('third');

    await expect(store.get('first')).resolves.toBeUndefined();
    await expect(store.get('second')).resolves.toBeDefined();
    await expect(store.get('third')).resolves.toBeDefined();
  });
});
