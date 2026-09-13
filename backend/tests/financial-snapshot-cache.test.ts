import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  buildFinancialSnapshotCacheKey,
  FinancialSnapshotCache,
  FinancialSnapshotCacheStore,
  getFinancialSnapshotCacheStatus,
  initializeFinancialSnapshotCacheRuntime,
  shutdownFinancialSnapshotCacheRuntime,
} from '../src/cache/financialSnapshotCache';
import {
  FinancialSnapshotCacheConfig,
  getFinancialSnapshotCacheConfig,
} from '../src/cache/financialSnapshotCacheConfig';

interface StoredValue {
  value: string;
  expiresAt: number;
}

class SharedMemorySnapshotStore implements FinancialSnapshotCacheStore {
  private nowMs = 0;
  private readonly values = new Map<string, StoredValue>();
  private readonly revisions = new Map<string, Map<string, number>>();
  failRevisionIncrements = false;

  async get(key: string): Promise<string | null> {
    const stored = this.values.get(key);
    if (!stored) return null;
    if (stored.expiresAt <= this.nowMs) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, {
      value,
      expiresAt: this.nowMs + ttlSeconds * 1_000,
    });
  }

  async delete(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async readRevisions(key: string, fields: string[]): Promise<number[]> {
    const revisions = this.revisions.get(key);
    return fields.map(field => revisions?.get(field) || 0);
  }

  async incrementRevisions(key: string, fields: string[]): Promise<number[]> {
    if (this.failRevisionIncrements) throw new Error('revision store unavailable');
    const revisions = this.revisions.get(key) || new Map<string, number>();
    this.revisions.set(key, revisions);
    return fields.map(field => {
      const next = (revisions.get(field) || 0) + 1;
      revisions.set(field, next);
      return next;
    });
  }

  advance(milliseconds: number): void {
    this.nowMs += milliseconds;
  }
}

const buildConfig = (
  overrides: Partial<FinancialSnapshotCacheConfig> = {},
): FinancialSnapshotCacheConfig => ({
  enabled: true,
  prefix: 'sync-test:ai-financial-snapshot',
  ttlSeconds: 300,
  connectTimeoutMs: 100,
  maxValueBytes: 1024 * 1024,
  ...overrides,
});

afterEach(async () => {
  await shutdownFinancialSnapshotCacheRuntime();
});

describe('T-010 financial snapshot cache configuration', () => {
  it('TV-015 uses short-lived safe defaults and bypasses Redis when it is not configured', async () => {
    const config = getFinancialSnapshotCacheConfig({} as NodeJS.ProcessEnv);

    expect(config).toEqual({
      enabled: true,
      redisUrl: undefined,
      prefix: 'sync:ai-financial-snapshot',
      ttlSeconds: 300,
      connectTimeoutMs: 3000,
      maxValueBytes: 1024 * 1024,
    });

    await initializeFinancialSnapshotCacheRuntime(config);
    expect(getFinancialSnapshotCacheStatus()).toMatchObject({
      state: 'bypass',
      backend: 'none',
      distributed: false,
      ttlSeconds: 300,
    });
  });

  it('TV-015 accepts a dedicated TLS Redis URL and rejects unsupported protocols', () => {
    const config = getFinancialSnapshotCacheConfig({
      REDIS_URL: 'redis://shared.example.invalid:6379',
      AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL: 'rediss://cache-user:secret@example.invalid:6380',
      AI_FINANCIAL_SNAPSHOT_CACHE_PREFIX: 'sync-prod:finance-cache',
      AI_FINANCIAL_SNAPSHOT_CACHE_TTL_SECONDS: '120',
    } as NodeJS.ProcessEnv);

    expect(config.redisUrl).toMatch(/^rediss:/);
    expect(config.prefix).toBe('sync-prod:finance-cache');
    expect(config.ttlSeconds).toBe(120);
    expect(() => getFinancialSnapshotCacheConfig({
      AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL: 'http://example.invalid',
    } as NodeJS.ProcessEnv)).toThrow('must use redis:// or rediss://');
  });
});

