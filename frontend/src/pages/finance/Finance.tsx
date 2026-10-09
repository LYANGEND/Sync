import React, { useState, useEffect, useRef } from 'react';
import FinanceReports from './FinanceReports';

import { Plus, Search, Filter, DollarSign, CreditCard, Calendar, BookOpen, Users, Edit2, Trash2, Upload, X, Bell, Send, FileText, TrendingUp, Smartphone, Receipt, Calculator, Wallet, PiggyBank, BarChart3, ClipboardList, Sparkles, Target, ShieldCheck, AlertTriangle, ArrowRight, Ban, CheckCircle2, Download, Landmark, StickyNote } from 'lucide-react';
import { pickActiveTerm } from '../../hooks/useActiveTerm';
import api from '../../utils/api';
import Scholarships from './Scholarships';
import BulkImportModal from '../../components/BulkImportModal';
import ExportDropdown from '../../components/ExportDropdown';
import { fmt, fmtWhole, formatMethod, formatPaymentDate, plural, ProgressBar } from './financeFormat';
import StudentSelector from '../../components/StudentSelector';
import MobileMoneyPayment from '../../components/MobileMoneyPayment';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// Accounting modules (rendered as embedded tabs)
import Expenses from '../accounting/Expenses';
import Invoices from '../accounting/Invoices';
import Payroll from '../accounting/Payroll';
import Budgets from '../accounting/Budgets';
import PettyCash from '../accounting/PettyCash';
import FinancialStatements from '../accounting/FinancialStatements';
import AIFinancialAdvisor from '../accounting/AIFinancialAdvisor';
import DebtCollection from '../accounting/DebtCollection';
import BankReconciliation from '../accounting/BankReconciliation';
import { financialApi, paymentControlApi, ReconciliationSummary } from '../../services/accountingService';

