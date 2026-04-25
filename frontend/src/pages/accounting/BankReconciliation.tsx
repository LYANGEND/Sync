import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, RefreshCw, ShieldCheck, Sparkles, Upload, Wallet } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { paymentControlApi, ReconciliationPayment, ReconciliationSummary } from '../../services/accountingService';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const emptySummary: ReconciliationSummary = {
  totalPayments: 0,
  totalAmount: 0,
  reconciledPayments: 0,
  reconciledAmount: 0,
  unreconciledPayments: 0,
  unreconciledAmount: 0,
  unallocatedPayments: 0,
  unallocatedAmount: 0,
  missingBankReference: 0,
};

interface StatementRow {
  id: string;
  date: string;
  amount: number;
  reference: string;
  description: string;
  raw: Record<string, any>;
}

interface StatementMatch {
  row: StatementRow;
  payment: ReconciliationPayment | null;
  confidence: number;
  reason: string;
}

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

const parseDateValue = (value: any) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseAmountValue = (value: any) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildStatementRows = (rows: Record<string, any>[]) => {
  if (!rows.length) return [] as StatementRow[];

  const firstRow = rows[0];
  const headerMap = Object.keys(firstRow).reduce((map, key) => {
    map[normalizeHeader(key)] = key;
    return map;
  }, {} as Record<string, string>);

  const dateKey = headerMap.transactiondate || headerMap.date || headerMap.valuedate || headerMap.postingdate;
  const amountKey = headerMap.amount || headerMap.credit || headerMap.deposit || headerMap.transactionamount;
  const referenceKey = headerMap.reference || headerMap.bankreference || headerMap.ref || headerMap.transactionid || headerMap.documentnumber;
  const descriptionKey = headerMap.description || headerMap.narration || headerMap.details || headerMap.memo;

  if (!dateKey || !amountKey) {
    throw new Error('Statement must include at least date and amount columns.');
  }

  return rows
    .map((row, index) => {
      const date = parseDateValue(row[dateKey]);
      const amount = parseAmountValue(row[amountKey]);
      if (!date || amount === null || amount <= 0) return null;

      return {
        id: `row-${index + 1}`,
        date: date.toISOString(),
        amount,
        reference: String(referenceKey ? (row[referenceKey] ?? '') : '').trim(),
        description: String(descriptionKey ? (row[descriptionKey] ?? '') : '').trim(),
        raw: row,
      } as StatementRow;
    })
    .filter((row): row is StatementRow => Boolean(row));
};

const scoreMatch = (row: StatementRow, payment: ReconciliationPayment) => {
  let score = 0;
  const reasons: string[] = [];

  if (Math.abs(Number(payment.amount) - row.amount) < 0.01) {
    score += 60;
    reasons.push('amount');
  }

  const rowDate = new Date(row.date).getTime();
  const paymentDate = new Date(payment.paymentDate).getTime();
  const dayDiff = Math.abs(rowDate - paymentDate) / (1000 * 60 * 60 * 24);
  if (dayDiff <= 1) {
    score += 25;
    reasons.push('date ±1d');
  } else if (dayDiff <= 3) {
    score += 15;
    reasons.push('date ±3d');
  }

  const reference = row.reference.toLowerCase();
  if (reference) {
    const transactionId = payment.transactionId?.toLowerCase() || '';
    const bankReference = payment.bankReference?.toLowerCase() || '';
    const settlementReference = payment.settlementReference?.toLowerCase() || '';
    if (transactionId && reference.includes(transactionId)) {
      score += 40;
      reasons.push('txn ref');
    }
    if (bankReference && reference.includes(bankReference)) {
      score += 30;
      reasons.push('bank ref');
    }
    if (settlementReference && reference.includes(settlementReference)) {
      score += 30;
      reasons.push('settlement ref');
    }
  }

  if (payment.method === 'BANK_DEPOSIT') {
    score += 5;
  }

  return { score, reason: reasons.join(', ') || 'weak match' };
};

