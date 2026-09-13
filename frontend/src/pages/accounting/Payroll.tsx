import { useState, useEffect, useId } from 'react';
import { Plus, Users, PlayCircle, CheckCircle, DollarSign, Eye, X, Calculator, Loader2 } from 'lucide-react';
import { payrollApi, StaffPayroll, PayrollRun, Payslip } from '../../services/accountingService';
import { Alert, Tabs, TabPanel } from '../../components/ui/DesignSystem';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  DRAFT: 'ds-badge-neutral',
  APPROVED: 'ds-badge-info',
  PAID: 'ds-badge-success',
  CANCELLED: 'ds-badge-error',
};

const Payroll = ({ embedded = false }: { embedded?: boolean }) => {
  const payrollId = useId();
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
    return <div className="ds-page"><div role="status" className="ds-card flex h-64 items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="ds-helper">Loading payroll data…</span></div></div>;
  }

  return (
    <div className="ds-page">
      {!embedded && (
        <header className="ds-page-header">
          <div className="min-w-0">
            <h1 className="ds-page-title">Payroll Management</h1>
            <p className="ds-page-subtitle">Staff salaries, payroll runs, and payslips</p>
          </div>
        </header>
      )}

      {/* Tabs */}
      <Tabs id={payrollId} label="Payroll sections" value={activeTab}
        onChange={tab => { if (tab === 'staff' || tab === 'runs') setActiveTab(tab); }}
        items={[
          { id: 'staff', label: <span className="inline-flex items-center gap-2"><Users size={16} aria-hidden="true" />Staff Payroll</span> },
          { id: 'runs', label: <span className="inline-flex items-center gap-2"><PlayCircle size={16} aria-hidden="true" />Payroll Runs</span> },
        ]} />

      {/* ======== STAFF TAB ======== */}
      <div hidden={activeTab !== 'staff'}>
      <TabPanel id={payrollId} value="staff">
      {activeTab === 'staff' && (
        <div className="ds-section">
          <div className="ds-toolbar justify-between">
            <p className="ds-helper">{staffPayrolls.length} staff member(s) configured</p>
            <button onClick={() => { resetStaffForm(); setShowStaffModal(true); }}
              className="ds-button-primary">
              <Plus size={16} aria-hidden="true" /><span>Add Staff</span>
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="ds-card">
              <p className="ds-helper">Total Gross</p>
              <p className="text-2xl font-bold break-words tabular-nums text-blue-600 dark:text-blue-400">{fmt(staffPayrolls.reduce((s, sp) => s + sp.basicSalary + sp.housingAllowance + sp.transportAllowance + sp.otherAllowances, 0))}</p>
            </div>
            <div className="ds-card">
              <p className="ds-helper">Total Deductions</p>
              <p className="text-2xl font-bold break-words tabular-nums text-red-600 dark:text-red-400">{fmt(staffPayrolls.reduce((s, sp) => s + sp.taxDeduction + sp.napsaDeduction + sp.nhimaDeduction + sp.otherDeductions, 0))}</p>
            </div>
            <div className="ds-card">
              <p className="ds-helper">Total Net Pay</p>
              <p className="text-2xl font-bold break-words tabular-nums text-green-600 dark:text-green-400">{fmt(staffPayrolls.reduce((s, sp) => s + sp.netSalary, 0))}</p>
            </div>
          </div>

          {/* Table */}
          <div className="ds-table-container" role="region" aria-label="Staff payroll table" tabIndex={0}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">Staff</th>
                  <th scope="col" className="text-right">Basic</th>
                  <th scope="col" className="text-right">Allowances</th>
                  <th scope="col" className="text-right">PAYE</th>
                  <th scope="col" className="text-right">NAPSA</th>
                  <th scope="col" className="text-right">NHIMA</th>
                  <th scope="col" className="text-right">Net Pay</th>
                  <th scope="col" className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffPayrolls.length === 0 ? (
                  <tr><td colSpan={8}><div className="ds-empty">No staff payroll configured</div></td></tr>
                ) : staffPayrolls.map(sp => (
                  <tr key={sp.id}>
                    <td>
                      <p className="font-medium">{sp.user?.fullName || sp.userId}</p>
                      <p className="ds-helper">{sp.user?.role}</p>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">{fmt(sp.basicSalary)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{fmt(sp.housingAllowance + sp.transportAllowance + sp.otherAllowances)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{fmt(sp.taxDeduction)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{fmt(sp.napsaDeduction)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{fmt(sp.nhimaDeduction)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums font-bold text-green-600 dark:text-green-400">{fmt(sp.netSalary)}</td>
                    <td className="text-center">
                      <button aria-label={`Edit payroll for ${sp.user?.fullName || sp.userId}`} onClick={() => {
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
                      }} className="ds-button-ghost">Edit</button>
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

      {/* ======== PAYROLL RUNS TAB ======== */}
      <div hidden={activeTab !== 'runs'}>
      <TabPanel id={payrollId} value="runs">
      {activeTab === 'runs' && (
        <div className="ds-section">
          <div className="ds-actions justify-end">
            <button onClick={() => setShowRunModal(true)}
              className="ds-button-primary">
              <PlayCircle size={16} aria-hidden="true" /><span>Create Payroll Run</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {payrollRuns.length === 0 ? (
              <div className="ds-surface ds-empty col-span-full">No payroll runs yet</div>
            ) : payrollRuns.map(run => (
              <div key={run.id} className="ds-card space-y-4">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div className="min-w-0 break-words">
                    <h3>{run.runNumber}</h3>
                    <p className="ds-helper">{monthNames[run.month - 1]} {run.year}</p>
                    {run.description && <p className="ds-helper">{run.description}</p>}
                  </div>
                  <span className={`ds-badge ${statusColors[run.status] || 'ds-badge-neutral'}`}>{run.status}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="ds-helper">Gross</p>
                    <p className="font-medium break-words tabular-nums text-blue-600 dark:text-blue-400">{fmt(run.totalGross)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="ds-helper">Deductions</p>
                    <p className="font-medium break-words tabular-nums text-red-600 dark:text-red-400">{fmt(run.totalDeductions)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="ds-helper">Net</p>
                    <p className="font-medium break-words tabular-nums text-green-600 dark:text-green-400">{fmt(run.totalNet)}</p>
                  </div>
                </div>

                <p className="ds-helper">{run._count?.payslips || 0} payslip(s)</p>

                <div className="ds-actions pt-4 border-t border-[var(--border-color)]">
                  <button aria-label={`View payroll run ${run.runNumber}`} onClick={() => handleViewRun(run.id)} className="ds-button-ghost">
                    <Eye size={16} aria-hidden="true" /><span>View</span>
                  </button>
                  {run.status === 'DRAFT' && (
                    <button aria-label={`Approve payroll run ${run.runNumber}`} onClick={() => handleApproveRun(run.id)} className="ds-button-secondary">
                      <CheckCircle size={16} aria-hidden="true" /><span>Approve</span>
                    </button>
                  )}
                  {run.status === 'APPROVED' && (
                    <button aria-label={`Pay payroll run ${run.runNumber}`} onClick={() => handleMarkRunPaid(run.id)} className="ds-button-primary">
                      <DollarSign size={16} aria-hidden="true" /><span>Pay</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </TabPanel>
      </div>

      {/* ======== STAFF MODAL ======== */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-xl" role="dialog" aria-modal="true" aria-labelledby={`${payrollId}-staff-title`}>
            <div className="ds-modal-header">
              <h2 id={`${payrollId}-staff-title`}>{editingStaff ? 'Edit Staff Payroll' : 'Add Staff Payroll'}</h2>
              <button aria-label="Close staff payroll dialog" onClick={() => { setShowStaffModal(false); resetStaffForm(); }} className="ds-button-ghost shrink-0"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              {!editingStaff && (
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-user-id`} className="ds-label">User ID</label>
                  <input id={`${payrollId}-user-id`} type="text" value={staffForm.userId} onChange={e => setStaffForm({ ...staffForm, userId: e.target.value })}
                    className="ds-input" placeholder="User ID of the staff member" />
                </div>
              )}

              <div className="ds-field">
                <label htmlFor={`${payrollId}-basic-salary`} className="ds-label">Basic Salary (ZMW)</label>
                <input id={`${payrollId}-basic-salary`} type="number" step="0.01" value={staffForm.basicSalary} onChange={e => setStaffForm({ ...staffForm, basicSalary: e.target.value })}
                  className="ds-input" placeholder="0.00" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-housing`} className="ds-label">Housing</label>
                  <input id={`${payrollId}-housing`} type="number" step="0.01" value={staffForm.housingAllowance} onChange={e => setStaffForm({ ...staffForm, housingAllowance: e.target.value })}
                    className="ds-input" />
                </div>
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-transport`} className="ds-label">Transport</label>
                  <input id={`${payrollId}-transport`} type="number" step="0.01" value={staffForm.transportAllowance} onChange={e => setStaffForm({ ...staffForm, transportAllowance: e.target.value })}
                    className="ds-input" />
                </div>
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-other-allowances`} className="ds-label">Other Allow.</label>
                  <input id={`${payrollId}-other-allowances`} type="number" step="0.01" value={staffForm.otherAllowances} onChange={e => setStaffForm({ ...staffForm, otherAllowances: e.target.value })}
                    className="ds-input" />
                </div>
              </div>

              <div className="ds-field">
                <label htmlFor={`${payrollId}-other-deductions`} className="ds-label">Other Deductions (ZMW)</label>
                <input id={`${payrollId}-other-deductions`} type="number" step="0.01" value={staffForm.otherDeductions} onChange={e => setStaffForm({ ...staffForm, otherDeductions: e.target.value })}
                  className="ds-input" />
              </div>

              <div className="ds-surface-muted p-4">
                <p className="text-sm font-semibold mb-1">
                  <Calculator size={16} className="inline mr-1" aria-hidden="true" /> Auto-Calculated Deductions
                </p>
                <p className="ds-helper">PAYE, NAPSA (5%), and NHIMA (1%) are automatically calculated based on Zambian tax law when saved.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-bank-name`} className="ds-label">Bank Name</label>
                  <input id={`${payrollId}-bank-name`} type="text" value={staffForm.bankName} onChange={e => setStaffForm({ ...staffForm, bankName: e.target.value })}
                    className="ds-input" />
                </div>
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-bank-account`} className="ds-label">Account #</label>
                  <input id={`${payrollId}-bank-account`} type="text" value={staffForm.bankAccount} onChange={e => setStaffForm({ ...staffForm, bankAccount: e.target.value })}
                    className="ds-input" />
                </div>
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-bank-branch`} className="ds-label">Branch</label>
                  <input id={`${payrollId}-bank-branch`} type="text" value={staffForm.bankBranch} onChange={e => setStaffForm({ ...staffForm, bankBranch: e.target.value })}
                    className="ds-input" />
                </div>
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => { setShowStaffModal(false); resetStaffForm(); }}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleSaveStaff}
                className="ds-button-primary">
                {editingStaff ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======== RUN MODAL ======== */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby={`${payrollId}-run-title`}>
            <div className="ds-modal-header">
              <h2 id={`${payrollId}-run-title`}>Create Payroll Run</h2>
              <button aria-label="Close create payroll run dialog" onClick={() => setShowRunModal(false)} className="ds-button-ghost shrink-0"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-month`} className="ds-label">Month</label>
                  <select id={`${payrollId}-month`} value={runForm.month} onChange={e => setRunForm({ ...runForm, month: parseInt(e.target.value) })}
                    className="ds-select">
                    {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="ds-field">
                  <label htmlFor={`${payrollId}-year`} className="ds-label">Year</label>
                  <input id={`${payrollId}-year`} type="number" value={runForm.year} onChange={e => setRunForm({ ...runForm, year: parseInt(e.target.value) })}
                    className="ds-input" />
                </div>
              </div>
              <div className="ds-field">
                <label htmlFor={`${payrollId}-description`} className="ds-label">Description</label>
                <input id={`${payrollId}-description`} type="text" value={runForm.description} onChange={e => setRunForm({ ...runForm, description: e.target.value })}
                  className="ds-input" placeholder="e.g., January 2025 Payroll" />
              </div>
              <Alert tone="warning">
                This will generate payslips for all {staffPayrolls.filter(s => s.isActive).length} active staff members.
              </Alert>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowRunModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleCreateRun}
                className="ds-button-primary">Create Run</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== RUN DETAIL MODAL ======== */}
      {showRunDetailModal && selectedRun && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-4xl" role="dialog" aria-modal="true" aria-labelledby={`${payrollId}-run-detail-title`} aria-describedby={`${payrollId}-run-detail-period`}>
            <div className="ds-modal-header">
              <div className="min-w-0 break-words">
                <h2 id={`${payrollId}-run-detail-title`}>Payroll Run: {selectedRun.runNumber}</h2>
                <p id={`${payrollId}-run-detail-period`} className="ds-helper">{monthNames[selectedRun.month - 1]} {selectedRun.year}</p>
              </div>
              <button aria-label="Close payroll run details" onClick={() => setShowRunDetailModal(false)} className="ds-button-ghost shrink-0"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="ds-card">
                  <p className="ds-helper">Status</p>
                  <span className={`ds-badge ${statusColors[selectedRun.status] || 'ds-badge-neutral'}`}>{selectedRun.status}</span>
                </div>
                <div className="ds-card">
                  <p className="ds-helper">Total Gross</p>
                  <p className="font-bold break-words tabular-nums text-blue-600 dark:text-blue-400">{fmt(selectedRun.totalGross)}</p>
                </div>
                <div className="ds-card">
                  <p className="ds-helper">Total Deductions</p>
                  <p className="font-bold break-words tabular-nums text-red-600 dark:text-red-400">{fmt(selectedRun.totalDeductions)}</p>
                </div>
                <div className="ds-card">
                  <p className="ds-helper">Total Net</p>
                  <p className="font-bold break-words tabular-nums text-green-600 dark:text-green-400">{fmt(selectedRun.totalNet)}</p>
                </div>
              </div>

              <div className="ds-table-container" role="region" aria-label={`Payslips for payroll run ${selectedRun.runNumber}`} tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th scope="col">Staff</th>
                    <th scope="col" className="text-right">Gross</th>
                    <th scope="col" className="text-right">PAYE</th>
                    <th scope="col" className="text-right">NAPSA</th>
                    <th scope="col" className="text-right">NHIMA</th>
                    <th scope="col" className="text-right">Net</th>
                    <th scope="col" className="text-center">Paid</th>
                    <th scope="col" className="text-center">View</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedRun.payslips || []).map(ps => (
                    <tr key={ps.id}>
                      <td>{ps.user?.fullName || ps.userId}</td>
                      <td className="text-right whitespace-nowrap tabular-nums text-blue-600 dark:text-blue-400">{fmt(ps.grossSalary)}</td>
                      <td className="text-right whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{fmt(ps.payeTax)}</td>
                      <td className="text-right whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{fmt(ps.napsaContribution)}</td>
                      <td className="text-right whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{fmt(ps.nhimaContribution)}</td>
                      <td className="text-right whitespace-nowrap tabular-nums font-bold text-green-600 dark:text-green-400">{fmt(ps.netSalary)}</td>
                      <td className="text-center">{ps.isPaid ? <span className="ds-badge ds-badge-success"><CheckCircle size={16} aria-hidden="true" />Paid</span> : <span className="ds-badge ds-badge-neutral">Unpaid</span>}</td>
                      <td className="text-center">
                        <button aria-label={`View payslip for ${ps.user?.fullName || ps.userId}`} onClick={() => handleViewPayslip(ps.id)} className="ds-button-ghost">Payslip</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======== PAYSLIP MODAL ======== */}
      {showPayslipModal && selectedPayslip && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-md" role="dialog" aria-modal="true" aria-label={`Payslip ${selectedPayslip.payslipNumber}`}>
            <div className="ds-modal-header border-b border-[var(--border-color)]">
              <h2 className="text-lg font-semibold dark:text-white">Payslip {selectedPayslip.payslipNumber}</h2>
              <button aria-label="Close payslip dialog" onClick={() => setShowPayslipModal(false)} className="ds-button-ghost shrink-0"><X size={20} aria-hidden="true" /></button>
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