describe('T-010 / TV-015 snapshot reuse', () => {
  it('reuses one Redis snapshot across independent API cache instances within TTL', async () => {
    const store = new SharedMemorySnapshotStore();
    const replicaA = new FinancialSnapshotCache(buildConfig(), store);
    const replicaB = new FinancialSnapshotCache(buildConfig(), store);
    const builder = jest.fn(async () => ({ generatedAt: '2026-09-09T12:00:00.000Z', revenue: 1250 }));

    const first = await replicaA.getOrBuild('tenant-a', 'branch-1', builder);
    const second = await replicaB.getOrBuild('tenant-a', 'branch-1', builder);

    expect(first).toEqual(second);
    expect(builder).toHaveBeenCalledTimes(1);
    expect(replicaA.getMetrics()).toMatchObject({ misses: 1, writes: 1 });
    expect(replicaB.getMetrics()).toMatchObject({ hits: 1, hitRatio: 1 });
  });

  it('rebuilds the snapshot after its configured TTL expires', async () => {
    const config = buildConfig({ ttlSeconds: 5 });
    const store = new SharedMemorySnapshotStore();
    const cache = new FinancialSnapshotCache(config, store);
    let generation = 0;
    const builder = jest.fn(async () => ({ generation: ++generation }));

    await expect(cache.getOrBuild('tenant-a', 'branch-1', builder))
      .resolves.toEqual({ generation: 1 });
    store.advance(5_001);
    await expect(cache.getOrBuild('tenant-a', 'branch-1', builder))
      .resolves.toEqual({ generation: 2 });

    expect(builder).toHaveBeenCalledTimes(2);
    expect(cache.getMetrics()).toMatchObject({ misses: 2, writes: 2 });
  });

  it('coalesces concurrent misses for the same tenant and branch in one process', async () => {
    const store = new SharedMemorySnapshotStore();
    const cache = new FinancialSnapshotCache(buildConfig(), store);
    let release: ((value: { marker: string }) => void) | undefined;
    const builder = jest.fn(() => new Promise<{ marker: string }>(resolve => {
      release = resolve;
    }));

    const first = cache.getOrBuild('tenant-a', 'branch-1', builder);
    await new Promise<void>(resolve => setImmediate(resolve));
    const second = cache.getOrBuild('tenant-a', 'branch-1', builder);
    release?.({ marker: 'shared-build' });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { marker: 'shared-build' },
      { marker: 'shared-build' },
    ]);
    expect(builder).toHaveBeenCalledTimes(1);
    expect(cache.getMetrics().coalescedBuilds).toBe(1);
  });
});

describe('T-010 / TV-016 tenant and branch isolation', () => {
  it('uses distinct opaque keys for tenant, branch, and all-branch scopes', () => {
    const prefix = 'sync-test:ai-financial-snapshot';
    const tenantABranch1 = buildFinancialSnapshotCacheKey(prefix, 'tenant-a', 'branch-1');
    const tenantABranch2 = buildFinancialSnapshotCacheKey(prefix, 'tenant-a', 'branch-2');
    const tenantBBranch1 = buildFinancialSnapshotCacheKey(prefix, 'tenant-b', 'branch-1');
    const tenantAAll = buildFinancialSnapshotCacheKey(prefix, 'tenant-a');

    expect(new Set([tenantABranch1, tenantABranch2, tenantBBranch1, tenantAAll]).size).toBe(4);
    expect(tenantABranch1).not.toContain('tenant-a');
    expect(tenantABranch1).not.toContain('branch-1');
    expect(() => buildFinancialSnapshotCacheKey(prefix, ' ', 'branch-1'))
      .toThrow('Tenant ID is required');
  });

  it('never reuses snapshots across tenant, branch, or all-branch boundaries', async () => {
    const store = new SharedMemorySnapshotStore();
    const cache = new FinancialSnapshotCache(buildConfig(), store);
    let builds = 0;
    const load = (tenantId: string, branchId?: string) => cache.getOrBuild(
      tenantId,
      branchId,
      async () => ({ marker: `${tenantId}:${branchId || 'all'}:${++builds}` }),
    );

    const tenantABranch1 = await load('tenant-a', 'branch-1');
    const tenantABranch2 = await load('tenant-a', 'branch-2');
    const tenantBBranch1 = await load('tenant-b', 'branch-1');
    const tenantAAll = await load('tenant-a');

    expect(builds).toBe(4);
    await expect(load('tenant-a', 'branch-1')).resolves.toEqual(tenantABranch1);
    await expect(load('tenant-a', 'branch-2')).resolves.toEqual(tenantABranch2);
    await expect(load('tenant-b', 'branch-1')).resolves.toEqual(tenantBBranch1);
    await expect(load('tenant-a')).resolves.toEqual(tenantAAll);
    expect(builds).toBe(4);
    expect(cache.getMetrics()).toMatchObject({ misses: 4, hits: 4 });
  });

  it('builds fresh data when Redis is unavailable instead of serving another scope', async () => {
    const cache = new FinancialSnapshotCache(buildConfig());
    let builds = 0;
    const builder = async () => ({ generation: ++builds });

    await expect(cache.getOrBuild('tenant-a', 'branch-1', builder))
      .resolves.toEqual({ generation: 1 });
    await expect(cache.getOrBuild('tenant-a', 'branch-1', builder))
      .resolves.toEqual({ generation: 2 });

    expect(cache.getMetrics()).toMatchObject({ bypasses: 2, hits: 0 });
  });
});

