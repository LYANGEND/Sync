import { useState, useEffect } from 'react';
import { Plus, X, BarChart3, TrendingUp, Edit2 } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { budgetApi, Budget } from '../../services/accountingService';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = [
  'UTILITIES', 'RENT', 'SALARIES', 'SUPPLIES', 'MAINTENANCE',
  'TRANSPORT', 'COMMUNICATION', 'INSURANCE', 'MARKETING',
  'PROFESSIONAL_FEES', 'FOOD_CATERING', 'CLEANING',
  'SECURITY', 'MISCELLANEOUS', 'CAPITAL_EXPENDITURE'
];

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CLOSED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const defaultForm = () => ({
  name: '', period: 'term', year: new Date().getFullYear(),
  startDate: '', endDate: '', notes: '',
  items: [{ category: 'SUPPLIES', description: '', allocated: '' }],
});

const normalizePeriod = (period?: string) => (period || 'term').toLowerCase();
const formatPeriodLabel = (period?: string) => {
  const normalized = normalizePeriod(period);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const Budgets = ({ embedded = false }: { embedded?: boolean }) => {
    const { confirm } = useAppDialog();
  const [activeTab, setActiveTab] = useState<'budgets' | 'comparison'>('budgets');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<any>(null);

  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [budRes, compRes] = await Promise.all([
        budgetApi.getAll(),
        budgetApi.getBudgetVsActual(),
      ]);
      setBudgets(budRes.data.budgets || budRes.data || []);
      setComparison(compRes.data);
    } catch (err: any) {
      toast.error('Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  const buildPayload = () => ({
    ...form,
    period: normalizePeriod(form.period),
    items: form.items.map(i => ({
      category: i.category,
      description: i.description || undefined,
      allocated: parseFloat(i.allocated as string),
    })),
  });

  const closeFormModal = () => {
    setShowCreateModal(false);
    setEditingBudgetId(null);
    resetForm();
  };

  const handleSubmit = async () => {
    try {
      const payload = buildPayload();
      if (editingBudgetId) {
        await budgetApi.update(editingBudgetId, payload);
        toast.success('Budget updated');
      } else {
        await budgetApi.create(payload);
        toast.success('Budget created');
      }
      closeFormModal();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to ${editingBudgetId ? 'update' : 'create'} budget`);
    }
  };

  const handleViewDetail = async (id: string) => {
    try {
      const res = await budgetApi.getById(id);
      setSelectedBudget(res.data);
      setShowDetailModal(true);
    } catch {
      toast.error('Failed to load budget details');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await budgetApi.activate(id);
      toast.success('Budget activated');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to activate');
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const res = await budgetApi.getById(id);
      const budget = res.data;
      setEditingBudgetId(id);
      setForm({
        name: budget.name || '',
        period: normalizePeriod(budget.period),
        year: budget.year || new Date().getFullYear(),
        startDate: budget.startDate ? budget.startDate.split('T')[0] : '',
        endDate: budget.endDate ? budget.endDate.split('T')[0] : '',
        notes: budget.notes || '',
        items: (budget.items || []).length > 0
          ? budget.items.map((item: any) => ({
              category: item.category,
              description: item.description || '',
              allocated: String(item.allocated ?? ''),
            }))
          : [{ category: 'SUPPLIES', description: '', allocated: '' }],
      });
      setShowCreateModal(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load budget for editing');
    }
  };

  const handleClose = async (id: string) => {
    try {
      await budgetApi.close(id);
      toast.success('Budget closed');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to close');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({
      title: 'Delete budget?',
      message: 'Delete this budget?',
      confirmText: 'Delete budget',
    }))) return;
    try {
      await budgetApi.delete(id);
      toast.success('Budget deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setForm(defaultForm());
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { category: 'SUPPLIES', description: '', allocated: '' }] });
  };

  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...form.items];
    (items[idx] as any)[field] = value;
    setForm({ ...form, items });
  };

  const fmt = (n: number) => `K${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budget Management</h1>
            <p className="text-gray-500 dark:text-gray-400">Plan budgets and track spending</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-4">
          {[
            { key: 'budgets', label: 'Budgets', icon: BarChart3 },
            { key: 'comparison', label: 'Budget vs Actual', icon: TrendingUp },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}>
              <tab.icon size={16} /><span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ======== BUDGETS TAB ======== */}
      {activeTab === 'budgets' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingBudgetId(null); resetForm(); setShowCreateModal(true); }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              <Plus size={16} /><span>New Budget</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 dark:text-gray-400 py-8">No budgets yet</div>
            ) : budgets.map(b => {
              const utilization = b.totalBudget > 0 ? (b.totalSpent / b.totalBudget) * 100 : 0;
              return (
                <div key={b.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{b.name}</h3>
                      <p className="text-sm text-gray-500">{formatPeriodLabel(b.period)} {b.year}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[b.status] || ''}`}>{b.status}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Allocated</span>
                      <span className="font-medium dark:text-white">{fmt(b.totalBudget)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Spent</span>
                      <span className={`font-medium ${utilization > 90 ? 'text-red-600' : 'text-green-600'}`}>{fmt(b.totalSpent)}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${utilization > 90 ? 'bg-red-500' : utilization > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-400 text-right">{utilization.toFixed(1)}% used</p>
                  </div>

                  <div className="flex space-x-2 pt-2 border-t dark:border-gray-700">
                    <button onClick={() => handleViewDetail(b.id)} className="text-sm text-blue-600 hover:underline">View</button>
                    {b.status === 'DRAFT' && (
                      <>
                        <button onClick={() => handleEdit(b.id)} className="text-sm text-slate-600 hover:underline inline-flex items-center gap-1"><Edit2 size={14} />Edit</button>
                        <button onClick={() => handleActivate(b.id)} className="text-sm text-green-600 hover:underline">Activate</button>
                        <button onClick={() => handleDelete(b.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                      </>
                    )}
                    {b.status === 'ACTIVE' && (
                      <button onClick={() => handleClose(b.id)} className="text-sm text-gray-600 hover:underline">Close</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======== COMPARISON TAB ======== */}
      {activeTab === 'comparison' && (
        <div className="space-y-4">
          {!comparison || !comparison.budgets || comparison.budgets.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">No active budgets to compare</div>
          ) : comparison.budgets.map((b: any) => (
            <div key={b.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{b.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[b.status]}`}>{b.status}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Category</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Budgeted</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Actual</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Variance</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">% Used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {(b.items || []).map((item: any) => {
                      const variance = item.allocated - item.spent;
                      const pct = item.allocated > 0 ? (item.spent / item.allocated) * 100 : 0;
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-2 dark:text-gray-200">{item.category.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(item.allocated)}</td>
                          <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(item.spent)}</td>
                          <td className={`px-4 py-2 text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {variance >= 0 ? '+' : ''}{fmt(variance)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${pct > 100 ? 'bg-red-100 text-red-700' : pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======== DETAIL MODAL ======== */}
      {showDetailModal && selectedBudget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">{selectedBudget.name}</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Budget</p>
                  <p className="font-bold text-blue-600">{fmt(selectedBudget.totalBudget)}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Spent</p>
                  <p className="font-bold text-orange-600">{fmt(selectedBudget.totalSpent)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Remaining</p>
                  <p className="font-bold text-green-600">{fmt(selectedBudget.totalBudget - selectedBudget.totalSpent)}</p>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Category</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Description</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Allocated</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Spent</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {(selectedBudget.items || []).map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 dark:text-gray-200">{item.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2 text-gray-500">{item.description || '—'}</td>
                      <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(item.allocated)}</td>
                      <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(item.spent)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${item.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(item.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======== CREATE MODAL ======== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">{editingBudgetId ? 'Edit Budget' : 'Create Budget'}</h2>
              <button onClick={closeFormModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Budget Name</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., Term 1 2025 Budget" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Period</label>
                  <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="term">Term</option>
                    <option value="annual">Annual</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                  <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Budget Items</label>
                  <button onClick={addItem} className="text-sm text-blue-600 hover:underline">+ Add Item</button>
                </div>
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                      className="w-48 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                    <input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Description" />
                    <input type="number" step="0.01" value={item.allocated} onChange={e => updateItem(idx, 'allocated', e.target.value)}
                      className="w-32 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Amount" />
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>
                    )}
                  </div>
                ))}
                <div className="text-right text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                  Total: {fmt(form.items.reduce((s, i) => s + (parseFloat(i.allocated as string) || 0), 0))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={closeFormModal}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{editingBudgetId ? 'Save Changes' : 'Create Budget'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budgets;
