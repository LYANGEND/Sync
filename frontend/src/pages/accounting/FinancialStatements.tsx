import { useState, useEffect } from 'react';
import { BarChart3, PieChart, TrendingUp, Clock, BookOpen, RefreshCw, Plus, X, CheckCircle, DollarSign, Shield } from 'lucide-react';
import { financialApi, ChartOfAccount, Refund, FinancialAuditEntry } from '../../services/accountingService';
import toast from 'react-hot-toast';

type Tab = 'trial-balance' | 'income' | 'balance-sheet' | 'cash-flow' | 'receivables' | 'accounts' | 'refunds' | 'audit';

const toInputDate = (date: Date) => date.toISOString().split('T')[0];

const normalizeTrialBalance = (raw: any) => {
  const entries = raw.entries || raw.accounts || [];
  const totalDebits = entries.reduce((sum: number, entry: any) => sum + (entry.debit || 0), 0);
  const totalCredits = entries.reduce((sum: number, entry: any) => sum + (entry.credit || 0), 0);

  return {
    period: raw.period ? `${new Date(raw.period.startDate).toLocaleDateString()} — ${new Date(raw.period.endDate).toLocaleDateString()}` : '',
    accounts: entries.map((entry: any) => ({
      name: entry.accountName || entry.name || entry.accountCode,
      debit: entry.debit || 0,
      credit: entry.credit || 0,
    })),
    totalDebits,
    totalCredits,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
};

const normalizeIncomeStatement = (raw: any) => ({
  income: raw.income || [],
  totalIncome: raw.totalIncome || 0,
  expenses: raw.expenses || [],
  totalExpenses: raw.totalExpenses || 0,
  netIncome: raw.netIncome || 0,
});

const normalizeBalanceSheet = (raw: any) => ({
  assets: (raw.assets || []).map((item: any) => ({ name: item.name, amount: item.balance || item.amount || 0 })),
  totalAssets: raw.totalAssets || 0,
  liabilities: (raw.liabilities || []).map((item: any) => ({ name: item.name, amount: item.balance || item.amount || 0 })),
  totalLiabilities: raw.totalLiabilities || 0,
  equity: (raw.equity || []).map((item: any) => ({ name: item.name, amount: item.balance || item.amount || 0 })),
  totalEquity: raw.totalEquity || 0,
});

const normalizeCashFlow = (raw: any) => ({
  totalInflows: raw.inflows?.totalInflow ?? raw.totalInflows ?? 0,
  totalOutflows: raw.outflows?.totalOutflow ?? raw.totalOutflows ?? 0,
  netCashFlow: raw.netCashFlow ?? 0,
  details: {
    feeCollections: raw.inflows?.feeCollections ?? 0,
    expenseOutflows: raw.outflows?.expenses ?? 0,
    payrollOutflows: raw.outflows?.payroll ?? 0,
  },
});

const buildComparisonWindow = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;

  const rangeMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd.getTime() - rangeMs);

  return {
    params: {
      startDate: toInputDate(previousStart),
      endDate: toInputDate(previousEnd),
    },
    label: `${previousStart.toLocaleDateString()} — ${previousEnd.toLocaleDateString()}`,
  };
};

