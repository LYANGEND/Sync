import { Worker } from 'bullmq';
import {
  AnnouncementDeliveryResult,
  AnnouncementJobPayload,
  processAnnouncementDelivery,
} from './announcementQueueService';
import { QUEUE_NAMES, TenantJobEnvelope } from './queueContracts';
import { getQueueRuntimeConfig } from './queueConfig';
import { createTenantWorker } from './tenantWorker';

export const createCommunicationWorker = (): Worker<
  TenantJobEnvelope<AnnouncementJobPayload>,
  AnnouncementDeliveryResult,
  string
> => {
  const config = getQueueRuntimeConfig();
  return createTenantWorker<AnnouncementJobPayload, AnnouncementDeliveryResult>(
    QUEUE_NAMES.communications,
    async (envelope) => processAnnouncementDelivery(envelope),
    {
      concurrency: config.communicationWorkerConcurrency,
    },
  );
};
