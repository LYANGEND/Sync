import { useState, useEffect, useId } from 'react';
import { BarChart3, PieChart, TrendingUp, Clock, BookOpen, RefreshCw, Plus, X, CheckCircle, DollarSign, Shield } from 'lucide-react';
import { financialApi, ChartOfAccount, Refund, FinancialAuditEntry } from '../../services/accountingService';
import { PageHeader, Tabs, TabPanel } from '../../components/ui/DesignSystem';
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
  const tabId = useId();
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
    <div className="ds-page text-[var(--text-primary)]">
      {!embedded && (
        <PageHeader title="Financial Reports" description="Statements, accounts, refunds, and audit trail" />
      )}

      {/* Tabs */}
      <div className="min-w-0 overflow-x-auto" role="region" aria-label="Financial report navigation" tabIndex={0}>
        <Tabs id={tabId} label="Financial reports" value={activeTab} onChange={value => setActiveTab(value as Tab)}
          items={tabs.map(tab => ({ id: tab.key, label: <span className="inline-flex items-center gap-2"><tab.icon size={14} aria-hidden="true" /><span>{tab.label}</span></span> }))} />
      </div>

      <TabPanel id={tabId} value={activeTab}>
      <div className="ds-page">
      {/* Date Filter (for financial statements) */}
      {['trial-balance', 'income', 'balance-sheet', 'cash-flow'].includes(activeTab) && (
        <div className="ds-card space-y-4">
          <div className="ds-actions">
            {[
              { key: 'this-month', label: 'This Month' },
              { key: 'last-month', label: 'Last Month' },
              { key: 'ytd', label: 'YTD' },
              { key: 'clear', label: 'Clear' },
            ].map(preset => (
              <button
                key={preset.key}
                onClick={() => applyDatePreset(preset.key as 'this-month' | 'last-month' | 'ytd' | 'clear')}
                className="ds-button-outline"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="ds-toolbar">
            <div className="ds-field">
            <label htmlFor={`${tabId}-date-from`} className="ds-label">From:</label>
            <input id={`${tabId}-date-from`} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="ds-input" />
          </div>
          <div className="ds-field">
            <label htmlFor={`${tabId}-date-to`} className="ds-label">To:</label>
            <input id={`${tabId}-date-to`} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="ds-input" />
          </div>
          <button onClick={() => loadTabData(activeTab)}
            className="ds-button-primary">Apply</button>
          {comparisonLabel && (
            <span className="text-xs text-[var(--text-secondary)]">Comparing current period against {comparisonLabel}</span>
          )}
          </div>
        </div>
      )}

      {controlHighlights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {controlHighlights.map(card => (
            <div key={card.label} className={`ds-card ${card.bg}`}>
              <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
              <p className={`text-xl font-bold mt-1 ${card.tone}`}>{card.value}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{card.detail}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64" role="status" aria-label="Loading financial reports"><div aria-hidden="true" className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--action-color)]"></div></div>
      ) : (
        <>
          {/* ======== TRIAL BALANCE ======== */}
          {activeTab === 'trial-balance' && (
            <div className="ds-surface overflow-x-auto" role="region" aria-label="Trial balance" tabIndex={0}>
              <div className="p-4 sm:p-6 border-b border-[var(--border-color)]">
                <h3 className="font-semibold text-[var(--text-primary)]">Trial Balance</h3>
                {trialBalance?.period && <p className="text-sm text-[var(--text-secondary)]">{trialBalance.period}</p>}
              </div>
              {trialBalance && (trialBalance.accounts || []).length > 0 ? (
                <>
                  <table className="ds-table">
                    <thead>
                      <tr>
                        <th className="text-left">Account</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trialBalance.accounts || []).map((acct: any, i: number) => (
                        <tr key={i}>
                          <td>{acct.name || acct.code}</td>
                          <td className="text-right">{acct.debit > 0 ? fmt(acct.debit) : ''}</td>
                          <td className="text-right">{acct.credit > 0 ? fmt(acct.credit) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[var(--surface-muted)] font-bold">
                      <tr>
                        <td>Total</td>
                        <td className="text-right">{fmt(trialBalance.totalDebits)}</td>
                        <td className="text-right">{fmt(trialBalance.totalCredits)}</td>
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
                <div className="ds-empty">
                  <BarChart3 size={48} aria-hidden="true" className="mx-auto mb-3 text-[var(--text-secondary)]" />
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
                        <div key={metric.label} className="ds-card">
                          <p className="text-sm text-[var(--text-secondary)]">{metric.label}</p>
                          <p className={`text-xl font-bold mt-1 ${metric.tone}`}>{fmt(metric.current)}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-1">Previous {fmt(metric.previous)} • {pct(calculateChange(metric.current, metric.previous))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="ds-card bg-green-50 dark:bg-green-900/20">
                      <p className="text-sm text-[var(--text-secondary)]">Total Income</p>
                      <p className="text-2xl font-bold text-green-600">{fmt(incomeStatement.totalIncome)}</p>
                    </div>
                    <div className="ds-card bg-red-50 dark:bg-red-900/20">
                      <p className="text-sm text-[var(--text-secondary)]">Total Expenses</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(incomeStatement.totalExpenses)}</p>
                    </div>
                    <div className={`ds-card ${incomeStatement.netIncome >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                      <p className="text-sm text-[var(--text-secondary)]">Net Income</p>
                      <p className={`text-2xl font-bold ${incomeStatement.netIncome >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(incomeStatement.netIncome)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="ds-card">
                      <h4 className="font-semibold text-green-600 mb-3">Income</h4>
                      {(incomeStatement.income || []).length > 0 ? (
                        (incomeStatement.income || []).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between gap-3 py-1.5 text-sm border-b border-[var(--border-color)]">
                            <span className="text-[var(--text-secondary)]">{item.name || item.category}</span>
                            <span className="font-medium text-[var(--text-primary)]">{fmt(item.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">No income entries in this period</p>
                      )}
                    </div>

                    <div className="ds-card">
                      <h4 className="font-semibold text-red-600 mb-3">Expenses</h4>
                      {(incomeStatement.expenses || []).length > 0 ? (
                        (incomeStatement.expenses || []).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between gap-3 py-1.5 text-sm border-b border-[var(--border-color)]">
                            <span className="text-[var(--text-secondary)]">{item.name || item.category}</span>
                            <span className="font-medium text-[var(--text-primary)]">{fmt(item.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)]">No expense entries in this period</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="ds-card text-center text-[var(--text-secondary)]">
                  <TrendingUp size={48} aria-hidden="true" className="mx-auto mb-3 text-[var(--text-secondary)]" />
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
                      <div key={metric.label} className="ds-card">
                        <p className="text-sm text-[var(--text-secondary)]">{metric.label}</p>
                        <p className={`text-xl font-bold mt-1 ${metric.tone}`}>{fmt(metric.current)}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Previous {fmt(metric.previous)} • {pct(calculateChange(metric.current, metric.previous))}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                  <div className="ds-card">
                    <h4 className="font-semibold text-blue-600 mb-3">Assets</h4>
                    {(balanceSheet.assets || []).length > 0 ? (
                      (balanceSheet.assets || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between gap-3 py-1.5 text-sm border-b border-[var(--border-color)]">
                          <span className="text-[var(--text-secondary)]">{item.name}</span>
                          <span className="font-medium text-[var(--text-primary)]">{fmt(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">No asset entries</p>
                    )}
                    <div className="flex justify-between gap-3 pt-3 font-bold">
                      <span className="text-[var(--text-primary)]">Total Assets</span>
                      <span className="text-blue-600">{fmt(balanceSheet.totalAssets)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="ds-card">
                    <h4 className="font-semibold text-red-600 mb-3">Liabilities</h4>
                    {(balanceSheet.liabilities || []).length > 0 ? (
                      (balanceSheet.liabilities || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between gap-3 py-1.5 text-sm border-b border-[var(--border-color)]">
                          <span className="text-[var(--text-secondary)]">{item.name}</span>
                          <span className="font-medium text-[var(--text-primary)]">{fmt(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">No liability entries</p>
                    )}
                    <div className="flex justify-between gap-3 pt-3 font-bold">
                      <span className="text-[var(--text-primary)]">Total Liabilities</span>
                      <span className="text-red-600">{fmt(balanceSheet.totalLiabilities)}</span>
                    </div>
                  </div>

                  <div className="ds-card">
                    <h4 className="font-semibold text-green-600 mb-3">Equity</h4>
                    {(balanceSheet.equity || []).length > 0 ? (
                      (balanceSheet.equity || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between gap-3 py-1.5 text-sm border-b border-[var(--border-color)]">
                          <span className="text-[var(--text-secondary)]">{item.name}</span>
                          <span className="font-medium text-[var(--text-primary)]">{fmt(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">No equity entries</p>
                    )}
                    <div className="flex justify-between gap-3 pt-3 font-bold">
                      <span className="text-[var(--text-primary)]">Total Equity</span>
                      <span className="text-green-600">{fmt(balanceSheet.totalEquity)}</span>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ) : (
              <div className="ds-card text-center text-[var(--text-secondary)]">
                <PieChart size={48} aria-hidden="true" className="mx-auto mb-3 text-[var(--text-secondary)]" />
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
                    <div key={metric.label} className="ds-card">
                      <p className="text-sm text-[var(--text-secondary)]">{metric.label}</p>
                      <p className={`text-xl font-bold mt-1 ${metric.tone}`}>{fmt(metric.current)}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">Previous {fmt(metric.previous)} • {pct(calculateChange(metric.current, metric.previous))}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="ds-card bg-green-50 dark:bg-green-900/20">
                  <p className="text-sm text-[var(--text-secondary)]">Cash Inflows</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(cashFlow.totalInflows)}</p>
                  {cashFlow.details?.feeCollections > 0 && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Fee collections: {fmt(cashFlow.details.feeCollections)}</p>
                  )}
                </div>
                <div className="ds-card bg-red-50 dark:bg-red-900/20">
                  <p className="text-sm text-[var(--text-secondary)]">Cash Outflows</p>
                  <p className="text-2xl font-bold text-red-600">{fmt(cashFlow.totalOutflows)}</p>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {cashFlow.details?.expenseOutflows > 0 && <p>Expenses: {fmt(cashFlow.details.expenseOutflows)}</p>}
                    {cashFlow.details?.payrollOutflows > 0 && <p>Payroll: {fmt(cashFlow.details.payrollOutflows)}</p>}
                  </div>
                </div>
                <div className={`ds-card ${cashFlow.netCashFlow >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                  <p className="text-sm text-[var(--text-secondary)]">Net Cash Flow</p>
                  <p className={`text-2xl font-bold ${cashFlow.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(cashFlow.netCashFlow)}</p>
                </div>
              </div>

              {/* Summary table */}
              <div className="ds-card">
                <h4 className="font-semibold text-[var(--text-primary)] mb-4">Cash Flow Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3 py-2 border-b border-[var(--border-color)]">
                    <span className="text-[var(--text-secondary)] font-medium">Inflows</span>
                    <span className="text-green-600 font-bold">{fmt(cashFlow.totalInflows)}</span>
                  </div>
                  {cashFlow.details?.feeCollections > 0 && (
                    <div className="flex justify-between gap-3 py-1 pl-4">
                      <span className="text-[var(--text-secondary)]">Fee Collections</span>
                      <span className="text-[var(--text-primary)]">{fmt(cashFlow.details.feeCollections)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 py-2 border-b border-[var(--border-color)]">
                    <span className="text-[var(--text-secondary)] font-medium">Outflows</span>
                    <span className="text-red-600 font-bold">{fmt(cashFlow.totalOutflows)}</span>
                  </div>
                  {cashFlow.details?.expenseOutflows > 0 && (
                    <div className="flex justify-between gap-3 py-1 pl-4">
                      <span className="text-[var(--text-secondary)]">Expenses</span>
                      <span className="text-[var(--text-primary)]">{fmt(cashFlow.details.expenseOutflows)}</span>
                    </div>
                  )}
                  {cashFlow.details?.payrollOutflows > 0 && (
                    <div className="flex justify-between gap-3 py-1 pl-4">
                      <span className="text-[var(--text-secondary)]">Payroll</span>
                      <span className="text-[var(--text-primary)]">{fmt(cashFlow.details.payrollOutflows)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 py-2 border-t-2 border-[var(--border-color)] font-bold">
                    <span className="text-[var(--text-primary)]">Net Cash Flow</span>
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
                  <div key={card.label} className={`ds-card ${card.bg}`}>
                    <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
              </div>
              <div className="ds-surface overflow-x-auto" role="region" aria-label="Aged receivables" tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="text-left">Student</th>
                    <th className="text-left">Class</th>
                    <th className="text-right">Total Due</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th className="text-center">Age</th>
                    <th className="text-center">Bucket</th>
                    <th className="text-left">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-[var(--text-secondary)]">No outstanding receivables</td></tr>
                  ) : receivables.map((r: any, i) => (
                    <tr key={i}>
                      <td>
                        <p className="font-medium text-[var(--text-primary)]">{r.studentName}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{r.admissionNumber}</p>
                      </td>
                      <td>{r.className}</td>
                      <td className="text-right">{fmt(r.totalDue)}</td>
                      <td className="text-right text-green-600">{fmt(r.totalPaid)}</td>
                      <td className="text-right font-medium text-red-600">{fmt(r.balance)}</td>
                      <td className="text-center text-[var(--text-secondary)]">{r.ageDays}d</td>
                      <td className="text-center">
                        <span className={`ds-badge ${
                          r.bucket === '90+' ? 'bg-red-100 text-red-700' :
                          r.bucket === '60-90' ? 'bg-orange-100 text-orange-700' :
                          r.bucket === '30-60' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>{r.bucket} days</span>
                      </td>
                      <td className="text-xs text-[var(--text-secondary)]">
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
              <div className="ds-actions justify-end">
                <button onClick={handleSeedDefaults}
                  className="ds-button-secondary">
                  <RefreshCw size={16} aria-hidden="true" /><span>Seed Defaults</span>
                </button>
                <button onClick={() => setShowAccountModal(true)}
                  className="ds-button-primary">
                  <Plus size={16} aria-hidden="true" /><span>New Account</span>
                </button>
              </div>

              <div className="ds-surface overflow-x-auto" role="region" aria-label="Chart of accounts" tabIndex={0}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th className="text-left">Code</th>
                      <th className="text-left">Name</th>
                      <th className="text-left">Type</th>
                      <th className="text-left">Description</th>
                      <th className="text-center">System</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-[var(--text-secondary)]">No accounts. Click "Seed Defaults" to create standard accounts.</td></tr>
                    ) : accounts.map(acct => (
                      <tr key={acct.id}>
                        <td className="font-mono text-blue-600">{acct.code}</td>
                        <td className="font-medium">{acct.name}</td>
                        <td>
                          <span className={`ds-badge ${
                            acct.type === 'ASSET' ? 'bg-blue-100 text-blue-700' :
                            acct.type === 'LIABILITY' ? 'bg-red-100 text-red-700' :
                            acct.type === 'EQUITY' ? 'bg-green-100 text-green-700' :
                            acct.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>{acct.type}</span>
                        </td>
                        <td className="text-[var(--text-secondary)] max-w-xs truncate">{acct.description || '—'}</td>
                        <td className="text-center">{acct.isSystem ? <CheckCircle size={14} role="img" aria-label="System account" className="inline text-green-500" /> : '—'}</td>
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
                  { label: 'Total Refund Value', value: fmt(refundSummary.total), tone: 'text-[var(--text-primary)]', bg: 'bg-[var(--surface-muted)]' },
                  { label: 'Pending Approval', value: fmt(refundSummary.PENDING || 0), tone: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                  { label: 'Approved', value: fmt(refundSummary.APPROVED || 0), tone: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Processed', value: fmt(refundSummary.PROCESSED || 0), tone: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                ].map(card => (
                  <div key={card.label} className={`ds-card ${card.bg}`}>
                    <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowRefundModal(true)}
                  className="ds-button-primary">
                  <Plus size={16} aria-hidden="true" /><span>New Refund</span>
                </button>
              </div>

              <div className="ds-surface overflow-x-auto" role="region" aria-label="Refunds" tabIndex={0}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th className="text-left">Refund #</th>
                      <th className="text-left">Student</th>
                      <th className="text-right">Amount</th>
                      <th className="text-left">Reason</th>
                      <th className="text-center">Status</th>
                      <th className="text-left">Date</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-[var(--text-secondary)]">No refunds</td></tr>
                    ) : refunds.map(r => (
                      <tr key={r.id}>
                        <td className="font-mono text-blue-600">{r.refundNumber}</td>
                        <td>
                          {r.payment?.student ? `${r.payment.student.firstName} ${r.payment.student.lastName}` : r.studentId}
                        </td>
                        <td className="text-right font-medium text-red-600">{fmt(r.amount)}</td>
                        <td className="text-[var(--text-secondary)] max-w-xs truncate">{r.reason}</td>
                        <td className="text-center">
                          <span className={`ds-badge ${
                            r.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                            r.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                            r.status === 'PROCESSED' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>{r.status}</span>
                        </td>
                        <td className="text-[var(--text-secondary)]">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="text-center">
                          {r.status === 'PENDING' && (
                            <button onClick={() => handleApproveRefund(r.id)} className="ds-button-outline text-green-600 mr-2">Approve</button>
                          )}
                          {r.status === 'APPROVED' && (
                            <button onClick={() => handleProcessRefund(r.id)} className="ds-button-outline text-blue-600">Process</button>
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
                <div className="ds-card bg-blue-50 dark:bg-blue-900/20">
                  <p className="text-sm text-[var(--text-secondary)]">Audit Entries</p>
                  <p className="text-2xl font-bold text-blue-600">{auditLog.length}</p>
                </div>
                <div className="ds-card bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-sm text-[var(--text-secondary)]">Amount Touched</p>
                  <p className="text-2xl font-bold text-purple-600">{fmt(auditAmount)}</p>
                </div>
                <div className="ds-card bg-[var(--surface-muted)]">
                  <p className="text-sm text-[var(--text-secondary)]">Latest Event</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">{auditLog[0]?.action || 'No entries'}</p>
                </div>
              </div>
              <div className="ds-surface overflow-x-auto" role="region" aria-label="Financial audit log" tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="text-left">Timestamp</th>
                    <th className="text-left">User</th>
                    <th className="text-left">Action</th>
                    <th className="text-left">Entity</th>
                    <th className="text-left">Description</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-[var(--text-secondary)]">No audit entries</td></tr>
                  ) : auditLog.map(entry => (
                    <tr key={entry.id}>
                      <td className="text-[var(--text-secondary)] whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>{entry.userName || entry.userId}</td>
                      <td><span className="ds-badge ds-badge-neutral">{entry.action}</span></td>
                      <td className="text-[var(--text-secondary)]">{entry.entityType}</td>
                      <td className="max-w-xs truncate">{entry.description}</td>
                      <td className="text-right font-medium">{entry.amount ? fmt(entry.amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </>
      )}
      </div>
      </TabPanel>

      {/* ======== CREATE ACCOUNT MODAL ======== */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="ds-surface w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby={`${tabId}-account-title`}>
            <div className="ds-modal-header border-b border-[var(--border-color)]">
              <h2 id={`${tabId}-account-title`} className="text-lg font-semibold text-[var(--text-primary)]">New Account</h2>
              <button onClick={() => setShowAccountModal(false)} className="ds-button-ghost" aria-label="Close new account dialog"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="ds-field">
                  <label htmlFor={`${tabId}-account-code`} className="ds-label">Code</label>
                  <input id={`${tabId}-account-code`} type="text" value={accountForm.code} onChange={e => setAccountForm({ ...accountForm, code: e.target.value })}
                    className="ds-input" placeholder="e.g., 1000" />
                </div>
                <div className="ds-field">
                  <label htmlFor={`${tabId}-account-type`} className="ds-label">Type</label>
                  <select id={`${tabId}-account-type`} value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}
                    className="ds-select">
                    <option value="ASSET">Asset</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="EQUITY">Equity</option>
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
              </div>
              <div className="ds-field">
                <label htmlFor={`${tabId}-account-name`} className="ds-label">Name</label>
                <input id={`${tabId}-account-name`} type="text" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="ds-input" />
              </div>
              <div className="ds-field">
                <label htmlFor={`${tabId}-account-description`} className="ds-label">Description</label>
                <input id={`${tabId}-account-description`} type="text" value={accountForm.description} onChange={e => setAccountForm({ ...accountForm, description: e.target.value })}
                  className="ds-input" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowAccountModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleCreateAccount}
                className="ds-button-primary">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== REFUND MODAL ======== */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="ds-surface w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby={`${tabId}-refund-title`}>
            <div className="ds-modal-header border-b border-[var(--border-color)]">
              <h2 id={`${tabId}-refund-title`} className="text-lg font-semibold text-[var(--text-primary)]">Create Refund</h2>
              <button onClick={() => setShowRefundModal(false)} className="ds-button-ghost" aria-label="Close create refund dialog"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="ds-field">
                <label htmlFor={`${tabId}-refund-payment`} className="ds-label">Payment ID</label>
                <input id={`${tabId}-refund-payment`} type="text" value={refundForm.paymentId} onChange={e => setRefundForm({ ...refundForm, paymentId: e.target.value })}
                  className="ds-input" />
              </div>
              <div className="ds-field">
                <label htmlFor={`${tabId}-refund-student`} className="ds-label">Student ID</label>
                <input id={`${tabId}-refund-student`} type="text" value={refundForm.studentId} onChange={e => setRefundForm({ ...refundForm, studentId: e.target.value })}
                  className="ds-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="ds-field">
                  <label htmlFor={`${tabId}-refund-amount`} className="ds-label">Amount (ZMW)</label>
                  <input id={`${tabId}-refund-amount`} type="number" step="0.01" value={refundForm.amount} onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })}
                    className="ds-input" />
                </div>
                <div className="ds-field">
                  <label htmlFor={`${tabId}-refund-method`} className="ds-label">Method</label>
                  <select id={`${tabId}-refund-method`} value={refundForm.method} onChange={e => setRefundForm({ ...refundForm, method: e.target.value })}
                    className="ds-select">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>
              </div>
              <div className="ds-field">
                <label htmlFor={`${tabId}-refund-reason`} className="ds-label">Reason</label>
                <textarea id={`${tabId}-refund-reason`} value={refundForm.reason} onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })} rows={3}
                  className="ds-textarea" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowRefundModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleCreateRefund}
                className="ds-button-primary">Submit Refund</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialStatements;
