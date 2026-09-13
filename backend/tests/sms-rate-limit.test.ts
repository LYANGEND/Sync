import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { prisma } from '../src/utils/prisma';
import * as communicationLogService from '../src/services/communicationLogService';
import smsService from '../src/services/smsService';
import { getSmsRateLimitConfig, SmsRateLimitConfig } from '../src/services/smsRateLimitConfig';
import {
  buildSmsRateLimitKeys,
  SmsCounterReservation,
  SmsCounterReservationResult,
  SmsDailyRateLimiter,
  SmsDailyUsageRow,
  SmsRateLimitCounterStore,
  SmsRateLimitUnavailableError,
  SmsRateLimitUsageSource,
  SmsRateLimitWindow,
  SmsUsageCounts,
} from '../src/services/smsRateLimitService';
import * as smsRateLimitService from '../src/services/smsRateLimitService';

class MemorySmsCounterStore implements SmsRateLimitCounterStore {
  readonly counters = new Map<string, number>();
  fail = false;
  leaseAvailable = true;

  async reserve(reservation: SmsCounterReservation): Promise<SmsCounterReservationResult> {
    if (this.fail) throw new Error('counter store unavailable');
    let tenantCount = this.counters.get(reservation.keys.tenant);
    let userCount = reservation.keys.user
      ? this.counters.get(reservation.keys.user)
      : undefined;

    if (
      tenantCount === undefined
      || (reservation.keys.user && userCount === undefined)
    ) {
      if (!reservation.baseline) {
        return {
          status: 'uninitialized',
          tenantCount: tenantCount || 0,
          ...(userCount === undefined ? {} : { userCount }),
        };
      }
      if (tenantCount === undefined) {
        tenantCount = reservation.baseline.tenant;
        this.counters.set(reservation.keys.tenant, tenantCount);
      }
      if (reservation.keys.user && userCount === undefined) {
        userCount = reservation.baseline.user || 0;
        this.counters.set(reservation.keys.user, userCount);
      }
    }

    if (tenantCount! + reservation.amount > reservation.tenantLimit) {
      return { status: 'limited', limitedScope: 'tenant', tenantCount: tenantCount!, userCount };
    }
    if (
      reservation.keys.user
      && userCount! + reservation.amount > reservation.userLimit
    ) {
      return { status: 'limited', limitedScope: 'user', tenantCount: tenantCount!, userCount };
    }

    tenantCount! += reservation.amount;
    this.counters.set(reservation.keys.tenant, tenantCount!);
    if (reservation.keys.user) {
      userCount! += reservation.amount;
      this.counters.set(reservation.keys.user, userCount!);
    }
    return { status: 'allowed', tenantCount: tenantCount!, userCount };
  }

  async reconcileCounter(key: string, minimum: number): Promise<boolean> {
    if (this.fail) throw new Error('counter store unavailable');
    const current = this.counters.get(key);
    if (current === undefined || current < minimum) {
      this.counters.set(key, minimum);
      return true;
    }
    return false;
  }

  async acquireReconciliationLease(): Promise<boolean> {
    if (this.fail) throw new Error('counter store unavailable');
    return this.leaseAvailable;
  }
}

class MemorySmsUsageSource implements SmsRateLimitUsageSource {
  scopeReads = 0;
  dailyReads = 0;

  constructor(
    private readonly scopeCounts: (
      tenantId: string,
      sentById: string | undefined,
    ) => SmsUsageCounts = () => ({ tenant: 0, user: 0 }),
    public dailyRows: SmsDailyUsageRow[] = [],
  ) {}

  async readScopeCounts(
    tenantId: string,
    sentById: string | undefined,
    _window: SmsRateLimitWindow,
  ): Promise<SmsUsageCounts> {
    this.scopeReads += 1;
    return this.scopeCounts(tenantId, sentById);
  }

  async readDailyUsage(_window: SmsRateLimitWindow): Promise<SmsDailyUsageRow[]> {
    this.dailyReads += 1;
    return this.dailyRows;
  }
}

const buildConfig = (overrides: Partial<SmsRateLimitConfig> = {}): SmsRateLimitConfig => ({
  enabled: true,
  required: false,
  prefix: 'sync-test:sms-daily-rate',
  tenantLimit: 3,
  userLimit: 2,
  connectTimeoutMs: 100,
  reconciliationIntervalMs: 60_000,
  reconciliationLeaseMs: 30_000,
  ...overrides,
});

const fixedNow = new Date('2026-09-09T12:00:00.000Z');

