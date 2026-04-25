import { useState, useEffect } from 'react';
import { Plus, Search, DollarSign, CheckCircle, XCircle, Edit2, Trash2, X, Building2, Receipt, BarChart3 } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expense Management</h1>
            <p className="text-gray-500 dark:text-gray-400">Track, approve, and manage all expenses</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-4">
          {[
            { key: 'expenses', label: 'Expenses', icon: Receipt },
            { key: 'vendors', label: 'Vendors', icon: Building2 },
            { key: 'summary', label: 'Summary', icon: BarChart3 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ======== EXPENSES TAB ======== */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                <option value="">All Statuses</option>
                {Object.keys(statusColors).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                <option value="">All Categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <button onClick={() => { resetExpenseForm(); setShowExpenseModal(true); }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              <Plus size={16} /><span>New Expense</span>
            </button>
          </div>

          {/* Stats Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Expenses', value: fmt(summary.totalExpenses || summary.byCategory?.reduce((s: number, c: any) => s + c._sum?.totalAmount, 0) || 0), color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Pending Approval', value: expenses.filter(e => e.status === 'PENDING_APPROVAL').length, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
                { label: 'Approved', value: expenses.filter(e => e.status === 'APPROVED').length, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: 'Paid', value: expenses.filter(e => e.status === 'PAID').length, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
              ].map(stat => (
                <div key={stat.label} className={`${stat.bg} p-4 rounded-lg`}>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Expense #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Description</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Vendor</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Amount</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredExpenses.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No expenses found</td></tr>
                ) : filteredExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">{exp.expenseNumber}</td>
                    <td className="px-4 py-3">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{exp.category.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3 max-w-xs truncate">{exp.description}</td>
                    <td className="px-4 py-3">{exp.vendor?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(exp.totalAmount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[exp.status] || ''}`}>
                        {exp.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center space-x-1">
                        {exp.status === 'PENDING_APPROVAL' && (
                          <>
                            <button onClick={() => handleApprove(exp.id)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Approve"><CheckCircle size={16} /></button>
                            <button onClick={() => handleReject(exp.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Reject"><XCircle size={16} /></button>
                          </>
                        )}
                        {exp.status === 'APPROVED' && (
                          <button onClick={() => handleMarkPaid(exp.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Mark Paid"><DollarSign size={16} /></button>
                        )}
                        {(exp.status === 'DRAFT' || exp.status === 'PENDING_APPROVAL') && (
                          <>
                            <button onClick={() => { setEditingExpense(exp); setExpenseForm({ date: exp.date?.split('T')[0] || '', category: exp.category, description: exp.description, amount: String(exp.amount), taxAmount: String(exp.taxAmount), vendorId: exp.vendorId || '', paymentMethod: exp.paymentMethod || 'CASH', paymentRef: exp.paymentRef || '', notes: exp.notes || '', isRecurring: exp.isRecurring, recurringFrequency: exp.recurringFrequency || '' }); setShowExpenseModal(true); }} className="p-1 text-gray-600 hover:bg-gray-50 rounded"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteExpense(exp.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
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

      {/* ======== VENDORS TAB ======== */}
      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingVendor(null); setVendorForm({ name: '', contactName: '', email: '', phone: '', address: '', taxId: '', bankName: '', bankAccount: '', bankBranch: '', notes: '' }); setShowVendorModal(true); }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              <Plus size={16} /><span>New Vendor</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 dark:text-gray-400 py-8">No vendors yet. Add your first vendor.</div>
            ) : vendors.map(v => (
              <div key={v.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{v.name}</h3>
                    {v.contactName && <p className="text-sm text-gray-500">{v.contactName}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {v.email && <p className="text-sm text-gray-600 dark:text-gray-400">📧 {v.email}</p>}
                {v.phone && <p className="text-sm text-gray-600 dark:text-gray-400">📞 {v.phone}</p>}
                {v.taxId && <p className="text-sm text-gray-600 dark:text-gray-400">Tax ID: {v.taxId}</p>}
                <div className="flex space-x-2 pt-2 border-t dark:border-gray-700">
                  <button onClick={() => { setEditingVendor(v); setVendorForm({ name: v.name, contactName: v.contactName || '', email: v.email || '', phone: v.phone || '', address: v.address || '', taxId: v.taxId || '', bankName: v.bankName || '', bankAccount: v.bankAccount || '', bankBranch: v.bankBranch || '', notes: v.notes || '' }); setShowVendorModal(true); }}
                    className="text-sm text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => handleDeleteVendor(v.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======== SUMMARY TAB ======== */}
      {activeTab === 'summary' && summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Category */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Expenses by Category</h3>
              <div className="space-y-3">
                {(summary.byCategory || []).map((cat: any) => (
                  <div key={cat.category} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{cat.category.replace(/_/g, ' ')}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-900 dark:text-white">{fmt(cat._sum?.totalAmount || 0)}</span>
                      <span className="text-xs text-gray-400 ml-2">({cat._count} items)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Monthly Trend</h3>
              <div className="space-y-3">
                {(summary.monthlyTrend || []).map((m: any) => (
                  <div key={`${m.year}-${m.month}`} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(m.year, m.month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">{fmt(m.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======== EXPENSE MODAL ======== */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">{editingExpense ? 'Edit Expense' : 'New Expense'}</h2>
              <button onClick={() => { setShowExpenseModal(false); resetExpenseForm(); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                  <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="What was this expense for?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (ZMW)</label>
                  <input type="number" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax Amount (ZMW)</label>
                  <input type="number" step="0.01" value={expenseForm.taxAmount} onChange={e => setExpenseForm({ ...expenseForm, taxAmount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor (optional)</label>
                <select value={expenseForm.vendorId} onChange={e => setExpenseForm({ ...expenseForm, vendorId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="">— No Vendor —</option>
                  {vendors.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
                  <select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Ref</label>
                  <input type="text" value={expenseForm.paymentRef} onChange={e => setExpenseForm({ ...expenseForm, paymentRef: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => { setShowExpenseModal(false); resetExpenseForm(); }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleSaveExpense}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                {editingExpense ? 'Update' : 'Create'} Expense
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======== VENDOR MODAL ======== */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">{editingVendor ? 'Edit Vendor' : 'New Vendor'}</h2>
              <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor Name *</label>
                <input type="text" value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Person</label>
                  <input type="text" value={vendorForm.contactName} onChange={e => setVendorForm({ ...vendorForm, contactName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input type="text" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <input type="text" value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax ID / TPIN</label>
                <input type="text" value={vendorForm.taxId} onChange={e => setVendorForm({ ...vendorForm, taxId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
                  <input type="text" value={vendorForm.bankName} onChange={e => setVendorForm({ ...vendorForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account #</label>
                  <input type="text" value={vendorForm.bankAccount} onChange={e => setVendorForm({ ...vendorForm, bankAccount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
                  <input type="text" value={vendorForm.bankBranch} onChange={e => setVendorForm({ ...vendorForm, bankBranch: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={vendorForm.notes} onChange={e => setVendorForm({ ...vendorForm, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowVendorModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleSaveVendor}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
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
