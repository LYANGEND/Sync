import { Router } from 'express';
import {
  getMyInvoicesHandler,
  getMyInvoicePaymentStatusHandler,
  payMyInvoiceHandler,
} from '../controllers/subscriptionBillingController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN']));

// Tenant self-service: view and pay the school's own platform subscription invoices.
router.get('/invoices', getMyInvoicesHandler);
router.get('/invoices/:id/payment-status', getMyInvoicePaymentStatusHandler);
router.post('/invoices/:id/pay-with-lenco', payMyInvoiceHandler);

export default router;
