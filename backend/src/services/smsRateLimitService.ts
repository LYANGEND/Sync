import crypto from 'crypto';
import IORedis from 'ioredis';
import { getCurrentTenantId } from '../middleware/tenantContext';
import { systemPrisma } from '../utils/prisma';
import { getSmsRateLimitConfig, SmsRateLimitConfig } from './smsRateLimitConfig';

export type SmsRateLimitBackend = 'disabled' | 'redis' | 'database';
export type SmsRateLimitScope = 'tenant' | 'user';
export type SmsRateLimitRuntimeState =
  | 'uninitialized'
  | 'disabled'
  | 'database'
  | 'redis'
  | 'degraded'
  | 'error'
  | 'stopping';

export interface SmsRateLimitWindow {
  day: string;
  start: Date;
  end: Date;
  expiresAtSeconds: number;
}

export interface SmsRateLimitKeys {
  tenant: string;
  user?: string;
}

export interface SmsUsageCounts {
  tenant: number;
  user?: number;
}

export interface SmsDailyUsageRow {
  tenantId: string;
  sentById: string | null;
  count: number;
}

export interface SmsRateLimitUsageSource {
  readScopeCounts(
    tenantId: string,
    sentById: string | undefined,
    window: SmsRateLimitWindow,
  ): Promise<SmsUsageCounts>;
  readDailyUsage(window: SmsRateLimitWindow): Promise<SmsDailyUsageRow[]>;
}

export interface SmsCounterReservation {
  keys: SmsRateLimitKeys;
  amount: number;
  tenantLimit: number;
  userLimit: number;
  expiresAtSeconds: number;
  baseline?: SmsUsageCounts;
}

export interface SmsCounterReservationResult {
  status: 'allowed' | 'limited' | 'uninitialized';
  limitedScope?: SmsRateLimitScope;
  tenantCount: number;
  userCount?: number;
}

export interface SmsRateLimitCounterStore {
  reserve(reservation: SmsCounterReservation): Promise<SmsCounterReservationResult>;
  reconcileCounter(key: string, minimum: number, expiresAtSeconds: number): Promise<boolean>;
  acquireReconciliationLease(key: string, ttlMs: number): Promise<boolean>;
}

export interface SmsQuotaDecision {
  allowed: boolean;
  backend: SmsRateLimitBackend;
  limit?: number;
  limitedScope?: SmsRateLimitScope;
  tenantCount: number;
  userCount?: number;
  remaining: number;
  resetAt: string;
}

export interface SmsRateLimitMetrics {
  redisReservations: number;
  databaseFallbackChecks: number;
  cacheSeedQueries: number;
  denied: number;
  reconciliationRuns: number;
  reconciliationSkips: number;
  reconciledCounters: number;
  storeErrors: number;
}

export interface SmsRateLimitReconciliationResult {
  ran: boolean;
  sourceRows: number;
  countersExamined: number;
  correctedCounters: number;
}

export interface SmsRateLimitRuntimeStatus extends SmsRateLimitMetrics {
  state: SmsRateLimitRuntimeState;
  backend: 'none' | 'database' | 'redis';
  enabled: boolean;
  required: boolean;
  distributed: boolean;
  tenantLimit: number;
  userLimit: number;
  reconciliationIntervalMs: number;
  lastTransitionAt: string;
  readyAt?: string;
  lastStoreErrorAt?: string;
  lastReconciledAt?: string;
}

export interface SmsRateLimitRedisClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    durationMs: number,
    condition: 'NX',
  ): Promise<string | null>;
}

export class SmsRateLimitUnavailableError extends Error {
  constructor() {
    super('SMS rate-limit service is temporarily unavailable');
    this.name = 'SmsRateLimitUnavailableError';
  }
}

