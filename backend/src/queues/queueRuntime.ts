import { JobsOptions, Queue } from 'bullmq';
import { getCurrentTenantId } from '../middleware/tenantContext';
import {
  buildTenantJobEnvelope,
  jobNameSchema,
  QUEUE_NAMES,
  QueueName,
  queueNameSchema,
  TenantJobEnvelope,
} from './queueContracts';
import { getQueueRuntimeConfig, QueueRuntimeConfig } from './queueConfig';
import { createQueueRedisConnection } from './redisConnection';
import type IORedis from 'ioredis';

export type QueueRuntimeState = 'disabled' | 'initializing' | 'ready' | 'degraded' | 'stopping' | 'stopped';

export interface QueueRuntimeStatus {
  state: QueueRuntimeState;
  checkedAt: string;
  readyAt?: string;
  error?: string;
}

export interface QueueHealthSnapshot extends QueueRuntimeStatus {
  queues?: Record<string, Record<string, number>>;
}

export interface QueueMetricAlert {
  code: 'BACKLOG_HIGH' | 'OLDEST_JOB_HIGH' | 'FAILURE_RATE_HIGH' | 'DEAD_LETTER_PRESENT';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

export interface QueueMetricJobSample {
  timestamp: number;
  attemptsMade: number;
  tenantId?: string;
}

export interface QueueMetricThresholds {
  waitingCount: number;
  oldestMs: number;
  failureRatePercent: number;
}

export interface QueueMetric {
  counts: Record<string, number>;
  backlog: number;
  oldestPendingAgeMs: number | null;
  failureRatePercent: number;
  retryAttemptsObserved: number;
  sampledJobs: number;
  sampleTruncated: boolean;
  tenantDistribution: Array<{ tenantId: string; count: number }>;
  alerts: QueueMetricAlert[];
}

export interface QueueMetricsSnapshot extends QueueRuntimeStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'disabled' | 'unavailable';
  generatedAt: string;
  sampleSize: number;
  queues?: Record<string, QueueMetric>;
  alerts: Array<QueueMetricAlert & { queue: string }>;
}

export interface EnqueueTenantJobOptions {
  tenantId?: string;
  correlationId?: string;
  actorUserId?: string;
  jobOptions?: JobsOptions;
}

export class QueueUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueUnavailableError';
  }
}

let runtimeConfig: QueueRuntimeConfig | undefined;
let producerConnection: IORedis | undefined;
const queues = new Map<QueueName, Queue<TenantJobEnvelope, unknown, string>>();
let initialization: Promise<QueueRuntimeStatus> | undefined;
let status: QueueRuntimeStatus = {
  state: 'stopped',
  checkedAt: new Date().toISOString(),
};

const setStatus = (next: Omit<QueueRuntimeStatus, 'checkedAt'>): QueueRuntimeStatus => {
  status = { ...next, checkedAt: new Date().toISOString() };
  return status;
};

const serializeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const logQueueEvent = (event: string, details: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...details,
  }));
};

