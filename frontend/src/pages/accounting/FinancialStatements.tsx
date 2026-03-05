import { useState, useEffect } from 'react';
import { BarChart3, PieChart, TrendingUp, Clock, BookOpen, RefreshCw, Plus, X, CheckCircle, DollarSign, Shield } from 'lucide-react';
import { financialApi, ChartOfAccount, Refund, FinancialAuditEntry } from '../../services/accountingService';
import toast from 'react-hot-toast';

type Tab = 'trial-balance' | 'income' | 'balance-sheet' | 'cash-flow' | 'receivables' | 'accounts' | 'refunds' | 'audit';

const FinancialStatements = ({ embedded = false }: { embedded?: boolean }) => {
  const [activeTab, setActiveTab] = useState<Tab>('trial-balance');
  const [loading, setLoading] = useState(false);

  // Data
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [auditLog, setAuditLog] = useState<FinancialAuditEntry[]>([]);

  // Modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'ASSET', parentId: '', description: '' });
  const [refundForm, setRefundForm] = useState({ paymentId: '', studentId: '', amount: '', reason: '', method: 'CASH' });

  // Date filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  const loadTabData = async (tab: Tab) => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      switch (tab) {
        case 'trial-balance': {
          const tb = await financialApi.getTrialBalance(params);
          const raw = tb.data;
          // Backend returns { period, entries: [...] }
          const entries = raw.entries || raw.accounts || [];
          const totalDebits = entries.reduce((s: number, e: any) => s + (e.debit || 0), 0);
          const totalCredits = entries.reduce((s: number, e: any) => s + (e.credit || 0), 0);
          setTrialBalance({
            period: raw.period ? `${new Date(raw.period.startDate).toLocaleDateString()} — ${new Date(raw.period.endDate).toLocaleDateString()}` : '',
            accounts: entries.map((e: any) => ({ name: e.accountName || e.name || e.accountCode, debit: e.debit || 0, credit: e.credit || 0 })),
            totalDebits,
            totalCredits,
            isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
          });
          break;
        }
        case 'income': {
          const inc = await financialApi.getIncomeStatement(params);
          const raw = inc.data;
          // Backend returns { period, income, totalIncome, expenses, totalExpenses, netIncome }
          setIncomeStatement({
            income: raw.income || [],
            totalIncome: raw.totalIncome || 0,
            expenses: raw.expenses || [],
            totalExpenses: raw.totalExpenses || 0,
            netIncome: raw.netIncome || 0,
          });
          break;
        }
        case 'balance-sheet': {
          const bs = await financialApi.getBalanceSheet(params);
          const raw = bs.data;
          // Backend returns { asOfDate, assets, totalAssets, liabilities, totalLiabilities, equity, totalEquity }
          setBalanceSheet({
            assets: (raw.assets || []).map((a: any) => ({ name: a.name, amount: a.balance || a.amount || 0 })),
            totalAssets: raw.totalAssets || 0,
            liabilities: (raw.liabilities || []).map((l: any) => ({ name: l.name, amount: l.balance || l.amount || 0 })),
            totalLiabilities: raw.totalLiabilities || 0,
            equity: (raw.equity || []).map((e: any) => ({ name: e.name, amount: e.balance || e.amount || 0 })),
            totalEquity: raw.totalEquity || 0,
          });
          break;
        }
        case 'cash-flow': {
          const cf = await financialApi.getCashFlow(params);
          const raw = cf.data;
          // Backend returns { inflows: { feeCollections, totalInflow }, outflows: { expenses, payroll, totalOutflow }, netCashFlow }
          setCashFlow({
            totalInflows: raw.inflows?.totalInflow ?? raw.totalInflows ?? 0,
            totalOutflows: raw.outflows?.totalOutflow ?? raw.totalOutflows ?? 0,
            netCashFlow: raw.netCashFlow ?? 0,
            details: {
              feeCollections: raw.inflows?.feeCollections ?? 0,
              expenseOutflows: raw.outflows?.expenses ?? 0,
              payrollOutflows: raw.outflows?.payroll ?? 0,
            },
          });
          break;
        }
        case 'receivables': {
          const rec = await financialApi.getAgedReceivables();
          const raw = rec.data;
          // Backend returns { receivables: [...], summary, studentCount }
          setReceivables(raw.receivables || raw || []);
          break;
        }
        case 'accounts': {
          const accs = await financialApi.getAccounts();
          // Backend returns array directly
          const raw = accs.data;
          setAccounts(Array.isArray(raw) ? raw : (raw.accounts || []));
          break;
        }
        case 'refunds': {
          const ref = await financialApi.getRefunds();
          // Backend returns array directly
          const raw = ref.data;
          setRefunds(Array.isArray(raw) ? raw : (raw.refunds || []));
          break;
        }
        case 'audit': {
          const aud = await financialApi.getAuditLog();
          const raw = aud.data;
          // Backend returns { logs, total, page, totalPages }
          setAuditLog(raw.logs || (Array.isArray(raw) ? raw : []));
          break;
        }
      }
    } catch (err: any) {
      console.error('Financial data load error:', err);
      // Set safe empty defaults so the UI renders empty-state instead of crashing
      switch (tab) {
        case 'trial-balance': setTrialBalance({ accounts: [], totalDebits: 0, totalCredits: 0, isBalanced: true, period: '' }); break;
        case 'income': setIncomeStatement({ income: [], expenses: [], totalIncome: 0, totalExpenses: 0, netIncome: 0 }); break;
        case 'balance-sheet': setBalanceSheet({ assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0 }); break;
        case 'cash-flow': setCashFlow({ totalInflows: 0, totalOutflows: 0, netCashFlow: 0, details: {} }); break;
        case 'receivables': setReceivables([]); break;
        case 'accounts': setAccounts([]); break;
        case 'refunds': setRefunds([]); break;
        case 'audit': setAuditLog([]); break;
      }
      if (err.response?.status !== 404) {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await financialApi.seedDefaults();
      toast.success('Default chart of accounts seeded');
      loadTabData('accounts');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to seed defaults');
    }
  };

  const handleCreateAccount = async () => {
    try {
      await financialApi.createAccount({
        ...accountForm,
        parentId: accountForm.parentId || undefined,
      });
      toast.success('Account created');
      setShowAccountModal(false);
      setAccountForm({ code: '', name: '', type: 'ASSET', parentId: '', description: '' });
      loadTabData('accounts');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create account');
    }
  };

  const handleCreateRefund = async () => {
    try {
      await financialApi.createRefund({
        paymentId: refundForm.paymentId,
        studentId: refundForm.studentId,
        amount: parseFloat(refundForm.amount),
        reason: refundForm.reason,
        method: refundForm.method,
      });
      toast.success('Refund request created');
      setShowRefundModal(false);
      setRefundForm({ paymentId: '', studentId: '', amount: '', reason: '', method: 'CASH' });
      loadTabData('refunds');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create refund');
    }
  };

  const handleApproveRefund = async (id: string) => {
    try {
      await financialApi.approveRefund(id);
      toast.success('Refund approved');
      loadTabData('refunds');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleProcessRefund = async (id: string) => {
    try {
      await financialApi.processRefund(id);
      toast.success('Refund processed');
      loadTabData('refunds');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process');
    }
  };

  const fmt = (n: number) => `K${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const tabs = [
    { key: 'trial-balance', label: 'Trial Balance', icon: BarChart3 },
    { key: 'income', label: 'Income Statement', icon: TrendingUp },
    { key: 'balance-sheet', label: 'Balance Sheet', icon: PieChart },
    { key: 'cash-flow', label: 'Cash Flow', icon: RefreshCw },
    { key: 'receivables', label: 'Aged Receivables', icon: Clock },
    { key: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
    { key: 'refunds', label: 'Refunds', icon: DollarSign },
    { key: 'audit', label: 'Audit Log', icon: Shield },
  ];

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Financial Reports</h1>
          <p className="text-gray-500 dark:text-gray-400">Statements, accounts, refunds, and audit trail</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <nav className="flex space-x-2 min-w-max">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as Tab)}
              className={`flex items-center space-x-1.5 px-3 py-3 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}>
              <tab.icon size={14} /><span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Date Filter (for financial statements) */}
      {['trial-balance', 'income', 'balance-sheet', 'cash-flow'].includes(activeTab) && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500">From:</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500">To:</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          </div>
          <button onClick={() => loadTabData(activeTab)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Apply</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
      ) : (
        <>
          {/* ======== TRIAL BALANCE ======== */}
          {activeTab === 'trial-balance' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
              <div className="p-4 border-b dark:border-gray-700">
                <h3 className="font-semibold dark:text-white">Trial Balance</h3>
                {trialBalance?.period && <p className="text-sm text-gray-500">{trialBalance.period}</p>}
              </div>
              {trialBalance && (trialBalance.accounts || []).length > 0 ? (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Account</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Debit</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {(trialBalance.accounts || []).map((acct: any, i: number) => (
                        <tr key={i}>
                          <td className="px-4 py-2 dark:text-gray-200">{acct.name || acct.code}</td>
                          <td className="px-4 py-2 text-right dark:text-gray-200">{acct.debit > 0 ? fmt(acct.debit) : ''}</td>
                          <td className="px-4 py-2 text-right dark:text-gray-200">{acct.credit > 0 ? fmt(acct.credit) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-700 font-bold">
                      <tr>
                        <td className="px-4 py-3 dark:text-white">Total</td>
                        <td className="px-4 py-3 text-right dark:text-white">{fmt(trialBalance.totalDebits)}</td>
                        <td className="px-4 py-3 text-right dark:text-white">{fmt(trialBalance.totalCredits)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {trialBalance.isBalanced !== undefined && (
                    <div className={`p-4 text-sm ${trialBalance.isBalanced ? 'bg-green-50 dark:bg-green-900/20 text-green-700' : 'bg-red-50 dark:bg-red-900/20 text-red-700'}`}>
                      {trialBalance.isBalanced ? '✓ Trial balance is balanced' : '✗ Trial balance is NOT balanced — discrepancy detected'}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <BarChart3 size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No journal entries found</p>
                  <p className="text-sm mt-1">Seed default accounts and create journal entries to see the trial balance.</p>
                </div>
              )}
            </div>
          )}

          {/* ======== INCOME STATEMENT ======== */}
          {activeTab === 'income' && (
            <div className="space-y-4">
              {incomeStatement ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Total Income</p>
                      <p className="text-2xl font-bold text-green-600">{fmt(incomeStatement.totalIncome)}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Total Expenses</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(incomeStatement.totalExpenses)}</p>
                    </div>
                    <div className={`p-4 rounded-lg ${incomeStatement.netIncome >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                      <p className="text-sm text-gray-500">Net Income</p>
                      <p className={`text-2xl font-bold ${incomeStatement.netIncome >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(incomeStatement.netIncome)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h4 className="font-semibold text-green-600 mb-3">Income</h4>
                      {(incomeStatement.income || []).length > 0 ? (
                        (incomeStatement.income || []).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between py-1.5 text-sm border-b dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">{item.name || item.category}</span>
                            <span className="font-medium dark:text-white">{fmt(item.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400">No income entries in this period</p>
                      )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h4 className="font-semibold text-red-600 mb-3">Expenses</h4>
                      {(incomeStatement.expenses || []).length > 0 ? (
                        (incomeStatement.expenses || []).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between py-1.5 text-sm border-b dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">{item.name || item.category}</span>
                            <span className="font-medium dark:text-white">{fmt(item.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400">No expense entries in this period</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500 dark:text-gray-400">
                  <TrendingUp size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No data available</p>
                  <p className="text-sm mt-1">Create journal entries with income and expense accounts.</p>
                </div>
              )}
            </div>
          )}

          {/* ======== BALANCE SHEET ======== */}
          {activeTab === 'balance-sheet' && (
            balanceSheet ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h4 className="font-semibold text-blue-600 mb-3">Assets</h4>
                    {(balanceSheet.assets || []).length > 0 ? (
                      (balanceSheet.assets || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between py-1.5 text-sm border-b dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                          <span className="font-medium dark:text-white">{fmt(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400">No asset entries</p>
                    )}
                    <div className="flex justify-between pt-3 font-bold">
                      <span className="dark:text-white">Total Assets</span>
                      <span className="text-blue-600">{fmt(balanceSheet.totalAssets)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h4 className="font-semibold text-red-600 mb-3">Liabilities</h4>
                    {(balanceSheet.liabilities || []).length > 0 ? (
                      (balanceSheet.liabilities || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between py-1.5 text-sm border-b dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                          <span className="font-medium dark:text-white">{fmt(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400">No liability entries</p>
                    )}
                    <div className="flex justify-between pt-3 font-bold">
                      <span className="dark:text-white">Total Liabilities</span>
                      <span className="text-red-600">{fmt(balanceSheet.totalLiabilities)}</span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h4 className="font-semibold text-green-600 mb-3">Equity</h4>
                    {(balanceSheet.equity || []).length > 0 ? (
                      (balanceSheet.equity || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between py-1.5 text-sm border-b dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                          <span className="font-medium dark:text-white">{fmt(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400">No equity entries</p>
                    )}
                    <div className="flex justify-between pt-3 font-bold">
                      <span className="dark:text-white">Total Equity</span>
                      <span className="text-green-600">{fmt(balanceSheet.totalEquity)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500 dark:text-gray-400">
                <PieChart size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No data available</p>
                <p className="text-sm mt-1">Seed default accounts and create transactions to see the balance sheet.</p>
              </div>
            )
          )}

          {/* ======== CASH FLOW ======== */}
          {activeTab === 'cash-flow' && cashFlow && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Cash Inflows</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(cashFlow.totalInflows)}</p>
                  {cashFlow.details?.feeCollections > 0 && (
                    <p className="text-xs text-gray-400 mt-1">Fee collections: {fmt(cashFlow.details.feeCollections)}</p>
                  )}
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Cash Outflows</p>
                  <p className="text-2xl font-bold text-red-600">{fmt(cashFlow.totalOutflows)}</p>
                  <div className="text-xs text-gray-400 mt-1">
                    {cashFlow.details?.expenseOutflows > 0 && <p>Expenses: {fmt(cashFlow.details.expenseOutflows)}</p>}
                    {cashFlow.details?.payrollOutflows > 0 && <p>Payroll: {fmt(cashFlow.details.payrollOutflows)}</p>}
                  </div>
                </div>
                <div className={`p-4 rounded-lg ${cashFlow.netCashFlow >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                  <p className="text-sm text-gray-500">Net Cash Flow</p>
                  <p className={`text-2xl font-bold ${cashFlow.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(cashFlow.netCashFlow)}</p>
                </div>
              </div>

              {/* Summary table */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h4 className="font-semibold dark:text-white mb-4">Cash Flow Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">Inflows</span>
                    <span className="text-green-600 font-bold">{fmt(cashFlow.totalInflows)}</span>
                  </div>
                  {cashFlow.details?.feeCollections > 0 && (
                    <div className="flex justify-between py-1 pl-4">
                      <span className="text-gray-500 dark:text-gray-400">Fee Collections</span>
                      <span className="dark:text-gray-200">{fmt(cashFlow.details.feeCollections)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">Outflows</span>
                    <span className="text-red-600 font-bold">{fmt(cashFlow.totalOutflows)}</span>
                  </div>
                  {cashFlow.details?.expenseOutflows > 0 && (
                    <div className="flex justify-between py-1 pl-4">
                      <span className="text-gray-500 dark:text-gray-400">Expenses</span>
                      <span className="dark:text-gray-200">{fmt(cashFlow.details.expenseOutflows)}</span>
                    </div>
                  )}
                  {cashFlow.details?.payrollOutflows > 0 && (
                    <div className="flex justify-between py-1 pl-4">
                      <span className="text-gray-500 dark:text-gray-400">Payroll</span>
                      <span className="dark:text-gray-200">{fmt(cashFlow.details.payrollOutflows)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t-2 dark:border-gray-600 font-bold">
                    <span className="dark:text-white">Net Cash Flow</span>
                    <span className={cashFlow.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}>{fmt(cashFlow.netCashFlow)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======== AGED RECEIVABLES ======== */}
          {activeTab === 'receivables' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Class</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Total Due</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Paid</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Balance</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Age</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Bucket</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {receivables.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No outstanding receivables</td></tr>
                  ) : receivables.map((r: any, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2">
                        <p className="font-medium dark:text-white">{r.studentName}</p>
                        <p className="text-xs text-gray-400">{r.admissionNumber}</p>
                      </td>
                      <td className="px-4 py-2 dark:text-gray-200">{r.className}</td>
                      <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(r.totalDue)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{fmt(r.totalPaid)}</td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">{fmt(r.balance)}</td>
                      <td className="px-4 py-2 text-center text-gray-500">{r.ageDays}d</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.bucket === '90+' ? 'bg-red-100 text-red-700' :
                          r.bucket === '60-90' ? 'bg-orange-100 text-orange-700' :
                          r.bucket === '30-60' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>{r.bucket} days</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ======== CHART OF ACCOUNTS ======== */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <div className="flex justify-end space-x-2">
                <button onClick={handleSeedDefaults}
                  className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm">
                  <RefreshCw size={16} /><span>Seed Defaults</span>
                </button>
                <button onClick={() => setShowAccountModal(true)}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                  <Plus size={16} /><span>New Account</span>
                </button>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Code</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Description</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">System</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {accounts.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No accounts. Click "Seed Defaults" to create standard accounts.</td></tr>
                    ) : accounts.map(acct => (
                      <tr key={acct.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-2 font-mono text-blue-600">{acct.code}</td>
                        <td className="px-4 py-2 font-medium dark:text-white">{acct.name}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            acct.type === 'ASSET' ? 'bg-blue-100 text-blue-700' :
                            acct.type === 'LIABILITY' ? 'bg-red-100 text-red-700' :
                            acct.type === 'EQUITY' ? 'bg-green-100 text-green-700' :
                            acct.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>{acct.type}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{acct.description || '—'}</td>
                        <td className="px-4 py-2 text-center">{acct.isSystem ? <CheckCircle size={14} className="inline text-green-500" /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======== REFUNDS ======== */}
          {activeTab === 'refunds' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => setShowRefundModal(true)}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                  <Plus size={16} /><span>New Refund</span>
                </button>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Refund #</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Student</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Amount</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Reason</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Date</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {refunds.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No refunds</td></tr>
                    ) : refunds.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-2 font-mono text-blue-600">{r.refundNumber}</td>
                        <td className="px-4 py-2 dark:text-gray-200">
                          {r.payment?.student ? `${r.payment.student.firstName} ${r.payment.student.lastName}` : r.studentId}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-red-600">{fmt(r.amount)}</td>
                        <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{r.reason}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                            r.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                            r.status === 'PROCESSED' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-center">
                          {r.status === 'PENDING' && (
                            <button onClick={() => handleApproveRefund(r.id)} className="text-sm text-green-600 hover:underline mr-2">Approve</button>
                          )}
                          {r.status === 'APPROVED' && (
                            <button onClick={() => handleProcessRefund(r.id)} className="text-sm text-blue-600 hover:underline">Process</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======== AUDIT LOG ======== */}
          {activeTab === 'audit' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Timestamp</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">User</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Action</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Entity</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Description</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {auditLog.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No audit entries</td></tr>
                  ) : auditLog.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2 dark:text-gray-200">{entry.userName || entry.userId}</td>
                      <td className="px-4 py-2"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{entry.action}</span></td>
                      <td className="px-4 py-2 text-gray-500">{entry.entityType}</td>
                      <td className="px-4 py-2 dark:text-gray-200 max-w-xs truncate">{entry.description}</td>
                      <td className="px-4 py-2 text-right font-medium dark:text-gray-200">{entry.amount ? fmt(entry.amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ======== CREATE ACCOUNT MODAL ======== */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">New Account</h2>
              <button onClick={() => setShowAccountModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code</label>
                  <input type="text" value={accountForm.code} onChange={e => setAccountForm({ ...accountForm, code: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., 1000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="ASSET">Asset</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="EQUITY">Equity</option>
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input type="text" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input type="text" value={accountForm.description} onChange={e => setAccountForm({ ...accountForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowAccountModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateAccount}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== REFUND MODAL ======== */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Create Refund</h2>
              <button onClick={() => setShowRefundModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment ID</label>
                <input type="text" value={refundForm.paymentId} onChange={e => setRefundForm({ ...refundForm, paymentId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Student ID</label>
                <input type="text" value={refundForm.studentId} onChange={e => setRefundForm({ ...refundForm, studentId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (ZMW)</label>
                  <input type="number" step="0.01" value={refundForm.amount} onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Method</label>
                  <select value={refundForm.method} onChange={e => setRefundForm({ ...refundForm, method: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                <textarea value={refundForm.reason} onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowRefundModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateRefund}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Submit Refund</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialStatements;