describe('T-011 / TV-017 event-driven invalidation', () => {
  it('invalidates the affected branch and all-branches view without evicting sibling branches or tenants', async () => {
    const store = new SharedMemorySnapshotStore();
    const cache = new FinancialSnapshotCache(buildConfig(), store);
    const builds = new Map<string, number>();
    const load = (tenantId: string, branchId?: string) => {
      const scope = `${tenantId}:${branchId || 'all'}`;
      return cache.getOrBuild(tenantId, branchId, async () => {
        const generation = (builds.get(scope) || 0) + 1;
        builds.set(scope, generation);
        return { scope, generation };
      });
    };

    await Promise.all([
      load('tenant-a', 'branch-1'),
      load('tenant-a', 'branch-2'),
      load('tenant-a'),
      load('tenant-b', 'branch-1'),
    ]);

    await expect(cache.invalidate('tenant-a', { scope: 'branch', branchId: 'branch-1' }))
      .resolves.toBe(2);

    await expect(load('tenant-a', 'branch-1')).resolves.toMatchObject({ generation: 2 });
    await expect(load('tenant-a')).resolves.toMatchObject({ generation: 2 });
    await expect(load('tenant-a', 'branch-2')).resolves.toMatchObject({ generation: 1 });
    await expect(load('tenant-b', 'branch-1')).resolves.toMatchObject({ generation: 1 });
    expect(cache.getMetrics()).toMatchObject({
      invalidationEvents: 1,
      invalidatedScopes: 2,
    });
  });

  it('invalidates every cached branch for one tenant while preserving another tenant', async () => {
    const store = new SharedMemorySnapshotStore();
    const cache = new FinancialSnapshotCache(buildConfig(), store);
    let builds = 0;
    const load = (tenantId: string, branchId?: string) => cache.getOrBuild(
      tenantId,
      branchId,
      async () => ({ generation: ++builds }),
    );

    const tenantABranch1 = await load('tenant-a', 'branch-1');
    const tenantABranch2 = await load('tenant-a', 'branch-2');
    const tenantAAll = await load('tenant-a');
    const tenantBBranch1 = await load('tenant-b', 'branch-1');

    await expect(cache.invalidate('tenant-a', { scope: 'tenant' })).resolves.toBe(1);

    await expect(load('tenant-a', 'branch-1')).resolves.not.toEqual(tenantABranch1);
    await expect(load('tenant-a', 'branch-2')).resolves.not.toEqual(tenantABranch2);
    await expect(load('tenant-a')).resolves.not.toEqual(tenantAAll);
    await expect(load('tenant-b', 'branch-1')).resolves.toEqual(tenantBBranch1);
  });

  it('does not let an in-flight pre-commit build repopulate the invalidated revision', async () => {
    const store = new SharedMemorySnapshotStore();
    const cache = new FinancialSnapshotCache(buildConfig(), store);
    let releaseOldBuild: ((value: { generation: number }) => void) | undefined;
    const oldBuild = cache.getOrBuild(
      'tenant-a',
      'branch-1',
      () => new Promise<{ generation: number }>(resolve => {
        releaseOldBuild = resolve;
      }),
    );
    await new Promise<void>(resolve => setImmediate(resolve));

    await cache.invalidate('tenant-a', { scope: 'branch', branchId: 'branch-1' });
    const freshBuild = cache.getOrBuild(
      'tenant-a',
      'branch-1',
      async () => ({ generation: 2 }),
    );
    releaseOldBuild?.({ generation: 1 });

    await expect(oldBuild).resolves.toEqual({ generation: 1 });
    await expect(freshBuild).resolves.toEqual({ generation: 2 });
    await expect(cache.getOrBuild(
      'tenant-a',
      'branch-1',
      async () => ({ generation: 3 }),
    )).resolves.toEqual({ generation: 2 });
  });

  it('does not coalesce a post-commit read onto a pre-commit build while Redis is bypassed', async () => {
    const cache = new FinancialSnapshotCache(buildConfig());
    let releaseOldBuild: ((value: { generation: number }) => void) | undefined;
    const oldBuild = cache.getOrBuild(
      'tenant-a',
      'branch-1',
      () => new Promise<{ generation: number }>(resolve => {
        releaseOldBuild = resolve;
      }),
    );
    await new Promise<void>(resolve => setImmediate(resolve));

    await cache.invalidate('tenant-a', { scope: 'branch', branchId: 'branch-1' });
    const freshBuild = cache.getOrBuild(
      'tenant-a',
      'branch-1',
      async () => ({ generation: 2 }),
    );
    releaseOldBuild?.({ generation: 1 });

    await expect(oldBuild).resolves.toEqual({ generation: 1 });
    await expect(freshBuild).resolves.toEqual({ generation: 2 });
  });

  it('treats revision-store failure as non-fatal and switches subsequent reads to fresh-data bypass', async () => {
    const store = new SharedMemorySnapshotStore();
    let cache: FinancialSnapshotCache;
    const onStoreError = jest.fn(() => cache.setStore(undefined));
    cache = new FinancialSnapshotCache(buildConfig(), store, onStoreError);

    await cache.getOrBuild('tenant-a', 'branch-1', async () => ({ generation: 1 }));
    store.failRevisionIncrements = true;

    await expect(cache.invalidate('tenant-a', { scope: 'branch', branchId: 'branch-1' }))
      .resolves.toBe(0);
    await expect(cache.getOrBuild('tenant-a', 'branch-1', async () => ({ generation: 2 })))
      .resolves.toEqual({ generation: 2 });
    expect(onStoreError).toHaveBeenCalledTimes(1);
    expect(cache.getMetrics()).toMatchObject({ storeErrors: 1, bypasses: 1 });
  });
});
