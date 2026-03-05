import { useState, useEffect } from 'react';
import { Plus, Users, PlayCircle, CheckCircle, DollarSign, Eye, X, Calculator } from 'lucide-react';
import { payrollApi, StaffPayroll, PayrollRun, Payslip } from '../../services/accountingService';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const Payroll = ({ embedded = false }: { embedded?: boolean }) => {
  const [activeTab, setActiveTab] = useState<'staff' | 'runs' | 'payslip'>('staff');
  const [staffPayrolls, setStaffPayrolls] = useState<StaffPayroll[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showRunDetailModal, setShowRunDetailModal] = useState(false);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffPayroll | null>(null);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  // Staff form
  const [staffForm, setStaffForm] = useState({
    userId: '', basicSalary: '', housingAllowance: '0', transportAllowance: '0',
    otherAllowances: '0', otherDeductions: '0', bankName: '', bankAccount: '', bankBranch: '',
  });

  // Run form
  const [runForm, setRunForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    description: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [staffRes, runsRes] = await Promise.all([
        payrollApi.getStaff(),
        payrollApi.getRuns(),
      ]);
      setStaffPayrolls(staffRes.data.staffPayrolls || staffRes.data || []);
      setPayrollRuns(runsRes.data.payrollRuns || runsRes.data || []);
    } catch (err: any) {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  // ===== STAFF PAYROLL =====
  const handleSaveStaff = async () => {
    try {
      const payload = {
        userId: staffForm.userId,
        basicSalary: parseFloat(staffForm.basicSalary),
        housingAllowance: parseFloat(staffForm.housingAllowance) || 0,
        transportAllowance: parseFloat(staffForm.transportAllowance) || 0,
        otherAllowances: parseFloat(staffForm.otherAllowances) || 0,
        otherDeductions: parseFloat(staffForm.otherDeductions) || 0,
        bankName: staffForm.bankName || undefined,
        bankAccount: staffForm.bankAccount || undefined,
        bankBranch: staffForm.bankBranch || undefined,
      };
      if (editingStaff) {
        await payrollApi.updateStaff(editingStaff.id, payload);
        toast.success('Staff payroll updated');
      } else {
        await payrollApi.createStaff(payload);
        toast.success('Staff payroll created');
      }
      setShowStaffModal(false);
      resetStaffForm();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const resetStaffForm = () => {
    setStaffForm({ userId: '', basicSalary: '', housingAllowance: '0', transportAllowance: '0', otherAllowances: '0', otherDeductions: '0', bankName: '', bankAccount: '', bankBranch: '' });
    setEditingStaff(null);
  };

  // ===== PAYROLL RUNS =====
  const handleCreateRun = async () => {
    try {
      await payrollApi.createRun(runForm);
      toast.success('Payroll run created with payslips');
      setShowRunModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create run');
    }
  };

  const handleViewRun = async (id: string) => {
    try {
      const res = await payrollApi.getRunDetail(id);
      setSelectedRun(res.data);
      setShowRunDetailModal(true);
    } catch {
      toast.error('Failed to load run details');
    }
  };

  const handleApproveRun = async (id: string) => {
    try {
      await payrollApi.approveRun(id);
      toast.success('Payroll run approved');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleMarkRunPaid = async (id: string) => {
    try {
      await payrollApi.markPaid(id);
      toast.success('Payroll marked as paid');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to mark paid');
    }
  };

  const handleViewPayslip = async (id: string) => {
    try {
      const res = await payrollApi.getPayslip(id);
      setSelectedPayslip(res.data);
      setShowPayslipModal(true);
    } catch {
      toast.error('Failed to load payslip');
    }
  };

  const fmt = (n: number) => `K${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payroll Management</h1>
          <p className="text-gray-500 dark:text-gray-400">Staff salaries, payroll runs, and payslips</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-4">
          {[
            { key: 'staff', label: 'Staff Payroll', icon: Users },
            { key: 'runs', label: 'Payroll Runs', icon: PlayCircle },
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

      {/* ======== STAFF TAB ======== */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{staffPayrolls.length} staff member(s) configured</p>
            <button onClick={() => { resetStaffForm(); setShowStaffModal(true); }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              <Plus size={16} /><span>Add Staff</span>
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Gross</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(staffPayrolls.reduce((s, sp) => s + sp.basicSalary + sp.housingAllowance + sp.transportAllowance + sp.otherAllowances, 0))}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Deductions</p>
              <p className="text-2xl font-bold text-red-600">{fmt(staffPayrolls.reduce((s, sp) => s + sp.taxDeduction + sp.napsaDeduction + sp.nhimaDeduction + sp.otherDeductions, 0))}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Net Pay</p>
              <p className="text-2xl font-bold text-green-600">{fmt(staffPayrolls.reduce((s, sp) => s + sp.netSalary, 0))}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Staff</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Basic</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Allowances</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">PAYE</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">NAPSA</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">NHIMA</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Net Pay</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {staffPayrolls.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No staff payroll configured</td></tr>
                ) : staffPayrolls.map(sp => (
                  <tr key={sp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <p className="font-medium dark:text-white">{sp.user?.fullName || sp.userId}</p>
                      <p className="text-xs text-gray-400">{sp.user?.role}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{fmt(sp.basicSalary)}</td>
                    <td className="px-4 py-3 text-right">{fmt(sp.housingAllowance + sp.transportAllowance + sp.otherAllowances)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{fmt(sp.taxDeduction)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{fmt(sp.napsaDeduction)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{fmt(sp.nhimaDeduction)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">{fmt(sp.netSalary)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => {
                        setEditingStaff(sp);
                        setStaffForm({
                          userId: sp.userId,
                          basicSalary: String(sp.basicSalary),
                          housingAllowance: String(sp.housingAllowance),
                          transportAllowance: String(sp.transportAllowance),
                          otherAllowances: String(sp.otherAllowances),
                          otherDeductions: String(sp.otherDeductions),
                          bankName: sp.bankName || '',
                          bankAccount: sp.bankAccount || '',
                          bankBranch: sp.bankBranch || '',
                        });
                        setShowStaffModal(true);
                      }} className="text-sm text-blue-600 hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======== PAYROLL RUNS TAB ======== */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowRunModal(true)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
              <PlayCircle size={16} /><span>Create Payroll Run</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {payrollRuns.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 dark:text-gray-400 py-8">No payroll runs yet</div>
            ) : payrollRuns.map(run => (
              <div key={run.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white font-mono">{run.runNumber}</h3>
                    <p className="text-sm text-gray-500">{monthNames[run.month - 1]} {run.year}</p>
                    {run.description && <p className="text-xs text-gray-400">{run.description}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[run.status] || ''}`}>{run.status}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs">Gross</p>
                    <p className="font-medium dark:text-white">{fmt(run.totalGross)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs">Deductions</p>
                    <p className="font-medium text-red-500">{fmt(run.totalDeductions)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs">Net</p>
                    <p className="font-medium text-green-600">{fmt(run.totalNet)}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-400">{run._count?.payslips || 0} payslip(s)</p>

                <div className="flex space-x-2 pt-2 border-t dark:border-gray-700">
                  <button onClick={() => handleViewRun(run.id)} className="text-sm text-blue-600 hover:underline flex items-center space-x-1">
                    <Eye size={14} /><span>View</span>
                  </button>
                  {run.status === 'DRAFT' && (
                    <button onClick={() => handleApproveRun(run.id)} className="text-sm text-green-600 hover:underline flex items-center space-x-1">
                      <CheckCircle size={14} /><span>Approve</span>
                    </button>
                  )}
                  {run.status === 'APPROVED' && (
                    <button onClick={() => handleMarkRunPaid(run.id)} className="text-sm text-purple-600 hover:underline flex items-center space-x-1">
                      <DollarSign size={14} /><span>Pay</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======== STAFF MODAL ======== */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">{editingStaff ? 'Edit Staff Payroll' : 'Add Staff Payroll'}</h2>
              <button onClick={() => { setShowStaffModal(false); resetStaffForm(); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {!editingStaff && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID</label>
                  <input type="text" value={staffForm.userId} onChange={e => setStaffForm({ ...staffForm, userId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="User ID of the staff member" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Basic Salary (ZMW)</label>
                <input type="number" step="0.01" value={staffForm.basicSalary} onChange={e => setStaffForm({ ...staffForm, basicSalary: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0.00" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Housing</label>
                  <input type="number" step="0.01" value={staffForm.housingAllowance} onChange={e => setStaffForm({ ...staffForm, housingAllowance: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transport</label>
                  <input type="number" step="0.01" value={staffForm.transportAllowance} onChange={e => setStaffForm({ ...staffForm, transportAllowance: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Other Allow.</label>
                  <input type="number" step="0.01" value={staffForm.otherAllowances} onChange={e => setStaffForm({ ...staffForm, otherAllowances: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Other Deductions (ZMW)</label>
                <input type="number" step="0.01" value={staffForm.otherDeductions} onChange={e => setStaffForm({ ...staffForm, otherDeductions: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm font-medium text-blue-600 mb-1">
                  <Calculator size={14} className="inline mr-1" /> Auto-Calculated Deductions
                </p>
                <p className="text-xs text-gray-500">PAYE, NAPSA (5%), and NHIMA (1%) are automatically calculated based on Zambian tax law when saved.</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
                  <input type="text" value={staffForm.bankName} onChange={e => setStaffForm({ ...staffForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account #</label>
                  <input type="text" value={staffForm.bankAccount} onChange={e => setStaffForm({ ...staffForm, bankAccount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
                  <input type="text" value={staffForm.bankBranch} onChange={e => setStaffForm({ ...staffForm, bankBranch: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => { setShowStaffModal(false); resetStaffForm(); }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleSaveStaff}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                {editingStaff ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======== RUN MODAL ======== */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Create Payroll Run</h2>
              <button onClick={() => setShowRunModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Month</label>
                  <select value={runForm.month} onChange={e => setRunForm({ ...runForm, month: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Year</label>
                  <input type="number" value={runForm.year} onChange={e => setRunForm({ ...runForm, year: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input type="text" value={runForm.description} onChange={e => setRunForm({ ...runForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g., January 2025 Payroll" />
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
                This will generate payslips for all {staffPayrolls.filter(s => s.isActive).length} active staff members.
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowRunModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateRun}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Run</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== RUN DETAIL MODAL ======== */}
      {showRunDetailModal && selectedRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold dark:text-white">Payroll Run: {selectedRun.runNumber}</h2>
                <p className="text-sm text-gray-500">{monthNames[selectedRun.month - 1]} {selectedRun.year}</p>
              </div>
              <button onClick={() => setShowRunDetailModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedRun.status]}`}>{selectedRun.status}</span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Gross</p>
                  <p className="font-bold text-blue-600">{fmt(selectedRun.totalGross)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Deductions</p>
                  <p className="font-bold text-red-600">{fmt(selectedRun.totalDeductions)}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Net</p>
                  <p className="font-bold text-green-600">{fmt(selectedRun.totalNet)}</p>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Staff</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Gross</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">PAYE</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">NAPSA</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">NHIMA</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Net</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-300">Paid</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-300">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {(selectedRun.payslips || []).map(ps => (
                    <tr key={ps.id}>
                      <td className="px-4 py-2 dark:text-gray-200">{ps.user?.fullName || ps.userId}</td>
                      <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(ps.grossSalary)}</td>
                      <td className="px-4 py-2 text-right text-red-500">{fmt(ps.payeTax)}</td>
                      <td className="px-4 py-2 text-right text-red-500">{fmt(ps.napsaContribution)}</td>
                      <td className="px-4 py-2 text-right text-red-500">{fmt(ps.nhimaContribution)}</td>
                      <td className="px-4 py-2 text-right font-bold text-green-600">{fmt(ps.netSalary)}</td>
                      <td className="px-4 py-2 text-center">{ps.isPaid ? <CheckCircle size={16} className="text-green-500 inline" /> : <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => handleViewPayslip(ps.id)} className="text-blue-600 hover:underline text-xs">Payslip</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======== PAYSLIP MODAL ======== */}
      {showPayslipModal && selectedPayslip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Payslip {selectedPayslip.payslipNumber}</h2>
              <button onClick={() => setShowPayslipModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center border-b dark:border-gray-700 pb-4">
                <p className="font-bold text-lg dark:text-white">{selectedPayslip.user?.fullName}</p>
                <p className="text-sm text-gray-500">{selectedPayslip.user?.role}</p>
              </div>

              <div className="space-y-2 text-sm">
                <h4 className="font-medium text-gray-700 dark:text-gray-300">Earnings</h4>
                <div className="flex justify-between"><span className="text-gray-500">Basic Salary</span><span className="dark:text-white">{fmt(selectedPayslip.basicSalary)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Housing Allowance</span><span className="dark:text-white">{fmt(selectedPayslip.housingAllowance)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Transport Allowance</span><span className="dark:text-white">{fmt(selectedPayslip.transportAllowance)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Other Allowances</span><span className="dark:text-white">{fmt(selectedPayslip.otherAllowances)}</span></div>
                <div className="flex justify-between font-bold border-t dark:border-gray-700 pt-2"><span className="dark:text-white">Gross Salary</span><span className="text-blue-600">{fmt(selectedPayslip.grossSalary)}</span></div>
              </div>

              <div className="space-y-2 text-sm">
                <h4 className="font-medium text-gray-700 dark:text-gray-300">Deductions</h4>
                <div className="flex justify-between"><span className="text-gray-500">PAYE Tax</span><span className="text-red-500">{fmt(selectedPayslip.payeTax)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">NAPSA (5%)</span><span className="text-red-500">{fmt(selectedPayslip.napsaContribution)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">NHIMA (1%)</span><span className="text-red-500">{fmt(selectedPayslip.nhimaContribution)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Other Deductions</span><span className="text-red-500">{fmt(selectedPayslip.otherDeductions)}</span></div>
                <div className="flex justify-between font-bold border-t dark:border-gray-700 pt-2"><span className="dark:text-white">Total Deductions</span><span className="text-red-600">{fmt(selectedPayslip.totalDeductions)}</span></div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg dark:text-white">Net Pay</span>
                  <span className="font-bold text-2xl text-green-600">{fmt(selectedPayslip.netSalary)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
