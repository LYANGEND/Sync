import IORedis from 'ioredis';
import {
  buildFinancialSnapshotCacheKey,
  FinancialSnapshotCache,
  RedisFinancialSnapshotCacheStore,
} from '../src/cache/financialSnapshotCache';
import { getFinancialSnapshotCacheConfig } from '../src/cache/financialSnapshotCacheConfig';

const deleteProbeKeys = async (client: IORedis, prefix: string): Promise<void> => {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      'MATCH',
      `${prefix}:*`,
      'COUNT',
      100,
    );
    cursor = nextCursor;
    if (keys.length > 0) await client.del(...keys);
  } while (cursor !== '0');
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const redisUrl = process.env.AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL || process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Set AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL or REDIS_URL before running this probe');
  }

  const prefix = `sync:ai-financial-snapshot:probe:${process.pid}:${Date.now()}`;
  const config = getFinancialSnapshotCacheConfig({
    ...process.env,
    AI_FINANCIAL_SNAPSHOT_CACHE_ENABLED: 'true',
    AI_FINANCIAL_SNAPSHOT_CACHE_REDIS_URL: redisUrl,
    AI_FINANCIAL_SNAPSHOT_CACHE_PREFIX: prefix,
    AI_FINANCIAL_SNAPSHOT_CACHE_TTL_SECONDS: '60',
  });
  const clients = [0, 1].map(() => {
    const client = new IORedis(redisUrl, {
      connectTimeout: config.connectTimeoutMs,
      disconnectTimeout: Math.min(config.connectTimeoutMs, 500),
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    return client;
  });

  try {
    await Promise.all(clients.map(async client => {
      await client.connect();
      await client.ping();
    }));

    const replicaA = new FinancialSnapshotCache(
      config,
      new RedisFinancialSnapshotCacheStore(clients[0]),
    );
    const replicaB = new FinancialSnapshotCache(
      config,
      new RedisFinancialSnapshotCacheStore(clients[1]),
    );
    let builds = 0;
    const build = async (scope: string) => ({
      scope,
      generation: ++builds,
      generatedAt: new Date().toISOString(),
    });

    const first = await replicaA.getOrBuild(
      'tenant-probe-a',
      'branch-probe-1',
      () => build('tenant-a/branch-1'),
    );
    const sharedHit = await replicaB.getOrBuild(
      'tenant-probe-a',
      'branch-probe-1',
      () => build('must-not-run'),
    );
    const otherBranch = await replicaB.getOrBuild(
      'tenant-probe-a',
      'branch-probe-2',
      () => build('tenant-a/branch-2'),
    );
    const otherTenant = await replicaA.getOrBuild(
      'tenant-probe-b',
      'branch-probe-1',
      () => build('tenant-b/branch-1'),
    );
    const allBranches = await replicaA.getOrBuild(
      'tenant-probe-a',
      undefined,
      () => build('tenant-a/all-branches'),
    );

    const sharedKey = buildFinancialSnapshotCacheKey(
      prefix,
      'tenant-probe-a',
      'branch-probe-1',
    );
    const ttlSeconds = await clients[0].ttl(sharedKey);

    const branchInvalidatedScopes = await replicaA.invalidate(
      'tenant-probe-a',
      { scope: 'branch', branchId: 'branch-probe-1' },
    );
    const rebuiltBranch = await replicaB.getOrBuild(
      'tenant-probe-a',
      'branch-probe-1',
      () => build('tenant-a/branch-1-after-invalidation'),
    );
    const rebuiltAllBranches = await replicaB.getOrBuild(
      'tenant-probe-a',
      undefined,
      () => build('tenant-a/all-branches-after-invalidation'),
    );
    const preservedSibling = await replicaB.getOrBuild(
      'tenant-probe-a',
      'branch-probe-2',
      () => build('must-not-run'),
    );

    const tenantInvalidatedScopes = await replicaA.invalidate(
      'tenant-probe-a',
      { scope: 'tenant' },
    );
    const rebuiltSibling = await replicaB.getOrBuild(
      'tenant-probe-a',
      'branch-probe-2',
      () => build('tenant-a/branch-2-after-tenant-invalidation'),
    );
    const preservedOtherTenant = await replicaB.getOrBuild(
      'tenant-probe-b',
      'branch-probe-1',
      () => build('must-not-run'),
    );

    assert(builds === 7, `Expected seven isolated/invalidation builds, received ${builds}`);
    assert(JSON.stringify(first) === JSON.stringify(sharedHit), 'Second replica did not reuse the shared snapshot');
    assert(otherBranch.scope === 'tenant-a/branch-2', 'Branch scope was not isolated');
    assert(otherTenant.scope === 'tenant-b/branch-1', 'Tenant scope was not isolated');
    assert(allBranches.scope === 'tenant-a/all-branches', 'All-branch scope was not isolated');
    assert(ttlSeconds > 0 && ttlSeconds <= config.ttlSeconds, `Unexpected Redis TTL: ${ttlSeconds}`);
    assert(branchInvalidatedScopes === 2, 'Branch invalidation did not advance both affected scopes');
    assert(rebuiltBranch.scope.endsWith('after-invalidation'), 'Affected branch was not rebuilt');
    assert(rebuiltAllBranches.scope.endsWith('after-invalidation'), 'All-branches view was not rebuilt');
    assert(JSON.stringify(preservedSibling) === JSON.stringify(otherBranch), 'Sibling branch was unnecessarily invalidated');
    assert(tenantInvalidatedScopes === 1, 'Tenant invalidation did not advance the tenant revision');
    assert(rebuiltSibling.scope.endsWith('after-tenant-invalidation'), 'Tenant-wide invalidation did not rebuild sibling branch');
    assert(JSON.stringify(preservedOtherTenant) === JSON.stringify(otherTenant), 'Tenant-wide invalidation crossed tenant boundary');

    console.log(JSON.stringify({
      event: 'ai.financial-snapshot-cache.validation.passed',
      replicas: 2,
      builds,
      sharedReplicaHit: replicaB.getMetrics().hits >= 1,
      tenantIsolated: true,
      branchIsolated: true,
      allBranchesIsolated: true,
      branchInvalidation: true,
      tenantInvalidation: true,
      crossTenantPreserved: true,
      ttlSeconds,
    }));
  } finally {
    await deleteProbeKeys(clients[0], prefix).catch(() => undefined);
    await Promise.allSettled(clients.map(client => client.quit()));
  }
};

main().catch(error => {
  console.error('[FinancialSnapshotCacheValidation] Failed:', error);
  process.exitCode = 1;
});
