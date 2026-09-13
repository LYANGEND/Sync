import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { runWithTenant } from '../src/middleware/tenantContext';
import { prisma, systemPrisma } from '../src/utils/prisma';
import * as accountingBridge from '../src/services/accountingBridge';
import * as emailService from '../src/services/emailService';
import * as lencoService from '../src/services/lencoService';
import * as notificationService from '../src/services/notificationService';
import smsService from '../src/services/smsService';
import * as deliveryIdempotency from '../src/queues/deliveryIdempotency';
import * as providerRateLimiter from '../src/queues/providerRateLimiter';
import * as queueRuntime from '../src/queues/queueRuntime';
import * as paymentQueueService from '../src/queues/paymentQueueService';
import * as financialSnapshotCache from '../src/cache/financialSnapshotCache';
import {
  PAYMENT_JOB_NAMES,
  PaymentReceiptJobPayload,
  enqueuePaymentReceipt,
  processPaymentReceipt,
} from '../src/queues/paymentQueueService';
import { buildTenantJobEnvelope, QUEUE_NAMES } from '../src/queues/queueContracts';
import {
  checkMobileMoneyStatus,
  createPayment,
  handleLencoWebhook,
} from '../src/controllers/paymentController';
import { executeAIAction } from '../src/controllers/aiFinancialController';

const PAYMENT_ID = '00000000-0000-4000-8000-000000000015';
const STUDENT_ID = '00000000-0000-4000-8000-000000000115';

const createResponse = (): Response => {
  const response: any = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  response.send = jest.fn(() => response);
  return response as Response;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-015 payment queue contract', () => {
  it('TV-022 enqueues one tenant-scoped receipt job with a stable payment key', async () => {
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    const enqueue = jest.spyOn(queueRuntime, 'enqueueTenantJob') as any;
    enqueue.mockResolvedValue({
      jobId: `payment-${PAYMENT_ID}-receipt`,
      correlationId: '00000000-0000-4000-8000-000000000022',
    });

    const result = await runWithTenant('tenant-a', () => enqueuePaymentReceipt({
      paymentId: PAYMENT_ID,
      channels: ['email', 'sms', 'inApp', 'email'],
      actorUserId: 'user-1',
      correlationId: '00000000-0000-4000-8000-000000000022',
    }));

    expect(enqueue).toHaveBeenCalledWith(
      QUEUE_NAMES.payments,
      PAYMENT_JOB_NAMES.receipt,
      {
        paymentId: PAYMENT_ID,
        channels: ['email', 'sms', 'inApp'],
      },
      expect.objectContaining({
        actorUserId: 'user-1',
        correlationId: '00000000-0000-4000-8000-000000000022',
        jobOptions: expect.objectContaining({
          jobId: `payment-${PAYMENT_ID}-receipt`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
        }),
      }),
    );
    expect(result.jobId).toBe(`payment-${PAYMENT_ID}-receipt`);
  });

  it('TV-022 reloads payment data in the worker and completes all receipt channels', async () => {
    jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue({
      id: PAYMENT_ID,
      transactionId: 'TXN-PAYMENT1',
      amount: 1250,
      paymentDate: new Date('2026-09-09T12:00:00.000Z'),
      method: 'CASH',
      recordedByUserId: 'user-1',
      student: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        guardianEmail: 'guardian@example.com',
        guardianName: 'Grace',
        guardianPhone: '0977000000',
        parent: {
          id: 'parent-1',
          email: 'parent@example.com',
          fullName: 'Parent One',
        },
      },
    } as any);
    jest.spyOn(prisma.schoolSettings, 'findFirst').mockResolvedValue({
      schoolName: 'Queue Academy',
    } as any);
    jest.spyOn(deliveryIdempotency, 'executeIdempotentDelivery').mockImplementation(
      async (_key, operation) => ({ executed: true, result: await operation() }),
    );
    const waitForPermit = jest.spyOn(providerRateLimiter, 'waitForProviderPermit')
      .mockResolvedValue(undefined);
    const sendEmail = jest.spyOn(emailService, 'sendEmail').mockResolvedValue(true);
    const sendSms = jest.spyOn(smsService, 'send').mockResolvedValue({ success: true });
    const createNotification = jest.spyOn(notificationService, 'createNotification').mockResolvedValue(true);

    const envelope = buildTenantJobEnvelope<PaymentReceiptJobPayload>({
      tenantId: 'tenant-a',
      actorUserId: 'user-1',
      payload: {
        paymentId: PAYMENT_ID,
        channels: ['email', 'sms', 'inApp'],
      },
    });
    const result = await runWithTenant('tenant-a', () => processPaymentReceipt(envelope));

    expect(createNotification).toHaveBeenCalledWith(
      'parent-1',
      '✅ Payment Received',
      expect.stringContaining('TXN-PAYMENT1'),
      'SUCCESS',
      { awaitPush: true, pushSource: 'payment_receipt_queue' },
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'parent@example.com',
      expect.stringContaining('Payment Receipt'),
      expect.any(String),
      expect.objectContaining({ source: 'payment_receipt_queue' }),
    );
    expect(sendSms).toHaveBeenCalledWith(
      '0977000000',
      expect.stringContaining('TXN-PAYMENT1'),
      expect.objectContaining({ source: 'payment_receipt_queue' }),
    );
    expect(waitForPermit.mock.calls).toEqual(expect.arrayContaining([
      ['tenant-a', 'push'],
      ['tenant-a', 'email'],
      ['tenant-a', 'sms'],
    ]));
    expect(result).toEqual({
      paymentId: PAYMENT_ID,
      transactionId: 'TXN-PAYMENT1',
      emailSent: true,
      smsSent: true,
      inAppCreated: true,
    });
  });
});

