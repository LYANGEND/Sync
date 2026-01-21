import React, { useState, useEffect } from 'react';
import FinanceReports from './FinanceReports';

import { Plus, Search, Filter, DollarSign, CreditCard, Calendar, BookOpen, Users, Edit2, Trash2, Upload, X, Bell, Send, FileText, TrendingUp, Smartphone } from 'lucide-react';
import api from '../../utils/api';
import Scholarships from './Scholarships';
import BulkImportModal from '../../components/BulkImportModal';
import ExportDropdown from '../../components/ExportDropdown';
import StudentSelector from '../../components/StudentSelector';
import MobileMoneyPayment from '../../components/MobileMoneyPayment';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

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
  applicableGrade: number;
  academicTerm: {
    name: string;
  };
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

const Finance = () => {
  const [activeTab, setActiveTab] = useState<'payments' | 'mobile-money' | 'fees' | 'scholarships' | 'reminders' | 'reports'>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<{ id: string; firstName: string; lastName: string; admissionNumber: string; guardianPhone?: string; class?: { id: string; name: string } }[]>([]);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateFeeModal, setShowCreateFeeModal] = useState(false);
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

  // Form states
  const [newFee, setNewFee] = useState({ name: '', amount: '', academicTermId: '', applicableGrade: '' });
  const [editingTemplate, setEditingTemplate] = useState<FeeTemplate | null>(null);
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

  // Fee Reminders state
  const [debtors, setDebtors] = useState<any[]>([]);
  const [loadingDebtors, setLoadingDebtors] = useState(false);
  const [selectedDebtors, setSelectedDebtors] = useState<string[]>([]);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    fetchPayments();
    fetchFeeTemplates();
    fetchAcademicTerms();
    fetchClasses();
    fetchStudents();
    fetchStats();
  }, []);

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
      setNewFee({ name: '', amount: '', academicTermId: '', applicableGrade: '' });
      fetchFeeTemplates();
    } catch (error) {
      console.error('Error saving fee template:', error);
      alert('Failed to save fee template');
    }
  };

  const handleEditClick = (template: FeeTemplate) => {
    setEditingTemplate(template);
    setNewFee({
      name: template.name,
      amount: template.amount.toString(),
      academicTermId: template.academicTermId,
      applicableGrade: template.applicableGrade.toString(),
    });
    setShowCreateFeeModal(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this fee template?')) return;
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

        if (window.confirm(confirmMessage)) {
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
    const reason = window.prompt('Please provide a reason for voiding this payment:');
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) {
        alert('Please provide a reason with at least 5 characters');
      }
      return;
    }

    try {
      await api.post(`/payments/${paymentId}/void`, { reason });
      alert('Payment voided successfully');
      fetchPayments();
    } catch (error: any) {
      console.error('Error voiding payment:', error);
      alert(error.response?.data?.message || 'Failed to void payment');
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
  const sendFeeReminders = async (studentIds?: string[], isOverdue = false) => {
    setSendingReminders(true);
    try {
      const response = await api.post('/fee-reminders/send', {
        studentIds: studentIds || selectedDebtors,
        isOverdue
      });
      alert(`${response.data.message}\n\nEmails sent: ${response.data.results.emailsSent}\nSMS sent: ${response.data.results.smsSent}`);
      setSelectedDebtors([]);
    } catch (error) {
      console.error('Error sending reminders:', error);
      alert('Failed to send reminders');
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

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Finance & Payments</h1>
          <p className="text-slate-500 dark:text-gray-400">Manage school fees and transactions</p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'fees' && (
            <>
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
                  setNewFee({ name: '', amount: '', academicTermId: '', applicableGrade: '' });
                  setShowCreateFeeModal(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                <span>Create Fee Template</span>
              </button>
            </>
          )}
          {activeTab === 'payments' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Record Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg w-full md:w-fit mb-6 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'payments'
            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
        >
          Payments
        </button>
        <button
          onClick={() => setActiveTab('mobile-money')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'mobile-money'
            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
        >
          <Smartphone size={16} />
          Mobile Money
        </button>
        <button
          onClick={() => setActiveTab('fees')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'fees'
            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
        >
          Fee Structures
        </button>
        <button
          onClick={() => setActiveTab('scholarships')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'scholarships'
            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
        >
          Scholarships
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'reports'
            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
        >
          <TrendingUp size={16} />
          Reports
        </button>
        <button
          onClick={() => {
            setActiveTab('reminders');
            fetchDebtors();
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'reminders'
            ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
        >
          <Bell size={16} />
          Reminders
        </button>
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
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Send size={18} />
                  Send Reminder ({selectedDebtors.length})
                </button>
              )}
              <button
                onClick={() => sendFeeReminders(debtors.map(d => d.id), true)}
                disabled={sendingReminders || debtors.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                <Bell size={18} />
                Send to All Overdue
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
                      <tr key={debtor.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${selectedDebtors.includes(debtor.id) ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}>
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
      ) : activeTab === 'payments' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                  <DollarSign size={24} />
                </div>
                <span className="text-sm text-slate-500 dark:text-gray-400">Total Revenue</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">ZMW {stats.totalRevenue.toLocaleString()}</h3>
              <p className="text-sm text-green-600 mt-1">All time revenue</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                  <CreditCard size={24} />
                </div>
                <span className="text-sm text-slate-500 dark:text-gray-400">Transactions</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalTransactions}</h3>
              <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">Total transactions</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                  <Calendar size={24} />
                </div>
                <span className="text-sm text-slate-500 dark:text-gray-400">Pending Fees</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white">ZMW {stats.pendingFees.toLocaleString()}</h3>
              <p className="text-sm text-red-500 mt-1">{stats.overdueStudentsCount} students overdue</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg mb-6 w-fit">
            <button
              onClick={() => setPaymentTab('completed')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${paymentTab === 'completed' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                }`}
            >
              Valid Payments
            </button>
            <button
              onClick={() => setPaymentTab('voided')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${paymentTab === 'voided' ? 'bg-white dark:bg-slate-800 text-red-600 shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                }`}
            >
              Voided Transactions
            </button>
          </div>

          {/* Search and Action Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
            <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by student name, ID, or reference..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowFilterModal(true)}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors border ${(classFilter !== 'ALL' || methodFilter !== 'ALL' || dateRange.start || dateRange.end)
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <Filter size={18} />
                  <span>Filter</span>
                  {(classFilter !== 'ALL' || methodFilter !== 'ALL' || dateRange.start || dateRange.end) && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
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
                    { key: 'notes', header: 'Notes' },
                    { key: 'recordedBy', header: 'Recorded By' }
                  ]}
                  filename={`payments_export_${new Date().toISOString().split('T')[0]}`}
                />
              </div>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Date</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Student</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Class</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Amount (ZMW)</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Method</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Transaction ID</th>
                    {paymentTab === 'voided' ? (
                      <>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Void Reason</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Voided By</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Notes</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Recorded By</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300 text-right">Actions</th>
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
                      <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
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
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
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
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                  title="Download Receipt"
                                >
                                  <FileText size={14} />
                                  Receipt
                                </button>
                                <button
                                  onClick={() => handleVoidPayment(payment.id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
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
                className="w-full py-2 px-4 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
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
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
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
                  className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Apply Filters
                </button>
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
                    className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                  className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFee}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                This will assign the selected fee to all active students in the selected class.
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
                  className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignFee}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