const deniedDecision = {
  allowed: false,
  backend: 'redis' as const,
  limit: 2,
  limitedScope: 'user' as const,
  tenantCount: 2,
  userCount: 2,
  remaining: 0,
  resetAt: '2026-09-10T00:00:00.000Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-012 SMS daily rate-limit configuration', () => {
  it('TV-018 uses bounded defaults and an optional shared Redis URL', () => {
    expect(getSmsRateLimitConfig({} as NodeJS.ProcessEnv)).toEqual({
      enabled: true,
      required: false,
      redisUrl: undefined,
      prefix: 'sync:sms-daily-rate',
      tenantLimit: 5_000,
      userLimit: 500,
      connectTimeoutMs: 3_000,
      reconciliationIntervalMs: 15 * 60 * 1_000,
      reconciliationLeaseMs: 5 * 60 * 1_000,
    });

    const configured = getSmsRateLimitConfig({
      REDIS_URL: 'redis://shared.example.invalid:6379',
      SMS_RATE_LIMIT_REDIS_URL: 'rediss://sms.example.invalid:6380',
      SMS_DAILY_TENANT_LIMIT: '2500',
      SMS_DAILY_USER_LIMIT: '250',
    } as NodeJS.ProcessEnv);
    expect(configured.redisUrl).toMatch(/^rediss:/);
    expect(configured.tenantLimit).toBe(2_500);
    expect(configured.userLimit).toBe(250);

    expect(() => getSmsRateLimitConfig({
      SMS_RATE_LIMIT_REDIS_URL: 'https://example.invalid',
    } as NodeJS.ProcessEnv)).toThrow('must use redis:// or rediss://');
    expect(() => getSmsRateLimitConfig({
      SMS_DAILY_TENANT_LIMIT: '100',
      SMS_DAILY_USER_LIMIT: '101',
    } as NodeJS.ProcessEnv)).toThrow('cannot exceed');
  });

  it('TV-018 creates opaque tenant/user keys in a deterministic UTC-day window', () => {
    const keys = buildSmsRateLimitKeys(
      'sync-test:sms-daily-rate',
      'tenant-sensitive-id',
      'user-sensitive-id',
      '20260909',
    );

    expect(keys.tenant).toContain(':d:20260909:tenant');
    expect(keys.user).toContain(':d:20260909:user:');
    expect(keys.tenant).not.toContain('tenant-sensitive-id');
    expect(keys.user).not.toContain('user-sensitive-id');
  });
});