export const calculateQueueMetric = (
  queueName: QueueName,
  counts: Record<string, number>,
  pendingJobs: QueueMetricJobSample[],
  sampledJobs: QueueMetricJobSample[],
  thresholds: QueueMetricThresholds,
  nowMs: number = Date.now(),
): QueueMetric => {
  const backlog = (counts.waiting || 0) + (counts.delayed || 0);
  const oldestPendingAgeMs = pendingJobs.length === 0
    ? null
    : Math.max(...pendingJobs.map(job => Math.max(0, nowMs - job.timestamp)));
  const failed = counts.failed || 0;
  const completed = counts.completed || 0;
  const terminalJobs = failed + completed;
  const failureRatePercent = terminalJobs === 0
    ? 0
    : Number(((failed / terminalJobs) * 100).toFixed(2));
  const retryAttemptsObserved = sampledJobs.reduce(
    (total, job) => total + Math.max(0, job.attemptsMade - 1),
    0,
  );
  const tenantCounts = new Map<string, number>();
  for (const job of sampledJobs) {
    const tenantId = job.tenantId || 'UNKNOWN';
    tenantCounts.set(tenantId, (tenantCounts.get(tenantId) || 0) + 1);
  }
  const tenantDistribution = [...tenantCounts.entries()]
    .map(([tenantId, count]) => ({ tenantId, count }))
    .sort((left, right) => right.count - left.count || left.tenantId.localeCompare(right.tenantId));
  const alerts: QueueMetricAlert[] = [];

  if (backlog >= thresholds.waitingCount) {
    alerts.push({
      code: 'BACKLOG_HIGH',
      severity: 'warning',
      message: `Queue backlog is ${backlog}`,
      value: backlog,
      threshold: thresholds.waitingCount,
    });
  }
  if (oldestPendingAgeMs !== null && oldestPendingAgeMs >= thresholds.oldestMs) {
    alerts.push({
      code: 'OLDEST_JOB_HIGH',
      severity: 'warning',
      message: `Oldest pending job is ${oldestPendingAgeMs}ms old`,
      value: oldestPendingAgeMs,
      threshold: thresholds.oldestMs,
    });
  }
  if (failed > 0 && failureRatePercent >= thresholds.failureRatePercent) {
    alerts.push({
      code: 'FAILURE_RATE_HIGH',
      severity: 'warning',
      message: `Retained job failure rate is ${failureRatePercent}%`,
      value: failureRatePercent,
      threshold: thresholds.failureRatePercent,
    });
  }

  const deadLetterCount = queueName === QUEUE_NAMES.deadLetter
    ? backlog + (counts.active || 0) + failed
    : 0;
  if (deadLetterCount > 0) {
    alerts.push({
      code: 'DEAD_LETTER_PRESENT',
      severity: 'critical',
      message: `${deadLetterCount} dead-letter job(s) require review`,
      value: deadLetterCount,
      threshold: 0,
    });
  }

  const observedJobs = backlog + (counts.active || 0) + failed;
  return {
    counts,
    backlog,
    oldestPendingAgeMs,
    failureRatePercent,
    retryAttemptsObserved,
    sampledJobs: sampledJobs.length,
    sampleTruncated: observedJobs > sampledJobs.length,
    tenantDistribution,
    alerts,
  };
};

const closeRuntimeResources = async (): Promise<void> => {
  const queueInstances = [...queues.values()];
  queues.clear();
  await Promise.allSettled(queueInstances.map(queue => queue.close()));

  if (producerConnection) {
    const connection = producerConnection;
    producerConnection = undefined;
    try {
      await connection.quit();
    } catch {
      connection.disconnect(false);
    }
  }
};

const initialize = async (config: QueueRuntimeConfig): Promise<QueueRuntimeStatus> => {
  runtimeConfig = config;
  if (!config.enabled) {
    return setStatus({ state: 'disabled' });
  }

  setStatus({ state: 'initializing' });

  try {
    producerConnection = createQueueRedisConnection(config, 'producer');
    producerConnection.on('error', (error) => {
      if (status.state === 'stopping' || status.state === 'stopped') return;
      setStatus({ state: 'degraded', readyAt: status.readyAt, error: error.message });
      console.error(JSON.stringify({
        event: 'queue.redis.error',
        timestamp: new Date().toISOString(),
        error: error.message,
      }));
    });

    await producerConnection.connect();
    await producerConnection.ping();

    for (const queueName of Object.values(QUEUE_NAMES)) {
      const queue = new Queue<TenantJobEnvelope, unknown, string>(queueName, {
        connection: producerConnection,
        prefix: config.prefix,
        defaultJobOptions: {
          attempts: config.defaultAttempts,
          backoff: {
            type: 'exponential',
            delay: config.backoffDelayMs,
          },
          removeOnComplete: { count: config.removeCompleteCount },
          removeOnFail: { count: config.removeFailCount },
        },
      });
      await queue.waitUntilReady();
      queues.set(queueName, queue);
    }

    const readyAt = new Date().toISOString();
    logQueueEvent('queue.runtime.ready', { queues: [...queues.keys()] });
    return setStatus({ state: 'ready', readyAt });
  } catch (error) {
    await closeRuntimeResources();
    const message = serializeError(error);
    setStatus({ state: 'degraded', error: message });
    console.error(JSON.stringify({
      event: 'queue.runtime.degraded',
      timestamp: new Date().toISOString(),
      error: message,
    }));
    if (config.required) throw error;
    return status;
  }
};

export const initializeQueueRuntime = async (
  config: QueueRuntimeConfig = getQueueRuntimeConfig(),
): Promise<QueueRuntimeStatus> => {
  if (status.state === 'ready' || status.state === 'disabled') return { ...status };
  if (initialization) return initialization;

  initialization = initialize(config).finally(() => {
    initialization = undefined;
  });
  return initialization;
};

export const getQueueRuntimeStatus = (): QueueRuntimeStatus => ({ ...status });

