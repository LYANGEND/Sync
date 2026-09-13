import { useState, useEffect, useId } from 'react';
import { Plus, Search, DollarSign, CheckCircle, XCircle, Edit2, Trash2, X, Building2, Receipt, BarChart3 } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { PageHeader, Tabs, TabPanel } from '../../components/ui/DesignSystem';
import { expenseApi, Expense, Vendor } from '../../services/accountingService';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = [
  'UTILITIES', 'RENT', 'SALARIES', 'SUPPLIES', 'MAINTENANCE',
  'TRANSPORT', 'COMMUNICATION', 'INSURANCE', 'MARKETING',
  'PROFESSIONAL_FEES', 'FOOD_CATERING', 'CLEANING',
  'SECURITY', 'MISCELLANEOUS', 'CAPITAL_EXPENDITURE'
];

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300',
};

const Expenses = ({ embedded = false }: { embedded?: boolean }) => {
  const tabsId = useId();
    const { confirm, prompt } = useAppDialog();
  const [activeTab, setActiveTab] = useState<'expenses' | 'vendors' | 'summary'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [summary, setSummary] = useState<any>(null);

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Expense form
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'SUPPLIES',
    description: '',
    amount: '',
    taxAmount: '0',
    vendorId: '',
    paymentMethod: 'CASH',
    paymentRef: '',
    notes: '',
    isRecurring: false,
    recurringFrequency: '',
  });

  // Vendor form
  const [vendorForm, setVendorForm] = useState({
    name: '', contactName: '', email: '', phone: '', address: '', taxId: '',
    bankName: '', bankAccount: '', bankBranch: '', notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [expRes, vendRes, sumRes] = await Promise.all([
        expenseApi.getAll(),
        expenseApi.getVendors(),
        expenseApi.getSummary(),
      ]);
      setExpenses(expRes.data.expenses || expRes.data || []);
      setVendors(vendRes.data.vendors || vendRes.data || []);
      setSummary(sumRes.data);
    } catch (err: any) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ===== EXPENSE CRUD =====
  const handleSaveExpense = async () => {
    try {
      const payload = {
        ...expenseForm,
        amount: parseFloat(expenseForm.amount as string),
        taxAmount: parseFloat(expenseForm.taxAmount as string) || 0,
        vendorId: expenseForm.vendorId || undefined,
      };
      if (editingExpense) {
        await expenseApi.update(editingExpense.id, payload);
        toast.success('Expense updated');
      } else {
        await expenseApi.create(payload);
        toast.success('Expense created');
      }
      setShowExpenseModal(false);
      resetExpenseForm();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save expense');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await expenseApi.approve(id);
      toast.success('Expense approved');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    const reason = await prompt({
      title: 'Reject expense',
      message: 'Provide a reason for rejecting this expense.',
      placeholder: 'Rejection reason',
      confirmText: 'Reject expense',
    });
    if (!reason?.trim()) return;
    try {
      await expenseApi.reject(id, reason);
      toast.success('Expense rejected');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject');
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await expenseApi.markPaid(id, { paymentMethod: 'BANK_TRANSFER', paymentRef: '' });
      toast.success('Expense marked as paid');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to mark paid');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!(await confirm({
      title: 'Delete expense?',
      message: 'Delete this expense?',
      confirmText: 'Delete expense',
    }))) return;
    try {
      await expenseApi.delete(id);
      toast.success('Expense deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      date: new Date().toISOString().split('T')[0], category: 'SUPPLIES', description: '', amount: '',
      taxAmount: '0', vendorId: '', paymentMethod: 'CASH', paymentRef: '', notes: '',
      isRecurring: false, recurringFrequency: '',
    });
    setEditingExpense(null);
  };

  // ===== VENDOR CRUD =====
  const handleSaveVendor = async () => {
    try {
      if (editingVendor) {
        await expenseApi.updateVendor(editingVendor.id, vendorForm);
        toast.success('Vendor updated');
      } else {
        await expenseApi.createVendor(vendorForm);
        toast.success('Vendor created');
      }
      setShowVendorModal(false);
      setEditingVendor(null);
      setVendorForm({ name: '', contactName: '', email: '', phone: '', address: '', taxId: '', bankName: '', bankAccount: '', bankBranch: '', notes: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save vendor');
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (!(await confirm({
      title: 'Delete vendor?',
      message: 'Delete this vendor?',
      confirmText: 'Delete vendor',
    }))) return;
    try {
      await expenseApi.deleteVendor(id);
      toast.success('Vendor deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete vendor');
    }
  };

  // Filtering
  const filteredExpenses = expenses.filter(e => {
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase()) || e.expenseNumber.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || e.status === statusFilter;
    const matchCategory = !categoryFilter || e.category === categoryFilter;
    return matchSearch && matchStatus && matchCategory;
  });

  const fmt = (n: number) => `K${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="ds-page flex items-center justify-center h-64" role="status" aria-label="Loading expenses">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--action-color)]" aria-hidden="true"></div>
      </div>
    );
  }

  return (
    <div className="ds-page">
      {!embedded && (
        <PageHeader title="Expense Management" description="Track, approve, and manage all expenses" />
      )}

      {/* Tabs */}
      <Tabs id={tabsId} label="Expense management" value={activeTab}
        onChange={key => setActiveTab(key as typeof activeTab)}
        items={[
          { id: 'expenses', label: <span className="inline-flex items-center gap-2"><Receipt size={16} aria-hidden="true" />Expenses</span> },
          { id: 'vendors', label: <span className="inline-flex items-center gap-2"><Building2 size={16} aria-hidden="true" />Vendors</span> },
          { id: 'summary', label: <span className="inline-flex items-center gap-2"><BarChart3 size={16} aria-hidden="true" />Summary</span> },
        ]} />

      {/* ======== EXPENSES TAB ======== */}
      <div hidden={activeTab !== 'expenses'}>
      <TabPanel id={tabsId} value="expenses">
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="ds-toolbar justify-between">
            <div className="ds-toolbar flex-1">
              <div className="relative w-full sm:w-auto sm:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} aria-hidden="true" />
                <input
                  type="text"
                  aria-label="Search expenses"
                  placeholder="Search expenses..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ds-input pl-10"
                />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter expenses by status" className="ds-select sm:w-auto">
                <option value="">All Statuses</option>
                {Object.keys(statusColors).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                aria-label="Filter expenses by category" className="ds-select sm:w-auto">
                <option value="">All Categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <button onClick={() => { resetExpenseForm(); setShowExpenseModal(true); }}
              className="ds-button-primary">
              <Plus size={16} aria-hidden="true" /><span>New Expense</span>
            </button>
          </div>

          {/* Stats Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: 'Total Expenses', value: fmt(summary.totalExpenses || summary.byCategory?.reduce((s: number, c: any) => s + c._sum?.totalAmount, 0) || 0), color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Pending Approval', value: expenses.filter(e => e.status === 'PENDING_APPROVAL').length, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                { label: 'Approved', value: expenses.filter(e => e.status === 'APPROVED').length, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: 'Paid', value: expenses.filter(e => e.status === 'PAID').length, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
              ].map(stat => (
                <div key={stat.label} className={`ds-card ${stat.bg}`}>
                  <p className="ds-helper">{stat.label}</p>
                  <p className={`text-2xl font-bold break-words ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="ds-surface overflow-x-auto" role="region" aria-label="Expenses table" tabIndex={0}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col" className="text-left">Expense #</th>
                  <th scope="col" className="text-left">Date</th>
                  <th scope="col" className="text-left">Category</th>
                  <th scope="col" className="text-left">Description</th>
                  <th scope="col" className="text-left">Vendor</th>
                  <th scope="col" className="text-right">Amount</th>
                  <th scope="col" className="text-center">Status</th>
                  <th scope="col" className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--text-secondary)]">No expenses found</td></tr>
                ) : filteredExpenses.map(exp => (
                  <tr key={exp.id}>
                    <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">{exp.expenseNumber}</td>
                    <td className="px-4 py-3">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className="ds-badge ds-badge-neutral">{exp.category.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3 max-w-xs truncate">{exp.description}</td>
                    <td className="px-4 py-3">{exp.vendor?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(exp.totalAmount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`ds-badge ${statusColors[exp.status] || ''}`}>
                        {exp.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center space-x-1">
                        {exp.status === 'PENDING_APPROVAL' && (
                          <>
                            <button onClick={() => handleApprove(exp.id)} className="ds-button-ghost text-green-700 dark:text-green-400" title="Approve" aria-label={`Approve expense ${exp.expenseNumber}`}><CheckCircle size={16} aria-hidden="true" /></button>
                            <button onClick={() => handleReject(exp.id)} className="ds-button-destructive" title="Reject" aria-label={`Reject expense ${exp.expenseNumber}`}><XCircle size={16} aria-hidden="true" /></button>
                          </>
                        )}
                        {exp.status === 'APPROVED' && (
                          <button onClick={() => handleMarkPaid(exp.id)} className="ds-button-ghost text-blue-600 dark:text-blue-400" title="Mark Paid" aria-label={`Mark expense ${exp.expenseNumber} as paid`}><DollarSign size={16} aria-hidden="true" /></button>
                        )}
                        {(exp.status === 'DRAFT' || exp.status === 'PENDING_APPROVAL') && (
                          <>
                            <button onClick={() => { setEditingExpense(exp); setExpenseForm({ date: exp.date?.split('T')[0] || '', category: exp.category, description: exp.description, amount: String(exp.amount), taxAmount: String(exp.taxAmount), vendorId: exp.vendorId || '', paymentMethod: exp.paymentMethod || 'CASH', paymentRef: exp.paymentRef || '', notes: exp.notes || '', isRecurring: exp.isRecurring, recurringFrequency: exp.recurringFrequency || '' }); setShowExpenseModal(true); }} className="ds-button-ghost" aria-label={`Edit expense ${exp.expenseNumber}`}><Edit2 size={16} aria-hidden="true" /></button>
                            <button onClick={() => handleDeleteExpense(exp.id)} className="ds-button-destructive" aria-label={`Delete expense ${exp.expenseNumber}`}><Trash2 size={16} aria-hidden="true" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </TabPanel>
      </div>

      {/* ======== VENDORS TAB ======== */}
      <div hidden={activeTab !== 'vendors'}>
      <TabPanel id={tabsId} value="vendors">
      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingVendor(null); setVendorForm({ name: '', contactName: '', email: '', phone: '', address: '', taxId: '', bankName: '', bankAccount: '', bankBranch: '', notes: '' }); setShowVendorModal(true); }}
              className="ds-button-primary">
              <Plus size={16} aria-hidden="true" /><span>New Vendor</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.length === 0 ? (
              <div className="ds-card col-span-full text-center text-[var(--text-secondary)] py-8">No vendors yet. Add your first vendor.</div>
            ) : vendors.map(v => (
              <div key={v.id} className="ds-card space-y-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 break-words">
                    <h3 className="font-semibold text-[var(--text-primary)]">{v.name}</h3>
                    {v.contactName && <p className="ds-helper">{v.contactName}</p>}
                  </div>
                  <span className={`ds-badge ${v.isActive ? 'ds-badge-success' : 'ds-badge-neutral'}`}>
                    {v.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {v.email && <p className="ds-helper break-words">📧 {v.email}</p>}
                {v.phone && <p className="ds-helper break-words">📞 {v.phone}</p>}
                {v.taxId && <p className="ds-helper break-words">Tax ID: {v.taxId}</p>}
                <div className="ds-actions pt-2 border-t border-[var(--border-color)]">
                  <button onClick={() => { setEditingVendor(v); setVendorForm({ name: v.name, contactName: v.contactName || '', email: v.email || '', phone: v.phone || '', address: v.address || '', taxId: v.taxId || '', bankName: v.bankName || '', bankAccount: v.bankAccount || '', bankBranch: v.bankBranch || '', notes: v.notes || '' }); setShowVendorModal(true); }}
                    className="ds-button-ghost">Edit</button>
                  <button onClick={() => handleDeleteVendor(v.id)} className="ds-button-destructive">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </TabPanel>
      </div>

      {/* ======== SUMMARY TAB ======== */}
      <div hidden={activeTab !== 'summary'}>
      <TabPanel id={tabsId} value="summary">
      {activeTab === 'summary' && summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Category */}
            <div className="ds-card">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">Expenses by Category</h3>
              <div className="space-y-3">
                {(summary.byCategory || []).map((cat: any) => (
                  <div key={cat.category} className="flex flex-wrap gap-2 justify-between items-center">
                    <span className="ds-helper">{cat.category.replace(/_/g, ' ')}</span>
                    <div className="text-right">
                      <span className="font-medium text-[var(--text-primary)]">{fmt(cat._sum?.totalAmount || 0)}</span>
                      <span className="text-xs text-[var(--text-secondary)] ml-2">({cat._count} items)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="ds-card">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">Monthly Trend</h3>
              <div className="space-y-3">
                {(summary.monthlyTrend || []).map((m: any) => (
                  <div key={`${m.year}-${m.month}`} className="flex flex-wrap gap-2 justify-between items-center">
                    <span className="ds-helper">
                      {new Date(m.year, m.month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">{fmt(m.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      </TabPanel>
      </div>

      {/* ======== EXPENSE MODAL ======== */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" role="dialog" aria-labelledby={`${tabsId}-expense-title`}>
          <div className="ds-surface w-full max-w-xl max-h-[90vh] overflow-y-auto" role="region" aria-label="Expense form" tabIndex={0}>
            <div className="ds-modal-header border-b border-[var(--border-color)]">
              <h2 id={`${tabsId}-expense-title`} className="text-[var(--text-primary)]">{editingExpense ? 'Edit Expense' : 'New Expense'}</h2>
              <button onClick={() => { setShowExpenseModal(false); resetExpenseForm(); }} className="ds-button-ghost" aria-label="Close expense dialog"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${tabsId}-expense-date`} className="ds-label mb-1">Date</label>
                  <input id={`${tabsId}-expense-date`} type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="ds-input" />
                </div>
                <div>
                  <label htmlFor={`${tabsId}-expense-category`} className="ds-label mb-1">Category</label>
                  <select id={`${tabsId}-expense-category`} value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="ds-select">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor={`${tabsId}-expense-description`} className="ds-label mb-1">Description</label>
                <input id={`${tabsId}-expense-description`} type="text" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="ds-input" placeholder="What was this expense for?" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${tabsId}-expense-amount`} className="ds-label mb-1">Amount (ZMW)</label>
                  <input id={`${tabsId}-expense-amount`} type="number" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="ds-input" placeholder="0.00" />
                </div>
                <div>
                  <label htmlFor={`${tabsId}-expense-tax`} className="ds-label mb-1">Tax Amount (ZMW)</label>
                  <input id={`${tabsId}-expense-tax`} type="number" step="0.01" value={expenseForm.taxAmount} onChange={e => setExpenseForm({ ...expenseForm, taxAmount: e.target.value })}
                    className="ds-input" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label htmlFor={`${tabsId}-expense-vendor`} className="ds-label mb-1">Vendor (optional)</label>
                <select id={`${tabsId}-expense-vendor`} value={expenseForm.vendorId} onChange={e => setExpenseForm({ ...expenseForm, vendorId: e.target.value })}
                  className="ds-select">
                  <option value="">— No Vendor —</option>
                  {vendors.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${tabsId}-expense-method`} className="ds-label mb-1">Payment Method</label>
                  <select id={`${tabsId}-expense-method`} value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    className="ds-select">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`${tabsId}-expense-ref`} className="ds-label mb-1">Payment Ref</label>
                  <input id={`${tabsId}-expense-ref`} type="text" value={expenseForm.paymentRef} onChange={e => setExpenseForm({ ...expenseForm, paymentRef: e.target.value })}
                    className="ds-input" />
                </div>
              </div>
              <div>
                <label htmlFor={`${tabsId}-expense-notes`} className="ds-label mb-1">Notes</label>
                <textarea id={`${tabsId}-expense-notes`} value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} rows={2}
                  className="ds-textarea" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => { setShowExpenseModal(false); resetExpenseForm(); }}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleSaveExpense}
                className="ds-button-primary">
                {editingExpense ? 'Update' : 'Create'} Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======== VENDOR MODAL ======== */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" role="dialog" aria-labelledby={`${tabsId}-vendor-title`}>
          <div className="ds-surface w-full max-w-xl max-h-[90vh] overflow-y-auto" role="region" aria-label="Vendor form" tabIndex={0}>
            <div className="ds-modal-header border-b border-[var(--border-color)]">
              <h2 id={`${tabsId}-vendor-title`} className="text-[var(--text-primary)]">{editingVendor ? 'Edit Vendor' : 'New Vendor'}</h2>
              <button onClick={() => setShowVendorModal(false)} className="ds-button-ghost" aria-label="Close vendor dialog"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label htmlFor={`${tabsId}-vendor-name`} className="ds-label mb-1">Vendor Name *</label>
                <input id={`${tabsId}-vendor-name`} type="text" value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })}
                  className="ds-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${tabsId}-vendor-contact`} className="ds-label mb-1">Contact Person</label>
                  <input id={`${tabsId}-vendor-contact`} type="text" value={vendorForm.contactName} onChange={e => setVendorForm({ ...vendorForm, contactName: e.target.value })}
                    className="ds-input" />
                </div>
                <div>
                  <label htmlFor={`${tabsId}-vendor-phone`} className="ds-label mb-1">Phone</label>
                  <input id={`${tabsId}-vendor-phone`} type="text" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    className="ds-input" />
                </div>
              </div>
              <div>
                <label htmlFor={`${tabsId}-vendor-email`} className="ds-label mb-1">Email</label>
                <input id={`${tabsId}-vendor-email`} type="email" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                  className="ds-input" />
              </div>
              <div>
                <label htmlFor={`${tabsId}-vendor-address`} className="ds-label mb-1">Address</label>
                <input id={`${tabsId}-vendor-address`} type="text" value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })}
                  className="ds-input" />
              </div>
              <div>
                <label htmlFor={`${tabsId}-vendor-tax`} className="ds-label mb-1">Tax ID / TPIN</label>
                <input id={`${tabsId}-vendor-tax`} type="text" value={vendorForm.taxId} onChange={e => setVendorForm({ ...vendorForm, taxId: e.target.value })}
                  className="ds-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor={`${tabsId}-vendor-bank`} className="ds-label mb-1">Bank Name</label>
                  <input id={`${tabsId}-vendor-bank`} type="text" value={vendorForm.bankName} onChange={e => setVendorForm({ ...vendorForm, bankName: e.target.value })}
                    className="ds-input" />
                </div>
                <div>
                  <label htmlFor={`${tabsId}-vendor-account`} className="ds-label mb-1">Account #</label>
                  <input id={`${tabsId}-vendor-account`} type="text" value={vendorForm.bankAccount} onChange={e => setVendorForm({ ...vendorForm, bankAccount: e.target.value })}
                    className="ds-input" />
                </div>
                <div>
                  <label htmlFor={`${tabsId}-vendor-branch`} className="ds-label mb-1">Branch</label>
                  <input id={`${tabsId}-vendor-branch`} type="text" value={vendorForm.bankBranch} onChange={e => setVendorForm({ ...vendorForm, bankBranch: e.target.value })}
                    className="ds-input" />
                </div>
              </div>
              <div>
                <label htmlFor={`${tabsId}-vendor-notes`} className="ds-label mb-1">Notes</label>
                <textarea id={`${tabsId}-vendor-notes`} value={vendorForm.notes} onChange={e => setVendorForm({ ...vendorForm, notes: e.target.value })} rows={2}
                  className="ds-textarea" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowVendorModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleSaveVendor}
                className="ds-button-primary">
                {editingVendor ? 'Update' : 'Create'} Vendor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
