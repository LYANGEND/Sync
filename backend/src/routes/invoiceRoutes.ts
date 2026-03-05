import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getInvoices, getInvoiceById, createInvoice, sendInvoice,
  recordInvoicePayment, cancelInvoice, generateStudentInvoices,
  createCreditNote, getInvoiceSummary,
} from '../controllers/invoiceController';

const router = Router();

router.use(authenticateToken);

router.get('/summary', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getInvoiceSummary);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), getInvoices);
router.get('/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), getInvoiceById);
router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createInvoice);
router.post('/generate-bulk', authorizeRole(['SUPER_ADMIN', 'BURSAR']), generateStudentInvoices);
router.post('/:id/send', authorizeRole(['SUPER_ADMIN', 'BURSAR']), sendInvoice);
router.post('/:id/payment', authorizeRole(['SUPER_ADMIN', 'BURSAR']), recordInvoicePayment);
router.post('/:id/cancel', authorizeRole(['SUPER_ADMIN', 'BURSAR']), cancelInvoice);
router.post('/credit-note', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createCreditNote);

export default router;
