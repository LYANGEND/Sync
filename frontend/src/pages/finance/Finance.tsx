import React, { useState, useEffect } from 'react';
import FinanceReports from './FinanceReports';

import { Plus, Search, Filter, DollarSign, CreditCard, Calendar, BookOpen, Users, Edit2, Trash2, Upload, X, Bell, Send, FileText, TrendingUp, Smartphone, Receipt, Calculator, Wallet, PiggyBank, BarChart3, ClipboardList, Sparkles, Target, ShieldCheck } from 'lucide-react';
import api from '../../utils/api';
import Scholarships from './Scholarships';
import BulkImportModal from '../../components/BulkImportModal';
import ExportDropdown from '../../components/ExportDropdown';
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
}

interface Class {
  id: string;
  name: string;
}

const getGradeLabel = (grade: number) => {
  if (grade === 0) return 'Nursery';
  return `Grade ${grade}`;
};

const fmt = (amount: number) => `ZMW ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Finance = () => {
  const { confirm, prompt, notify } = useAppDialog();
  const [activeTab, setActiveTab] = useState<'payments' | 'mobile-money' | 'fees' | 'scholarships' | 'reminders' | 'reports' | 'expenses' | 'invoices' | 'payroll' | 'budgets' | 'petty-cash' | 'bank-reconciliation' | 'financial-reports' | 'ai-advisor' | 'debt-collection'>('payments');

  // Determine which section is active for visual grouping
  const revenueTabKeys = ['payments', 'mobile-money', 'fees', 'scholarships', 'reports', 'reminders'];
  const accountingTabKeys = ['expenses', 'invoices', 'payroll', 'budgets', 'petty-cash', 'bank-reconciliation', 'financial-reports', 'ai-advisor', 'debt-collection'];
  const [activeSection, setActiveSection] = useState<'revenue' | 'accounting'>('revenue');

  // Sync section with tab
  useEffect(() => {
    if (revenueTabKeys.includes(activeTab)) setActiveSection('revenue');
    else setActiveSection('accounting');
  }, [activeTab]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
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
    pendingFees: 0,
    overdueStudentsCount: 0
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
    amount: '',
    method: 'CASH',
    notes: ''
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'completed' | 'voided'>('completed'); // 'completed' | 'voided'
  const [resendingReceiptId, setResendingReceiptId] = useState<string | null>(null);
  const [creatingFeeCategory, setCreatingFeeCategory] = useState(false);

  // Fee Reminders state
  const [debtors, setDebtors] = useState<any[]>([]);
  const [loadingDebtors, setLoadingDebtors] = useState(false);
  const [selectedDebtors, setSelectedDebtors] = useState<string[]>([]);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    fetchPayments();
    fetchFeeTemplates();
    fetchFeeCategories();
    fetchAcademicTerms();
    fetchClasses();
    fetchStudents();
    fetchStats();
    fetchPaymentControlSummary();
  }, []);

  const fetchPaymentControlSummary = async () => {
    setPaymentControlLoading(true);
    try {
      const response = await paymentControlApi.getReconciliationDashboard();
      setPaymentControlSummary(response.data.summary);
    } catch (error) {
      console.error('Error fetching payment control summary:', error);
    } finally {
      setPaymentControlLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/payments/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching finance stats:', error);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await api.get('/payments');
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

  const fetchStudents = async () => {
    try {
      const response = await api.get('/students');
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
      setAcademicTerms(response.data);
    } catch (error) {
      console.error('Error fetching academic terms:', error);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
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

  const handleRecordPayment = async (e: React.FormEvent, forceCreate = false) => {
    e.preventDefault();
    if (submitting) return; // Prevent double submission

    setSubmitting(true);
    try {
      await api.post('/payments', {
        ...paymentForm,
        amount: Number(paymentForm.amount),
        forceCreate // If true, skip duplicate check
      });

      setShowAddModal(false);
      setPaymentForm({ studentId: '', amount: '', method: 'CASH', notes: '' });
      fetchPayments();
    } catch (error: any) {
      console.error('Error recording payment:', error);

      // Check if it's a duplicate warning
      if (error.response?.status === 409 && error.response?.data?.warning === 'POTENTIAL_DUPLICATE') {
        const existingPayment = error.response.data.existingPayment;
        const confirmMessage =
          `⚠️ Potential Duplicate Detected!\n\n` +
          `A similar payment was found:\n` +
          `• Amount: ZMW ${existingPayment.amount}\n` +
          `• Transaction ID: ${existingPayment.transactionId}\n` +
          `• Method: ${existingPayment.method}\n` +
          `• Date: ${new Date(existingPayment.paymentDate).toLocaleString()}\n\n` +
          `${error.response.data.message}\n\n` +
          `Do you want to record this payment anyway?`;

        if (await confirm({
          title: 'Potential duplicate payment',
          message: confirmMessage,
          confirmText: 'Record anyway',
          cancelText: 'Cancel',
        })) {
          // User confirmed, retry with forceCreate
          try {
            await api.post('/payments', {
              ...paymentForm,
              amount: Number(paymentForm.amount),
              forceCreate: true
            });
            setShowAddModal(false);
            setPaymentForm({ studentId: '', amount: '', method: 'CASH', notes: '' });
            fetchPayments();
          } catch (retryError) {
            console.error('Error on retry:', retryError);
            alert('Failed to record payment');
          }
        }
      } else {
        alert('Failed to record payment');
      }
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
      alert('Payment voided successfully');
      fetchPayments();
      fetchPaymentControlSummary();
    } catch (error: any) {
      console.error('Error voiding payment:', error);
      alert(error.response?.data?.message || 'Failed to void payment');
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

  const filteredPayments = payments.filter(payment => {
    const matchesSearch =
      payment.student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.student.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.transactionId?.toLowerCase().includes(searchTerm.toLowerCase());

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

  // Fetch students with outstanding fees
  const fetchDebtors = async () => {
    setLoadingDebtors(true);
    try {
      const response = await api.get('/fee-reminders/outstanding');
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
    const targetIds = studentIds || selectedDebtors;
    if (targetIds.length === 0) {
      alert('Select at least one student to remind.');
      return;
    }

    setSendingReminders(true);
    try {
      const response = await api.post('/fee-reminders/send', {
        studentIds: targetIds,
        isOverdue
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

  return (
    <div className="ds-page">
      <div className="ds-page-header">
        <div>
          <h1 className="ds-page-title">Finance & Payments</h1>
          <p className="ds-page-subtitle">Manage school fees and transactions</p>
        </div>
        <div className="ds-actions">
          {activeTab === 'fees' && (
            <>
              <button
                onClick={() => setShowFeeCategoryModal(true)}
                className="ds-button-outline"
              >
                <ClipboardList size={20} />
                <span>Fee Categories</span>
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="ds-button-outline"
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
                className="ds-button-primary"
              >
                <Plus size={20} />
                <span>Create Fee Template</span>
              </button>
            </>
          )}
          {activeTab === 'payments' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="ds-button-primary"
            >
              <Plus size={20} />
              <span>Record Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* Section Switcher */}
      <div className="ds-actions" role="group" aria-label="Finance section">
        <button
          onClick={() => { setActiveSection('revenue'); setActiveTab('payments'); }}
          aria-pressed={activeSection === 'revenue'}
          className={activeSection === 'revenue' ? 'ds-button-primary' : 'ds-button-secondary'}
        >
          <CreditCard size={16} />
          Revenue & Collections
        </button>
        <button
          onClick={() => { setActiveSection('accounting'); setActiveTab('expenses'); }}
          aria-pressed={activeSection === 'accounting'}
          className={activeSection === 'accounting' ? 'ds-button-primary' : 'ds-button-secondary'}
        >
          <BarChart3 size={16} />
          Accounting & Reports
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="ds-actions" role="group" aria-label="Finance views">
        {activeSection === 'revenue' ? (
          <>
            <button onClick={() => setActiveTab('payments')}
              aria-pressed={activeTab === 'payments'}
              className={activeTab === 'payments' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              Payments
            </button>
            <button onClick={() => setActiveTab('mobile-money')}
              aria-pressed={activeTab === 'mobile-money'}
              className={activeTab === 'mobile-money' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Smartphone size={16} />
              Mobile Money
            </button>
            <button onClick={() => setActiveTab('fees')}
              aria-pressed={activeTab === 'fees'}
              className={activeTab === 'fees' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              Fee Structures
            </button>
            <button onClick={() => setActiveTab('scholarships')}
              aria-pressed={activeTab === 'scholarships'}
              className={activeTab === 'scholarships' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              Scholarships
            </button>
            <button onClick={() => setActiveTab('reports')}
              aria-pressed={activeTab === 'reports'}
              className={activeTab === 'reports' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <TrendingUp size={16} />
              Reports
            </button>
            <button onClick={() => { setActiveTab('reminders'); fetchDebtors(); }}
              aria-pressed={activeTab === 'reminders'}
              className={activeTab === 'reminders' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Bell size={16} />
              Reminders
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setActiveTab('expenses')}
              aria-pressed={activeTab === 'expenses'}
              className={activeTab === 'expenses' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Receipt size={16} />
              Expenses
            </button>
            <button onClick={() => setActiveTab('invoices')}
              aria-pressed={activeTab === 'invoices'}
              className={activeTab === 'invoices' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <FileText size={16} />
              Invoices
            </button>
            <button onClick={() => setActiveTab('payroll')}
              aria-pressed={activeTab === 'payroll'}
              className={activeTab === 'payroll' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Calculator size={16} />
              Payroll
            </button>
            <button onClick={() => setActiveTab('budgets')}
              aria-pressed={activeTab === 'budgets'}
              className={activeTab === 'budgets' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <PiggyBank size={16} />
              Budgets
            </button>
            <button onClick={() => setActiveTab('petty-cash')}
              aria-pressed={activeTab === 'petty-cash'}
              className={activeTab === 'petty-cash' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Wallet size={16} />
              Petty Cash
            </button>
            <button onClick={() => setActiveTab('bank-reconciliation')}
              aria-pressed={activeTab === 'bank-reconciliation'}
              className={activeTab === 'bank-reconciliation' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <ShieldCheck size={16} />
              Reconciliation
            </button>
            <button onClick={() => setActiveTab('financial-reports')}
              aria-pressed={activeTab === 'financial-reports'}
              className={activeTab === 'financial-reports' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <ClipboardList size={16} />
              Statements
            </button>
            <button onClick={() => setActiveTab('ai-advisor')}
              aria-pressed={activeTab === 'ai-advisor'}
              className={activeTab === 'ai-advisor' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Sparkles size={16} />
              Finance AI
            </button>
            <button onClick={() => setActiveTab('debt-collection')}
              aria-pressed={activeTab === 'debt-collection'}
              className={activeTab === 'debt-collection' ? 'ds-button-secondary' : 'ds-button-ghost'}>
              <Target size={16} />
              Debt Collection
            </button>
          </>
        )}
      </div>

      {activeTab === 'reports' ? (
        <FinanceReports />
      ) : activeTab === 'scholarships' ? (
        <Scholarships />
      ) : activeTab === 'mobile-money' ? (
        <MobileMoneyPayment
          students={students}
          onPaymentSuccess={fetchPayments}
        />
      ) : activeTab === 'reminders' ? (
        /* Fee Reminders Tab */
        <div className="space-y-6">
          {/* Header */}
          <div className="ds-page-header">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Fee Reminders</h2>
              <p className="text-slate-500 dark:text-gray-400">Send payment reminders to parents with outstanding fees</p>
            </div>
            <div className="ds-actions">
              {selectedDebtors.length > 0 && (
                <button
                  onClick={() => sendFeeReminders()}
                  disabled={sendingReminders}
                  className="ds-button-primary"
                >
                  <Send size={18} />
                  Send Reminder ({selectedDebtors.length})
                </button>
              )}
              <button
                onClick={() => sendFeeReminders(overdueDebtors.map(d => d.id), true)}
                disabled={sendingReminders || overdueDebtors.length === 0}
                className="ds-button-secondary"
              >
                <Bell size={18} />
                Send to All Overdue ({overdueDebtors.length})
              </button>
            </div>
          </div>

          {/* Debtors Table */}
          <div className="ds-surface overflow-hidden">
            <div className="overflow-x-auto" role="region" aria-label="Students with outstanding fees" tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                        <span className="sr-only">Select all students with outstanding fees</span>
                        <input
                          type="checkbox"
                          checked={selectedDebtors.length === debtors.length && debtors.length > 0}
                          onChange={toggleAllDebtors}
                          className="ds-choice"
                        />
                      </label>
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Student</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Class</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Guardian</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Outstanding</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Status</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Actions</th>
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
                          <div className="w-12 h-12 flex items-center justify-center mb-3">
                            <DollarSign className="text-green-600 dark:text-green-400" size={24} />
                          </div>
                          <p className="font-medium text-slate-700 dark:text-white">All fees are paid!</p>
                          <p className="text-sm dark:text-gray-400">No students with outstanding balances</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    debtors.map((debtor) => (
                      <tr key={debtor.id} className={selectedDebtors.includes(debtor.id) ? 'bg-[var(--surface-muted)]' : ''}>
                        <td className="px-4 py-3 align-middle">
                          <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                            <span className="sr-only">Select {debtor.firstName} {debtor.lastName}</span>
                            <input
                              type="checkbox"
                              checked={selectedDebtors.includes(debtor.id)}
                              onChange={() => toggleDebtorSelection(debtor.id)}
                              className="ds-choice"
                            />
                          </label>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="font-semibold text-slate-800 dark:text-white">{debtor.firstName} {debtor.lastName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{debtor.admissionNumber}</div>
                        </td>
                        <td className="px-4 py-3 align-middle text-slate-600 dark:text-slate-300">{debtor.className || 'N/A'}</td>
                        <td className="px-4 py-3 align-middle">
                          <div className="font-medium text-slate-700 dark:text-slate-200">{debtor.guardianName || 'N/A'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{debtor.guardianPhone || 'No phone'}</div>
                          {debtor.guardianEmail && (
                            <div className="text-xs text-blue-600 dark:text-blue-400">{debtor.guardianEmail}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="text-base font-bold text-red-600 dark:text-red-400">ZMW {Number(debtor.outstandingAmount).toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {debtor.isOverdue ? (
                            <span className="ds-badge ds-badge-error">
                              Overdue
                            </span>
                          ) : (
                            <span className="ds-badge ds-badge-warning">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right align-middle">
                          <button
                            onClick={() => sendFeeReminders([debtor.id], debtor.isOverdue)}
                            disabled={sendingReminders}
                            className="ds-button-secondary"
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
            <div className="ds-card">
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
        <Invoices embedded />
      ) : activeTab === 'payroll' ? (
        <Payroll embedded />
      ) : activeTab === 'budgets' ? (
        <Budgets embedded />
      ) : activeTab === 'petty-cash' ? (
        <PettyCash embedded />
      ) : activeTab === 'bank-reconciliation' ? (
        <BankReconciliation embedded />
      ) : activeTab === 'financial-reports' ? (
        <FinancialStatements embedded />
      ) : activeTab === 'ai-advisor' ? (
        <AIFinancialAdvisor embedded />
      ) : activeTab === 'debt-collection' ? (
        <DebtCollection embedded />
      ) : activeTab === 'payments' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="ds-card">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 text-green-600 dark:text-green-400">
                  <DollarSign size={24} />
                </div>
                <span className="text-sm text-slate-500 dark:text-gray-400">Total Revenue</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">ZMW {stats.totalRevenue.toLocaleString()}</h3>
              <p className="text-sm text-green-600 mt-1">All time revenue</p>
            </div>

            <div className="ds-card">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 text-blue-600 dark:text-blue-400">
                  <CreditCard size={24} />
                </div>
                <span className="text-sm text-slate-500 dark:text-gray-400">Transactions</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalTransactions}</h3>
              <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">Total transactions</p>
            </div>

            <div className="ds-card">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 text-orange-600 dark:text-orange-400">
                  <Calendar size={24} />
                </div>
                <span className="text-sm text-slate-500 dark:text-gray-400">Pending Fees</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">ZMW {stats.pendingFees.toLocaleString()}</h3>
              <p className="text-sm text-red-500 mt-1">{stats.overdueStudentsCount} students overdue</p>
            </div>
          </div>

          <div className="ds-card mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                <div className="ds-surface-muted p-4">
                  <p className="text-sm text-slate-500 dark:text-gray-400">Unreconciled receipts</p>
                  <p className="text-xl font-bold text-orange-600">{paymentControlLoading ? '…' : paymentControlSummary.unreconciledPayments}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{fmt(paymentControlSummary.unreconciledAmount || 0)}</p>
                </div>
                <div className="ds-surface-muted p-4">
                  <p className="text-sm text-slate-500 dark:text-gray-400">Unallocated payments</p>
                  <p className="text-xl font-bold text-purple-600">{paymentControlLoading ? '…' : paymentControlSummary.unallocatedPayments}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{fmt(paymentControlSummary.unallocatedAmount || 0)}</p>
                </div>
                <div className="ds-surface-muted p-4">
                  <p className="text-sm text-slate-500 dark:text-gray-400">Missing bank refs</p>
                  <p className="text-xl font-bold text-red-600">{paymentControlLoading ? '…' : paymentControlSummary.missingBankReference}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Bank deposits need statement evidence</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAutoAllocatePayments}
                  className="ds-button-primary"
                >
                  Auto-allocate open payments
                </button>
                <button
                  onClick={() => setActiveTab('bank-reconciliation')}
                  className="ds-button-outline"
                >
                  Open reconciliation queue
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="ds-actions mb-6" role="group" aria-label="Payment status">
            <button
              onClick={() => setPaymentTab('completed')}
              aria-pressed={paymentTab === 'completed'}
              className={paymentTab === 'completed' ? 'ds-button-secondary' : 'ds-button-ghost'}
            >
              Valid Payments
            </button>
            <button
              onClick={() => setPaymentTab('voided')}
              aria-pressed={paymentTab === 'voided'}
              className={paymentTab === 'voided' ? 'ds-button-secondary' : 'ds-button-ghost'}
            >
              Voided Transactions
            </button>
          </div>

          {/* Search and Action Bar */}
          <div className="ds-card mb-6">
            <div className="ds-toolbar">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by student name, ID, or reference..."
                  className="ds-input pl-10"
                  aria-label="Search payments by student name, ID, or reference"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="ds-actions">
                <button
                  onClick={() => setShowFilterModal(true)}
                  className={`${(classFilter !== 'ALL' || methodFilter !== 'ALL' || dateRange.start || dateRange.end)
                    ? 'ds-button-secondary'
                    : 'ds-button-outline'
                    }`}
                >
                  <Filter size={18} />
                  <span>Filter</span>
                  {(classFilter !== 'ALL' || methodFilter !== 'ALL' || dateRange.start || dateRange.end) && (
                    <span className="ds-badge ds-badge-info">
                      {[classFilter !== 'ALL', methodFilter !== 'ALL', dateRange.start || dateRange.end].filter(Boolean).length}
                    </span>
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
                    reconciliationStatus: p.isReconciled ? 'Reconciled' : 'Open',
                    allocationStatus: (p.unallocatedAmount || 0) > 0 ? `Open ${Number(p.unallocatedAmount || 0).toFixed(2)}` : 'Allocated',
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
                    { key: 'reconciliationStatus', header: 'Reconciliation' },
                    { key: 'allocationStatus', header: 'Allocation' },
                    { key: 'notes', header: 'Notes' },
                    { key: 'recordedBy', header: 'Recorded By' }
                  ]}
                  filename={`payments_export_${new Date().toISOString().split('T')[0]}`}
                />
              </div>
            </div>
          </div>

          {/* Payments Table */}
          <div className="ds-surface overflow-hidden">
            <div className="overflow-x-auto" role="region" aria-label="Payment transactions" tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Date</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Student</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Class</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Amount (ZMW)</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Method</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Transaction ID</th>
                    {paymentTab === 'voided' ? (
                      <>
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Void Reason</th>
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Voided By</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Allocation</th>
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Reconciliation</th>
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Notes</th>
                        <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Recorded By</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300">Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-slate-500 dark:text-gray-400">Loading payments...</td>
                    </tr>
                  ) : filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-slate-500 dark:text-gray-400">No payments found</td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300">
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800 dark:text-white">
                            {payment.student.firstName} {payment.student.lastName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-gray-400">
                            {payment.student.admissionNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300">
                          {payment.student.class?.name || 'No Class'}
                        </td>
                        <td className={`px-6 py-4 font-medium ${payment.status === 'VOIDED' ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-white'}`}>
                          {Number(payment.amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`ds-badge
                            ${payment.method === 'CASH' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' :
                              payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' :
                                'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'}`}>
                            {payment.method.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300 font-mono text-sm">
                          {payment.transactionId || '-'}
                        </td>
                        {paymentTab === 'voided' ? (
                          <>
                            <td className="px-6 py-4 text-red-600 dark:text-red-400 text-sm italic">
                              {payment.voidReason || 'No reason'}
                            </td>
                            <td className="px-6 py-4 text-slate-600 dark:text-gray-300">
                              {payment.voidedBy?.fullName || 'Unknown'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4">
                              <div className="text-sm">
                                <span className={`font-medium ${(payment.unallocatedAmount || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                  {(payment.unallocatedAmount || 0) > 0 ? `Open ZMW ${Number(payment.unallocatedAmount || 0).toLocaleString()}` : 'Allocated'}
                                </span>
                                <div className="text-xs text-slate-500 dark:text-gray-400">
                                  {payment.allocationCount || 0} fee item(s)
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm">
                                <span className={`ds-badge ${payment.isReconciled ? 'ds-badge-success' : 'ds-badge-warning'}`}>
                                  {payment.isReconciled ? 'Reconciled' : 'Open'}
                                </span>
                                <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                                  {payment.bankReference || 'No bank ref'}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-500 dark:text-gray-400 text-sm max-w-xs truncate">
                              {payment.notes || '-'}
                            </td>
                            <td className="px-6 py-4 text-slate-600 dark:text-gray-300">
                              {payment.recordedBy.fullName}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => generatePaymentReceipt(payment)}
                                  className="ds-button-secondary"
                                  title="Download Receipt"
                                >
                                  <FileText size={14} />
                                  Receipt
                                </button>
                                <button
                                  onClick={() => handleResendReceipt(payment.id)}
                                  disabled={resendingReceiptId === payment.id}
                                  className="ds-button-outline"
                                  title="Resend receipt to parent"
                                >
                                  <Send size={14} />
                                  {resendingReceiptId === payment.id ? 'Sending...' : 'Resend'}
                                </button>
                                <button
                                  onClick={() => handleVoidPayment(payment.id)}
                                  className="ds-button-destructive"
                                  title="Void this payment"
                                >
                                  <X size={14} />
                                  Void
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feeTemplates.map((template) => (
            <div key={template.id} className="ds-card">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">{template.name}</h3>
                  <span className="ds-badge ds-badge-neutral">
                    {getGradeLabel(template.applicableGrade)}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditClick(template)}
                    className="ds-button-ghost"
                    aria-label={`Edit ${template.name}`}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="ds-button-destructive"
                    aria-label={`Delete ${template.name}`}
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
                className="ds-button-outline w-full"
              >
                <Users size={18} />
                <span>Assign to Class</span>
              </button>
            </div>
          ))}

          {feeTemplates.length === 0 && (
            <div className="ds-surface ds-empty col-span-full">
              <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="ds-card w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="finance-filter-title">
              <div className="flex justify-between items-center mb-4">
                <h2 id="finance-filter-title" className="text-xl font-bold">Filter Payments</h2>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="ds-button-ghost"
                  aria-label="Close payment filters"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="finance-filter-class" className="ds-label mb-1">Class</label>
                  <select
                    id="finance-filter-class"
                    className="ds-select"
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
                  <label htmlFor="finance-filter-method" className="ds-label mb-1">Payment Method</label>
                  <select
                    id="finance-filter-method"
                    className="ds-select"
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
                  <p className="ds-label mb-1">Date Range</p>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <input
                      type="date"
                      className="ds-input flex-1"
                      aria-label="Payment date range start"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      className="ds-input flex-1"
                      aria-label="Payment date range end"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="ds-form-actions">
                <button
                  onClick={() => {
                    setClassFilter('ALL');
                    setMethodFilter('ALL');
                    setDateRange({ start: '', end: '' });
                  }}
                  className="ds-button-secondary"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="ds-button-primary"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="ds-card w-full max-w-2xl max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="finance-categories-title">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 id="finance-categories-title" className="text-xl font-bold">Fee Categories</h2>
                  <p className="text-sm text-slate-500 dark:text-gray-400">Create categories once, then reuse them across fee templates.</p>
                </div>
                <button
                  onClick={() => setShowFeeCategoryModal(false)}
                  className="ds-button-ghost"
                  aria-label="Close fee categories"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3">Existing Categories</h3>
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1" role="region" aria-label="Existing fee categories" tabIndex={0}>
                    {feeCategories.length === 0 ? (
                      <div className="ds-surface ds-empty">
                        No fee categories yet.
                      </div>
                    ) : (
                      feeCategories.map((category) => (
                        <div key={category.id} className="ds-surface p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-800 dark:text-white">{category.name}</p>
                              <p className="text-xs text-slate-500 dark:text-gray-400">Code: {category.code}</p>
                            </div>
                            <button
                              onClick={() => {
                                setNewFee((current) => ({ ...current, categoryId: category.id }));
                                setShowFeeCategoryModal(false);
                              }}
                              className="ds-button-secondary"
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

                <div className="ds-surface-muted p-4 h-fit">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3">Create New Category</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="finance-category-name" className="ds-label mb-1">Category Name</label>
                      <input
                        id="finance-category-name"
                        type="text"
                        value={feeCategoryForm.name}
                        onChange={(e) => setFeeCategoryForm({ ...feeCategoryForm, name: e.target.value })}
                        className="ds-input"
                        placeholder="e.g. Tuition"
                      />
                    </div>
                    <div>
                      <label htmlFor="finance-category-code" className="ds-label mb-1">Code</label>
                      <input
                        id="finance-category-code"
                        type="text"
                        value={feeCategoryForm.code}
                        onChange={(e) => setFeeCategoryForm({ ...feeCategoryForm, code: e.target.value.toUpperCase() })}
                        className="ds-input"
                        placeholder="e.g. TUITION"
                      />
                    </div>
                    <div>
                      <label htmlFor="finance-category-description" className="ds-label mb-1">Description</label>
                      <textarea
                        id="finance-category-description"
                        rows={3}
                        value={feeCategoryForm.description}
                        onChange={(e) => setFeeCategoryForm({ ...feeCategoryForm, description: e.target.value })}
                        className="ds-textarea"
                        placeholder="Optional description"
                      />
                    </div>
                    <button
                      onClick={handleCreateFeeCategory}
                      disabled={creatingFeeCategory}
                      className="ds-button-primary w-full"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="ds-card w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="finance-payment-title">
              <h2 id="finance-payment-title" className="text-xl font-bold mb-4">Record New Payment</h2>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div role="group" aria-labelledby="finance-payment-student-label">
                  <p id="finance-payment-student-label" className="ds-label mb-2">Find Student</p>
                  <StudentSelector
                    students={students}
                    classes={classes}
                    value={paymentForm.studentId}
                    onChange={(studentId) => setPaymentForm({ ...paymentForm, studentId })}
                  />
                </div>
                <div>
                  <label htmlFor="finance-payment-amount" className="ds-label mb-1">Amount (ZMW)</label>
                  <input
                    id="finance-payment-amount"
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="ds-input"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="finance-payment-method" className="ds-label mb-1">Payment Method</label>
                  <select
                    id="finance-payment-method"
                    className="ds-select"
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  >
                    <option value="CASH">Cash</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK_DEPOSIT">Bank Deposit</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="finance-payment-notes" className="ds-label mb-1">Notes</label>
                  <textarea
                    id="finance-payment-notes"
                    className="ds-textarea"
                    placeholder="Optional notes about this payment"
                    rows={2}
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  />
                </div>
                <div className="ds-form-actions">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="ds-button-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="ds-button-primary"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="ds-card w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="finance-template-title">
              <h2 id="finance-template-title" className="text-xl font-bold mb-4">{editingTemplate ? 'Edit Fee Template' : 'Create Fee Template'}</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="finance-template-name" className="ds-label mb-1">Fee Name</label>
                  <input
                    id="finance-template-name"
                    type="text"
                    className="ds-input"
                    placeholder="e.g. Term 1 Tuition"
                    value={newFee.name}
                    onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="finance-template-amount" className="ds-label mb-1">Amount (ZMW)</label>
                  <input
                    id="finance-template-amount"
                    type="number"
                    className="ds-input"
                    placeholder="0.00"
                    value={newFee.amount}
                    onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="finance-template-term" className="ds-label mb-1">Academic Term</label>
                  <select
                    id="finance-template-term"
                    className="ds-select"
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
                  <label htmlFor="finance-template-category" className="ds-label mb-1">Fee Category</label>
                  <select
                    id="finance-template-category"
                    className="ds-select"
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
                    className="ds-button-ghost mt-2"
                  >
                    + Create or review fee categories
                  </button>
                </div>
                <div>
                  <label htmlFor="finance-template-grade" className="ds-label mb-1">Applicable Grade</label>
                  <select
                    id="finance-template-grade"
                    className="ds-select"
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
              <div className="ds-form-actions">
                <button
                  onClick={() => setShowCreateFeeModal(false)}
                  className="ds-button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFee}
                  className="ds-button-primary"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="ds-card w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="finance-assign-title">
              <h2 id="finance-assign-title" className="text-xl font-bold mb-4">Assign Fee to Class</h2>
              <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
                This will assign the selected fee to all active students in the selected class and keep the class fee rule available for future student sync.
                Scholarship discounts will be applied automatically.
              </p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="finance-assign-class" className="ds-label mb-1">Select Class</label>
                  <select
                    id="finance-assign-class"
                    className="ds-select"
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
                  <label htmlFor="finance-assign-due-date" className="ds-label mb-1">
                    <span className="flex items-center gap-2">
                      <Calendar size={16} />
                      <span>Payment Due Date (Optional)</span>
                    </span>
                  </label>
                  <input
                    id="finance-assign-due-date"
                    type="date"
                    className="ds-input"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    Set a deadline for this fee payment
                  </p>
                </div>
              </div>
              <div className="ds-form-actions">
                <button
                  onClick={() => {
                    setShowAssignFeeModal(false);
                    setAssignDueDate('');
                  }}
                  className="ds-button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignFee}
                  className="ds-button-primary"
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