const BankReconciliation = ({ embedded = false }: { embedded?: boolean }) => {
  const { confirm, prompt } = useAppDialog();
  const [summary, setSummary] = useState<ReconciliationSummary>(emptySummary);
  const [payments, setPayments] = useState<ReconciliationPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'reconciled' | 'unreconciled'>('all');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CASH' | 'MOBILE_MONEY' | 'BANK_DEPOSIT'>('ALL');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statementRows, setStatementRows] = useState<StatementRow[]>([]);
  const [statementFileName, setStatementFileName] = useState('');
  const [applyingMatches, setApplyingMatches] = useState(false);

  useEffect(() => {
    void loadData();
  }, [statusFilter, methodFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await paymentControlApi.getReconciliationDashboard({ status: statusFilter, method: methodFilter });
      setSummary(res.data.summary || emptySummary);
      setPayments(res.data.payments || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async (payment: ReconciliationPayment) => {
    const bankReference = await prompt({
      title: 'Reconcile payment',
      message: 'Add a bank or statement reference if available. You can leave it blank for cash postings.',
      placeholder: 'Statement line / bank reference',
      confirmText: 'Mark reconciled',
      defaultValue: payment.bankReference || payment.settlementReference || '',
    });

    if (bankReference === null) return;

    setActionLoading(payment.id);
    try {
      await paymentControlApi.reconcilePayment(payment.id, {
        bankReference: bankReference.trim() || undefined,
        settlementDate: new Date().toISOString(),
      });
      toast.success('Payment reconciled');
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to reconcile payment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnreconcile = async (payment: ReconciliationPayment) => {
    if (!(await confirm({
      title: 'Move payment back to unreconciled?',
      message: 'This will clear reconciliation markers and return the payment to the open reconciliation queue.',
      confirmText: 'Move back',
    }))) return;

    setActionLoading(payment.id);
    try {
      await paymentControlApi.unreconcilePayment(payment.id);
      toast.success('Payment moved back to unreconciled');
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change reconciliation status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAutoAllocate = async () => {
    setActionLoading('auto-allocate');
    try {
      const res = await paymentControlApi.autoAllocatePayments();
      if (res.data.allocated > 0) toast.success(res.data.message);
      else toast.success('All payments are already fully allocated');
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to auto-allocate payments');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredPayments = useMemo(() => payments.filter(payment => {
    const term = search.trim().toLowerCase();
    if (!term) return true;

    return [
      payment.transactionId,
      payment.student.firstName,
      payment.student.lastName,
      payment.student.admissionNumber,
      payment.student.class?.name,
      payment.bankReference,
      payment.settlementReference || undefined,
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(term));
  }), [payments, search]);

  const statementMatches = useMemo<StatementMatch[]>(() => {
    if (!statementRows.length) return [];

    const openPayments = payments.filter(payment => !payment.isReconciled);
    const usedPayments = new Set<string>();

    return statementRows.map(row => {
      let bestPayment: ReconciliationPayment | null = null;
      let bestScore = 0;
      let bestReason = 'No suitable match';

      for (const payment of openPayments) {
        if (usedPayments.has(payment.id)) continue;
        const result = scoreMatch(row, payment);
        if (result.score > bestScore) {
          bestScore = result.score;
          bestReason = result.reason;
          bestPayment = payment;
        }
      }

      if (bestPayment && bestScore >= 70) {
        usedPayments.add(bestPayment.id);
        return { row, payment: bestPayment, confidence: bestScore, reason: bestReason };
      }

      return { row, payment: null, confidence: bestScore, reason: bestReason };
    });
  }, [payments, statementRows]);

  const matchedCount = statementMatches.filter(match => match.payment).length;

  const handleStatementUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });
      const parsedRows = buildStatementRows(rows);

      if (!parsedRows.length) {
        toast.error('No valid statement rows were found in the uploaded file');
        return;
      }

      setStatementRows(parsedRows);
      setStatementFileName(file.name);
      toast.success(`Loaded ${parsedRows.length} statement row(s)`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to read statement file');
    } finally {
      event.target.value = '';
    }
  };

  const handleApplyMatches = async () => {
    const matchesToApply = statementMatches.filter(match => match.payment);
    if (!matchesToApply.length) {
      toast.error('No confident matches available to apply');
      return;
    }

    if (!(await confirm({
      title: 'Apply matched reconciliations?',
      message: `This will reconcile ${matchesToApply.length} payment(s) using the uploaded statement references.`,
      confirmText: 'Apply matches',
    }))) return;

    setApplyingMatches(true);
    try {
      for (const match of matchesToApply) {
        await paymentControlApi.reconcilePayment(match.payment!.id, {
          bankReference: match.row.reference || undefined,
          settlementDate: match.row.date,
          reconciliationNote: match.row.description || `Imported from ${statementFileName || 'statement'}`,
        });
      }

      toast.success(`Applied ${matchesToApply.length} reconciliation match(es)`);
      setStatementRows([]);
      setStatementFileName('');
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed while applying statement matches');
    } finally {
      setApplyingMatches(false);
    }
  };

  const fmt = (amount: number) => `K${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6'}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bank Reconciliation</h1>
          <p className="text-gray-500 dark:text-gray-400">Match posted receipts, clear settlement references, and monitor unallocated value.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          >
            <option value="all">All payments</option>
            <option value="unreconciled">Unreconciled</option>
            <option value="reconciled">Reconciled</option>
          </select>
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value as typeof methodFilter)}
            className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          >
            <option value="ALL">All methods</option>
            <option value="BANK_DEPOSIT">Bank deposit</option>
            <option value="MOBILE_MONEY">Mobile money</option>
            <option value="CASH">Cash</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student, ref, class..."
            className="px-3 py-2 border rounded-lg text-sm min-w-64 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="px-4 py-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 inline-flex items-center gap-2">
            <Upload size={16} />
            Import statement
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleStatementUpload} />
          </label>
          <button
            onClick={handleAutoAllocate}
            disabled={actionLoading === 'auto-allocate'}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60"
          >
            {actionLoading === 'auto-allocate' ? 'Allocating…' : 'Auto-allocate payments'}
          </button>
          <button
            onClick={() => void loadData()}
            className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <span className="inline-flex items-center gap-2"><RefreshCw size={16} />Refresh</span>
          </button>
        </div>
      </div>

      {statementRows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Imported Statement Preview</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{statementFileName || 'Statement file'} • {statementRows.length} row(s) • {matchedCount} confident match(es)</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleApplyMatches}
                disabled={applyingMatches || matchedCount === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                <Sparkles size={16} />
                {applyingMatches ? 'Applying…' : `Apply ${matchedCount} match(es)`}
              </button>
              <button
                onClick={() => { setStatementRows([]); setStatementFileName(''); }}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Clear import
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Imported rows</p>
              <p className="text-2xl font-bold text-blue-600">{statementRows.length}</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Confident matches</p>
              <p className="text-2xl font-bold text-green-600">{matchedCount}</p>
            </div>
            <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Needs review</p>
              <p className="text-2xl font-bold text-orange-600">{statementMatches.length - matchedCount}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Statement Date</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Reference</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Suggested Payment</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {statementMatches.map(match => (
                  <tr key={match.row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{new Date(match.row.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(match.row.amount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs">{match.row.reference || match.row.description || '—'}</td>
                    <td className="px-4 py-3">
                      {match.payment ? (
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{match.payment.student.firstName} {match.payment.student.lastName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{match.payment.transactionId || match.payment.id.slice(0, 8)} • {new Date(match.payment.paymentDate).toLocaleDateString()}</p>
                        </div>
                      ) : (
                        <span className="text-orange-600">No confident match</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${match.payment ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                        {match.payment ? `${match.confidence}%` : 'Review'}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{match.reason}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total posted', value: fmt(summary.totalAmount), detail: `${summary.totalPayments} payment(s)`, icon: Wallet, tone: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Reconciled', value: fmt(summary.reconciledAmount), detail: `${summary.reconciledPayments} matched`, icon: CheckCircle2, tone: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Unreconciled', value: fmt(summary.unreconciledAmount), detail: `${summary.unreconciledPayments} open item(s)`, icon: AlertTriangle, tone: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
          { label: 'Unallocated', value: fmt(summary.unallocatedAmount), detail: `${summary.unallocatedPayments} payment(s) need allocation`, icon: Link2, tone: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Missing bank refs', value: `${summary.missingBankReference}`, detail: 'Bank deposits without statement ref', icon: ShieldCheck, tone: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
        ].map(card => (
          <div key={card.label} className={`rounded-xl p-4 ${card.bg}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.tone}`}>{card.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.detail}</p>
              </div>
              <card.icon className={card.tone} size={18} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Student</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Method</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Allocation</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Settlement Ref</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">Loading reconciliation queue…</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">No payments match the current filters.</td></tr>
              ) : filteredPayments.map(payment => (
                <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{payment.student.firstName} {payment.student.lastName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{payment.student.admissionNumber} • {payment.student.class?.name || 'No class'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{payment.method.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(Number(payment.amount))}</td>
                  <td className="px-4 py-3">
                    <p className={`font-medium ${payment.unallocatedAmount > 0.009 ? 'text-orange-600' : 'text-green-600'}`}>
                      {payment.unallocatedAmount > 0.009 ? `${fmt(payment.unallocatedAmount)} open` : 'Fully allocated'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{payment.allocationCount} fee item(s){payment.allocationLabels.length > 0 ? ` • ${payment.allocationLabels.slice(0, 2).join(', ')}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    <p>{payment.bankReference || payment.settlementReference || 'No reference'}</p>
                    <p>{payment.settlementDate ? new Date(payment.settlementDate).toLocaleDateString() : 'Settlement date open'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${payment.isReconciled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                      {payment.isReconciled ? 'Reconciled' : 'Open'}
                    </span>
                    {payment.reconciledByName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">By {payment.reconciledByName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {payment.isReconciled ? (
                      <button
                        onClick={() => void handleUnreconcile(payment)}
                        disabled={actionLoading === payment.id}
                        className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 disabled:opacity-60"
                      >
                        {actionLoading === payment.id ? 'Working…' : 'Re-open'}
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleReconcile(payment)}
                        disabled={actionLoading === payment.id}
                        className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {actionLoading === payment.id ? 'Reconciling…' : 'Reconcile'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BankReconciliation;