describe('T-015 payment write paths', () => {
  it('TV-022 returns a created payment without invoking outbound notification providers', async () => {
    jest.spyOn(prisma.student, 'findUnique').mockResolvedValue({
      id: STUDENT_ID,
      branchId: 'branch-1',
    } as any);
    jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
    const payment = {
      id: PAYMENT_ID,
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      transactionId: 'TXN-PAYMENT1',
      amount: 1250,
      paymentDate: new Date('2026-09-09T12:00:00.000Z'),
      method: 'CASH',
      recordedByUserId: 'user-1',
      student: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        guardianEmail: 'guardian@example.com',
        guardianName: 'Grace',
        guardianPhone: '0977000000',
        parent: { id: 'parent-1', email: 'parent@example.com', fullName: 'Parent One' },
        class: { id: 'class-1', name: 'Grade 1' },
      },
      recordedBy: { fullName: 'Bursar One' },
    };
    jest.spyOn(prisma.payment, 'create').mockResolvedValue(payment as any);
    jest.spyOn(accountingBridge, 'onPaymentCreated').mockResolvedValue(undefined as any);
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    const enqueue = jest.spyOn(paymentQueueService, 'enqueuePaymentReceipt').mockResolvedValue({
      jobId: `payment-${PAYMENT_ID}-receipt`,
      correlationId: '00000000-0000-4000-8000-000000000022',
    });
    const sendNotification = jest.spyOn(notificationService, 'sendNotification');
    const createNotification = jest.spyOn(notificationService, 'createNotification');
    const findSettings = jest.spyOn(prisma.schoolSettings, 'findFirst');
    const invalidate = jest.spyOn(financialSnapshotCache, 'invalidateFinancialSnapshotAfterMutation')
      .mockResolvedValue({ success: true, scope: 'branch', invalidatedScopes: 2 });
    const response = createResponse();

    await runWithTenant('tenant-a', () => createPayment({
      user: { userId: 'user-1' },
      body: {
        studentId: STUDENT_ID,
        amount: 1250,
        method: 'CASH',
      },
    } as unknown as Request, response));

    expect(response.status).toHaveBeenCalledWith(201);
    expect(enqueue).toHaveBeenCalledWith({
      paymentId: PAYMENT_ID,
      channels: ['email', 'sms', 'inApp'],
      actorUserId: 'user-1',
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(findSettings).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      source: 'payment.created',
    });
  });

  it('TV-022/TV-017 acknowledges and invalidates a successful mobile-money status update without provider work', async () => {
    jest.spyOn(prisma.mobileMoneyCollection, 'findFirst').mockResolvedValue({
      id: 'collection-1',
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      reference: 'MM-QUEUE-1',
      amount: 1250,
      status: 'PENDING',
      paymentId: PAYMENT_ID,
      initiatedByUserId: 'parent-1',
      student: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        admissionNumber: 'A-001',
      },
      payment: {
        id: PAYMENT_ID,
        transactionId: 'TXN-PAYMENT1',
      },
    } as any);
    jest.spyOn(lencoService, 'getCollectionStatus').mockResolvedValue({
      success: true,
      data: { status: 'successful' },
    } as any);
    jest.spyOn(prisma.mobileMoneyCollection, 'update').mockResolvedValue({
      id: 'collection-1',
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      reference: 'MM-QUEUE-1',
      amount: 1250,
      status: 'SUCCESSFUL',
      completedAt: new Date('2026-09-09T12:00:00.000Z'),
    } as any);
    jest.spyOn(prisma.payment, 'updateMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: PAYMENT_ID,
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      transactionId: 'TXN-PAYMENT1',
      studentId: STUDENT_ID,
      amount: 1250,
      status: 'COMPLETED',
      recordedByUserId: null,
    } as any);
    jest.spyOn(accountingBridge, 'onPaymentCreated').mockResolvedValue(undefined as any);
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    const enqueue = jest.spyOn(paymentQueueService, 'enqueuePaymentReceipt').mockResolvedValue({
      jobId: `payment-${PAYMENT_ID}-receipt`,
      correlationId: '00000000-0000-4000-8000-000000000022',
    });
    const sendNotification = jest.spyOn(notificationService, 'sendNotification');
    const findStudent = jest.spyOn(prisma.student, 'findUnique');
    const invalidate = jest.spyOn(financialSnapshotCache, 'invalidateFinancialSnapshotAfterMutation')
      .mockResolvedValue({ success: true, scope: 'tenant', invalidatedScopes: 1 });
    const response = createResponse();

    await runWithTenant('tenant-a', () => checkMobileMoneyStatus({
      params: { reference: 'MM-QUEUE-1' },
    } as unknown as Request, response));

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Payment completed successfully',
    }));
    expect(enqueue).toHaveBeenCalledWith({
      paymentId: PAYMENT_ID,
      channels: ['email', 'sms'],
      actorUserId: 'parent-1',
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(findStudent).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      scope: 'tenant',
      source: 'mobile-money.collection-status-changed',
    });
    expect(invalidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      scope: 'tenant',
      source: 'payment.mobile-money-completed',
    });
  });
});