const RESERVE_SMS_QUOTA_SCRIPT = `
local amount = tonumber(ARGV[1])
local tenantMaximum = tonumber(ARGV[2])
local userMaximum = tonumber(ARGV[3])
local expiresAt = tonumber(ARGV[4])
local hasUser = ARGV[5] == '1'
local tenantBaseline = ARGV[6]
local userBaseline = ARGV[7]

local function initializeCounter(key, baseline)
  local raw = redis.call('GET', key)
  local current = tonumber(raw)
  if raw == false or current == nil or current < 0 then
    if baseline == '' then
      return nil
    end
    current = tonumber(baseline)
    redis.call('SET', key, current, 'EXAT', expiresAt)
  elseif redis.call('TTL', key) < 0 then
    redis.call('EXPIREAT', key, expiresAt)
  end
  return current
end

local tenantCurrent = initializeCounter(KEYS[1], tenantBaseline)
if tenantCurrent == nil then
  return {-1, 0, 0, -1}
end

local userCurrent = -1
if hasUser then
  userCurrent = initializeCounter(KEYS[2], userBaseline)
  if userCurrent == nil then
    return {-1, 0, tenantCurrent, -1}
  end
end

if tenantCurrent + amount > tenantMaximum then
  return {0, 1, tenantCurrent, userCurrent}
end
if hasUser and userCurrent + amount > userMaximum then
  return {0, 2, tenantCurrent, userCurrent}
end

local tenantNext = redis.call('INCRBY', KEYS[1], amount)
local userNext = -1
if hasUser then
  userNext = redis.call('INCRBY', KEYS[2], amount)
end
return {1, 0, tenantNext, userNext}
`;

const RECONCILE_SMS_COUNTER_SCRIPT = `
local minimum = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local raw = redis.call('GET', KEYS[1])
local current = tonumber(raw)

if raw == false or current == nil or current < minimum then
  redis.call('SET', KEYS[1], minimum, 'EXAT', expiresAt)
  return 1
end
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIREAT', KEYS[1], expiresAt)
end
return 0
`;

const digest = (value: string): string => crypto
  .createHash('sha256')
  .update(value)
  .digest('hex')
  .slice(0, 24);

const normalizeIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required for SMS rate limiting`);
  return normalized;
};

const toNonNegativeInteger = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export const getSmsRateLimitWindow = (now: Date = new Date()): SmsRateLimitWindow => {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid date is required for SMS rate limiting');
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const dayOfMonth = now.getUTCDate();
  const start = new Date(Date.UTC(year, month, dayOfMonth));
  const end = new Date(Date.UTC(year, month, dayOfMonth + 1));
  return {
    day: start.toISOString().slice(0, 10).replace(/-/g, ''),
    start,
    end,
    expiresAtSeconds: Math.floor(end.getTime() / 1_000),
  };
};

export const buildSmsRateLimitKeys = (
  prefix: string,
  tenantId: string,
  sentById: string | undefined,
  day: string,
): SmsRateLimitKeys => {
  const tenant = normalizeIdentity(tenantId, 'Tenant ID');
  if (!/^\d{8}$/.test(day)) throw new Error('SMS rate-limit day must use YYYYMMDD');
  const tenantHash = digest(tenant);
  const base = `${prefix}:v1:{${tenantHash}}:d:${day}`;
  return {
    tenant: `${base}:tenant`,
    ...(sentById?.trim() ? { user: `${base}:user:${digest(sentById.trim())}` } : {}),
  };
};

export class RedisSmsRateLimitCounterStore implements SmsRateLimitCounterStore {
  constructor(private readonly client: SmsRateLimitRedisClient) {}

  async reserve(reservation: SmsCounterReservation): Promise<SmsCounterReservationResult> {
    const response = await this.client.eval(
      RESERVE_SMS_QUOTA_SCRIPT,
      2,
      reservation.keys.tenant,
      reservation.keys.user || `${reservation.keys.tenant}:no-user`,
      reservation.amount,
      reservation.tenantLimit,
      reservation.userLimit,
      reservation.expiresAtSeconds,
      reservation.keys.user ? 1 : 0,
      reservation.baseline ? reservation.baseline.tenant : '',
      reservation.keys.user && reservation.baseline ? reservation.baseline.user || 0 : '',
    ) as Array<number | string>;

    const outcome = Number(response?.[0]);
    const reason = Number(response?.[1]);
    const tenantCount = toNonNegativeInteger(response?.[2]);
    const userRaw = Number(response?.[3]);
    const userCount = reservation.keys.user && Number.isSafeInteger(userRaw) && userRaw >= 0
      ? userRaw
      : undefined;

    if (outcome === -1) return { status: 'uninitialized', tenantCount, userCount };
    if (outcome === 0) {
      return {
        status: 'limited',
        limitedScope: reason === 2 ? 'user' : 'tenant',
        tenantCount,
        userCount,
      };
    }
    if (outcome !== 1) throw new Error('SMS rate-limit Redis script returned an invalid result');
    return { status: 'allowed', tenantCount, userCount };
  }

  async reconcileCounter(
    key: string,
    minimum: number,
    expiresAtSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.eval(
      RECONCILE_SMS_COUNTER_SCRIPT,
      1,
      key,
      minimum,
      expiresAtSeconds,
    );
    return Number(result) === 1;
  }

  async acquireReconciliationLease(key: string, ttlMs: number): Promise<boolean> {
    return (await this.client.set(key, String(process.pid), 'PX', ttlMs, 'NX')) === 'OK';
  }
}

export class PrismaSmsRateLimitUsageSource implements SmsRateLimitUsageSource {
  async readScopeCounts(
    tenantId: string,
    sentById: string | undefined,
    window: SmsRateLimitWindow,
  ): Promise<SmsUsageCounts> {
    const tenant = normalizeIdentity(tenantId, 'Tenant ID');
    const where = {
      tenantId: tenant,
      channel: 'SMS' as const,
      createdAt: { gte: window.start, lt: window.end },
    };
    const [tenantCount, userCount] = await Promise.all([
      systemPrisma.communicationLog.count({ where }),
      sentById?.trim()
        ? systemPrisma.communicationLog.count({
            where: { ...where, sentById: sentById.trim() },
          })
        : Promise.resolve(undefined),
    ]);
    return { tenant: tenantCount, ...(userCount === undefined ? {} : { user: userCount }) };
  }

  async readDailyUsage(window: SmsRateLimitWindow): Promise<SmsDailyUsageRow[]> {
    const rows = await systemPrisma.communicationLog.groupBy({
      by: ['tenantId', 'sentById'],
      where: {
        channel: 'SMS',
        createdAt: { gte: window.start, lt: window.end },
      },
      _count: { id: true },
    });
    return rows.map(row => ({
      tenantId: row.tenantId,
      sentById: row.sentById,
      count: row._count.id,
    }));
  }
}

export class SmsDailyRateLimiter {
  private store?: SmsRateLimitCounterStore;
  private readonly counters: SmsRateLimitMetrics = {
    redisReservations: 0,
    databaseFallbackChecks: 0,
    cacheSeedQueries: 0,
    denied: 0,
    reconciliationRuns: 0,
    reconciliationSkips: 0,
    reconciledCounters: 0,
    storeErrors: 0,
  };

  constructor(
    readonly config: SmsRateLimitConfig,
    private readonly usageSource: SmsRateLimitUsageSource,
    store?: SmsRateLimitCounterStore,
    private readonly onStoreError: (error: unknown) => void = () => undefined,
  ) {
    this.store = store;
  }

  setStore(store?: SmsRateLimitCounterStore): void {
    this.store = store;
  }

  getMetrics(): SmsRateLimitMetrics {
    return { ...this.counters };
  }

  async reserve(
    tenantId: string,
    sentById?: string,
    amount = 1,
    now: Date = new Date(),
  ): Promise<SmsQuotaDecision> {
    const tenant = normalizeIdentity(tenantId, 'Tenant ID');
    const user = sentById?.trim() || undefined;
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new Error('SMS quota reservation amount must be a positive integer');
    }

    const window = getSmsRateLimitWindow(now);
    if (!this.config.enabled) {
      return {
        allowed: true,
        backend: 'disabled',
        tenantCount: 0,
        remaining: Number.MAX_SAFE_INTEGER,
        resetAt: window.end.toISOString(),
      };
    }

    const keys = buildSmsRateLimitKeys(this.config.prefix, tenant, user, window.day);
    const store = this.store;
    if (store) {
      let result: SmsCounterReservationResult;
      try {
        result = await store.reserve({
          keys,
          amount,
          tenantLimit: this.config.tenantLimit,
          userLimit: this.config.userLimit,
          expiresAtSeconds: window.expiresAtSeconds,
        });
      } catch (error) {
        return this.handleStoreFailureAndFallback(error, tenant, user, amount, window);
      }

      if (result.status === 'uninitialized') {
        this.counters.cacheSeedQueries += 1;
        const baseline = await this.usageSource.readScopeCounts(tenant, user, window);
        try {
          result = await store.reserve({
            keys,
            amount,
            tenantLimit: this.config.tenantLimit,
            userLimit: this.config.userLimit,
            expiresAtSeconds: window.expiresAtSeconds,
            baseline,
          });
        } catch (error) {
          return this.handleStoreFailureAndFallback(error, tenant, user, amount, window);
        }
        if (result.status === 'uninitialized') {
          return this.handleStoreFailureAndFallback(
            new Error('SMS rate-limit counters could not be initialized'),
            tenant,
            user,
            amount,
            window,
          );
        }
      }

      this.counters.redisReservations += 1;
      return this.toDecision(result, 'redis', window);
    }

    if (this.config.required && this.config.redisUrl) {
      throw new SmsRateLimitUnavailableError();
    }
    return this.reserveFromDatabase(tenant, user, amount, window);
  }

  async reconcile(now: Date = new Date()): Promise<SmsRateLimitReconciliationResult> {
    const store = this.store;
    if (!this.config.enabled || !store) {
      this.counters.reconciliationSkips += 1;
      return { ran: false, sourceRows: 0, countersExamined: 0, correctedCounters: 0 };
    }

    const window = getSmsRateLimitWindow(now);
    const leaseKey = `${this.config.prefix}:v1:reconcile:${window.day}`;
    let acquired: boolean;
    try {
      acquired = await store.acquireReconciliationLease(
        leaseKey,
        this.config.reconciliationLeaseMs,
      );
    } catch (error) {
      this.recordStoreFailure(error);
      throw error;
    }
    if (!acquired) {
      this.counters.reconciliationSkips += 1;
      return { ran: false, sourceRows: 0, countersExamined: 0, correctedCounters: 0 };
    }

    const rows = await this.usageSource.readDailyUsage(window);
    const tenantCounts = new Map<string, number>();
    for (const row of rows) {
      const tenantId = normalizeIdentity(row.tenantId, 'Tenant ID');
      const count = toNonNegativeInteger(row.count);
      tenantCounts.set(tenantId, (tenantCounts.get(tenantId) || 0) + count);
    }

    const counters: Array<{ key: string; minimum: number }> = [];
    for (const [tenantId, count] of tenantCounts) {
      counters.push({
        key: buildSmsRateLimitKeys(this.config.prefix, tenantId, undefined, window.day).tenant,
        minimum: count,
      });
    }
    for (const row of rows) {
      if (!row.sentById?.trim()) continue;
      const keys = buildSmsRateLimitKeys(
        this.config.prefix,
        row.tenantId,
        row.sentById,
        window.day,
      );
      counters.push({ key: keys.user!, minimum: toNonNegativeInteger(row.count) });
    }

    let correctedCounters = 0;
    try {
      for (let index = 0; index < counters.length; index += 50) {
        const corrections = await Promise.all(
          counters.slice(index, index + 50).map(counter => store.reconcileCounter(
            counter.key,
            counter.minimum,
            window.expiresAtSeconds,
          )),
        );
        correctedCounters += corrections.filter(Boolean).length;
      }
    } catch (error) {
      this.recordStoreFailure(error);
      throw error;
    }

    this.counters.reconciliationRuns += 1;
    this.counters.reconciledCounters += correctedCounters;
    return {
      ran: true,
      sourceRows: rows.length,
      countersExamined: counters.length,
      correctedCounters,
    };
  }

  private async handleStoreFailureAndFallback(
    error: unknown,
    tenantId: string,
    sentById: string | undefined,
    amount: number,
    window: SmsRateLimitWindow,
  ): Promise<SmsQuotaDecision> {
    this.recordStoreFailure(error);
    if (this.config.required) throw new SmsRateLimitUnavailableError();
    return this.reserveFromDatabase(tenantId, sentById, amount, window);
  }

  private recordStoreFailure(error: unknown): void {
    this.counters.storeErrors += 1;
    this.onStoreError(error);
  }

  private async reserveFromDatabase(
    tenantId: string,
    sentById: string | undefined,
    amount: number,
    window: SmsRateLimitWindow,
  ): Promise<SmsQuotaDecision> {
    this.counters.databaseFallbackChecks += 1;
    const counts = await this.usageSource.readScopeCounts(tenantId, sentById, window);
    const tenantCount = toNonNegativeInteger(counts.tenant);
    const userCount = sentById ? toNonNegativeInteger(counts.user) : undefined;

    if (tenantCount + amount > this.config.tenantLimit) {
      this.counters.denied += 1;
      return this.buildDecision(
        false,
        'database',
        window,
        tenantCount,
        userCount,
        'tenant',
      );
    }
    if (sentById && (userCount || 0) + amount > this.config.userLimit) {
      this.counters.denied += 1;
      return this.buildDecision(
        false,
        'database',
        window,
        tenantCount,
        userCount,
        'user',
      );
    }

    return this.buildDecision(
      true,
      'database',
      window,
      tenantCount + amount,
      userCount === undefined ? undefined : userCount + amount,
    );
  }

  private toDecision(
    result: SmsCounterReservationResult,
    backend: SmsRateLimitBackend,
    window: SmsRateLimitWindow,
  ): SmsQuotaDecision {
    const allowed = result.status === 'allowed';
    if (!allowed) this.counters.denied += 1;
    return this.buildDecision(
      allowed,
      backend,
      window,
      result.tenantCount,
      result.userCount,
      result.limitedScope,
    );
  }

  private buildDecision(
    allowed: boolean,
    backend: SmsRateLimitBackend,
    window: SmsRateLimitWindow,
    tenantCount: number,
    userCount: number | undefined,
    limitedScope?: SmsRateLimitScope,
  ): SmsQuotaDecision {
    const tenantRemaining = Math.max(0, this.config.tenantLimit - tenantCount);
    const userRemaining = userCount === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, this.config.userLimit - userCount);
    return {
      allowed,
      backend,
      ...(limitedScope
        ? {
            limitedScope,
            limit: limitedScope === 'user' ? this.config.userLimit : this.config.tenantLimit,
          }
        : {}),
      tenantCount,
      ...(userCount === undefined ? {} : { userCount }),
      remaining: Math.min(tenantRemaining, userRemaining),
      resetAt: window.end.toISOString(),
    };
  }
}

let runtimeConfig = getSmsRateLimitConfig();
let runtimeState: SmsRateLimitRuntimeState = runtimeConfig.enabled
  ? 'uninitialized'
  : 'disabled';
let runtimeConnection: IORedis | undefined;
let runtimeStore: RedisSmsRateLimitCounterStore | undefined;
let redisHealthy = false;
let lastTransitionAt = new Date().toISOString();
let readyAt: string | undefined;
let lastStoreErrorAt: string | undefined;
let lastReconciledAt: string | undefined;
let lastStoreWarningAt = 0;
let nextRecoveryAttemptAt = 0;
let recoveryPromise: Promise<void> | undefined;
let reconciliationPromise: Promise<SmsRateLimitReconciliationResult> | undefined;
let reconciliationTimer: NodeJS.Timeout | undefined;
let runtimeLimiter: SmsDailyRateLimiter;

const setRuntimeState = (state: SmsRateLimitRuntimeState): void => {
  if (runtimeState !== state) lastTransitionAt = new Date().toISOString();
  runtimeState = state;
};

const stopReconciliationTimer = (): void => {
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  reconciliationTimer = undefined;
};

const markStoreFailure = (error: unknown): void => {
  if (runtimeState === 'stopping' || runtimeState === 'uninitialized') return;
  redisHealthy = false;
  runtimeLimiter?.setStore(undefined);
  stopReconciliationTimer();
  lastStoreErrorAt = new Date().toISOString();
  setRuntimeState('degraded');

  const now = Date.now();
  if (now - lastStoreWarningAt >= 60_000) {
    lastStoreWarningAt = now;
    console.error(JSON.stringify({
      event: 'sms.rate-limit.redis-error',
      timestamp: lastStoreErrorAt,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
};

const createRuntimeLimiter = (config: SmsRateLimitConfig): SmsDailyRateLimiter =>
  new SmsDailyRateLimiter(
    config,
    new PrismaSmsRateLimitUsageSource(),
    undefined,
    markStoreFailure,
  );

runtimeLimiter = createRuntimeLimiter(runtimeConfig);

const startReconciliationTimer = (): void => {
  stopReconciliationTimer();
  if (runtimeState !== 'redis') return;
  reconciliationTimer = setInterval(() => {
    void runSmsRateLimitReconciliation().catch(error => {
      console.error(JSON.stringify({
        event: 'sms.rate-limit.reconciliation-error',
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }));
    });
  }, runtimeConfig.reconciliationIntervalMs);
  reconciliationTimer.unref();
};

const activateRedisStore = (connection: IORedis): void => {
  if (connection !== runtimeConnection || connection.status !== 'ready') return;
  runtimeStore ||= new RedisSmsRateLimitCounterStore(connection);
  runtimeLimiter.setStore(runtimeStore);
  redisHealthy = true;
  readyAt = new Date().toISOString();
  setRuntimeState('redis');
  startReconciliationTimer();
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
      activateRedisStore(connection);
    } catch (error) {
      markStoreFailure(error);
      return;
    }

    try {
      await runSmsRateLimitReconciliation();
    } catch (error) {
      console.error(JSON.stringify({
        event: 'sms.rate-limit.reconciliation-error',
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }));
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
  reconciliationPromise = undefined;
  stopReconciliationTimer();
  runtimeLimiter.setStore(undefined);
  if (!connection) return;

  connection.removeAllListeners();
  try {
    if (connection.status === 'ready') await connection.quit();
    else connection.disconnect(false);
  } catch {
    connection.disconnect(false);
  }
};

export const initializeSmsRateLimitRuntime = async (
  config: SmsRateLimitConfig = getSmsRateLimitConfig(),
): Promise<SmsRateLimitRuntimeStatus> => {
  setRuntimeState('stopping');
  await closeRedisConnection();

  runtimeConfig = config;
  runtimeLimiter = createRuntimeLimiter(config);
  lastStoreErrorAt = undefined;
  lastReconciledAt = undefined;
  lastStoreWarningAt = 0;
  nextRecoveryAttemptAt = 0;
  readyAt = undefined;

  if (!config.enabled) {
    setRuntimeState('disabled');
    return getSmsRateLimitRuntimeStatus();
  }
  if (!config.redisUrl) {
    setRuntimeState('database');
    return getSmsRateLimitRuntimeStatus();
  }

  setRuntimeState('database');

  const connection = new IORedis(config.redisUrl, {
    connectionName: `${config.prefix}-counter-${process.pid}`,
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
      markStoreFailure(new Error('SMS rate-limit Redis connection closed'));
    }
  });

  try {
    await connection.connect();
    await connection.ping();
    activateRedisStore(connection);
    void runSmsRateLimitReconciliation().catch(error => {
      console.error(JSON.stringify({
        event: 'sms.rate-limit.reconciliation-error',
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }));
    });
  } catch (error) {
    markStoreFailure(error);
    if (config.required) {
      await closeRedisConnection();
      setRuntimeState('error');
      throw new SmsRateLimitUnavailableError();
    }
  }
  return getSmsRateLimitRuntimeStatus();
};

export const shutdownSmsRateLimitRuntime = async (): Promise<void> => {
  setRuntimeState('stopping');
  await closeRedisConnection();
  setRuntimeState('uninitialized');
};

export const getSmsRateLimitRuntimeStatus = (): SmsRateLimitRuntimeStatus => ({
  state: runtimeState,
  backend: runtimeState === 'redis'
    ? 'redis'
    : runtimeState === 'database' || runtimeState === 'degraded'
      ? 'database'
      : 'none',
  enabled: runtimeConfig.enabled,
  required: runtimeConfig.required,
  distributed: runtimeState === 'redis',
  tenantLimit: runtimeConfig.tenantLimit,
  userLimit: runtimeConfig.userLimit,
  reconciliationIntervalMs: runtimeConfig.reconciliationIntervalMs,
  lastTransitionAt,
  ...(readyAt ? { readyAt } : {}),
  ...(lastStoreErrorAt ? { lastStoreErrorAt } : {}),
  ...(lastReconciledAt ? { lastReconciledAt } : {}),
  ...runtimeLimiter.getMetrics(),
});

export const runSmsRateLimitReconciliation = async (): Promise<SmsRateLimitReconciliationResult> => {
  if (reconciliationPromise) return reconciliationPromise;
  if (runtimeState !== 'redis') {
    return { ran: false, sourceRows: 0, countersExamined: 0, correctedCounters: 0 };
  }

  reconciliationPromise = runtimeLimiter.reconcile().then(result => {
    if (result.ran) {
      lastReconciledAt = new Date().toISOString();
      console.log(JSON.stringify({
        event: 'sms.rate-limit.reconciled',
        timestamp: lastReconciledAt,
        sourceRows: result.sourceRows,
        countersExamined: result.countersExamined,
        correctedCounters: result.correctedCounters,
      }));
    }
    return result;
  }).finally(() => {
    reconciliationPromise = undefined;
  });
  return reconciliationPromise;
};

export const reserveSmsQuota = async (
  sentById?: string,
  amount = 1,
): Promise<SmsQuotaDecision> => {
  const tenantId = getCurrentTenantId();
  if (!tenantId) throw new Error('Tenant context is required to reserve SMS quota');
  if (runtimeConfig.enabled && runtimeState !== 'redis' && runtimeConfig.redisUrl) {
    await attemptRedisRecovery();
  }
  return runtimeLimiter.reserve(tenantId, sentById, amount);
};
