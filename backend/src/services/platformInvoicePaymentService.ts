import { systemPrisma as prisma } from '../utils/prisma';
import { markInvoicePaid } from './platformBillingService';
import { initiatePlatformSubscriptionCollection } from './lencoService';

// ---------------------------------------------------------------------------
// Tenant self-service subscription billing — lets a tenant admin view and pay
// their own platform subscription invoices via mobile money, always using the
// platform's own Lenco merchant account (never the tenant's own account).
// ---------------------------------------------------------------------------

class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const generateSubscriptionReference = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SUB-${timestamp}-${random}`;
};

export const listTenantInvoices = async (tenantId: string) => {
  return prisma.platformInvoice.findMany({
    where: { tenantId },
    orderBy: { periodStart: 'desc' },
    take: 100,
  });
};

export const getInvoicePaymentStatus = async (tenantId: string, invoiceId: string) => {
  return prisma.platformInvoiceCollection.findFirst({
    where: { invoiceId, tenantId },
    orderBy: { createdAt: 'desc' },
  });
};

interface InitiatePaymentInput {
  tenantId: string;
  invoiceId: string;
  userId?: string;
  phone: string;
  country: 'zm' | 'mw';
  operator: 'airtel' | 'mtn' | 'tnm';
}

export const initiateInvoicePayment = async (input: InitiatePaymentInput) => {
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id: input.invoiceId, tenantId: input.tenantId },
  });
  if (!invoice) {
    throw new HttpError('Invoice not found', 404);
  }
  if (invoice.status === 'PAID') {
    throw new HttpError('Invoice is already paid', 400);
  }
  if (invoice.status === 'VOID') {
    throw new HttpError('Invoice has been voided', 400);
  }
  if (invoice.status === 'DRAFT') {
    throw new HttpError('Invoice has not been issued yet', 400);
  }

  // Reuse a still-pending collection instead of starting a duplicate mobile money prompt.
  const existingPending = await prisma.platformInvoiceCollection.findFirst({
    where: { invoiceId: invoice.id, tenantId: input.tenantId, status: { in: ['PENDING', 'PAY_OFFLINE'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existingPending) {
    return existingPending;
  }

  const reference = generateSubscriptionReference();
  const collection = await prisma.platformInvoiceCollection.create({
    data: {
      reference,
      invoiceId: invoice.id,
      tenantId: input.tenantId,
      amount: invoice.totalAmount,
      phone: input.phone,
      country: input.country,
      operator: input.operator,
      initiatedByUserId: input.userId,
      status: 'PENDING',
    },
  });

  const result = await initiatePlatformSubscriptionCollection({
    amount: Number(invoice.totalAmount),
    phone: input.phone,
    country: input.country,
    operator: input.operator,
    reference,
  });

  if (!result.success) {
    return prisma.platformInvoiceCollection.update({
      where: { id: collection.id },
      data: { status: 'FAILED', reasonForFailure: result.error },
    });
  }

  return prisma.platformInvoiceCollection.update({
    where: { id: collection.id },
    data: {
      lencoReference: result.data?.lencoReference,
      lencoCollectionId: result.data?.id,
      status: result.data?.status === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
      fee: result.data?.fee ? parseFloat(result.data.fee) : null,
      accountName: result.data?.mobileMoneyDetails?.accountName,
    },
  });
};

/**
 * Applies a successful/failed webhook status transition to a platform invoice
 * collection, marking the parent invoice PAID when the collection succeeds.
 * Returns null when no matching collection row exists (caller should then check
 * the tenant fee-collection MobileMoneyCollection table for the same reference).
 */
export const applyInvoiceCollectionWebhookUpdate = async (
  reference: string,
  status: 'SUCCESSFUL' | 'FAILED' | 'PAY_OFFLINE',
  reasonForFailure?: string | null
) => {
  const collection = await prisma.platformInvoiceCollection.findUnique({ where: { reference } });
  if (!collection) return null;

  if (collection.status === status) {
    return collection;
  }
  if (collection.status === 'SUCCESSFUL') {
    return collection;
  }

  const updated = await prisma.platformInvoiceCollection.update({
    where: { id: collection.id },
    data: {
      status,
      reasonForFailure: reasonForFailure || null,
      completedAt: status === 'SUCCESSFUL' ? new Date() : null,
    },
  });

  if (status === 'SUCCESSFUL') {
    await markInvoicePaid(collection.invoiceId);
  }

  return updated;
};

export { HttpError };
