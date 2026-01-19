import { Router } from 'express';
import {
    getAllInvoices,
    generateInvoiceForSubscription,
    generateInvoicePDF,
    sendInvoiceReminder,
    bulkGenerateInvoices,
    getReconciliationDashboard,
    runReconciliation,
    getReconciliationHistory,
    exportFinancialReport,
} from '../controllers/invoiceController';
import { authenticatePlatformUser } from '../middleware/platformMiddleware';

const router = Router();

// All routes require platform admin authentication
router.use(authenticatePlatformUser);

// ==========================================
// INVOICE MANAGEMENT ROUTES
// ==========================================

// Get all invoices with filters
router.get('/invoices', getAllInvoices);

// Generate invoice for subscription payment
router.post('/invoices/generate', generateInvoiceForSubscription);

// Generate invoice PDF
router.get('/invoices/:invoiceId/pdf', generateInvoicePDF);

// Send invoice reminder
router.post('/invoices/:invoiceId/reminder', sendInvoiceReminder);

// Bulk generate invoices for pending payments
router.post('/invoices/bulk-generate', bulkGenerateInvoices);

// ==========================================
// REVENUE RECONCILIATION ROUTES
// ==========================================

// Get reconciliation dashboard
router.get('/reconciliation/dashboard', getReconciliationDashboard);

// Run reconciliation for a period
router.post('/reconciliation/run', runReconciliation);

// Get reconciliation history
router.get('/reconciliation/history', getReconciliationHistory);

// Export financial report
router.get('/reconciliation/export', exportFinancialReport);

export default router;
