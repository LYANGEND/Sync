import crypto from 'crypto';
import IORedis from 'ioredis';
import {
  FinancialSnapshotCacheConfig,
  getFinancialSnapshotCacheConfig,
} from './financialSnapshotCacheConfig';

export type FinancialSnapshotCacheRuntimeState =
  | 'uninitialized'
  | 'disabled'
  | 'bypass'
  | 'redis'
  | 'degraded';

export interface FinancialSnapshotCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(keys: string[]): Promise<number>;
  readRevisions(key: string, fields: string[]): Promise<number[]>;
  incrementRevisions(key: string, fields: string[]): Promise<number[]>;
}

export interface FinancialSnapshotCacheMetrics {
  hits: number;
  misses: number;
  bypasses: number;
  coalescedBuilds: number;
  writes: number;
  invalidEntries: number;
  oversizedEntries: number;
  storeErrors: number;
  invalidationEvents: number;
  invalidatedScopes: number;
  hitRatio: number;
}

export interface FinancialSnapshotCacheRuntimeStatus extends FinancialSnapshotCacheMetrics {
  state: FinancialSnapshotCacheRuntimeState;
  backend: 'none' | 'redis';
  enabled: boolean;
  distributed: boolean;
  ttlSeconds: number;
  maxValueBytes: number;
  pendingInvalidationTenants: number;
  lastTransitionAt: string;
  readyAt?: string;
  lastStoreErrorAt?: string;
}

interface CacheEnvelope<T> {
  schemaVersion: 1;
  cachedAt: string;
  value: T;
}

type CacheBuilder<T> = () => Promise<T>;
type StoreErrorHandler = (error: unknown) => void;

export type FinancialSnapshotCacheInvalidation =
  | { scope: 'branch'; branchId: string }
  | { scope: 'tenant' };

export type FinancialSnapshotMutationSource = `${string}.${string}`;

export interface FinancialSnapshotMutationInvalidation {
  tenantId: string;
  branchId?: string | null;
  scope?: 'branch' | 'tenant';
  source: FinancialSnapshotMutationSource;
}

export interface FinancialSnapshotMutationInvalidationResult {
  success: boolean;
  scope: 'branch' | 'tenant';
  invalidatedScopes: number;
}

const digest = (value: string): string => crypto
  .createHash('sha256')
  .update(value)
  .digest('hex');

const normalizeRequiredIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required for financial snapshot caching`);
  return normalized;
};

const getBranchScope = (branchId?: string): string => branchId?.trim()
  ? `branch:${branchId.trim()}`
  : 'all-branches';

const buildFinancialSnapshotRevisionKey = (
  prefix: string,
  tenantId: string,
): string => {
  const tenant = normalizeRequiredIdentity(tenantId, 'Tenant ID');
  return `${prefix}:v1:t:${digest(tenant)}:revisions`;
};

const buildFinancialSnapshotScopeRevisionField = (branchId?: string): string =>
  `scope:${digest(getBranchScope(branchId))}`;

export const buildFinancialSnapshotCacheKey = (
  prefix: string,
  tenantId: string,
  branchId?: string,
): string => {
  const tenant = normalizeRequiredIdentity(tenantId, 'Tenant ID');
  const branchScope = getBranchScope(branchId);
  return `${prefix}:v1:t:${digest(tenant)}:s:${digest(branchScope)}`;
};

const buildRevisionedFinancialSnapshotCacheKey = (
  baseKey: string,
  tenantRevision: number,
  scopeRevision: number,
): string => tenantRevision === 0 && scopeRevision === 0
  ? baseKey
  : `${baseKey}:r:${tenantRevision}:${scopeRevision}`;

const isCacheEnvelope = <T>(value: unknown): value is CacheEnvelope<T> => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CacheEnvelope<T>>;
  return candidate.schemaVersion === 1
    && typeof candidate.cachedAt === 'string'
    && Object.prototype.hasOwnProperty.call(candidate, 'value');
};

export class RedisFinancialSnapshotCacheStore implements FinancialSnapshotCacheStore {
  constructor(private readonly client: IORedis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async readRevisions(key: string, fields: string[]): Promise<number[]> {
    if (fields.length === 0) return [];
    const values = await this.client.hmget(key, ...fields);
    return values.map(value => {
      const revision = Number(value || 0);
      return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
    });
  }

  async incrementRevisions(key: string, fields: string[]): Promise<number[]> {
    if (fields.length === 0) return [];

    const transaction = this.client.multi();
    for (const field of fields) transaction.hincrby(key, field, 1);
    const results = await transaction.exec();
    if (!results) throw new Error('Financial snapshot revision transaction was aborted');

    return results.map(([error, value]) => {
      if (error) throw error;
      const revision = Number(value);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new Error('Financial snapshot revision increment returned an invalid value');
      }
      return revision;
    });
  }
}

export class FinancialSnapshotCache {
  private store?: FinancialSnapshotCacheStore;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly counters = {
    hits: 0,
    misses: 0,
    bypasses: 0,
    coalescedBuilds: 0,
    writes: 0,
    invalidEntries: 0,
    oversizedEntries: 0,
    storeErrors: 0,
    invalidationEvents: 0,
    invalidatedScopes: 0,
  };

  constructor(
    readonly config: FinancialSnapshotCacheConfig,
    store?: FinancialSnapshotCacheStore,
    private readonly onStoreError: StoreErrorHandler = () => undefined,
  ) {
    this.store = store;
  }

  setStore(store?: FinancialSnapshotCacheStore): void {
    this.store = store;
  }

  reset(): void {
    this.store = undefined;
    this.inFlight.clear();
  }

  getMetrics(): FinancialSnapshotCacheMetrics {
    const cacheLookups = this.counters.hits + this.counters.misses;
    return {
      ...this.counters,
      hitRatio: cacheLookups > 0
        ? Number((this.counters.hits / cacheLookups).toFixed(4))
        : 0,
    };
  }

  async getOrBuild<T>(
    tenantId: string,
    branchId: string | undefined,
    builder: CacheBuilder<T>,
  ): Promise<T> {
    const baseKey = buildFinancialSnapshotCacheKey(this.config.prefix, tenantId, branchId);
    const store = this.store;
    if (!this.config.enabled || !store) {
      this.counters.bypasses += 1;
      return this.buildOnce(baseKey, builder);
    }

    let key: string;
    try {
      const revisions = await store.readRevisions(
        buildFinancialSnapshotRevisionKey(this.config.prefix, tenantId),
        ['tenant', buildFinancialSnapshotScopeRevisionField(branchId)],
      );
      key = buildRevisionedFinancialSnapshotCacheKey(
        baseKey,
        revisions[0] || 0,
        revisions[1] || 0,
      );

      const pending = this.inFlight.get(key) as Promise<T> | undefined;
      if (pending) {
        this.counters.coalescedBuilds += 1;
        return pending;
      }

      const cached = await store.get(key);
      if (cached !== null) {
        try {
          const parsed: unknown = JSON.parse(cached);
          if (isCacheEnvelope<T>(parsed)) {
            this.counters.hits += 1;
            return parsed.value;
          }
        } catch {
          // The invalid entry is removed below and rebuilt from the database.
        }

        this.counters.invalidEntries += 1;
        await store.delete([key]);
      }
      this.counters.misses += 1;
    } catch (error) {
      this.handleStoreError(error);
      this.counters.bypasses += 1;
      return this.buildOnce(baseKey, builder);
    }

    return this.buildOnce(key, async () => {
      const value = await builder();
      let serialized: string;
      try {
        const envelope: CacheEnvelope<T> = {
          schemaVersion: 1,
          cachedAt: new Date().toISOString(),
          value,
        };
        serialized = JSON.stringify(envelope);
      } catch {
        this.counters.invalidEntries += 1;
        return value;
      }

      if (Buffer.byteLength(serialized, 'utf8') > this.config.maxValueBytes) {
        this.counters.oversizedEntries += 1;
        return value;
      }

      if (this.store !== store) return value;
      try {
        await store.set(key, serialized, this.config.ttlSeconds);
        this.counters.writes += 1;
      } catch (error) {
        this.handleStoreError(error);
      }
      return value;
    });
  }

  async invalidate(
    tenantId: string,
    invalidation: FinancialSnapshotCacheInvalidation,
  ): Promise<number> {
    this.clearInFlightScopes(tenantId, invalidation);
    const store = this.store;
    if (!this.config.enabled || !store) return 0;

    const revisionKey = buildFinancialSnapshotRevisionKey(this.config.prefix, tenantId);
    const fields = invalidation.scope === 'tenant'
      ? ['tenant']
      : [
          buildFinancialSnapshotScopeRevisionField(
            normalizeRequiredIdentity(invalidation.branchId, 'Branch ID'),
          ),
          buildFinancialSnapshotScopeRevisionField(undefined),
        ];

    try {
      await store.incrementRevisions(revisionKey, fields);
      this.counters.invalidationEvents += 1;
      this.counters.invalidatedScopes += fields.length;
      return fields.length;
    } catch (error) {
      this.handleStoreError(error);
      return 0;
    }
  }

  private clearInFlightScopes(
    tenantId: string,
    invalidation: FinancialSnapshotCacheInvalidation,
  ): void {
    const tenant = normalizeRequiredIdentity(tenantId, 'Tenant ID');
    const baseKeys = invalidation.scope === 'tenant'
      ? undefined
      : [
          buildFinancialSnapshotCacheKey(this.config.prefix, tenant, invalidation.branchId),
          buildFinancialSnapshotCacheKey(this.config.prefix, tenant, undefined),
        ];
    const tenantKeyPrefix = `${this.config.prefix}:v1:t:${digest(tenant)}:s:`;

    for (const key of this.inFlight.keys()) {
      const matches = baseKeys
        ? baseKeys.some(baseKey => key === baseKey || key.startsWith(`${baseKey}:r:`))
        : key.startsWith(tenantKeyPrefix);
      if (matches) this.inFlight.delete(key);
    }
  }

  private async buildOnce<T>(key: string, builder: CacheBuilder<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      this.counters.coalescedBuilds += 1;
      return existing;
    }

    const pending = builder().finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }

  private handleStoreError(error: unknown): void {
    this.counters.storeErrors += 1;
    this.onStoreError(error);
  }
}

let runtimeConfig = getFinancialSnapshotCacheConfig();
let runtimeState: FinancialSnapshotCacheRuntimeState = runtimeConfig.enabled
  ? 'uninitialized'
  : 'disabled';
let runtimeConnection: IORedis | undefined;
let runtimeStore: RedisFinancialSnapshotCacheStore | undefined;
let redisHealthy = false;
let lastTransitionAt = new Date().toISOString();
let readyAt: string | undefined;
let lastStoreErrorAt: string | undefined;
let lastStoreWarningAt = 0;
let nextRecoveryAttemptAt = 0;
let recoveryPromise: Promise<void> | undefined;
const pendingTenantInvalidations = new Map<string, number>();
let runtimeCache: FinancialSnapshotCache;

const setRuntimeState = (state: FinancialSnapshotCacheRuntimeState): void => {
  if (runtimeState !== state) lastTransitionAt = new Date().toISOString();
  runtimeState = state;
};

const markStoreFailure = (error: unknown): void => {
  redisHealthy = false;
  runtimeCache?.setStore(undefined);
  lastStoreErrorAt = new Date().toISOString();
  setRuntimeState('degraded');

  const now = Date.now();
  if (now - lastStoreWarningAt >= 60_000) {
    lastStoreWarningAt = now;
    console.error(JSON.stringify({
      event: 'ai.financial-snapshot-cache.redis-error',
      timestamp: lastStoreErrorAt,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
};

const createRuntimeCache = (config: FinancialSnapshotCacheConfig): FinancialSnapshotCache =>
  new FinancialSnapshotCache(config, undefined, markStoreFailure);

runtimeCache = createRuntimeCache(runtimeConfig);

const activateRedisStore = (connection: IORedis): void => {
  if (connection !== runtimeConnection || connection.status !== 'ready') return;
  runtimeStore ||= new RedisFinancialSnapshotCacheStore(connection);
  runtimeCache.setStore(runtimeStore);
  redisHealthy = true;
  readyAt = new Date().toISOString();
  setRuntimeState('redis');
};

const queuePendingTenantInvalidation = (tenantId: string): void => {
  const tenant = normalizeRequiredIdentity(tenantId, 'Tenant ID');
  pendingTenantInvalidations.set(
    tenant,
    (pendingTenantInvalidations.get(tenant) || 0) + 1,
  );
};

const flushPendingTenantInvalidations = async (
  store: FinancialSnapshotCacheStore,
): Promise<void> => {
  while (pendingTenantInvalidations.size > 0) {
    const pending = [...pendingTenantInvalidations.entries()];
    for (const [tenantId, queuedCount] of pending) {
      await store.incrementRevisions(
        buildFinancialSnapshotRevisionKey(runtimeConfig.prefix, tenantId),
        ['tenant'],
      );

      const currentCount = pendingTenantInvalidations.get(tenantId) || 0;
      if (currentCount <= queuedCount) pendingTenantInvalidations.delete(tenantId);
      else pendingTenantInvalidations.set(tenantId, currentCount - queuedCount);
    }
  }
};

const attemptRedisRecovery = (): Promise<void> => {
  const connection = runtimeConnection;
  const now = Date.now();
  if (!connection || redisHealthy || now < nextRecoveryAttemptAt) {
    return recoveryPromise || Promise.resolve();
  }
  if (recoveryPromise) return recoveryPromise;

  nextRecoveryAttemptAt = now + 5_000;
  recoveryPromise = (async () => {
    try {
      if (connection.status === 'wait' || connection.status === 'end') {
        await connection.connect();
      }
      await connection.ping();
      const recoveryStore = runtimeStore || new RedisFinancialSnapshotCacheStore(connection);
      await flushPendingTenantInvalidations(recoveryStore);
      activateRedisStore(connection);
    } catch (error) {
      markStoreFailure(error);
    }
  })().finally(() => {
    recoveryPromise = undefined;
  });
  return recoveryPromise;
};

const closeRedisConnection = async (): Promise<void> => {
  const connection = runtimeConnection;
  runtimeConnection = undefined;
  runtimeStore = undefined;
  redisHealthy = false;
  recoveryPromise = undefined;
  if (!connection) return;

  connection.removeAllListeners();
  try {
    if (connection.status === 'ready') await connection.quit();
    else connection.disconnect(false);
  } catch {
    connection.disconnect(false);
  }
};

export const initializeFinancialSnapshotCacheRuntime = async (
  config: FinancialSnapshotCacheConfig = getFinancialSnapshotCacheConfig(),
): Promise<FinancialSnapshotCacheRuntimeStatus> => {
  await closeRedisConnection();
  runtimeCache.reset();

  runtimeConfig = config;
  runtimeCache = createRuntimeCache(config);
  lastStoreErrorAt = undefined;
  lastStoreWarningAt = 0;
  nextRecoveryAttemptAt = 0;
  pendingTenantInvalidations.clear();
  readyAt = undefined;

  if (!config.enabled) {
    setRuntimeState('disabled');
    return getFinancialSnapshotCacheStatus();
  }

  if (!config.redisUrl) {
    setRuntimeState('bypass');
    return getFinancialSnapshotCacheStatus();
  }

  const connection = new IORedis(config.redisUrl, {
    connectionName: `${config.prefix}-cache-${process.pid}`,
    connectTimeout: config.connectTimeoutMs,
    disconnectTimeout: Math.min(config.connectTimeoutMs, 500),
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  runtimeConnection = connection;
  connection.on('error', markStoreFailure);
  connection.on('close', () => {
    if (connection === runtimeConnection) {
      markStoreFailure(new Error('Financial snapshot cache Redis connection closed'));
    }
  });

  try {
    await connection.connect();
    await connection.ping();
    await flushPendingTenantInvalidations(new RedisFinancialSnapshotCacheStore(connection));
    activateRedisStore(connection);
  } catch (error) {
    markStoreFailure(error);
  }
  return getFinancialSnapshotCacheStatus();
};

export const shutdownFinancialSnapshotCacheRuntime = async (): Promise<void> => {
  await closeRedisConnection();
  runtimeCache.reset();
  pendingTenantInvalidations.clear();
  setRuntimeState('uninitialized');
};

export const getFinancialSnapshotCacheStatus = (): FinancialSnapshotCacheRuntimeStatus => ({
  state: runtimeState,
  backend: runtimeState === 'redis' ? 'redis' : 'none',
  enabled: runtimeConfig.enabled,
  distributed: runtimeState === 'redis',
  ttlSeconds: runtimeConfig.ttlSeconds,
  maxValueBytes: runtimeConfig.maxValueBytes,
  pendingInvalidationTenants: pendingTenantInvalidations.size,
  lastTransitionAt,
  ...(readyAt ? { readyAt } : {}),
  ...(lastStoreErrorAt ? { lastStoreErrorAt } : {}),
  ...runtimeCache.getMetrics(),
});

export const getOrBuildFinancialSnapshot = async <T>(
  tenantId: string,
  branchId: string | undefined,
  builder: CacheBuilder<T>,
): Promise<T> => {
  if (runtimeState !== 'redis') void attemptRedisRecovery();
  return runtimeCache.getOrBuild(tenantId, branchId, builder);
};

export const invalidateFinancialSnapshotCache = async (
  tenantId: string,
  invalidation: FinancialSnapshotCacheInvalidation,
): Promise<number> => {
  if (runtimeState !== 'redis') {
    await runtimeCache.invalidate(tenantId, invalidation);
    if (runtimeConfig.enabled && runtimeConfig.redisUrl) {
      queuePendingTenantInvalidation(tenantId);
      void attemptRedisRecovery();
    }
    return 0;
  }

  const invalidatedScopes = await runtimeCache.invalidate(tenantId, invalidation);
  if (invalidatedScopes === 0 && runtimeConfig.enabled && runtimeConfig.redisUrl) {
    queuePendingTenantInvalidation(tenantId);
    void attemptRedisRecovery();
  }
  return invalidatedScopes;
};

/**
 * Await this immediately after a financial database mutation commits. Cache
 * invalidation is deliberately non-fatal: a Redis failure degrades reads to
 * fresh database reconstruction instead of rolling back durable business data.
 */
export const invalidateFinancialSnapshotAfterMutation = async (
  mutation: FinancialSnapshotMutationInvalidation,
): Promise<FinancialSnapshotMutationInvalidationResult> => {
  const branchId = mutation.branchId?.trim() || undefined;
  const scope = mutation.scope || (branchId ? 'branch' : 'tenant');

  try {
    const invalidatedScopes = await invalidateFinancialSnapshotCache(
      mutation.tenantId,
      scope === 'branch'
        ? { scope, branchId: normalizeRequiredIdentity(branchId || '', 'Branch ID') }
        : { scope },
    );

    if (invalidatedScopes > 0) {
      console.log(JSON.stringify({
        event: 'ai.financial-snapshot-cache.invalidated',
        source: mutation.source,
        scope,
        invalidatedScopes,
      }));
      return { success: true, scope, invalidatedScopes };
    }

    const success = runtimeState !== 'degraded';
    if (!success) {
      console.error(JSON.stringify({
        event: 'ai.financial-snapshot-cache.invalidation-degraded',
        source: mutation.source,
        scope,
      }));
    }
    return { success, scope, invalidatedScopes };
  } catch (error) {
    console.error(JSON.stringify({
      event: 'ai.financial-snapshot-cache.invalidation-error',
      source: mutation.source,
      scope,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }));
    return { success: false, scope, invalidatedScopes: 0 };
  }
};
