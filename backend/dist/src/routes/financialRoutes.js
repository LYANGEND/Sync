"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const financialController_1 = require("../controllers/financialController");
const aiFinancialController_1 = require("../controllers/aiFinancialController");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// AI Financial Advisor
router.post('/ai-advisor', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), rateLimiter_1.aiLimiter, aiFinancialController_1.getAIFinancialAdvice);
router.get('/ai-advisor/snapshot', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiFinancialController_1.getFinancialSnapshot);
router.post('/ai-advisor/quick-insights', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), rateLimiter_1.aiLimiter, aiFinancialController_1.getQuickInsights);
router.post('/ai-advisor/execute-action', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), aiFinancialController_1.executeAIAction);
// AI Conversation History
router.get('/ai-advisor/conversations', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiFinancialController_1.listConversations);
router.get('/ai-advisor/conversations/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiFinancialController_1.getConversation);
router.patch('/ai-advisor/conversations/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiFinancialController_1.updateConversation);
router.delete('/ai-advisor/conversations/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), aiFinancialController_1.deleteConversation);
// Financial Statements
router.get('/trial-balance', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.trialBalance);
router.get('/income-statement', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.incomeStatement);
router.get('/balance-sheet', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.balanceSheet);
router.get('/cash-flow', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.cashFlowStatement);
router.get('/aged-receivables', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.agedReceivables);
// Chart of Accounts
router.get('/accounts', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.getChartOfAccounts);
router.post('/accounts', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), financialController_1.createAccount);
router.post('/accounts/seed-defaults', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), financialController_1.seedDefaultAccounts);
// Fee Categories
router.get('/fee-categories', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.getFeeCategories);
router.post('/fee-categories', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), financialController_1.createFeeCategory);
// Refunds
router.get('/refunds', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.getRefunds);
router.post('/refunds', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.createRefund);
router.post('/refunds/:id/approve', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), financialController_1.approveRefund);
router.post('/refunds/:id/process', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), financialController_1.processRefund);
// Audit Log
router.get('/audit-log', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), financialController_1.getFinancialAuditLog);
exports.default = router;
