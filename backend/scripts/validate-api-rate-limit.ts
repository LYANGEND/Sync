import express, { Request, Response } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import IORedis from 'ioredis';
import { getApiRateLimitConfig } from '../src/middleware/rateLimitConfig';
import {
  createApiRateLimitHandlers,
  createRedisRateLimitStoreFactory,
  type ApiRateLimitHandlers,
} from '../src/middleware/rateLimiter';

interface ProbeReplica {
  server: Server;
  handlers: ApiRateLimitHandlers;
  url: string;
}

const listen = async (
  client: IORedis,
  prefix: string,
  config: ReturnType<typeof getApiRateLimitConfig>,
): Promise<ProbeReplica> => {
  const handlers = createApiRateLimitHandlers(
    config,
    createRedisRateLimitStoreFactory(client, prefix),
  );
  const app = express();
  app.set('trust proxy', 1);
  app.use((request, _response, next) => {
    (request as any).user = {
      tenantId: String(request.get('x-probe-tenant') || ''),
      userId: String(request.get('x-probe-user') || ''),
      role: 'TEACHER',
    };
    next();
  });
  app.get('/ai', handlers.ai, (_request: Request, response: Response) => {
    response.json({ ok: true });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  return {
    server,
    handlers,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
};

const closeReplica = async (replica: ProbeReplica): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    replica.server.close(error => error ? reject(error) : resolve());
  });
  await replica.handlers.shutdown();
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
  const redisUrl = process.env.API_RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('Set API_RATE_LIMIT_REDIS_URL or REDIS_URL before running this probe');
  }

  const prefix = `sync:api-rate:probe:${process.pid}:${Date.now()}`;
  const config = getApiRateLimitConfig({
    ...process.env,
    API_RATE_LIMIT_ENABLED: 'true',
    API_RATE_LIMIT_REQUIRED: 'true',
    API_RATE_LIMIT_REDIS_URL: redisUrl,
    API_RATE_LIMIT_PREFIX: prefix,
    API_AI_RATE_WINDOW_MS: '60000',
    API_AI_RATE_MAX: '2',
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
  const replicas: ProbeReplica[] = [];

  try {
    await Promise.all(clients.map(async client => {
      await client.connect();
      await client.ping();
    }));
    replicas.push(
      await listen(clients[0], prefix, config),
      await listen(clients[1], prefix, config),
    );

    const tenantAHeaders = {
      'x-probe-tenant': 'tenant-probe-a',
      'x-probe-user': 'shared-user',
    };
    const statuses = [
      (await fetch(`${replicas[0].url}/ai`, { headers: tenantAHeaders })).status,
      (await fetch(`${replicas[1].url}/ai`, { headers: tenantAHeaders })).status,
      (await fetch(`${replicas[0].url}/ai`, { headers: tenantAHeaders })).status,
      (await fetch(`${replicas[1].url}/ai`, {
        headers: {
          'x-probe-tenant': 'tenant-probe-b',
          'x-probe-user': 'shared-user',
        },
      })).status,
    ];

    if (statuses.join(',') !== '200,200,429,200') {
      throw new Error(`Unexpected distributed limiter statuses: ${statuses.join(',')}`);
    }

    console.log(JSON.stringify({
      event: 'api.rate-limit.validation.passed',
      replicas: 2,
      sameTenantStatuses: statuses.slice(0, 3),
      isolatedTenantStatus: statuses[3],
    }));
  } finally {
    await Promise.allSettled(replicas.map(closeReplica));
    await deleteProbeKeys(clients[0], prefix).catch(() => undefined);
    await Promise.allSettled(clients.map(client => client.quit()));
  }
};

main().catch(error => {
  console.error('[ApiRateLimitValidation] Failed:', error);
  process.exitCode = 1;
});
