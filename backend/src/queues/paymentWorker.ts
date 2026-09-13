import { Worker } from 'bullmq';
import {
  PaymentReceiptDeliveryResult,
  PaymentReceiptJobPayload,
  processPaymentReceipt,
} from './paymentQueueService';
import { QUEUE_NAMES, TenantJobEnvelope } from './queueContracts';
import { getQueueRuntimeConfig } from './queueConfig';
import { createTenantWorker } from './tenantWorker';

export const createPaymentWorker = (): Worker<
  TenantJobEnvelope<PaymentReceiptJobPayload>,
  PaymentReceiptDeliveryResult,
  string
> => {
  const config = getQueueRuntimeConfig();
  return createTenantWorker<PaymentReceiptJobPayload, PaymentReceiptDeliveryResult>(
    QUEUE_NAMES.payments,
    async (envelope) => processPaymentReceipt(envelope),
    {
      concurrency: config.paymentWorkerConcurrency,
    },
  );
};
