import api from '../utils/api';

// ========================================
// TYPES
// ========================================

export interface Vendor {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  notes?: string;
  isActive: boolean;
  _count?: { expenses: number };
}

export interface Expense {
  id: string;
  expenseNumber: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  vendorId?: string;
  vendor?: Vendor;
  status: string;
  paymentMethod?: string;
  paymentRef?: string;
  receiptUrl?: string;
  requestedBy: string;
  approvedBy?: string;
  notes?: string;
  isRecurring: boolean;
  recurringFrequency?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  termId: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  discount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  notes?: string;
  sentAt?: string;
  paidAt?: string;
  items: InvoiceItem[];
  student?: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    class?: { name: string };
  };
  creditNotes?: CreditNote[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  feeTemplateId?: string;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  amount: number;
  reason: string;
  issuedAt: string;
}

export interface StaffPayroll {
  id: string;
  userId: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  taxDeduction: number;
  napsaDeduction: number;
  nhimaDeduction: number;
  otherDeductions: number;
  netSalary: number;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  isActive: boolean;
  user?: { id: string; fullName: string; email: string; role: string };
}

export interface PayrollRun {
  id: string;
  runNumber: string;
  month: number;
  year: number;
  description?: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  status: string;
  preparedBy: string;
  approvedBy?: string;
  paidAt?: string;
  _count?: { payslips: number };
  payslips?: Payslip[];
}

export interface Payslip {
  id: string;
  payslipNumber: string;
  userId: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  grossSalary: number;
  payeTax: number;
  napsaContribution: number;
  nhimaContribution: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  isPaid: boolean;
  user?: { fullName: string; email: string; role: string };
}

export interface Budget {
  id: string;
  name: string;
  period: string;
  year: number;
  startDate: string;
  endDate: string;
  totalBudget: number;
  totalSpent: number;
  status: string;
  notes?: string;
  items: BudgetItem[];
}

export interface BudgetItem {
  id: string;
  category: string;
  description?: string;
  allocated: number;
  spent: number;
  remaining: number;
  percentUsed?: string;
}

export interface PettyCashAccount {
  id: string;
  name: string;
  floatAmount: number;
  balance: number;
  custodianId: string;
  isActive: boolean;
  _count?: { transactions: number };
}

export interface PettyCashTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  category?: string;
  recordedBy: string;
  recordedByName?: string;
  date: string;
}

export interface AgedReceivable {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  ageDays: number;
  bucket: string;
  guardianPhone?: string;
  guardianEmail?: string;
}

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId?: string;
  description?: string;
  isSystem: boolean;
  children?: ChartOfAccount[];
  parent?: { name: string; code: string };
}

export interface Refund {
  id: string;
  refundNumber: string;
  paymentId: string;
  studentId: string;
  amount: number;
  reason: string;
  method: string;
  status: string;
  payment?: {
    student?: { firstName: string; lastName: string; admissionNumber: string };
  };
  createdAt: string;
}

export interface FinancialAuditEntry {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  amount?: number;
  createdAt: string;
}

// ========================================
// EXPENSE APIs
// ========================================

