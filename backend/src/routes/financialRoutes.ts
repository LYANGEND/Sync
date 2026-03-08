import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  trialBalance, incomeStatement, balanceSheet, cashFlowStatement,
  agedReceivables, getChartOfAccounts, createAccount, seedDefaultAccounts,
  getRefunds, createRefund, approveRefund, processRefund,
  getFinancialAuditLog, getFeeCategories, createFeeCategory,
} from '../controllers/financialController';
import {
  getAIFinancialAdvice,
  getFinancialSnapshot,
  getQuickInsights,
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  executeAIAction,
  getCashFlowForecast,
  getComplianceStatus,
  autoAllocatePayments,
  saveReport,
  listReports,
  getReport,
} from '../controllers/aiFinancialController';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

// AI Financial Advisor
router.post('/ai-advisor', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiLimiter, getAIFinancialAdvice);
router.get('/ai-advisor/snapshot', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), getFinancialSnapshot);
router.post('/ai-advisor/quick-insights', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiLimiter, getQuickInsights);
router.post('/ai-advisor/execute-action', authorizeRole(['SUPER_ADMIN', 'BURSAR']), executeAIAction);
router.get('/ai-advisor/cash-flow-forecast', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiLimiter, getCashFlowForecast);
router.get('/ai-advisor/compliance', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), getComplianceStatus);
router.post('/ai-advisor/allocate-payments', authorizeRole(['SUPER_ADMIN', 'BURSAR']), autoAllocatePayments);
router.post('/ai-advisor/reports', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), saveReport);
router.get('/ai-advisor/reports', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), listReports);
router.get('/ai-advisor/reports/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), getReport);

// AI Conversation History
router.get('/ai-advisor/conversations', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), listConversations);
router.get('/ai-advisor/conversations/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), getConversation);
router.patch('/ai-advisor/conversations/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), updateConversation);
router.delete('/ai-advisor/conversations/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), deleteConversation);

// Financial Statements
router.get('/trial-balance', authorizeRole(['SUPER_ADMIN', 'BURSAR']), trialBalance);
router.get('/income-statement', authorizeRole(['SUPER_ADMIN', 'BURSAR']), incomeStatement);
router.get('/balance-sheet', authorizeRole(['SUPER_ADMIN', 'BURSAR']), balanceSheet);
router.get('/cash-flow', authorizeRole(['SUPER_ADMIN', 'BURSAR']), cashFlowStatement);
router.get('/aged-receivables', authorizeRole(['SUPER_ADMIN', 'BURSAR']), agedReceivables);

// Chart of Accounts
router.get('/accounts', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getChartOfAccounts);
router.post('/accounts', authorizeRole(['SUPER_ADMIN']), createAccount);
router.post('/accounts/seed-defaults', authorizeRole(['SUPER_ADMIN']), seedDefaultAccounts);

// Fee Categories
router.get('/fee-categories', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFeeCategories);
router.post('/fee-categories', authorizeRole(['SUPER_ADMIN']), createFeeCategory);

// Refunds
router.get('/refunds', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getRefunds);
router.post('/refunds', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createRefund);
router.post('/refunds/:id/approve', authorizeRole(['SUPER_ADMIN']), approveRefund);
router.post('/refunds/:id/process', authorizeRole(['SUPER_ADMIN', 'BURSAR']), processRefund);

// Audit Log
router.get('/audit-log', authorizeRole(['SUPER_ADMIN']), getFinancialAuditLog);

export default router;