describe('T-012 / TV-018 distributed cached counters', () => {
  it('seeds once from the database and then shares atomic quota across replicas', async () => {
    const store = new MemorySmsCounterStore();
    const sourceA = new MemorySmsUsageSource();
    const sourceB = new MemorySmsUsageSource();
    const replicaA = new SmsDailyRateLimiter(buildConfig(), sourceA, store);
    const replicaB = new SmsDailyRateLimiter(buildConfig(), sourceB, store);

    await expect(replicaA.reserve('tenant-a', 'user-1', 1, fixedNow)).resolves.toMatchObject({
      allowed: true,
      backend: 'redis',
      tenantCount: 1,
      userCount: 1,
    });
    await expect(replicaB.reserve('tenant-a', 'user-1', 1, fixedNow)).resolves.toMatchObject({
      allowed: true,
      tenantCount: 2,
      userCount: 2,
    });
    await expect(replicaA.reserve('tenant-a', 'user-1', 1, fixedNow)).resolves.toMatchObject({
      allowed: false,
      limitedScope: 'user',
      remaining: 0,
    });

    expect(sourceA.scopeReads).toBe(1);
    expect(sourceB.scopeReads).toBe(0);
    expect(replicaA.getMetrics()).toMatchObject({
      cacheSeedQueries: 1,
      databaseFallbackChecks: 0,
      redisReservations: 2,
      denied: 1,
    });
  });

  it('keeps tenants isolated and reserves an optimized bulk batch atomically', async () => {
    const store = new MemorySmsCounterStore();
    const source = new MemorySmsUsageSource((tenantId) => tenantId === 'tenant-a'
      ? { tenant: 2, user: 1 }
      : { tenant: 0, user: 0 });
    const limiter = new SmsDailyRateLimiter(
      buildConfig({ tenantLimit: 4, userLimit: 3 }),
      source,
      store,
    );

    await expect(limiter.reserve('tenant-a', 'user-1', 2, fixedNow)).resolves.toMatchObject({
      allowed: true,
      tenantCount: 4,
      userCount: 3,
    });
    await expect(limiter.reserve('tenant-a', 'user-2', 1, fixedNow)).resolves.toMatchObject({
      allowed: false,
      limitedScope: 'tenant',
      tenantCount: 4,
    });
    await expect(limiter.reserve('tenant-b', 'user-1', 1, fixedNow)).resolves.toMatchObject({
      allowed: true,
      tenantCount: 1,
      userCount: 1,
    });
  });

  it('falls back to indexed database counts on optional Redis failure and fails closed when required', async () => {
    const source = new MemorySmsUsageSource(() => ({ tenant: 1, user: 1 }));
    const failingStore = new MemorySmsCounterStore();
    failingStore.fail = true;
    const onStoreError = jest.fn();
    const optional = new SmsDailyRateLimiter(buildConfig(), source, failingStore, onStoreError);

    await expect(optional.reserve('tenant-a', 'user-1', 1, fixedNow)).resolves.toMatchObject({
      allowed: true,
      backend: 'database',
      tenantCount: 2,
      userCount: 2,
    });
    expect(onStoreError).toHaveBeenCalledTimes(1);
    expect(optional.getMetrics()).toMatchObject({
      storeErrors: 1,
      databaseFallbackChecks: 1,
    });

    const required = new SmsDailyRateLimiter(
      buildConfig({ required: true, redisUrl: 'redis://required.invalid:6379' }),
      source,
      failingStore,
    );
    await expect(required.reserve('tenant-a', 'user-1', 1, fixedNow))
      .rejects.toBeInstanceOf(SmsRateLimitUnavailableError);
  });

  it('periodically raises stale counters to durable log totals without lowering live reservations', async () => {
    const store = new MemorySmsCounterStore();
    const source = new MemorySmsUsageSource();
    const limiter = new SmsDailyRateLimiter(
      buildConfig({ tenantLimit: 10, userLimit: 10 }),
      source,
      store,
    );

    await limiter.reserve('tenant-a', 'user-1', 2, fixedNow);
    source.dailyRows = [
      { tenantId: 'tenant-a', sentById: 'user-1', count: 4 },
      { tenantId: 'tenant-a', sentById: null, count: 1 },
    ];
    await expect(limiter.reconcile(fixedNow)).resolves.toEqual({
      ran: true,
      sourceRows: 2,
      countersExamined: 2,
      correctedCounters: 2,
    });

    source.dailyRows = [{ tenantId: 'tenant-a', sentById: 'user-1', count: 1 }];
    await expect(limiter.reconcile(fixedNow)).resolves.toMatchObject({
      ran: true,
      correctedCounters: 0,
    });
    await expect(limiter.reserve('tenant-a', 'user-1', 1, fixedNow)).resolves.toMatchObject({
      tenantCount: 6,
      userCount: 5,
    });
    expect(limiter.getMetrics()).toMatchObject({
      reconciliationRuns: 2,
      reconciledCounters: 2,
    });
  });
});

describe('T-012 / TV-018 SMS send-path integration', () => {
  it('rejects a single SMS before creating an audit row or reading provider settings', async () => {
    const reserve = jest.spyOn(smsRateLimitService, 'reserveSmsQuota')
      .mockResolvedValue(deniedDecision);
    const log = jest.spyOn(communicationLogService, 'logCommunication');
    const settings = jest.spyOn(prisma.schoolSettings, 'findFirst');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(smsService.send('0977123456', 'Rate limited', { sentById: 'user-1' }))
      .resolves.toEqual({
        success: false,
        error: 'Your daily SMS limit reached (2). Try again tomorrow.',
      });

    expect(reserve).toHaveBeenCalledWith('user-1', 1);
    expect(log).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();
  });

  it('uses one atomic reservation for an optimized provider batch', async () => {
    jest.spyOn(prisma.schoolSettings, 'findFirst').mockResolvedValue({
      smsProvider: 'MSHASTRA',
      smsNotificationsEnabled: true,
      smsApiKey: 'test-key',
    } as any);
    const reserve = jest.spyOn(smsRateLimitService, 'reserveSmsQuota')
      .mockResolvedValue(deniedDecision);
    const log = jest.spyOn(communicationLogService, 'logCommunication');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await smsService.sendBulk([
      { phone: '0977123456', message: 'Same message' },
      { phone: '0966123456', message: 'Same message' },
      { phone: '0955123456', message: 'Same message' },
    ], { sentById: 'user-1' });

    expect(result).toMatchObject({ total: 3, sent: 0, failed: 3 });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledWith('user-1', 3);
    expect(log).not.toHaveBeenCalled();
  });
});
