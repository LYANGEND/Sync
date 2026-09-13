import dotenv from 'dotenv';
dotenv.config();

import { createCommunicationWorker } from '../queues/communicationWorker';
import { closeDeliveryIdempotencyStore } from '../queues/deliveryIdempotency';
import { closeProviderRateLimiter } from '../queues/providerRateLimiter';
import { initializeQueueRuntime, shutdownQueueRuntime } from '../queues/queueRuntime';
import {
  initializeSmsRateLimitRuntime,
  shutdownSmsRateLimitRuntime,
} from '../services/smsRateLimitService';
import { prisma, systemPrisma } from '../utils/prisma';

let worker: ReturnType<typeof createCommunicationWorker> | undefined;

const start = async (): Promise<void> => {
  const runtime = await initializeQueueRuntime();
  if (runtime.state !== 'ready') {
    throw new Error(`Queue runtime is ${runtime.state}`);
  }
  await initializeSmsRateLimitRuntime();
  worker = createCommunicationWorker();
  await worker.waitUntilReady();
  console.log('[CommunicationWorker] Ready');
};

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  console.log(`[CommunicationWorker] ${signal} received; shutting down`);
  if (worker) await worker.close();
  await Promise.all([
    closeDeliveryIdempotencyStore(),
    closeProviderRateLimiter(),
    shutdownSmsRateLimitRuntime(),
  ]);
  await shutdownQueueRuntime();
  await Promise.allSettled([
    prisma.$disconnect(),
    systemPrisma.$disconnect(),
  ]);
};

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('[CommunicationWorker] Shutdown failed:', error);
        process.exit(1);
      });
  });
}

start().catch(async (error) => {
  console.error('[CommunicationWorker] Startup failed:', error);
  await shutdown('startup failure');
  process.exitCode = 1;
});
