import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  listTenantInvoices,
  getInvoicePaymentStatus,
  initiateInvoicePayment,
  HttpError,
} from '../services/platformInvoicePaymentService';

export const getMyInvoicesHandler = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const invoices = await listTenantInvoices(tenantId);
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load invoices' });
  }
};

export const getMyInvoicePaymentStatusHandler = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const collection = await getInvoicePaymentStatus(tenantId, req.params.id);
    res.json(collection || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load payment status' });
  }
};

const payInvoiceSchema = z.object({
  phone: z.string().min(10).max(15),
  country: z.enum(['zm', 'mw']).default('zm'),
  operator: z.enum(['airtel', 'mtn', 'tnm']),
});

export const payMyInvoiceHandler = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const parseResult = payInvoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    if (parseResult.data.country === 'zm' && !['airtel', 'mtn'].includes(parseResult.data.operator)) {
      return res.status(400).json({ error: 'Invalid operator for Zambia. Use "airtel" or "mtn".' });
    }
    if (parseResult.data.country === 'mw' && !['airtel', 'tnm'].includes(parseResult.data.operator)) {
      return res.status(400).json({ error: 'Invalid operator for Malawi. Use "airtel" or "tnm".' });
    }

    const collection = await initiateInvoicePayment({
      tenantId,
      invoiceId: req.params.id,
      userId: req.user?.userId,
      ...parseResult.data,
    });
    res.json(collection);
  } catch (error: any) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    res.status(statusCode).json({ error: error.message || 'Failed to initiate payment' });
  }
};