export const getQueueHealthSnapshot = async (): Promise<QueueHealthSnapshot> => {
  if (status.state !== 'ready' || !producerConnection) return { ...status };

  try {
    await producerConnection.ping();
    const counts = await Promise.all(
      [...queues.entries()].map(async ([name, queue]) => [
        name,
        await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
      ] as const),
    );
    return {
      ...setStatus({ state: 'ready', readyAt: status.readyAt }),
      queues: Object.fromEntries(counts),
    };
  } catch (error) {
    return setStatus({
      state: 'degraded',
      readyAt: status.readyAt,
      error: serializeError(error),
    });
  }
};

export const getQueueMetricsSnapshot = async (): Promise<QueueMetricsSnapshot> => {
  const generatedAt = new Date().toISOString();
  if (status.state !== 'ready' || !producerConnection || !runtimeConfig) {
    return {
      ...status,
      overall: status.state === 'disabled' ? 'disabled' : 'unavailable',
      generatedAt,
      sampleSize: runtimeConfig?.metricsSampleSize || 0,
      alerts: [],
    };
  }

  try {
    await producerConnection.ping();
    const thresholds: QueueMetricThresholds = {
      waitingCount: runtimeConfig.alertWaitingCount,
      oldestMs: runtimeConfig.alertOldestMs,
      failureRatePercent: runtimeConfig.alertFailureRatePercent,
    };
    const metrics = await Promise.all([...queues.entries()].map(async ([name, queue]) => {
      const [counts, pending, sample] = await Promise.all([
        queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
        queue.getJobs(['waiting', 'delayed'], 0, 0, true),
        queue.getJobs(
          ['waiting', 'active', 'delayed', 'failed'],
          0,
          runtimeConfig!.metricsSampleSize - 1,
          true,
        ),
      ]);
      const toSample = (job: typeof sample[number]): QueueMetricJobSample => ({
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
        tenantId: typeof job.data?.tenantId === 'string' ? job.data.tenantId : undefined,
      });
      return [name, calculateQueueMetric(
        name,
        counts,
        pending.map(toSample),
        sample.map(toSample),
        thresholds,
      )] as const;
    }));
    const queueMetrics = Object.fromEntries(metrics) as Record<string, QueueMetric>;
    const alerts = metrics.flatMap(([queue, metric]) =>
      metric.alerts.map(alert => ({ queue, ...alert }))
    );
    const overall = alerts.some(alert => alert.severity === 'critical')
      ? 'critical'
      : alerts.length > 0 ? 'warning' : 'healthy';

    return {
      ...setStatus({ state: 'ready', readyAt: status.readyAt }),
      overall,
      generatedAt,
      sampleSize: runtimeConfig.metricsSampleSize,
      queues: queueMetrics,
      alerts,
    };
  } catch (error) {
    const degraded = setStatus({
      state: 'degraded',
      readyAt: status.readyAt,
      error: serializeError(error),
    });
    return {
      ...degraded,
      overall: 'unavailable',
      generatedAt,
      sampleSize: runtimeConfig.metricsSampleSize,
      alerts: [],
    };
  }
};

export const enqueueTenantJob = async <TPayload extends Record<string, unknown>>(
  queueName: QueueName,
  jobName: string,
  payload: TPayload,
  options: EnqueueTenantJobOptions = {},
): Promise<{ jobId: string; correlationId: string }> => {
  const parsedQueueName = queueNameSchema.parse(queueName);
  const parsedJobName = jobNameSchema.parse(jobName);
  const tenantId = options.tenantId || getCurrentTenantId();
  if (!tenantId) {
    throw new Error(`Tenant context is required to enqueue ${parsedJobName}`);
  }

  if (status.state !== 'ready') {
    throw new QueueUnavailableError(`Queue runtime is ${status.state}`);
  }

  const queue = queues.get(parsedQueueName);
  if (!queue || !runtimeConfig) {
    throw new QueueUnavailableError(`Queue ${parsedQueueName} is not initialized`);
  }

  const envelope = buildTenantJobEnvelope({
    tenantId,
    payload,
    correlationId: options.correlationId,
    actorUserId: options.actorUserId,
  });
  const job = await queue.add(parsedJobName, envelope, options.jobOptions);
  const jobId = String(job.id);

  logQueueEvent('queue.job.enqueued', {
    queue: parsedQueueName,
    jobName: parsedJobName,
    jobId,
    tenantId,
    correlationId: envelope.correlationId,
  });

  return { jobId, correlationId: envelope.correlationId };
};

export const shutdownQueueRuntime = async (): Promise<void> => {
  if (status.state === 'stopped') return;
  setStatus({ state: 'stopping', readyAt: status.readyAt });
  await closeRuntimeResources();
  setStatus({ state: 'stopped' });
  logQueueEvent('queue.runtime.stopped');
};
