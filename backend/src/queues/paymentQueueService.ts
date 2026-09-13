import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import {
  createNotification,
  generatePaymentReceiptEmail,
} from '../services/notificationService';
import { sendEmail } from '../services/emailService';
import smsService from '../services/smsService';
import { enqueueTenantJob, getQueueRuntimeStatus } from './queueRuntime';
import { QUEUE_NAMES, TenantJobEnvelope } from './queueContracts';
import {
  buildDeliveryIdempotencyKey,
  executeIdempotentDelivery,
} from './deliveryIdempotency';
import { ProviderChannel, waitForProviderPermit } from './providerRateLimiter';

export const paymentReceiptChannelSchema = z.enum(['email', 'sms', 'inApp']);
export type PaymentReceiptChannel = z.infer<typeof paymentReceiptChannelSchema>;

export const paymentReceiptJobPayloadSchema = z.object({
  paymentId: z.string().uuid(),
  channels: z.array(paymentReceiptChannelSchema).min(1),
});
export type PaymentReceiptJobPayload = z.infer<typeof paymentReceiptJobPayloadSchema>;

export interface PaymentReceiptDeliveryResult {
  paymentId: string;
  transactionId: string;
  emailSent: boolean;
  smsSent: boolean;
  inAppCreated: boolean;
}

export interface EnqueuePaymentReceiptOptions {
  paymentId: string;
  channels: PaymentReceiptChannel[];
  actorUserId?: string;
  correlationId?: string;
}

export const PAYMENT_JOB_NAMES = {
  receipt: 'payment.receipt',
} as const;

export const PAYMENT_RECEIPT_RETRY_POLICY = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

export const enqueuePaymentReceipt = async (
  options: EnqueuePaymentReceiptOptions,
): Promise<{ jobId: string; correlationId: string }> => {
  if (getQueueRuntimeStatus().state !== 'ready') {
    throw new Error('Payment queue is not ready');
  }

  const channels = [...new Set(
    options.channels.map(channel => paymentReceiptChannelSchema.parse(channel)),
  )];
  const correlationId = options.correlationId || crypto.randomUUID();

  return enqueueTenantJob(
    QUEUE_NAMES.payments,
    PAYMENT_JOB_NAMES.receipt,
    {
      paymentId: options.paymentId,
      channels,
    },
    {
      actorUserId: options.actorUserId,
      correlationId,
      jobOptions: {
        ...PAYMENT_RECEIPT_RETRY_POLICY,
        jobId: `payment-${options.paymentId}-receipt`,
      },
    },
  );
};

const deliverOnce = async (
  envelope: TenantJobEnvelope<PaymentReceiptJobPayload>,
  paymentId: string,
  channel: string,
  recipientId: string,
  operation: () => Promise<boolean>,
  providerChannel?: ProviderChannel,
): Promise<boolean> => {
  await executeIdempotentDelivery(
    buildDeliveryIdempotencyKey({
      tenantId: envelope.tenantId,
      messageId: `payment:${paymentId}`,
      channel,
      recipientId,
    }),
    async () => {
      if (providerChannel) {
        await waitForProviderPermit(envelope.tenantId, providerChannel);
      }
      if (!await operation()) {
        throw new Error(`${channel} provider rejected payment recipient ${recipientId}`);
      }
    },
  );
  return true;
};

export const processPaymentReceipt = async (
  envelope: TenantJobEnvelope<PaymentReceiptJobPayload>,
): Promise<PaymentReceiptDeliveryResult> => {
  const payload = paymentReceiptJobPayloadSchema.parse(envelope.payload);
  const channels = new Set(payload.channels);
  const payment = await prisma.payment.findFirst({
    where: {
      id: payload.paymentId,
      status: 'COMPLETED',
    },
    select: {
      id: true,
      transactionId: true,
      amount: true,
      paymentDate: true,
      method: true,
      recordedByUserId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          guardianEmail: true,
          guardianName: true,
          guardianPhone: true,
          parent: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      },
    },
  });

  if (!payment) {
    throw new Error(`Completed payment ${payload.paymentId} was not found in this tenant`);
  }

  const settings = await prisma.schoolSettings.findFirst({
    select: { schoolName: true },
  });
  const schoolName = settings?.schoolName || 'School';
  const transactionId = payment.transactionId || payment.id;
  const guardianName = payment.student.parent?.fullName
    || payment.student.guardianName
    || 'Parent/Guardian';
  const parentEmail = payment.student.parent?.email || payment.student.guardianEmail;
  const parentPhone = payment.student.guardianPhone;
  const studentName = `${payment.student.firstName} ${payment.student.lastName}`;
  const receipt = generatePaymentReceiptEmail(
    guardianName,
    studentName,
    Number(payment.amount),
    payment.paymentDate,
    payment.method,
    transactionId,
    schoolName,
  );

  let inAppCreated = false;
  if (channels.has('inApp') && payment.student.parent?.id) {
    const formattedAmount = Number(payment.amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
    });
    inAppCreated = await deliverOnce(
      envelope,
      payment.id,
      'in-app',
      payment.student.parent.id,
      () => createNotification(
        payment.student.parent!.id,
        '✅ Payment Received',
        `ZMW ${formattedAmount} received for ${studentName}. Ref: ${transactionId}.`,
        'SUCCESS',
        {
          awaitPush: true,
          pushSource: 'payment_receipt_queue',
        },
      ),
      'push',
    );
  }

  let emailSent = false;
  let smsSent = false;
  const recipientId = payment.student.parent?.id || payment.student.id;
  if (channels.has('email') && parentEmail) {
    emailSent = await deliverOnce(
      envelope,
      payment.id,
      'email',
      recipientId,
      () => sendEmail(parentEmail, receipt.subject, receipt.html, {
        source: 'payment_receipt_queue',
        sentById: envelope.actorUserId || payment.recordedByUserId || undefined,
        recipientName: guardianName,
      }),
      'email',
    );
  }
  if (channels.has('sms') && parentPhone) {
    smsSent = await deliverOnce(
      envelope,
      payment.id,
      'sms',
      recipientId,
      async () => {
        const result = await smsService.send(parentPhone, receipt.sms, {
          source: 'payment_receipt_queue',
          sentById: envelope.actorUserId || payment.recordedByUserId || undefined,
          recipientName: guardianName,
        });
        return result.success;
      },
      'sms',
    );
  }

  return {
    paymentId: payment.id,
    transactionId,
    emailSent,
    smsSent,
    inAppCreated,
  };
};