describe('T-011 payment mutation invalidation hooks', () => {
  it('TV-017 does not invalidate when the payment mutation fails to commit', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(prisma.student, 'findUnique').mockResolvedValue({
      id: STUDENT_ID,
      branchId: 'branch-1',
    } as any);
    jest.spyOn(prisma.payment, 'findFirst').mockResolvedValue(null);
    jest.spyOn(prisma.payment, 'create').mockRejectedValue(new Error('database write failed'));
    const invalidate = jest.spyOn(financialSnapshotCache, 'invalidateFinancialSnapshotAfterMutation');
    const response = createResponse();

    await runWithTenant('tenant-a', () => createPayment({
      user: { userId: 'user-1' },
      body: {
        studentId: STUDENT_ID,
        amount: 1250,
        method: 'CASH',
      },
    } as unknown as Request, response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('TV-017 invalidates the committed branch after an AI-recorded payment', async () => {
    jest.spyOn(prisma.student, 'findFirst').mockResolvedValue({
      id: STUDENT_ID,
      branchId: 'branch-1',
    } as any);
    jest.spyOn(prisma.payment, 'create').mockResolvedValue({
      id: PAYMENT_ID,
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      transactionId: 'TXN-AI-1',
      amount: 500,
      method: 'CASH',
      status: 'COMPLETED',
    } as any);
    const invalidate = jest.spyOn(financialSnapshotCache, 'invalidateFinancialSnapshotAfterMutation')
      .mockResolvedValue({ success: true, scope: 'branch', invalidatedScopes: 2 });
    const response = createResponse();

    await runWithTenant('tenant-a', () => executeAIAction({
      user: { userId: 'user-1', role: 'BURSAR', branchId: 'branch-1' },
      body: {
        type: 'RECORD_PAYMENT',
        params: {
          studentName: 'Ada Lovelace',
          amount: 500,
          method: 'CASH',
        },
      },
    } as unknown as Request, response));

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      created: 'payment',
    }));
    expect(invalidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      source: 'ai-action.payment-created',
    });
  });

  it('TV-017 invalidates tenant snapshots after a committed webhook payment transition', async () => {
    jest.spyOn(lencoService, 'verifyWebhookSignature').mockReturnValue(true);
    jest.spyOn(systemPrisma.mobileMoneyCollection, 'findMany').mockResolvedValue([{
      id: 'collection-1',
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      reference: 'MM-WEBHOOK-1',
      status: 'PENDING',
      paymentId: PAYMENT_ID,
      initiatedByUserId: 'parent-1',
    }] as any);
    jest.spyOn(prisma.mobileMoneyCollection, 'updateMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.mobileMoneyCollection, 'findUnique').mockResolvedValue({
      id: 'collection-1',
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      reference: 'MM-WEBHOOK-1',
      status: 'SUCCESSFUL',
      paymentId: PAYMENT_ID,
      initiatedByUserId: 'parent-1',
    } as any);
    jest.spyOn(prisma.payment, 'updateMany').mockResolvedValue({ count: 1 });
    jest.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: PAYMENT_ID,
      tenantId: 'tenant-a',
      branchId: 'branch-1',
      transactionId: 'TXN-WEBHOOK-1',
      studentId: STUDENT_ID,
      amount: 500,
      status: 'COMPLETED',
      recordedByUserId: null,
    } as any);
    jest.spyOn(accountingBridge, 'onPaymentCreated').mockResolvedValue(undefined as any);
    jest.spyOn(queueRuntime, 'getQueueRuntimeStatus').mockReturnValue({
      state: 'ready',
      checkedAt: new Date().toISOString(),
    });
    jest.spyOn(paymentQueueService, 'enqueuePaymentReceipt').mockResolvedValue({
      jobId: `payment-${PAYMENT_ID}-receipt`,
      correlationId: '00000000-0000-4000-8000-000000000022',
    });
    const invalidate = jest.spyOn(financialSnapshotCache, 'invalidateFinancialSnapshotAfterMutation')
      .mockResolvedValue({ success: true, scope: 'tenant', invalidatedScopes: 1 });
    const response = createResponse();

    await handleLencoWebhook({
      headers: { 'x-lenco-signature': 'valid-signature' },
      body: {
        data: {
          reference: 'MM-WEBHOOK-1',
          status: 'successful',
          mobileMoneyDetails: { operatorTransactionId: 'operator-1' },
        },
      },
    } as unknown as Request, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(invalidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      scope: 'tenant',
      source: 'mobile-money.webhook-status-changed',
    });
    expect(invalidate).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      scope: 'tenant',
      source: 'payment.mobile-money-completed',
    });
  });
});