const createPaymentIdempotencyKey = () => (
  globalThis.crypto?.randomUUID?.() || `manual-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

interface Payment {
  id: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  method: 'CASH' | 'MOBILE_MONEY' | 'BANK_DEPOSIT';
  transactionId?: string;
  notes?: string;
  status?: 'COMPLETED' | 'VOIDED' | 'PENDING';
  voidedAt?: string;
  voidReason?: string;
  isReconciled?: boolean;
  reconciledAt?: string;
  reconciledByName?: string;
  settlementDate?: string;
  bankReference?: string;
  allocatedAmount?: number;
  unallocatedAmount?: number;
  allocationCount?: number;
  allocationLabels?: string[];
  voidedBy?: {
    fullName: string;
  };
  student: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    class?: {
      id: string;
      name: string;
    };
  };
  recordedBy: {
    fullName: string;
  };
}

interface FeeTemplate {
  id: string;
  name: string;
  amount: number;
  academicTermId: string;
  categoryId?: string | null;
  applicableGrade: number;
  academicTerm: {
    name: string;
  };
  category?: {
    id: string;
    name: string;
    code?: string;
  } | null;
}

interface FeeCategory {
  id: string;
  name: string;
  code: string;
  description?: string | null;
}

interface AcademicTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
  isActive?: boolean;
}

interface Class {
  id: string;
  name: string;
}

const getGradeLabel = (grade: number) => {
  if (grade === 0) return 'Nursery';
  return `Grade ${grade}`;
};

// Each received payment moves through: applied to fees -> bank reference (deposits) -> matched to bank statement.
type PaymentStage = 'UNALLOCATED' | 'MISSING_REF' | 'UNRECONCILED' | 'COMPLETE';

const getPaymentStage = (payment: Payment): PaymentStage => {
  if ((payment.unallocatedAmount || 0) > 0.009) return 'UNALLOCATED';
  if (payment.method === 'BANK_DEPOSIT' && !payment.bankReference) return 'MISSING_REF';
  if (!payment.isReconciled) return 'UNRECONCILED';
  return 'COMPLETE';
};

const PAYMENT_STAGES: Record<PaymentStage, { label: string; chip: string }> = {
  UNALLOCATED: { label: 'Not applied to fees', chip: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:ring-orange-800' },
  MISSING_REF: { label: 'Bank ref missing', chip: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800' },
  UNRECONCILED: { label: 'Awaiting bank match', chip: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800' },
  COMPLETE: { label: 'Complete', chip: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-800' },
};

const getPaymentStageHint = (payment: Payment, stage: PaymentStage) => {
  if (stage === 'UNALLOCATED') return `${fmt(payment.unallocatedAmount || 0)} not linked to a fee`;
  if (stage === 'MISSING_REF') return 'Add the deposit slip reference';
  if (stage === 'UNRECONCILED') return 'Match on the bank statement';
  return payment.allocationLabels?.length ? payment.allocationLabels.join(', ') : 'Applied and matched';
};

const METHOD_CHIPS: Record<Payment['method'], string> = {
  CASH: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-gray-200',
  MOBILE_MONEY: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  BANK_DEPOSIT: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const Finance = () => {
  const { confirm, prompt, notify } = useAppDialog();
  const [activeTab, setActiveTab] = useState<'payments' | 'mobile-money' | 'fees' | 'scholarships' | 'reminders' | 'reports' | 'expenses' | 'invoices' | 'payroll' | 'budgets' | 'petty-cash' | 'bank-reconciliation' | 'financial-reports' | 'ai-advisor' | 'debt-collection'>('payments');

  // Determine which section is active for visual grouping
  const revenueTabKeys = ['payments', 'mobile-money', 'fees', 'scholarships', 'reports', 'reminders'];
  const [activeSection, setActiveSection] = useState<'revenue' | 'accounting'>('revenue');

  // Sync section with tab
  useEffect(() => {
    if (revenueTabKeys.includes(activeTab)) setActiveSection('revenue');
    else setActiveSection('accounting');
  }, [activeTab]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [selectedAcademicTermId, setSelectedAcademicTermId] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<{ id: string; firstName: string; lastName: string; admissionNumber: string; guardianPhone?: string; class?: { id: string; name: string } }[]>([]);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateFeeModal, setShowCreateFeeModal] = useState(false);
  const [showFeeCategoryModal, setShowFeeCategoryModal] = useState(false);
  const [showAssignFeeModal, setShowAssignFeeModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTransactions: 0,
    totalBilled: 0,
    pendingFees: 0,
    overdueCount: 0,
    creditBalance: 0,
    creditCount: 0
  });
  const [paymentControlSummary, setPaymentControlSummary] = useState<ReconciliationSummary>({
    totalPayments: 0,
    totalAmount: 0,
    reconciledPayments: 0,
    reconciledAmount: 0,
    unreconciledPayments: 0,
    unreconciledAmount: 0,
    unallocatedPayments: 0,
    unallocatedAmount: 0,
    missingBankReference: 0,
  });
  const [paymentControlLoading, setPaymentControlLoading] = useState(false);

  // Form states
  const [newFee, setNewFee] = useState({ name: '', amount: '', academicTermId: '', categoryId: '', applicableGrade: '' });
  const [editingTemplate, setEditingTemplate] = useState<FeeTemplate | null>(null);
  const [feeCategories, setFeeCategories] = useState<FeeCategory[]>([]);
  const [feeCategoryForm, setFeeCategoryForm] = useState({ name: '', code: '', description: '' });
  const [assignClassId, setAssignClassId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    academicTermId: '',
    amount: '',
    method: 'CASH',
    notes: '',
    idempotencyKey: createPaymentIdempotencyKey(),
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'completed' | 'voided'>('completed');
  const [stageFilter, setStageFilter] = useState<PaymentStage | 'ALL'>('ALL');
  const paymentsTableRef = useRef<HTMLElement>(null);
  const [resendingReceiptId, setResendingReceiptId] = useState<string | null>(null);
  const [creatingFeeCategory, setCreatingFeeCategory] = useState(false);

  // Fee Reminders state
  const [debtors, setDebtors] = useState<any[]>([]);
  const [loadingDebtors, setLoadingDebtors] = useState(false);
  const [selectedDebtors, setSelectedDebtors] = useState<string[]>([]);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    fetchFeeTemplates();
    fetchFeeCategories();
    fetchAcademicTerms();
  }, []);

  useEffect(() => {
    if (!selectedAcademicTermId) return;
    setLoading(true);
    fetchPayments();
    fetchStats();
    fetchPaymentControlSummary();
    fetchClasses(selectedAcademicTermId);
    fetchStudents(selectedAcademicTermId);
  }, [selectedAcademicTermId]);

  const fetchPaymentControlSummary = async () => {
    setPaymentControlLoading(true);
    try {
      const response = await paymentControlApi.getReconciliationDashboard({ academicTermId: selectedAcademicTermId });
      setPaymentControlSummary(response.data.summary);
    } catch (error) {
      console.error('Error fetching payment control summary:', error);
    } finally {
      setPaymentControlLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/payments/stats', { params: { academicTermId: selectedAcademicTermId } });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching finance stats:', error);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await api.get('/payments', { params: { academicTermId: selectedAcademicTermId } });
      // Handle paginated response structure
      if (response.data.data && Array.isArray(response.data.data)) {
        setPayments(response.data.data);
      } else if (Array.isArray(response.data)) {
        setPayments(response.data);
      } else {
        setPayments([]);
      }
      fetchPaymentControlSummary();
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (academicTermId = selectedAcademicTermId) => {
    if (!academicTermId) return;
    try {
      const response = await api.get('/students', { params: { academicTermId } });
      // Ensure students have class info and guardianPhone for the StudentSelector and MobileMoneyPayment
      const studentsWithClass = response.data.map((s: any) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNumber: s.admissionNumber,
        guardianPhone: s.guardianPhone || '',
        class: s.class || undefined
      }));
      setStudents(studentsWithClass);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchFeeTemplates = async () => {
    try {
      const response = await api.get('/fees/templates');
      setFeeTemplates(response.data);
    } catch (error) {
      console.error('Error fetching fee templates:', error);
    }
  };

  const fetchFeeCategories = async () => {
    try {
      const response = await financialApi.getFeeCategories();
      setFeeCategories(response.data || []);
    } catch (error) {
      console.error('Error fetching fee categories:', error);
    }
  };

  const fetchAcademicTerms = async () => {
    try {
      const response = await api.get('/academic-terms');
      const terms: AcademicTerm[] = Array.isArray(response.data) ? response.data : [];
      const defaultTerm = pickActiveTerm(terms) || terms[0];
      setAcademicTerms(terms);
      if (defaultTerm) {
        setSelectedAcademicTermId(defaultTerm.id);
        setPaymentForm(current => ({ ...current, academicTermId: current.academicTermId || defaultTerm.id }));
      }
    } catch (error) {
      console.error('Error fetching academic terms:', error);
    }
  };

  const fetchClasses = async (academicTermId = selectedAcademicTermId) => {
    if (!academicTermId) return;
    try {
      const response = await api.get('/classes', { params: { academicTermId } });
      setClasses(response.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const handleSaveFee = async () => {
    if (!newFee.name || !newFee.amount || !newFee.academicTermId || !newFee.categoryId || !newFee.applicableGrade) {
      alert('Please complete all fee template fields, including fee category.');
      return;
    }

    try {
      if (editingTemplate) {
        await api.put(`/fees/templates/${editingTemplate.id}`, {
          ...newFee,
          amount: Number(newFee.amount),
          applicableGrade: Number(newFee.applicableGrade),
        });
      } else {
        await api.post('/fees/templates', {
          ...newFee,
          amount: Number(newFee.amount),
          applicableGrade: Number(newFee.applicableGrade),
        });
      }
      setShowCreateFeeModal(false);
      setEditingTemplate(null);
      setNewFee({ name: '', amount: '', academicTermId: '', categoryId: '', applicableGrade: '' });
      fetchFeeTemplates();
    } catch (error: any) {
      console.error('Error saving fee template:', error);
      alert(error.response?.data?.error || 'Failed to save fee template');
    }
  };

  const handleCreateFeeCategory = async () => {
    if (!feeCategoryForm.name.trim() || !feeCategoryForm.code.trim()) {
      notify('Category name and code are required', 'warning');
      return;
    }

    setCreatingFeeCategory(true);
    try {
      const response = await financialApi.createFeeCategory({
        name: feeCategoryForm.name.trim(),
        code: feeCategoryForm.code.trim().toUpperCase(),
        description: feeCategoryForm.description.trim() || undefined,
      });

      const createdCategory = response.data;
      setFeeCategoryForm({ name: '', code: '', description: '' });
      await fetchFeeCategories();
      setNewFee((current) => ({
        ...current,
        categoryId: current.categoryId || createdCategory.id,
      }));
      notify('Fee category created', 'success');
    } catch (error: any) {
      console.error('Error creating fee category:', error);
      notify(error.response?.data?.error || 'Failed to create fee category', 'error');
    } finally {
      setCreatingFeeCategory(false);
    }
  };

  const handleEditClick = (template: FeeTemplate) => {
    setEditingTemplate(template);
    setNewFee({
      name: template.name,
      amount: template.amount.toString(),
      academicTermId: template.academicTermId,
      categoryId: template.categoryId || '',
      applicableGrade: template.applicableGrade.toString(),
    });
    setShowCreateFeeModal(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!(await confirm({
      title: 'Delete fee template?',
      message: 'Are you sure you want to delete this fee template?',
      confirmText: 'Delete template',
    }))) return;
    try {
      await api.delete(`/fees/templates/${id}`);
      fetchFeeTemplates();
    } catch (error: any) {
      console.error('Error deleting fee template:', error);
      alert(error.response?.data?.error || 'Failed to delete fee template');
    }
  };

  const handleAssignFee = async () => {
    if (!selectedTemplateId || !assignClassId) return;
    try {
      const response = await api.post('/fees/assign-class', {
        feeTemplateId: selectedTemplateId,
        classId: assignClassId,
        dueDate: assignDueDate || undefined,
      });

      setShowAssignFeeModal(false);
      setAssignClassId('');
      setAssignDueDate('');
      setSelectedTemplateId(null);

      // Show detailed success message
      const data = response.data;
      let message = `Successfully assigned fee to ${data.assigned} student(s)`;
      if (data.alreadyAssigned > 0) {
        message += `\n${data.alreadyAssigned} student(s) already had this fee assigned`;
      }
      if (data.failed > 0) {
        message += `\n${data.failed} assignment(s) failed`;
      }
      alert(message);
    } catch (error: any) {
      console.error('Error assigning fee:', error);
      const errorMsg = error.response?.data?.error || 'Failed to assign fee';
      alert(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevent double submission

    setSubmitting(true);
    try {
      await api.post('/payments', {
        ...paymentForm,
        amount: Number(paymentForm.amount),
      }, {
        headers: { 'Idempotency-Key': paymentForm.idempotencyKey },
      });

      setShowAddModal(false);
      setPaymentForm({
        studentId: '',
        academicTermId: selectedAcademicTermId,
        amount: '',
        method: 'CASH',
        notes: '',
        idempotencyKey: createPaymentIdempotencyKey(),
      });
      fetchPayments();
    } catch (error: any) {
      console.error('Error recording payment:', error);
      alert(error.response?.data?.error || error.response?.data?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  // Void a payment
  const handleVoidPayment = async (paymentId: string) => {
    const reason = await prompt({
      title: 'Void payment',
      message: 'Please provide a reason for voiding this payment.',
      placeholder: 'Enter reason for voiding',
      confirmText: 'Void payment',
    });
    if (reason === null) return;
    if (reason.trim().length < 5) {
      notify('Please provide a reason with at least 5 characters', 'warning');
      return;
    }

    try {
      await api.post(`/payments/${paymentId}/void`, { reason: reason.trim() });
      notify('Payment voided', 'success');
      fetchPayments();
      fetchPaymentControlSummary();
    } catch (error: any) {
      console.error('Error voiding payment:', error);
      notify(error.response?.data?.message || 'Failed to void payment', 'error');
    }
  };

  const handleResendReceipt = async (paymentId: string) => {
    setResendingReceiptId(paymentId);
    try {
      const response = await api.post(`/fee-reminders/receipt/${paymentId}`);
      const { emailSent, smsSent, message } = response.data || {};
      const deliveryChannels = [emailSent ? 'email' : null, smsSent ? 'SMS' : null].filter(Boolean);
      notify(
        deliveryChannels.length > 0
          ? `${message || 'Receipt sent'} via ${deliveryChannels.join(' and ')}`
          : (message || 'Receipt request completed'),
        deliveryChannels.length > 0 ? 'success' : 'info'
      );
    } catch (error: any) {
      console.error('Error resending payment receipt:', error);
      notify(error.response?.data?.error || 'Failed to resend receipt', 'error');
    } finally {
      setResendingReceiptId(null);
    }
  };

  const handleAutoAllocatePayments = async () => {
    try {
      const response = await paymentControlApi.autoAllocatePayments();
      notify(response.data.message || 'Payment allocation complete', response.data.allocated > 0 ? 'success' : 'info');
      fetchPayments();
      fetchPaymentControlSummary();
    } catch (error: any) {
      notify(error.response?.data?.error || 'Failed to auto-allocate payments', 'error');
    }
  };

  const listedPayments = payments.filter(payment => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query ||
      `${payment.student.firstName} ${payment.student.lastName}`.toLowerCase().includes(query) ||
      payment.student.admissionNumber.toLowerCase().includes(query) ||
      Boolean(payment.transactionId?.toLowerCase().includes(query)) ||
      Boolean(payment.bankReference?.toLowerCase().includes(query));

    const matchesMethod = methodFilter === 'ALL' || payment.method === methodFilter;
    const matchesClass = classFilter === 'ALL' || payment.student.class?.id === classFilter;

    const paymentDate = new Date(payment.paymentDate);
    const matchesDate =
      (!dateRange.start || paymentDate >= new Date(dateRange.start)) &&
      (!dateRange.end || paymentDate <= new Date(dateRange.end));

    // Tab Logic
    const matchesTab = paymentTab === 'completed'
      ? payment.status === 'COMPLETED'
      : payment.status === 'VOIDED';

    return matchesSearch && matchesMethod && matchesClass && matchesDate && matchesTab;
  });

  const stageCounts = listedPayments.reduce<Record<PaymentStage, number>>((counts, payment) => {
    counts[getPaymentStage(payment)] += 1;
    return counts;
  }, { UNALLOCATED: 0, MISSING_REF: 0, UNRECONCILED: 0, COMPLETE: 0 });

  const filteredPayments = paymentTab === 'completed' && stageFilter !== 'ALL'
    ? listedPayments.filter(payment => getPaymentStage(payment) === stageFilter)
    : listedPayments;
  const filteredTotal = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const receivedCount = payments.filter(payment => payment.status === 'COMPLETED').length;
  const voidedCount = payments.filter(payment => payment.status === 'VOIDED').length;
  const advancedFilterCount = [classFilter !== 'ALL', methodFilter !== 'ALL', Boolean(dateRange.start || dateRange.end)].filter(Boolean).length;
  const hasPaymentFilters = Boolean(searchTerm.trim()) || advancedFilterCount > 0 || stageFilter !== 'ALL';

  const clearPaymentFilters = () => {
    setSearchTerm('');
    setMethodFilter('ALL');
    setClassFilter('ALL');
    setDateRange({ start: '', end: '' });
    setStageFilter('ALL');
  };

  const showPaymentsAtStage = (stage: PaymentStage) => {
    setPaymentTab('completed');
    setStageFilter(stage);
    paymentsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const billedThisTerm = stats.totalBilled;
  const settledRate = billedThisTerm > 0 ? Math.round(((billedThisTerm - stats.pendingFees) / billedThisTerm) * 100) : 0;
  const reconciledRate = paymentControlSummary.totalPayments > 0
    ? Math.round((paymentControlSummary.reconciledPayments / paymentControlSummary.totalPayments) * 100)
    : 0;

  // Fetch students with outstanding fees
  const fetchDebtors = async () => {
    if (!selectedAcademicTermId) return;
    setLoadingDebtors(true);
    try {
      const response = await api.get('/fee-reminders/outstanding', {
        params: { academicTermId: selectedAcademicTermId },
      });
      setDebtors(response.data);
    } catch (error) {
      console.error('Error fetching debtors:', error);
    } finally {
      setLoadingDebtors(false);
    }
  };

  // Send fee reminders
  const formatReminderResult = (data: any) => {
    const results = data.results || {};
    const lines = [
      data.message || 'Reminder request completed.',
      '',
      `Students targeted: ${results.total ?? 0}`,
      `Students delivered: ${results.delivered ?? 0}`,
      `Emails sent: ${results.emailsSent ?? 0}`,
      `SMS sent: ${results.smsSent ?? 0}`,
      `Failed: ${results.failed ?? 0}`,
    ];

    if (results.noContact) {
      lines.push(`No guardian contact: ${results.noContact}`);
    }

    return lines.join('\n');
  };

  const sendFeeReminders = async (studentIds?: string[], isOverdue = false) => {
    if (!selectedAcademicTermId) {
      alert('Select an academic term first.');
      return;
    }
    const targetIds = studentIds || selectedDebtors;
    if (targetIds.length === 0) {
      alert('Select at least one student to remind.');
      return;
    }

    setSendingReminders(true);
    try {
      const response = await api.post('/fee-reminders/send', {
        studentIds: targetIds,
        isOverdue,
        academicTermId: selectedAcademicTermId,
      });
      const message = formatReminderResult(response.data);
      alert(message);
      setSelectedDebtors([]);
    } catch (error: any) {
      console.error('Error sending reminders:', error);
      const data = error.response?.data;
      const message = data?.results
        ? formatReminderResult(data)
        : data?.error || data?.message || 'Failed to send reminders';
      alert(message);
    } finally {
      setSendingReminders(false);
    }
  };

  // Generate payment receipt PDF
  const generatePaymentReceipt = async (payment: Payment) => {
    try {
      const settingsRes = await api.get('/settings');
      const schoolName = settingsRes.data.schoolName || 'School';
      const schoolAddress = settingsRes.data.schoolAddress || '';
      const schoolPhone = settingsRes.data.schoolPhone || '';
      const schoolEmail = settingsRes.data.schoolEmail || '';

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // --- QR Code Generation ---
      const qrData = JSON.stringify({
        id: payment.id,
        student: `${payment.student.firstName} ${payment.student.lastName}`,
        amount: payment.amount,
        date: payment.paymentDate,
        school: schoolName,
        verified: true
      });

      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 120,
        margin: 0,
        color: { dark: '#1e293b', light: '#ffffff' }
      });

      // --- Color Palette ---
      const primaryColor: [number, number, number] = [30, 58, 138]; // Deep Navy Blue
      const accentColor: [number, number, number] = [241, 245, 249]; // Slate-100 (Backgrounds)
      const textColor: [number, number, number] = [30, 41, 59]; // Slate-800
      const mutedColor: [number, number, number] = [100, 116, 139]; // Slate-500

      // --- Header ---
      // Top Strip
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 5, 'F');

      // School Info (Left - Full Width Safe)
      doc.setTextColor(...primaryColor);
      doc.setFontSize(18);
      doc.setFont('times', 'bold');
      doc.text(schoolName.toUpperCase(), 14, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...mutedColor);

      let yPos = 26;
      if (schoolAddress) {
        doc.text(schoolAddress, 14, yPos);
        yPos += 5;
      }
      if (schoolPhone || schoolEmail) {
        doc.text([schoolPhone, schoolEmail].filter(Boolean).join(' | '), 14, yPos);
      }

      // Horizontal Line Divider
      const headerBottom = 40;
      doc.setDrawColor(226, 232, 240);
      doc.line(14, headerBottom, pageWidth - 14, headerBottom);

      // --- Receipt Meta Section (Below Header) ---
      const metaY = headerBottom + 15;

      // Left: Receipt Title & Number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...mutedColor);
      doc.text('OFFICIAL RECEIPT', 14, metaY);

      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(`#${payment.id.substring(0, 8).toUpperCase()}`, 14, metaY + 8);

      // Right: Date & Badge
      doc.setFontSize(10);
      doc.setTextColor(...mutedColor);
      doc.text('Date Issued:', pageWidth - 50, metaY, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...textColor);
      doc.text(new Date(payment.paymentDate).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }), pageWidth - 14, metaY, { align: 'right' });

      // Verified Badge
      doc.setFillColor(220, 252, 231); // Green-100
      doc.setTextColor(22, 163, 74);   // Green-600
      doc.roundedRect(pageWidth - 44, metaY + 3, 30, 8, 4, 4, 'F');
      doc.setFontSize(7);
      doc.text('VERIFIED', pageWidth - 29, metaY + 8, { align: 'center' });

      // --- Information Section (Grid Layout) ---
      const startY = 80; // Pushed down
      const colWidth = (pageWidth - 34) / 2;

      // Student Section
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text('STUDENT INFORMATION', 14, startY);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...mutedColor);
      doc.text('Name:', 14, startY + 10);
      doc.text('Admission No:', 14, startY + 17);
      doc.text('Class:', 14, startY + 24);

      doc.setTextColor(...textColor);
      doc.setFont('helvetica', 'bold');
      doc.text(`${payment.student.firstName} ${payment.student.lastName}`, 50, startY + 10);
      doc.text(payment.student.admissionNumber, 50, startY + 17);
      doc.text(payment.student.class?.name || 'N/A', 50, startY + 24);

      // Payment Details Section
      const col2X = 14 + colWidth + 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text('PAYMENT DETAILS', col2X, startY);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...mutedColor);
      doc.text('Payment Method:', col2X, startY + 10);
      doc.text('Reference No:', col2X, startY + 17);
      doc.text('Received By:', col2X, startY + 24);

      doc.setTextColor(...textColor);
      doc.setFont('helvetica', 'bold');
      doc.text(payment.method.replace('_', ' '), col2X + 40, startY + 10);
      doc.text(payment.transactionId || 'N/A', col2X + 40, startY + 17);
      doc.text(payment.recordedBy.fullName, col2X + 40, startY + 24);

      // --- Table Section ---
      autoTable(doc, {
        startY: startY + 40,
        head: [['DESCRIPTION', 'AMOUNT (ZMW)']],
        body: [
          ['School Fees Payment', Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })]
        ],
        theme: 'plain', // Minimalist theme
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left',
          cellPadding: 10,
          lineWidth: { bottom: 0.5 },
          lineColor: [226, 232, 240]
        },
        bodyStyles: {
          fontSize: 11,
          textColor: [15, 23, 42],
          cellPadding: 12,
          valign: 'middle',
          lineWidth: { bottom: 0.5 },
          lineColor: [241, 245, 249]
        },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      });

      // --- Total & Verification Footer ---
      const finalY = (doc as any).lastAutoTable.finalY + 10;

      // Total Box (Right Aligned, Elegant)
      doc.setFillColor(...accentColor);
      doc.roundedRect(pageWidth - 70, finalY, 56, 20, 1, 1, 'F');

      doc.setFontSize(9);
      doc.setTextColor(...mutedColor);
      doc.text('Total Amount', pageWidth - 65, finalY + 7);

      doc.setFontSize(14);
      doc.setTextColor(...primaryColor);
      doc.setFont('helvetica', 'bold');
      doc.text(`ZMW ${Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 65, finalY + 15);

      // Verification Logic (Bottom)
      const footerY = pageHeight - 50;

      // Separator
      doc.setDrawColor(226, 232, 240);
      doc.line(14, footerY - 5, pageWidth - 14, footerY - 5);

      // QR Code
      doc.addImage(qrCodeDataUrl, 'PNG', 14, footerY + 5, 25, 25);

      // Verification Text
      doc.setFontSize(10);
      doc.setTextColor(...primaryColor);
      doc.setFont('helvetica', 'bold');
      doc.text('VERIFIED DOCUMENT', 45, footerY + 12);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...mutedColor);
      doc.text('This receipt is system-generated and includes a secure QR code.', 45, footerY + 18);
      doc.text('No signature is required. Scan the QR code to verify authenticity.', 45, footerY + 23);

      // Bottom Watermark/Text
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225); // Very light
      doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth - 14, pageHeight - 10, { align: 'right' });

      // Download
      doc.save(`receipt_${payment.student.lastName}_${payment.id.substring(0, 8)}.pdf`);
    } catch (error) {
      console.error('Error generating receipt:', error);
      alert('Failed to generate receipt');
    }
  };

  // Toggle debtor selection
  const toggleDebtorSelection = (id: string) => {
    setSelectedDebtors(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Toggle all debtors
  const toggleAllDebtors = () => {
    if (selectedDebtors.length === debtors.length) {
      setSelectedDebtors([]);
    } else {
      setSelectedDebtors(debtors.map(d => d.id));
    }
  };

  const overdueDebtors = debtors.filter(d => d.isOverdue);
  const selectedAcademicTerm = academicTerms.find(term => term.id === selectedAcademicTermId);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Finance & Payments</h1>
          <p className="text-slate-500 dark:text-gray-400">What was billed, what came in, and what still needs follow-up for the term</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200">
            <Calendar size={18} className="text-slate-400" aria-hidden="true" />
            <span className="text-slate-500 dark:text-gray-400">Showing</span>
            <select
              value={selectedAcademicTermId}
              onChange={(event) => {
                const academicTermId = event.target.value;
                setSelectedAcademicTermId(academicTermId);
                setPaymentForm(current => ({ ...current, academicTermId }));
              }}
              className="bg-transparent font-semibold outline-none"
              aria-label="Reporting term"
            >
              {academicTerms.map(term => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>
          </label>
          {activeTab === 'fees' && (
            <>
              <button
                onClick={() => setShowFeeCategoryModal(true)}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-gray-200 px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-surface-hover transition-colors"
              >
                <ClipboardList size={20} />
                <span>Fee Categories</span>
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-green-700 transition-colors"
              >
                <Upload size={20} />
                <span>Import Fee Templates</span>
              </button>
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  setNewFee({ name: '', amount: '', academicTermId: '', categoryId: '', applicableGrade: '' });
                  setShowCreateFeeModal(true);
                }}
                className="bg-primary text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-primary-hover transition-colors"
              >
                <Plus size={20} />
                <span>Create Fee Template</span>
              </button>
            </>
          )}
          {activeTab === 'payments' && (
            <button
              onClick={() => {
                setPaymentForm(current => ({
                  ...current,
                  academicTermId: current.academicTermId || selectedAcademicTermId,
                  idempotencyKey: createPaymentIdempotencyKey(),
                }));
                setShowAddModal(true);
              }}
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-primary-hover transition-colors"
            >
              <Plus size={20} />
              <span>Record Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* Section Switcher */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => { setActiveSection('revenue'); setActiveTab('payments'); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
            activeSection === 'revenue'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-300 hover:bg-surface-hover-strong'
          }`}
        >
          <CreditCard size={16} />
          Revenue & Collections
        </button>
        <button
          onClick={() => { setActiveSection('accounting'); setActiveTab('expenses'); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
            activeSection === 'accounting'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-300 hover:bg-surface-hover-strong'
          }`}
        >
          <BarChart3 size={16} />
          Accounting & Reports
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg w-full md:w-fit mb-6 overflow-x-auto scrollbar-hide">
        {activeSection === 'revenue' ? (
          <>
            <button onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'payments'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              Payments
            </button>
            <button onClick={() => setActiveTab('mobile-money')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'mobile-money'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Smartphone size={16} />
              Mobile Money
            </button>
            <button onClick={() => setActiveTab('fees')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'fees'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              Fee Structures
            </button>
            <button onClick={() => setActiveTab('scholarships')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'scholarships'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              Scholarships
            </button>
            <button onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'reports'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <TrendingUp size={16} />
              Reports
            </button>
            <button onClick={() => { setActiveTab('reminders'); fetchDebtors(); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'reminders'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Bell size={16} />
              Reminders
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setActiveTab('expenses')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'expenses'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Receipt size={16} />
              Expenses
            </button>
            <button onClick={() => setActiveTab('invoices')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'invoices'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <FileText size={16} />
              Invoices
            </button>
            <button onClick={() => setActiveTab('payroll')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'payroll'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Calculator size={16} />
              Payroll
            </button>
            <button onClick={() => setActiveTab('budgets')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'budgets'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <PiggyBank size={16} />
              Budgets
            </button>
            <button onClick={() => setActiveTab('petty-cash')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'petty-cash'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Wallet size={16} />
              Petty Cash
            </button>
            <button onClick={() => setActiveTab('bank-reconciliation')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'bank-reconciliation'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <ShieldCheck size={16} />
              Reconciliation
            </button>
            <button onClick={() => setActiveTab('financial-reports')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'financial-reports'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <ClipboardList size={16} />
              Statements
            </button>
            <button onClick={() => setActiveTab('ai-advisor')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'ai-advisor'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Sparkles size={16} />
              Finance AI
            </button>
            <button onClick={() => setActiveTab('debt-collection')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'debt-collection'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
              <Target size={16} />
              Debt Collection
            </button>
          </>
        )}
      </div>

      {activeTab === 'reports' ? (
        selectedAcademicTerm ? (
          <FinanceReports
            academicTerm={selectedAcademicTerm}
            onOpenReminders={() => { setActiveTab('reminders'); fetchDebtors(); }}
          />
        ) : null
      ) : activeTab === 'scholarships' ? (
        <Scholarships />
      ) : activeTab === 'mobile-money' ? (
        <MobileMoneyPayment
          students={students}
          academicTermId={selectedAcademicTermId}
          onPaymentSuccess={fetchPayments}
        />
      ) : activeTab === 'reminders' ? (
        /* Fee Reminders Tab */
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Fee Reminders</h2>
              <p className="text-slate-500 dark:text-gray-400">Send payment reminders to parents with outstanding fees</p>
            </div>
            <div className="flex gap-3">
              {selectedDebtors.length > 0 && (
                <button
                  onClick={() => sendFeeReminders()}
                  disabled={sendingReminders}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  <Send size={18} />
                  Send Reminder ({selectedDebtors.length})
                </button>
              )}
              <button
                onClick={() => sendFeeReminders(overdueDebtors.map(d => d.id), true)}
                disabled={sendingReminders || overdueDebtors.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                <Bell size={18} />
                Send to All Overdue ({overdueDebtors.length})
              </button>
            </div>
          </div>

          {/* Debtors Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-4 w-12">
                      <input
                        type="checkbox"
                        checked={selectedDebtors.length === debtors.length && debtors.length > 0}
                        onChange={toggleAllDebtors}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Student</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Class</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Guardian</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Outstanding</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Status</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {loadingDebtors ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500 dark:text-gray-400">Loading students with outstanding fees...</td>
                    </tr>
                  ) : debtors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500 dark:text-gray-400">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                            <DollarSign className="text-green-600 dark:text-green-400" size={24} />
                          </div>
                          <p className="font-medium text-slate-700 dark:text-white">All fees are paid!</p>
                          <p className="text-sm dark:text-gray-400">No students with outstanding balances</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    debtors.map((debtor) => (
                      <tr key={debtor.id} className={`hover:bg-surface-hover transition-colors ${selectedDebtors.includes(debtor.id) ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}>
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedDebtors.includes(debtor.id)}
                            onChange={() => toggleDebtorSelection(debtor.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800 dark:text-white">{debtor.firstName} {debtor.lastName}</div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">{debtor.admissionNumber}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300">{debtor.className || 'N/A'}</td>
                        <td className="px-6 py-4">
                          <div className="text-slate-800 dark:text-white">{debtor.guardianName || 'N/A'}</div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">{debtor.guardianPhone || 'No phone'}</div>
                          {debtor.guardianEmail && (
                            <div className="text-xs text-blue-600">{debtor.guardianEmail}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-lg font-bold text-red-600">ZMW {Number(debtor.outstandingAmount).toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4">
                          {debtor.isOverdue ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Overdue
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => sendFeeReminders([debtor.id], debtor.isOverdue)}
                            disabled={sendingReminders}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
                          >
                            <Send size={14} />
                            Send
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          {debtors.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-slate-500 dark:text-gray-400">Total Students</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{debtors.length}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">
                    ZMW {debtors.reduce((sum, d) => sum + Number(d.outstandingAmount), 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Overdue Students</p>
                  <p className="text-2xl font-bold text-orange-600">{debtors.filter(d => d.isOverdue).length}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'expenses' ? (
        <Expenses embedded />
      ) : activeTab === 'invoices' ? (
        <Invoices embedded initialTermId={selectedAcademicTermId} />
      ) : activeTab === 'payroll' ? (
        <Payroll embedded />
      ) : activeTab === 'budgets' ? (
        <Budgets embedded />
      ) : activeTab === 'petty-cash' ? (
        <PettyCash embedded />
      ) : activeTab === 'bank-reconciliation' ? (
        <BankReconciliation embedded academicTermId={selectedAcademicTermId} />
      ) : activeTab === 'financial-reports' ? (
        <FinancialStatements embedded academicTerm={selectedAcademicTerm} />
      ) : activeTab === 'ai-advisor' ? (
        <AIFinancialAdvisor embedded />
      ) : activeTab === 'debt-collection' ? (
        <DebtCollection embedded />
      ) : activeTab === 'payments' ? (
        <>
          {/* Term position: what came in, what is still owed, and how much is proven against the bank */}
          <section aria-label="Term position" className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-gray-400">
                <DollarSign size={16} className="text-green-600" aria-hidden="true" />
                Collected this term
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtWhole(stats.totalRevenue)}</p>
              <ProgressBar value={settledRate} label="Share of billed fees settled" tone="bg-green-500" />
              <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                {billedThisTerm > 0 ? `${settledRate}% of ${fmtWhole(billedThisTerm)} billed is settled` : 'No fees billed this term yet'}
                {' · '}{plural(stats.totalTransactions, 'payment')}
              </p>
            </article>

            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-gray-400">
                <Wallet size={16} className="text-orange-600" aria-hidden="true" />
                Still owed
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtWhole(stats.pendingFees)}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                {stats.overdueCount > 0 ? `${plural(stats.overdueCount, 'student')} with an unpaid balance` : 'Every billed student is paid up'}
              </p>
              {stats.creditCount > 0 && (
                <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                  {plural(stats.creditCount, 'student')} paid ahead · {fmtWhole(stats.creditBalance)} in credit
                </p>
              )}
              {stats.overdueCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setActiveTab('reminders'); fetchDebtors(); }}
                  className="mt-auto inline-flex w-fit items-center gap-1 pt-3 text-sm font-semibold text-primary hover:underline"
                >
                  Send fee reminders <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </article>

            <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-gray-400">
                <Landmark size={16} className="text-blue-600" aria-hidden="true" />
                Matched to bank
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {paymentControlLoading ? '…' : `${paymentControlSummary.reconciledPayments} of ${paymentControlSummary.totalPayments}`}
                <span className="ml-1 text-sm font-medium text-slate-500 dark:text-gray-400">payments</span>
              </p>
              <ProgressBar value={reconciledRate} label="Share of payments matched to bank statements" tone="bg-blue-500" />
              <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                {paymentControlSummary.unreconciledPayments > 0
                  ? `${fmt(paymentControlSummary.unreconciledAmount)} still to match on bank statements`
                  : 'Every payment is matched to the bank'}
              </p>
              {paymentControlSummary.unreconciledPayments > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('bank-reconciliation')}
                  className="mt-auto inline-flex w-fit items-center gap-1 pt-3 text-sm font-semibold text-primary hover:underline"
                >
                  Open bank reconciliation <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </article>
          </section>

          {/* Needs attention: only problems that block a payment from being complete, each with its fix */}
          {!paymentControlLoading && (paymentControlSummary.unallocatedPayments > 0 || paymentControlSummary.missingBankReference > 0) && (
            <section aria-labelledby="payments-attention-title" className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-900/10">
              <h2 id="payments-attention-title" className="px-5 pt-4 text-sm font-semibold text-amber-900 dark:text-amber-200">Needs attention</h2>
              <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
                {paymentControlSummary.unallocatedPayments > 0 && (
                  <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-orange-600" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{plural(paymentControlSummary.unallocatedPayments, 'payment')} not applied to fees</p>
                        <p className="text-sm text-slate-600 dark:text-gray-400">{fmt(paymentControlSummary.unallocatedAmount)} was received but is not yet linked to any fee item.</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => showPaymentsAtStage('UNALLOCATED')}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-surface-hover-accent dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200"
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoAllocatePayments}
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                      >
                        Apply to fees
                      </button>
                    </div>
                  </li>
                )}
                {paymentControlSummary.missingBankReference > 0 && (
                  <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{plural(paymentControlSummary.missingBankReference, 'bank deposit')} without a bank reference</p>
                        <p className="text-sm text-slate-600 dark:text-gray-400">Add the deposit slip reference so each deposit can be matched to the bank statement.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => showPaymentsAtStage('MISSING_REF')}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-surface-hover-accent dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200"
                    >
                      Review
                    </button>
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Payments ledger: who paid, how, and what is left to do with each payment */}
          <section
            ref={paymentsTableRef}
            aria-labelledby="payments-ledger-title"
            className="scroll-mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <header className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-700 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 id="payments-ledger-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  {paymentTab === 'completed' ? 'Payments received' : 'Voided payments'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  {loading ? 'Loading…' : `${plural(filteredPayments.length, 'payment')} · ${fmt(filteredTotal)}`}
                  {selectedAcademicTerm ? ` · ${selectedAcademicTerm.name}` : ''}
                </p>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-700" role="group" aria-label="Payment status">
                  {([
                    { key: 'completed', label: 'Received', count: receivedCount },
                    { key: 'voided', label: 'Voided', count: voidedCount },
                  ] as const).map(option => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={paymentTab === option.key}
                      onClick={() => { setPaymentTab(option.key); setStageFilter('ALL'); }}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${paymentTab === option.key
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:bg-surface-hover dark:text-gray-400'}`}
                    >
                      {option.label} <span className="tabular-nums text-slate-400">{option.count}</span>
                    </button>
                  ))}
                </div>

                <div className="relative md:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search payments"
                    placeholder="Student, admission no. or reference"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFilterModal(true)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${advancedFilterCount > 0
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-surface-hover dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300'}`}
                  >
                    <Filter size={16} aria-hidden="true" />
                    Filter
                    {advancedFilterCount > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-white">{advancedFilterCount}</span>
                    )}
                  </button>
                  <ExportDropdown
                    data={filteredPayments.map(p => ({
                      date: new Date(p.paymentDate).toLocaleDateString(),
                      studentName: `${p.student.firstName} ${p.student.lastName}`,
                      admissionNumber: p.student.admissionNumber,
                      className: p.student.class?.name || 'No Class',
                      amount: Number(p.amount).toFixed(2),
                      method: p.method.replace('_', ' '),
                      transactionId: p.transactionId || '-',
                      bankReference: p.bankReference || '-',
                      status: p.status === 'VOIDED' ? 'Voided' : PAYMENT_STAGES[getPaymentStage(p)].label,
                      notes: p.notes || '-',
                      recordedBy: p.recordedBy.fullName
                    }))}
                    columns={[
                      { key: 'date', header: 'Date' },
                      { key: 'studentName', header: 'Student Name' },
                      { key: 'admissionNumber', header: 'Admission #' },
                      { key: 'className', header: 'Class' },
                      { key: 'amount', header: 'Amount (ZMW)' },
                      { key: 'method', header: 'Method' },
                      { key: 'transactionId', header: 'Transaction ID' },
                      { key: 'bankReference', header: 'Bank Reference' },
                      { key: 'status', header: 'Status' },
                      { key: 'notes', header: 'Notes' },
                      { key: 'recordedBy', header: 'Recorded By' }
                    ]}
                    filename={`payments_export_${new Date().toISOString().split('T')[0]}`}
                  />
                </div>
              </div>
            </header>

            {paymentTab === 'completed' && listedPayments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700" role="group" aria-label="Filter by progress">
                {([
                  { key: 'ALL', label: 'All', count: listedPayments.length },
                  ...(Object.keys(PAYMENT_STAGES) as PaymentStage[]).map(stage => ({ key: stage, label: PAYMENT_STAGES[stage].label, count: stageCounts[stage] })),
                ] as { key: PaymentStage | 'ALL'; label: string; count: number }[])
                  .filter(option => option.key === 'ALL' || option.count > 0 || stageFilter === option.key)
                  .map(option => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={stageFilter === option.key}
                      onClick={() => setStageFilter(option.key)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${stageFilter === option.key
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 hover:bg-surface-hover-strong dark:bg-slate-700 dark:text-gray-300'}`}
                    >
                      {option.label} <span className="tabular-nums opacity-70">{option.count}</span>
                    </button>
                  ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-700/60 dark:text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Amount (ZMW)</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Method</th>
                    {paymentTab === 'voided' ? (
                      <>
                        <th scope="col" className="px-4 py-3 font-semibold">Why it was voided</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Voided by</th>
                      </>
                    ) : (
                      <>
                        <th scope="col" className="px-4 py-3 font-semibold">Progress</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} aria-hidden="true">
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <td key={cell} className="px-4 py-4">
                            <div className="h-4 w-full max-w-[8rem] animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        {hasPaymentFilters ? (
                          <>
                            <p className="font-medium text-slate-800 dark:text-white">No payments match these filters</p>
                            <button type="button" onClick={clearPaymentFilters} className="mt-2 text-sm font-semibold text-primary hover:underline">
                              Clear filters
                            </button>
                          </>
                        ) : paymentTab === 'voided' ? (
                          <p className="text-slate-500 dark:text-gray-400">No payments have been voided this term.</p>
                        ) : (
                          <>
                            <p className="font-medium text-slate-800 dark:text-white">No payments recorded for this term yet</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Payments you record, and mobile money collections, appear here.</p>
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment) => {
                      const stage = getPaymentStage(payment);
                      const isVoided = payment.status === 'VOIDED';
                      return (
                        <tr key={payment.id} className="align-top transition-colors hover:bg-surface-hover">
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="font-medium text-slate-800 dark:text-white">{formatPaymentDate(payment.paymentDate)}</div>
                            <div className="text-xs text-slate-500 dark:text-gray-400">by {payment.recordedBy.fullName}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 dark:text-white">
                              {payment.student.firstName} {payment.student.lastName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-gray-400">
                              {payment.student.admissionNumber} · {payment.student.class?.name || 'No class'}
                            </div>
                            {payment.notes && (
                              <div className="mt-1 flex max-w-[18rem] items-center gap-1 text-xs text-slate-500 dark:text-gray-400" title={payment.notes}>
                                <StickyNote size={12} className="shrink-0" aria-hidden="true" />
                                <span className="truncate">{payment.notes}</span>
                              </div>
                            )}
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${isVoided ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                            {Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${METHOD_CHIPS[payment.method]}`}>
                              {formatMethod(payment.method)}
                            </span>
                            <div className="mt-1 font-mono text-xs text-slate-500 dark:text-gray-400">
                              {payment.bankReference || payment.transactionId || '—'}
                            </div>
                          </td>
                          {paymentTab === 'voided' ? (
                            <>
                              <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{payment.voidReason || 'No reason recorded'}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-gray-300">{payment.voidedBy?.fullName || 'Unknown'}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PAYMENT_STAGES[stage].chip}`}>
                                  {stage === 'COMPLETE' && <CheckCircle2 size={12} aria-hidden="true" />}
                                  {PAYMENT_STAGES[stage].label}
                                </span>
                                <div className="mt-1 max-w-[16rem] truncate text-xs text-slate-500 dark:text-gray-400" title={getPaymentStageHint(payment, stage)}>
                                  {getPaymentStageHint(payment, stage)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right">
                                <div className="inline-flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => generatePaymentReceipt(payment)}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-surface-hover-accent hover:text-slate-800 dark:text-gray-400 dark:hover:text-white"
                                    title="Download receipt"
                                    aria-label={`Download receipt for ${payment.student.firstName} ${payment.student.lastName}`}
                                  >
                                    <Download size={18} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResendReceipt(payment.id)}
                                    disabled={resendingReceiptId === payment.id}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-surface-hover-accent hover:text-slate-800 disabled:cursor-wait disabled:opacity-50 dark:text-gray-400 dark:hover:text-white"
                                    title="Send receipt to parent"
                                    aria-label={`Send receipt to the parent of ${payment.student.firstName} ${payment.student.lastName}`}
                                  >
                                    <Send size={18} className={resendingReceiptId === payment.id ? 'animate-pulse' : ''} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleVoidPayment(payment.id)}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-surface-hover-danger hover:text-red-600 dark:text-gray-500"
                                    title="Void payment"
                                    aria-label={`Void payment from ${payment.student.firstName} ${payment.student.lastName}`}
                                  >
                                    <Ban size={18} />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feeTemplates.map((template) => (
            <div key={template.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">{template.name}</h3>
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-300">
                    {getGradeLabel(template.applicableGrade)}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditClick(template)}
                    className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">{template.academicTerm.name}</p>

              <div className="flex items-baseline mb-6">
                <span className="text-2xl font-bold text-slate-800 dark:text-white">ZMW {Number(template.amount).toLocaleString()}</span>
              </div>

              <button
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setShowAssignFeeModal(true);
                }}
                className="w-full py-2 px-4 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-surface-hover-accent transition-colors flex items-center justify-center space-x-2"
              >
                <Users size={18} />
                <span>Assign to Class</span>
              </button>
            </div>
          ))}

          {feeTemplates.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
              <div className="mx-auto w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="text-slate-400 dark:text-gray-500" size={24} />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">No fee templates</h3>
              <p className="text-slate-500 dark:text-gray-400 mt-1">Create a fee template to get started</p>
            </div>
          )}
        </div>
      )
      }
      {/* Filter Modal */}
      {
        showFilterModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold dark:text-white">Filter Payments</h2>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="p-1 hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Class</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                  >
                    <option value="ALL">All Classes</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Payment Method</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                  >
                    <option value="ALL">All Methods</option>
                    <option value="CASH">Cash</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK_DEPOSIT">Bank Deposit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Date Range</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="date"
                      className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => {
                    setClassFilter('ALL');
                    setMethodFilter('ALL');
                    setDateRange({ start: '', end: '' });
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-surface-hover rounded-lg transition-colors"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Fee Category Modal */}
      {
        showFeeCategoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold dark:text-white">Fee Categories</h2>
                  <p className="text-sm text-slate-500 dark:text-gray-400">Create categories once, then reuse them across fee templates.</p>
                </div>
                <button
                  onClick={() => setShowFeeCategoryModal(false)}
                  className="p-1 hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3">Existing Categories</h3>
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {feeCategories.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-500 dark:text-gray-400">
                        No fee categories yet.
                      </div>
                    ) : (
                      feeCategories.map((category) => (
                        <div key={category.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-800 dark:text-white">{category.name}</p>
                              <p className="text-xs text-slate-500 dark:text-gray-400">Code: {category.code}</p>
                            </div>
                            <button
                              onClick={() => {
                                setNewFee((current) => ({ ...current, categoryId: category.id }));
                                setShowFeeCategoryModal(false);
                              }}
                              className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-surface-hover-strong transition-colors"
                            >
                              Use in template
                            </button>
                          </div>
                          {category.description && (
                            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{category.description}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 p-4 h-fit">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3">Create New Category</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Category Name</label>
                      <input
                        type="text"
                        value={feeCategoryForm.name}
                        onChange={(e) => setFeeCategoryForm({ ...feeCategoryForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        placeholder="e.g. Tuition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Code</label>
                      <input
                        type="text"
                        value={feeCategoryForm.code}
                        onChange={(e) => setFeeCategoryForm({ ...feeCategoryForm, code: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        placeholder="e.g. TUITION"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Description</label>
                      <textarea
                        rows={3}
                        value={feeCategoryForm.description}
                        onChange={(e) => setFeeCategoryForm({ ...feeCategoryForm, description: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                        placeholder="Optional description"
                      />
                    </div>
                    <button
                      onClick={handleCreateFeeCategory}
                      disabled={creatingFeeCategory}
                      className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {creatingFeeCategory ? 'Creating...' : 'Create Category'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Add Payment Modal */}
      {
        showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Record New Payment</h2>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Academic Term</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={paymentForm.academicTermId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, academicTermId: e.target.value })}
                  >
                    <option value="">Select term</option>
                    {academicTerms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-2">Find Student</label>
                  <StudentSelector
                    students={students}
                    classes={classes}
                    value={paymentForm.studentId}
                    onChange={(studentId) => setPaymentForm({ ...paymentForm, studentId })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Amount (ZMW)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Payment Method</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  >
                    <option value="CASH">Cash</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK_DEPOSIT">Bank Deposit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Notes</label>
                  <textarea
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="Optional notes about this payment"
                    rows={2}
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-surface-hover rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover flex items-center gap-2 ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {submitting ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Create Fee Template Modal */}
      {
        showCreateFeeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4 dark:text-white">{editingTemplate ? 'Edit Fee Template' : 'Create Fee Template'}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Fee Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="e.g. Term 1 Tuition"
                    value={newFee.name}
                    onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Amount (ZMW)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    placeholder="0.00"
                    value={newFee.amount}
                    onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Academic Term</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={newFee.academicTermId}
                    onChange={(e) => setNewFee({ ...newFee, academicTermId: e.target.value })}
                  >
                    <option value="">Select Term</option>
                    {academicTerms.map(term => (
                      <option key={term.id} value={term.id}>{term.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Fee Category</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={newFee.categoryId}
                    onChange={(e) => setNewFee({ ...newFee, categoryId: e.target.value })}
                  >
                    <option value="">Select Category</option>
                    {feeCategories.map(category => (
                      <option key={category.id} value={category.id}>{category.name} ({category.code})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowFeeCategoryModal(true)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Create or review fee categories
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Applicable Grade</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={newFee.applicableGrade}
                    onChange={(e) => setNewFee({ ...newFee, applicableGrade: e.target.value })}
                  >
                    <option value="">Select Grade</option>
                    <option value="0">Nursery</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowCreateFeeModal(false)}
                  className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-surface-hover rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFee}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Assign Fee Modal */}
      {
        showAssignFeeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Assign Fee to Class</h2>
              <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
                This will assign the selected fee to all active students in the selected class and keep the class fee rule available for future student sync.
                Scholarship discounts will be applied automatically.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">Select Class</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={assignClassId}
                    onChange={(e) => setAssignClassId(e.target.value)}
                  >
                    <option value="">Select Class</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <div className="flex items-center space-x-2">
                      <Calendar size={16} />
                      <span>Payment Due Date (Optional)</span>
                    </div>
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    Set a deadline for this fee payment
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAssignFeeModal(false);
                    setAssignDueDate('');
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-surface-hover rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignFee}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                >
                  Assign Fee
                </button>
              </div>
            </div>
          </div>
        )
      }

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityName="Fee Templates"
        apiEndpoint="/api/v1/fees/templates/bulk"
        templateFields={['name', 'amount', 'applicableGrade']}
        onSuccess={fetchFeeTemplates}
        instructions={[
          'Upload a CSV file with fee template details.',
          'Required columns: name, amount, applicableGrade.',
          'Amount should be a positive number.',
          'Applicable grade: -2 (Baby Class), -1 (Middle), 0 (Nursery), 1-12 (Grades).',
          'Academic term will be set to the current active term automatically.',
        ]}
      />
    </div >
  );
};

export default Finance;