const calculateChange = (current: number, previous: number) => {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

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
  const [comparisonLabel, setComparisonLabel] = useState('');
  const [comparisonIncome, setComparisonIncome] = useState<any>(null);
  const [comparisonBalanceSheet, setComparisonBalanceSheet] = useState<any>(null);
  const [comparisonCashFlow, setComparisonCashFlow] = useState<any>(null);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  const applyDatePreset = (preset: 'this-month' | 'last-month' | 'ytd' | 'clear') => {
    const today = new Date();

    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }

    if (preset === 'this-month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(today));
      return;
    }

    if (preset === 'last-month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setDateFrom(toInputDate(start));
      setDateTo(toInputDate(end));
      return;
    }

    const start = new Date(today.getFullYear(), 0, 1);
    setDateFrom(toInputDate(start));
    setDateTo(toInputDate(today));
  };

  const loadTabData = async (tab: Tab) => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const comparisonWindow = buildComparisonWindow(dateFrom, dateTo);

      switch (tab) {
        case 'trial-balance': {
          const tb = await financialApi.getTrialBalance(params);
          setTrialBalance(normalizeTrialBalance(tb.data));
          setComparisonLabel('');
          setComparisonIncome(null);
          setComparisonBalanceSheet(null);
          setComparisonCashFlow(null);
          break;
        }
        case 'income': {
          if (comparisonWindow) {
            const [inc, prev] = await Promise.all([
              financialApi.getIncomeStatement(params),
              financialApi.getIncomeStatement(comparisonWindow.params),
            ]);
            setIncomeStatement(normalizeIncomeStatement(inc.data));
            setComparisonIncome(normalizeIncomeStatement(prev.data));
            setComparisonLabel(comparisonWindow.label);
          } else {
            const inc = await financialApi.getIncomeStatement(params);
            setIncomeStatement(normalizeIncomeStatement(inc.data));
            setComparisonIncome(null);
            setComparisonLabel('');
          }
          setComparisonBalanceSheet(null);
          setComparisonCashFlow(null);
          break;
        }
        case 'balance-sheet': {
          if (comparisonWindow) {
            const [bs, prev] = await Promise.all([
              financialApi.getBalanceSheet(params),
              financialApi.getBalanceSheet(comparisonWindow.params),
            ]);
            setBalanceSheet(normalizeBalanceSheet(bs.data));
            setComparisonBalanceSheet(normalizeBalanceSheet(prev.data));
            setComparisonLabel(comparisonWindow.label);
          } else {
            const bs = await financialApi.getBalanceSheet(params);
            setBalanceSheet(normalizeBalanceSheet(bs.data));
            setComparisonBalanceSheet(null);
            setComparisonLabel('');
          }
          setComparisonIncome(null);
          setComparisonCashFlow(null);
          break;
        }
        case 'cash-flow': {
          if (comparisonWindow) {
            const [cf, prev] = await Promise.all([
              financialApi.getCashFlow(params),
              financialApi.getCashFlow(comparisonWindow.params),
            ]);
            setCashFlow(normalizeCashFlow(cf.data));
            setComparisonCashFlow(normalizeCashFlow(prev.data));
            setComparisonLabel(comparisonWindow.label);
          } else {
            const cf = await financialApi.getCashFlow(params);
            setCashFlow(normalizeCashFlow(cf.data));
            setComparisonCashFlow(null);
            setComparisonLabel('');
          }
          setComparisonIncome(null);
          setComparisonBalanceSheet(null);
          break;
        }
        case 'receivables': {
          const rec = await financialApi.getAgedReceivables();
          const raw = rec.data;
          // Backend returns { receivables: [...], summary, studentCount }
          setReceivables(raw.receivables || raw || []);
          setComparisonLabel('');
          setComparisonIncome(null);
          setComparisonBalanceSheet(null);
          setComparisonCashFlow(null);
          break;
        }
        case 'accounts': {
          const accs = await financialApi.getAccounts();
          // Backend returns array directly
          const raw = accs.data;
          setAccounts(Array.isArray(raw) ? raw : (raw.accounts || []));
          setComparisonLabel('');
          setComparisonIncome(null);
          setComparisonBalanceSheet(null);
          setComparisonCashFlow(null);
          break;
        }
        case 'refunds': {
          const ref = await financialApi.getRefunds();
          // Backend returns array directly
          const raw = ref.data;
          setRefunds(Array.isArray(raw) ? raw : (raw.refunds || []));
          setComparisonLabel('');
          setComparisonIncome(null);
          setComparisonBalanceSheet(null);
          setComparisonCashFlow(null);
          break;
        }
        case 'audit': {
          const aud = await financialApi.getAuditLog();
          const raw = aud.data;
          // Backend returns { logs, total, page, totalPages }
          setAuditLog(raw.logs || (Array.isArray(raw) ? raw : []));
          setComparisonLabel('');
          setComparisonIncome(null);
          setComparisonBalanceSheet(null);
          setComparisonCashFlow(null);
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
  const pct = (n: number | null) => n === null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  const receivablesSummary = receivables.reduce((summary: any, item: any) => {
    summary.totalBalance += item.balance || 0;
    summary.totalDue += item.totalDue || 0;
    summary.totalPaid += item.totalPaid || 0;
    summary[item.bucket] = (summary[item.bucket] || 0) + (item.balance || 0);
    return summary;
  }, { totalBalance: 0, totalDue: 0, totalPaid: 0, '0-30': 0, '30-60': 0, '60-90': 0, '90+': 0 });

  const refundSummary = refunds.reduce((summary: any, refund) => {
    const amount = Number(refund.amount || 0);
    summary.total += amount;
    summary[refund.status] = (summary[refund.status] || 0) + amount;
    summary.counts[refund.status] = (summary.counts[refund.status] || 0) + 1;
    return summary;
  }, { total: 0, PENDING: 0, APPROVED: 0, PROCESSED: 0, counts: {} as Record<string, number> });

  const auditAmount = auditLog.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const balanceSheetDelta = balanceSheet ? Math.abs((balanceSheet.totalAssets || 0) - ((balanceSheet.totalLiabilities || 0) + (balanceSheet.totalEquity || 0))) : 0;
  const trialBalanceDelta = trialBalance ? Math.abs((trialBalance.totalDebits || 0) - (trialBalance.totalCredits || 0)) : 0;

  const controlHighlights = [] as Array<{ label: string; value: string; detail: string; tone: string; bg: string }>;

  if (activeTab === 'trial-balance' && trialBalance) {
    controlHighlights.push(
      {
        label: 'Trial Balance Status',
        value: trialBalance.isBalanced ? 'Balanced' : 'Mismatch',
        detail: `Variance ${fmt(trialBalanceDelta)}`,
        tone: trialBalance.isBalanced ? 'text-green-600' : 'text-red-600',
        bg: trialBalance.isBalanced ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20',
      },
      {
        label: 'Accounts Reported',
        value: `${trialBalance.accounts?.length || 0}`,
        detail: `${fmt(trialBalance.totalDebits || 0)} debits posted`,
        tone: 'text-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
      },
    );
  }

  if (activeTab === 'balance-sheet' && balanceSheet) {
    controlHighlights.push(
      {
        label: 'Accounting Equation',
        value: balanceSheetDelta < 0.01 ? 'In Balance' : 'Review Needed',
        detail: `Delta ${fmt(balanceSheetDelta)}`,
        tone: balanceSheetDelta < 0.01 ? 'text-green-600' : 'text-red-600',
        bg: balanceSheetDelta < 0.01 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20',
      },
      {
        label: 'Net Assets',
        value: fmt((balanceSheet.totalAssets || 0) - (balanceSheet.totalLiabilities || 0)),
        detail: `Equity reported ${fmt(balanceSheet.totalEquity || 0)}`,
        tone: 'text-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
      },
    );
  }

  if (activeTab === 'cash-flow' && cashFlow) {
    const cashCoverage = cashFlow.totalOutflows > 0 ? (cashFlow.totalInflows / cashFlow.totalOutflows) * 100 : null;
    controlHighlights.push(
      {
        label: 'Cash Coverage',
        value: cashCoverage === null ? '—' : `${cashCoverage.toFixed(1)}%`,
        detail: 'Inflows as a share of outflows',
        tone: cashCoverage !== null && cashCoverage >= 100 ? 'text-green-600' : 'text-orange-600',
        bg: cashCoverage !== null && cashCoverage >= 100 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-orange-50 dark:bg-orange-900/20',
      },
    );
  }

  if (activeTab === 'receivables' && receivables.length > 0) {
    controlHighlights.push(
      {
        label: 'Outstanding Balance',
        value: fmt(receivablesSummary.totalBalance),
        detail: `${receivables.length} debtor account(s)`,
        tone: 'text-red-600',
        bg: 'bg-red-50 dark:bg-red-900/20',
      },
      {
        label: '90+ Day Exposure',
        value: fmt(receivablesSummary['90+'] || 0),
        detail: 'High-risk overdue balances',
        tone: 'text-orange-600',
        bg: 'bg-orange-50 dark:bg-orange-900/20',
      },
    );
  }

  if (activeTab === 'refunds' && refunds.length > 0) {
    controlHighlights.push(
      {
        label: 'Pending Refunds',
        value: `${refundSummary.counts.PENDING || 0}`,
        detail: fmt(refundSummary.PENDING || 0),
        tone: 'text-yellow-600',
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      },
      {
        label: 'Processed Refunds',
        value: `${refundSummary.counts.PROCESSED || 0}`,
        detail: fmt(refundSummary.PROCESSED || 0),
        tone: 'text-green-600',
        bg: 'bg-green-50 dark:bg-green-900/20',
      },
    );
  }

  if (activeTab === 'audit' && auditLog.length > 0) {
    controlHighlights.push(
      {
        label: 'Audit Entries',
        value: `${auditLog.length}`,
        detail: 'Recent financial events loaded',
        tone: 'text-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
      },
      {
        label: 'Value Touched',
        value: fmt(auditAmount),
        detail: 'Entries with monetary amount',
        tone: 'text-purple-600',
        bg: 'bg-purple-50 dark:bg-purple-900/20',
      },
    );
  }

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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'this-month', label: 'This Month' },
              { key: 'last-month', label: 'Last Month' },
              { key: 'ytd', label: 'YTD' },
              { key: 'clear', label: 'Clear' },
            ].map(preset => (
              <button
                key={preset.key}
                onClick={() => applyDatePreset(preset.key as 'this-month' | 'last-month' | 'ytd' | 'clear')}
                className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
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
          {comparisonLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Comparing current period against {comparisonLabel}</span>
          )}
          </div>
        </div>
      )}

      {controlHighlights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {controlHighlights.map(card => (
            <div key={card.label} className={`p-4 rounded-lg ${card.bg}`}>
              <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className={`text-xl font-bold mt-1 ${card.tone}`}>{card.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.detail}</p>
            </div>
          ))}
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
                  {comparisonIncome && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        {
                          label: 'Income vs Previous',
                          current: incomeStatement.totalIncome,
                          previous: comparisonIncome.totalIncome,
                          tone: 'text-green-600',
                        },
                        {
                          label: 'Expenses vs Previous',
                          current: incomeStatement.totalExpenses,
                          previous: comparisonIncome.totalExpenses,
                          tone: 'text-red-600',
                        },
                        {
                          label: 'Net Result vs Previous',
                          current: incomeStatement.netIncome,
                          previous: comparisonIncome.netIncome,
                          tone: incomeStatement.netIncome >= comparisonIncome.netIncome ? 'text-blue-600' : 'text-orange-600',
                        },
                      ].map(metric => (
                        <div key={metric.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border dark:border-gray-700">
                          <p className="text-sm text-gray-500">{metric.label}</p>
                          <p className={`text-xl font-bold mt-1 ${metric.tone}`}>{fmt(metric.current)}</p>
                          <p className="text-xs text-gray-400 mt-1">Previous {fmt(metric.previous)} • {pct(calculateChange(metric.current, metric.previous))}</p>
                        </div>
                      ))}
                    </div>
                  )}
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
              <div className="space-y-4">
                {comparisonBalanceSheet && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      {
                        label: 'Assets vs Previous',
                        current: balanceSheet.totalAssets,
                        previous: comparisonBalanceSheet.totalAssets,
                        tone: 'text-blue-600',
                      },
                      {
                        label: 'Liabilities vs Previous',
                        current: balanceSheet.totalLiabilities,
                        previous: comparisonBalanceSheet.totalLiabilities,
                        tone: 'text-red-600',
                      },
                      {
                        label: 'Equity vs Previous',
                        current: balanceSheet.totalEquity,
                        previous: comparisonBalanceSheet.totalEquity,
                        tone: 'text-green-600',
                      },
                    ].map(metric => (
                      <div key={metric.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border dark:border-gray-700">
                        <p className="text-sm text-gray-500">{metric.label}</p>
                        <p className={`text-xl font-bold mt-1 ${metric.tone}`}>{fmt(metric.current)}</p>
                        <p className="text-xs text-gray-400 mt-1">Previous {fmt(metric.previous)} • {pct(calculateChange(metric.current, metric.previous))}</p>
                      </div>
                    ))}
                  </div>
                )}
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
              {comparisonCashFlow && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      label: 'Inflows vs Previous',
                      current: cashFlow.totalInflows,
                      previous: comparisonCashFlow.totalInflows,
                      tone: 'text-green-600',
                    },
                    {
                      label: 'Outflows vs Previous',
                      current: cashFlow.totalOutflows,
                      previous: comparisonCashFlow.totalOutflows,
                      tone: 'text-red-600',
                    },
                    {
                      label: 'Net Cash vs Previous',
                      current: cashFlow.netCashFlow,
                      previous: comparisonCashFlow.netCashFlow,
                      tone: cashFlow.netCashFlow >= comparisonCashFlow.netCashFlow ? 'text-blue-600' : 'text-orange-600',
                    },
                  ].map(metric => (
                    <div key={metric.label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border dark:border-gray-700">
                      <p className="text-sm text-gray-500">{metric.label}</p>
                      <p className={`text-xl font-bold mt-1 ${metric.tone}`}>{fmt(metric.current)}</p>
                      <p className="text-xs text-gray-400 mt-1">Previous {fmt(metric.previous)} • {pct(calculateChange(metric.current, metric.previous))}</p>
                    </div>
                  ))}
                </div>
              )}
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
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Outstanding', value: fmt(receivablesSummary.totalBalance), tone: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
                  { label: '0-30 Days', value: fmt(receivablesSummary['0-30']), tone: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                  { label: '30-60 Days', value: fmt(receivablesSummary['30-60']), tone: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                  { label: '90+ Days', value: fmt(receivablesSummary['90+']), tone: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
                ].map(card => (
                  <div key={card.label} className={`p-4 rounded-lg ${card.bg}`}>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
              </div>
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
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {receivables.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No outstanding receivables</td></tr>
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
                      <td className="px-4 py-2 text-xs text-gray-500">
                        <p>{r.guardianPhone || 'No phone'}</p>
                        <p>{r.guardianEmail || 'No email'}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Refund Value', value: fmt(refundSummary.total), tone: 'text-slate-700', bg: 'bg-slate-100 dark:bg-slate-800' },
                  { label: 'Pending Approval', value: fmt(refundSummary.PENDING || 0), tone: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                  { label: 'Approved', value: fmt(refundSummary.APPROVED || 0), tone: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Processed', value: fmt(refundSummary.PROCESSED || 0), tone: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                ].map(card => (
                  <div key={card.label} className={`p-4 rounded-lg ${card.bg}`}>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
              </div>
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
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Audit Entries</p>
                  <p className="text-2xl font-bold text-blue-600">{auditLog.length}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Amount Touched</p>
                  <p className="text-2xl font-bold text-purple-600">{fmt(auditAmount)}</p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Latest Event</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{auditLog[0]?.action || 'No entries'}</p>
                </div>
              </div>
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
