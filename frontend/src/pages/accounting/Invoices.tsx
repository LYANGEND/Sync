import { useState, useEffect } from 'react';
import { Plus, Search, Send, DollarSign, FileText, X, XCircle, Eye, Layers, Download } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { invoiceApi, Invoice } from '../../services/accountingService';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  CANCELLED: 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300',
  CREDITED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

interface InvoiceSummary {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalInvoices: number;
  paidCount: number;
  overdueCount: number;
  draftCount: number;
  partiallyPaidAmount: number;
  partiallyPaidCount: number;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber?: string;
  status?: string;
  classId?: string;
  class?: { id?: string; name?: string };
}

interface TermOption {
  id: string;
  name: string;
  isCurrent?: boolean;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel?: number;
}

const emptyInvoiceItem = { description: '', quantity: '1', unitPrice: '', feeTemplateId: '' };

const getDefaultDueDate = () => {
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);
  return nextMonth.toISOString().split('T')[0];
};

const buildInvoicePdf = (invoice: Invoice) => {
  const doc = new jsPDF();
  const studentName = invoice.student ? `${invoice.student.firstName} ${invoice.student.lastName}` : 'Student';
  const schoolName = 'Sync School Management';
  const issuedOn = new Date(invoice.issueDate).toLocaleDateString();
  const dueOn = new Date(invoice.dueDate).toLocaleDateString();

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(schoolName, 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Invoice Document', 14, 26);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.invoiceNumber, 196, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Issued ${issuedOn}`, 196, 26, { align: 'right' });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Student: ${studentName}`, 14, 52);
  doc.text(`Admission No: ${invoice.student?.admissionNumber || 'N/A'}`, 14, 59);
  doc.text(`Class: ${invoice.student?.class?.name || 'N/A'}`, 14, 66);
  doc.text(`Due Date: ${dueOn}`, 140, 52);
  doc.text(`Status: ${invoice.status.replace(/_/g, ' ')}`, 140, 59);

  if (invoice.student?.guardianName || invoice.student?.guardianEmail || invoice.student?.guardianPhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const guardianLine = [
      invoice.student.guardianName,
      invoice.student.guardianEmail,
      invoice.student.guardianPhone,
    ].filter(Boolean).join(' • ');
    doc.text(`Guardian: ${guardianLine}`, 14, 74);
  }

  autoTable(doc, {
    startY: 84,
    head: [['Description', 'Qty', 'Unit Price', 'Amount']],
    body: (invoice.items || []).map(item => [
      item.description,
      `${item.quantity}`,
      `ZMW ${Number(item.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `ZMW ${Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    ]),
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: 255 },
    columnStyles: {
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 38 },
      3: { halign: 'right', cellWidth: 38 },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 120;
  const rightEdge = 196;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Subtotal: ${fmt(invoice.subtotal)}`, rightEdge, finalY + 10, { align: 'right' });
  if (Number(invoice.discount || 0) > 0) {
    doc.text(`Discount: -${fmt(invoice.discount)}`, rightEdge, finalY + 17, { align: 'right' });
  }
  if (Number(invoice.taxAmount || 0) > 0) {
    doc.text(`Tax: ${fmt(invoice.taxAmount)}`, rightEdge, finalY + 24, { align: 'right' });
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${fmt(invoice.totalAmount)}`, rightEdge, finalY + 34, { align: 'right' });
  doc.setTextColor(22, 163, 74);
  doc.text(`Paid: ${fmt(invoice.amountPaid)}`, rightEdge, finalY + 41, { align: 'right' });
  doc.setTextColor(220, 38, 38);
  doc.text(`Balance Due: ${fmt(invoice.balanceDue)}`, rightEdge, finalY + 48, { align: 'right' });
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');

  if (invoice.notes) {
    doc.text('Notes:', 14, finalY + 20);
    const noteLines = doc.splitTextToSize(invoice.notes, 120);
    doc.text(noteLines, 14, finalY + 27);
  }

  doc.setFontSize(9);
  doc.text('Generated from Sync School Management System.', 14, 285);
  doc.save(`${invoice.invoiceNumber}.pdf`);
};

const Invoices = ({ embedded = false }: { embedded?: boolean }) => {
  const { confirm } = useAppDialog();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [creditNoteForm, setCreditNoteForm] = useState({ invoiceId: '', amount: '', reason: '' });
  const [showBulkGenerateModal, setShowBulkGenerateModal] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [createClassFilter, setCreateClassFilter] = useState('');
  const [bulkForm, setBulkForm] = useState({ termId: '', classId: '' });

  // Create form
  const [createForm, setCreateForm] = useState({
    studentId: '', termId: '', dueDate: getDefaultDueDate(), discount: '0', notes: '',
    items: [{ ...emptyInvoiceItem }],
  });

  useEffect(() => {
    loadData();
    loadReferenceData();
  }, []);

  useEffect(() => {
    if (!createForm.termId && terms.length > 0) {
      const currentTerm = terms.find(term => term.isCurrent) || terms[0];
      if (currentTerm) {
        setCreateForm(prev => ({ ...prev, termId: currentTerm.id }));
      }
    }

    if (!bulkForm.termId && terms.length > 0) {
      const currentTerm = terms.find(term => term.isCurrent) || terms[0];
      if (currentTerm) {
        setBulkForm(prev => ({ ...prev, termId: currentTerm.id }));
      }
    }
  }, [terms, createForm.termId, bulkForm.termId]);

  useEffect(() => {
    if (!createClassFilter) return;

    const currentStudentMatchesClass = students.some(student => student.id === createForm.studentId && student.classId === createClassFilter);
    if (!currentStudentMatchesClass) {
      setCreateForm(prev => ({ ...prev, studentId: '' }));
    }
  }, [createClassFilter, createForm.studentId, students]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, sumRes] = await Promise.all([
        invoiceApi.getAll(),
        invoiceApi.getSummary(),
      ]);
      setInvoices(invRes.data.invoices || invRes.data || []);
      setSummary(sumRes.data);
    } catch (err: any) {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const loadReferenceData = async () => {
    try {
      const [studentRes, termRes, classRes] = await Promise.all([
        api.get('/students'),
        api.get('/academic-terms'),
        api.get('/classes'),
      ]);

      setStudents((studentRes.data || []).filter((student: StudentOption) => student.status !== 'ARCHIVED'));
      setTerms((termRes.data || []).map((term: any) => ({
        id: term.id,
        name: term.name || term.termName || `Term ${term.id}`,
        isCurrent: term.isCurrent,
      })));
      setClasses((classRes.data || []).map((cls: any) => ({
        id: cls.id,
        name: cls.name,
        gradeLevel: cls.gradeLevel,
      })));
    } catch (error) {
      toast.error('Failed to load invoice setup data');
    }
  };

  const handleViewDetail = async (id: string) => {
    try {
      const res = await invoiceApi.getById(id);
      setSelectedInvoice(res.data);
      setShowDetailModal(true);
    } catch {
      toast.error('Failed to load invoice');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await invoiceApi.send(id);
      toast.success('Invoice sent and delivery queued');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send');
    }
  };

  const handleCancel = async (id: string) => {
    if (!(await confirm({
      title: 'Cancel invoice?',
      message: 'Cancel this invoice?',
      confirmText: 'Cancel invoice',
    }))) return;
    try {
      await invoiceApi.cancel(id);
      toast.success('Invoice cancelled');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (amount > Number(selectedInvoice.balanceDue || 0)) {
      toast.error('Payment cannot exceed the balance due');
      return;
    }
    try {
      await invoiceApi.recordPayment(selectedInvoice.id, amount);
      toast.success('Payment recorded');
      setShowPaymentModal(false);
      setPaymentAmount('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    }
  };

  const handleCreateInvoice = async () => {
    if (!createForm.studentId || !createForm.termId || !createForm.dueDate) {
      toast.error('Student, term, and due date are required');
      return;
    }

    if (createForm.items.some(item => !item.description || !item.unitPrice || Number(item.quantity) <= 0)) {
      toast.error('Complete all line items before creating the invoice');
      return;
    }

    try {
      const payload = {
        studentId: createForm.studentId,
        termId: createForm.termId,
        dueDate: createForm.dueDate,
        notes: createForm.notes,
        discount: parseFloat(createForm.discount) || 0,
        taxAmount: 0,
        items: createForm.items.map(i => ({
          description: i.description,
          quantity: parseInt(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
          feeTemplateId: i.feeTemplateId || undefined,
        })),
      };
      await invoiceApi.create(payload);
      toast.success('Invoice created');
      setShowCreateModal(false);
      setCreateClassFilter('');
      setCreateForm({ studentId: '', termId: terms.find(term => term.isCurrent)?.id || '', dueDate: getDefaultDueDate(), discount: '0', notes: '', items: [{ ...emptyInvoiceItem }] });
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create invoice');
    }
  };

  const handleGenerateBulkInvoices = async () => {
    if (!bulkForm.termId) {
      toast.error('Select an academic term first');
      return;
    }

    try {
      const res = await invoiceApi.generateBulk(bulkForm.termId, bulkForm.classId || undefined);
      toast.success(res.data?.message || 'Invoices generated');
      setShowBulkGenerateModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate invoices');
    }
  };

  const handleCreateCreditNote = async () => {
    try {
      await invoiceApi.createCreditNote({
        invoiceId: creditNoteForm.invoiceId,
        amount: parseFloat(creditNoteForm.amount),
        reason: creditNoteForm.reason,
      });
      toast.success('Credit note created');
      setShowCreditNoteModal(false);
      setCreditNoteForm({ invoiceId: '', amount: '', reason: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create credit note');
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      const fullInvoice = invoice.items?.length && invoice.student?.guardianEmail !== undefined
        ? invoice
        : (await invoiceApi.getById(invoice.id)).data;
      buildInvoicePdf(fullInvoice);
    } catch (error) {
      toast.error('Failed to download invoice PDF');
    }
  };

  const addItem = () => {
    setCreateForm({
      ...createForm,
      items: [...createForm.items, { ...emptyInvoiceItem }],
    });
  };

  const removeItem = (idx: number) => {
    setCreateForm({
      ...createForm,
      items: createForm.items.filter((_, i) => i !== idx),
    });
  };

  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...createForm.items];
    (items[idx] as any)[field] = value;
    setCreateForm({ ...createForm, items });
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchSearch = !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (inv.student && `${inv.student.firstName} ${inv.student.lastName}`.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = !statusFilter || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredStudents = students.filter(student => {
    if (!createClassFilter) return true;
    return student.classId === createClassFilter || student.class?.id === createClassFilter;
  });

  const summaryCards = summary ? [
    { label: 'Total Invoiced', value: summary.totalInvoiced, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Total Collected', value: summary.totalCollected, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Outstanding', value: summary.totalOutstanding, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    { label: 'Overdue', value: summary.totalOverdue, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
  ] : [];

  const fmt = (n: number | string | null | undefined) => `K${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {!embedded ? (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Management</h1>
            <p className="text-gray-500 dark:text-gray-400">Create, send, and track student invoices</p>
          </div>
        ) : <div />}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowBulkGenerateModal(true)}
            className="flex items-center space-x-2 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-50 text-sm dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/20"
          >
            <Layers size={16} /><span>Generate Invoices</span>
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
            <Plus size={16} /><span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {summaryCards.map(stat => (
            <div key={stat.label} className={`${stat.bg} p-4 rounded-lg`}>
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{fmt(stat.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" placeholder="Search by invoice # or student..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white">
          <option value="">All Statuses</option>
          {Object.keys(statusColors).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Invoice #</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Student</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Issue Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Due Date</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Total</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Paid</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Balance</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Status</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredInvoices.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No invoices found</td></tr>
            ) : filteredInvoices.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                <td className="px-4 py-3">
                  {inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—'}
                  {inv.student?.admissionNumber && <span className="block text-xs text-gray-400">{inv.student.admissionNumber}</span>}
                </td>
                <td className="px-4 py-3">{new Date(inv.issueDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">{new Date(inv.dueDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(inv.totalAmount)}</td>
                <td className="px-4 py-3 text-right text-green-600">{fmt(inv.amountPaid)}</td>
                <td className="px-4 py-3 text-right text-red-600 font-medium">{fmt(inv.balanceDue)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[inv.status] || ''}`}>
                    {inv.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center space-x-1">
                    <button onClick={() => handleViewDetail(inv.id)} className="p-1 text-gray-600 hover:bg-gray-50 rounded" title="View"><Eye size={16} /></button>
                    <button onClick={() => handleDownloadInvoice(inv)} className="p-1 text-slate-600 hover:bg-slate-50 rounded" title="Download PDF"><Download size={16} /></button>
                    {inv.status === 'DRAFT' && (
                      <button onClick={() => handleSend(inv.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Send"><Send size={16} /></button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE') && (
                      <button onClick={() => { setSelectedInvoice(inv); setPaymentAmount(''); setShowPaymentModal(true); }} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Record Payment"><DollarSign size={16} /></button>
                    )}
                    {inv.status !== 'CANCELLED' && inv.status !== 'CREDITED' && (
                      <button onClick={() => { setCreditNoteForm({ invoiceId: inv.id, amount: '', reason: '' }); setShowCreditNoteModal(true); }}
                        className="p-1 text-purple-600 hover:bg-purple-50 rounded" title="Credit Note"><FileText size={16} /></button>
                    )}
                    {inv.status === 'DRAFT' && (
                      <button onClick={() => handleCancel(inv.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Cancel"><XCircle size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ======== INVOICE DETAIL MODAL ======== */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Invoice {selectedInvoice.invoiceNumber}</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Student</p>
                  <p className="font-medium dark:text-white">{selectedInvoice.student ? `${selectedInvoice.student.firstName} ${selectedInvoice.student.lastName}` : '—'}</p>
                  {selectedInvoice.student?.guardianName && <p className="text-xs text-gray-500 mt-1">Guardian: {selectedInvoice.student.guardianName}</p>}
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[selectedInvoice.status] || ''}`}>
                    {selectedInvoice.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <p className="text-gray-500">Issue Date</p>
                  <p className="font-medium dark:text-white">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Due Date</p>
                  <p className="font-medium dark:text-white">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => handleDownloadInvoice(selectedInvoice)}
                  className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  <Download size={16} /> Download PDF
                </button>
              </div>

              <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Item</th>
                      <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Qty</th>
                      <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Price</th>
                      <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {(selectedInvoice.items || []).map((item, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 dark:text-gray-200">{item.description}</td>
                        <td className="px-4 py-2 text-right dark:text-gray-200">{item.quantity}</td>
                        <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(item.unitPrice)}</td>
                        <td className="px-4 py-2 text-right dark:text-gray-200">{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right font-medium dark:text-gray-200">Subtotal</td>
                      <td className="px-4 py-2 text-right font-medium dark:text-gray-200">{fmt(selectedInvoice.subtotal)}</td>
                    </tr>
                    {selectedInvoice.discount > 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right text-green-600">Discount</td>
                        <td className="px-4 py-2 text-right text-green-600">-{fmt(selectedInvoice.discount)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right font-bold dark:text-white">Total</td>
                      <td className="px-4 py-2 text-right font-bold dark:text-white">{fmt(selectedInvoice.totalAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-green-600 font-medium">Paid</td>
                      <td className="px-4 py-2 text-right text-green-600 font-medium">{fmt(selectedInvoice.amountPaid)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-red-600 font-bold">Balance Due</td>
                      <td className="px-4 py-2 text-right text-red-600 font-bold">{fmt(selectedInvoice.balanceDue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedInvoice.creditNotes && selectedInvoice.creditNotes.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Credit Notes</h4>
                  {selectedInvoice.creditNotes.map(cn => (
                    <div key={cn.id} className="flex justify-between items-center bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg mb-2">
                      <div>
                        <span className="font-mono text-sm text-purple-600">{cn.creditNoteNumber}</span>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{cn.reason}</p>
                      </div>
                      <span className="font-medium text-purple-600">{fmt(cn.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======== CREATE INVOICE MODAL ======== */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Create Invoice</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class Filter</label>
                  <select
                    value={createClassFilter}
                    onChange={e => setCreateClassFilter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="">All Classes</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.gradeLevel !== undefined ? `Grade ${cls.gradeLevel} • ` : ''}{cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Academic Term</label>
                  <select
                    value={createForm.termId}
                    onChange={e => setCreateForm({ ...createForm, termId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="">Select term</option>
                    {terms.map(term => (
                      <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? ' • Current' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Student</label>
                <select
                  value={createForm.studentId}
                  onChange={e => setCreateForm({ ...createForm, studentId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">Select student</option>
                  {filteredStudents.map(student => (
                    <option key={student.id} value={student.id}>
                      {student.firstName} {student.lastName} • {student.admissionNumber || 'No admission #'}{student.class?.name ? ` • ${student.class.name}` : ''}
                    </option>
                  ))}
                </select>
                {filteredStudents.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">No students match the selected class.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                  <input type="date" value={createForm.dueDate} onChange={e => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount (ZMW)</label>
                  <input type="number" step="0.01" value={createForm.discount} onChange={e => setCreateForm({ ...createForm, discount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Line Items</label>
                  <button onClick={addItem} className="text-sm text-blue-600 hover:underline">+ Add Item</button>
                </div>
                {createForm.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Description" />
                    <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      className="w-20 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Qty" />
                    <input type="number" step="0.01" value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                      className="w-32 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Price" />
                    {createForm.items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateInvoice}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== BULK GENERATE MODAL ======== */}
      {showBulkGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Generate Invoices</h2>
              <button onClick={() => setShowBulkGenerateModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Academic Term</label>
                <select
                  value={bulkForm.termId}
                  onChange={e => setBulkForm({ ...bulkForm, termId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">Select term</option>
                  {terms.map(term => (
                    <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? ' • Current' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class</label>
                <select
                  value={bulkForm.classId}
                  onChange={e => setBulkForm({ ...bulkForm, classId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">All active students</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.gradeLevel !== undefined ? `Grade ${cls.gradeLevel} • ` : ''}{cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-700 dark:text-blue-300">
                Generates draft invoices for students with fee structures in the selected term and skips existing active invoices.
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowBulkGenerateModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleGenerateBulkInvoices}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== PAYMENT MODAL ======== */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Record Payment</h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-sm">
                <p className="text-gray-500">Invoice: <span className="font-mono text-blue-600">{selectedInvoice.invoiceNumber}</span></p>
                <p className="text-gray-500">Balance Due: <span className="font-bold text-red-600">{fmt(selectedInvoice.balanceDue)}</span></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Amount (ZMW)</label>
                <input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  max={selectedInvoice.balanceDue}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0.00" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleRecordPayment}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Record Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== CREDIT NOTE MODAL ======== */}
      {showCreditNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold dark:text-white">Issue Credit Note</h2>
              <button onClick={() => setShowCreditNoteModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (ZMW)</label>
                <input type="number" step="0.01" value={creditNoteForm.amount} onChange={e => setCreditNoteForm({ ...creditNoteForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                <textarea value={creditNoteForm.reason} onChange={e => setCreditNoteForm({ ...creditNoteForm, reason: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t dark:border-gray-700">
              <button onClick={() => setShowCreditNoteModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleCreateCreditNote}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Issue Credit Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
