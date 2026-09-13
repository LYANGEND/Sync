import IORedis from 'ioredis';
import { getSmsRateLimitConfig } from '../src/services/smsRateLimitConfig';
import {
  buildSmsRateLimitKeys,
  RedisSmsRateLimitCounterStore,
  SmsDailyRateLimiter,
  SmsDailyUsageRow,
  SmsRateLimitUsageSource,
  SmsRateLimitWindow,
  SmsUsageCounts,
} from '../src/services/smsRateLimitService';

class ProbeUsageSource implements SmsRateLimitUsageSource {
  scopeReads = 0;
  dailyRows: SmsDailyUsageRow[] = [];

  async readScopeCounts(
    _tenantId: string,
    sentById: string | undefined,
    _window: SmsRateLimitWindow,
  ): Promise<SmsUsageCounts> {
    this.scopeReads += 1;
    return { tenant: 0, ...(sentById ? { user: 0 } : {}) };
  }

  async readDailyUsage(_window: SmsRateLimitWindow): Promise<SmsDailyUsageRow[]> {
    return this.dailyRows;
  }
}

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

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

const main = async (): Promise<void> => {
  const redisUrl = process.env.SMS_RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Set SMS_RATE_LIMIT_REDIS_URL or REDIS_URL before running this probe');
  }

  const prefix = `sync:sms-daily-rate:probe:${process.pid}:${Date.now()}`;
  const config = getSmsRateLimitConfig({
    ...process.env,
    SMS_RATE_LIMIT_ENABLED: 'true',
    SMS_RATE_LIMIT_REQUIRED: 'true',
    SMS_RATE_LIMIT_REDIS_URL: redisUrl,
    SMS_RATE_LIMIT_PREFIX: prefix,
    SMS_DAILY_TENANT_LIMIT: '4',
    SMS_DAILY_USER_LIMIT: '2',
    SMS_RATE_LIMIT_RECONCILE_INTERVAL_MS: '60000',
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

    const sourceA = new ProbeUsageSource();
    const sourceB = new ProbeUsageSource();
    const replicaA = new SmsDailyRateLimiter(
      config,
      sourceA,
      new RedisSmsRateLimitCounterStore(clients[0]),
    );
    const replicaB = new SmsDailyRateLimiter(
      config,
      sourceB,
      new RedisSmsRateLimitCounterStore(clients[1]),
    );
    const now = new Date();
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');

    const first = await replicaA.reserve('tenant-probe-a', 'user-probe-1', 1, now);
    const sharedReplica = await replicaB.reserve('tenant-probe-a', 'user-probe-1', 1, now);
    const secondReplicaSeedReadsAfterSharedHit = sourceB.scopeReads;
    const userLimit = await replicaA.reserve('tenant-probe-a', 'user-probe-1', 1, now);
    const secondUser = await replicaB.reserve('tenant-probe-a', 'user-probe-2', 1, now);
    const otherTenant = await replicaA.reserve('tenant-probe-b', 'user-probe-1', 1, now);

    const tenantAKeys = buildSmsRateLimitKeys(
      prefix,
      'tenant-probe-a',
      'user-probe-1',
      day,
    );
    const ttlSeconds = await clients[0].ttl(tenantAKeys.tenant);

    sourceA.dailyRows = [
      { tenantId: 'tenant-probe-a', sentById: 'user-probe-1', count: 3 },
      { tenantId: 'tenant-probe-a', sentById: 'user-probe-2', count: 2 },
      { tenantId: 'tenant-probe-b', sentById: 'user-probe-1', count: 1 },
    ];
    const reconciliation = await replicaA.reconcile(now);
    const reconciledLimit = await replicaB.reserve('tenant-probe-a', 'user-probe-3', 1, now);
    const preservedOtherTenant = await replicaB.reserve('tenant-probe-b', 'user-probe-2', 1, now);

    assert(first.allowed, 'First reservation was unexpectedly denied');
    assert(sharedReplica.allowed, 'Second replica did not share the Redis quota');
    assert(secondReplicaSeedReadsAfterSharedHit === 0, 'Shared Redis hit unexpectedly queried the database');
    assert(!userLimit.allowed && userLimit.limitedScope === 'user', 'Per-user quota was not enforced');
    assert(secondUser.allowed, 'Independent user quota was not preserved');
    assert(otherTenant.allowed, 'Independent tenant quota was not preserved');
    assert(ttlSeconds > 0 && ttlSeconds <= 24 * 60 * 60, `Unexpected counter TTL: ${ttlSeconds}`);
    assert(reconciliation.ran && reconciliation.correctedCounters >= 2, 'Database reconciliation did not repair drift');
    assert(!reconciledLimit.allowed && reconciledLimit.limitedScope === 'tenant', 'Reconciled tenant quota was not enforced');
    assert(preservedOtherTenant.allowed, 'Tenant reconciliation crossed the tenant boundary');
    assert(!tenantAKeys.tenant.includes('tenant-probe-a'), 'Redis key exposed the tenant identifier');
    assert(!tenantAKeys.user?.includes('user-probe-1'), 'Redis key exposed the user identifier');

    console.log(JSON.stringify({
      event: 'sms.rate-limit.validation.passed',
      replicas: 2,
      sharedReplicaCounter: true,
      sharedHitDatabaseReads: secondReplicaSeedReadsAfterSharedHit,
      userLimitEnforced: true,
      tenantLimitEnforcedAfterReconciliation: true,
      tenantIsolated: true,
      opaqueKeys: true,
      reconciliation,
      ttlSeconds,
    }));
  } finally {
    await deleteProbeKeys(clients[0], prefix).catch(() => undefined);
    await Promise.allSettled(clients.map(client => client.quit()));
  }
};

main().catch(error => {
  console.error('[SmsRateLimitValidation] Failed:', error);
  process.exitCode = 1;
});