export const expenseApi = {
  getAll: (params?: any) => api.get('/expenses', { params }),
  getById: (id: string) => api.get(`/expenses/${id}`),
  create: (data: any) => api.post('/expenses', data),
  update: (id: string, data: any) => api.put(`/expenses/${id}`, data),
  approve: (id: string) => api.post(`/expenses/${id}/approve`),
  reject: (id: string, reason: string) => api.post(`/expenses/${id}/reject`, { reason }),
  markPaid: (id: string, data: any) => api.post(`/expenses/${id}/pay`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
  getSummary: (params?: any) => api.get('/expenses/summary', { params }),
  // Vendors
  getVendors: () => api.get('/expenses/vendors'),
  createVendor: (data: any) => api.post('/expenses/vendors', data),
  updateVendor: (id: string, data: any) => api.put(`/expenses/vendors/${id}`, data),
  deleteVendor: (id: string) => api.delete(`/expenses/vendors/${id}`),
};

// ========================================
// INVOICE APIs
// ========================================

export const invoiceApi = {
  getAll: (params?: any) => api.get('/invoices', { params }),
  getById: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  send: (id: string) => api.post(`/invoices/${id}/send`),
  recordPayment: (id: string, amount: number) => api.post(`/invoices/${id}/payment`, { amount }),
  cancel: (id: string) => api.post(`/invoices/${id}/cancel`),
  generateBulk: (termId: string, classId?: string) => api.post('/invoices/generate-bulk', { termId, classId }),
  createCreditNote: (data: any) => api.post('/invoices/credit-note', data),
  getSummary: () => api.get('/invoices/summary'),
};

// ========================================
// PAYROLL APIs
// ========================================

export const payrollApi = {
  getStaff: () => api.get('/payroll/staff'),
  createStaff: (data: any) => api.post('/payroll/staff', data),
  updateStaff: (id: string, data: any) => api.put(`/payroll/staff/${id}`, data),
  deleteStaff: (id: string) => api.delete(`/payroll/staff/${id}`),
  getRuns: () => api.get('/payroll/runs'),
  createRun: (data: any) => api.post('/payroll/runs', data),
  getRunDetail: (id: string) => api.get(`/payroll/runs/${id}`),
  approveRun: (id: string) => api.post(`/payroll/runs/${id}/approve`),
  markPaid: (id: string) => api.post(`/payroll/runs/${id}/pay`),
  getPayslip: (id: string) => api.get(`/payroll/payslips/${id}`),
};

// ========================================
// BUDGET APIs
// ========================================

export const budgetApi = {
  getAll: () => api.get('/budgets'),
  getById: (id: string) => api.get(`/budgets/${id}`),
  create: (data: any) => api.post('/budgets', data),
  update: (id: string, data: any) => api.put(`/budgets/${id}`, data),
  activate: (id: string) => api.post(`/budgets/${id}/activate`),
  close: (id: string) => api.post(`/budgets/${id}/close`),
  delete: (id: string) => api.delete(`/budgets/${id}`),
  getBudgetVsActual: () => api.get('/budgets/vs-actual'),
};

// ========================================
// PETTY CASH APIs
// ========================================

export const pettyCashApi = {
  getAccounts: () => api.get('/petty-cash/accounts'),
  createAccount: (data: any) => api.post('/petty-cash/accounts', data),
  getTransactions: (accountId: string, params?: any) => api.get(`/petty-cash/accounts/${accountId}/transactions`, { params }),
  createTransaction: (data: any) => api.post('/petty-cash/transactions', data),
  getSummary: (accountId: string) => api.get(`/petty-cash/accounts/${accountId}/summary`),
};

// ========================================
// FINANCIAL APIs
// ========================================

export const financialApi = {
  // Statements
  getTrialBalance: (params?: any) => api.get('/financial/trial-balance', { params }),
  getIncomeStatement: (params?: any) => api.get('/financial/income-statement', { params }),
  getBalanceSheet: (params?: any) => api.get('/financial/balance-sheet', { params }),
  getCashFlow: (params?: any) => api.get('/financial/cash-flow', { params }),
  getAgedReceivables: () => api.get('/financial/aged-receivables'),
  // Chart of Accounts
  getAccounts: () => api.get('/financial/accounts'),
  createAccount: (data: any) => api.post('/financial/accounts', data),
  seedDefaults: () => api.post('/financial/accounts/seed-defaults'),
  // Fee Categories
  getFeeCategories: () => api.get('/financial/fee-categories'),
  createFeeCategory: (data: any) => api.post('/financial/fee-categories', data),
  // Refunds
  getRefunds: () => api.get('/financial/refunds'),
  createRefund: (data: any) => api.post('/financial/refunds', data),
  approveRefund: (id: string) => api.post(`/financial/refunds/${id}/approve`),
  processRefund: (id: string) => api.post(`/financial/refunds/${id}/process`),
  // Audit Log
  getAuditLog: (params?: any) => api.get('/financial/audit-log', { params }),
};
