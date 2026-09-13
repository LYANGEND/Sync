import { useState, useEffect } from 'react';
import { Plus, Search, Send, DollarSign, FileText, X, XCircle, Eye, Layers, Download } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { invoiceApi, Invoice } from '../../services/accountingService';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const statusColors: Record<string, string> = {
  DRAFT: 'ds-badge-neutral',
  SENT: 'ds-badge-info',
  PARTIALLY_PAID: 'ds-badge-warning',
  PAID: 'ds-badge-success',
  OVERDUE: 'ds-badge-error',
  CANCELLED: 'ds-badge-neutral',
  CREDITED: 'ds-badge-info',
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
    { label: 'Total Invoiced', value: summary.totalInvoiced, color: 'text-[var(--text-primary)]' },
    { label: 'Total Collected', value: summary.totalCollected, color: 'text-green-700 dark:text-green-300' },
    { label: 'Outstanding', value: summary.totalOutstanding, color: 'text-amber-800 dark:text-amber-200' },
    { label: 'Overdue', value: summary.totalOverdue, color: 'text-red-700 dark:text-red-300' },
  ] : [];

  const fmt = (n: number | string | null | undefined) => `K${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="ds-page"><div className="ds-surface flex items-center justify-center h-64" role="status"><span className="ds-helper">Loading invoices…</span></div></div>;
  }

  return (
    <div className="ds-page">
      <div className="ds-page-header">
        {!embedded ? (
          <div className="min-w-0">
            <h1 className="ds-page-title">Invoice Management</h1>
            <p className="ds-page-subtitle">Create, send, and track student invoices</p>
          </div>
        ) : <div />}
        <div className="ds-actions">
          <button
            onClick={() => setShowBulkGenerateModal(true)}
            className="ds-button-outline"
          >
            <Layers size={16} aria-hidden="true" /><span>Generate Invoices</span>
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="ds-button-primary">
            <Plus size={16} aria-hidden="true" /><span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map(stat => (
            <div key={stat.label} className="ds-card">
              <p className="ds-helper">{stat.label}</p>
              <p className={`text-2xl font-bold break-words ${stat.color}`}>{fmt(stat.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="ds-surface ds-toolbar p-4">
        <div className="relative w-full sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} aria-hidden="true" />
          <input type="text" aria-label="Search invoices by invoice number or student" placeholder="Search by invoice # or student..." value={search} onChange={e => setSearch(e.target.value)}
            className="ds-input pl-10" />
        </div>
        <select aria-label="Filter invoices by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="ds-select w-full sm:w-auto">
          <option value="">All Statuses</option>
          {Object.keys(statusColors).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="ds-table-container" role="region" aria-label="Invoices" tabIndex={0}>
        <table className="ds-table">
          <thead>
            <tr>
              <th scope="col">Invoice #</th>
              <th scope="col">Student</th>
              <th scope="col">Issue Date</th>
              <th scope="col">Due Date</th>
              <th scope="col" className="text-right">Total</th>
              <th scope="col" className="text-right">Paid</th>
              <th scope="col" className="text-right">Balance</th>
              <th scope="col" className="text-center">Status</th>
              <th scope="col" className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr><td colSpan={9}><div className="ds-empty">No invoices found</div></td></tr>
            ) : filteredInvoices.map(inv => (
              <tr key={inv.id}>
                <td className="font-mono">{inv.invoiceNumber}</td>
                <td>
                  {inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—'}
                  {inv.student?.admissionNumber && <span className="ds-helper block">{inv.student.admissionNumber}</span>}
                </td>
                <td>{new Date(inv.issueDate).toLocaleDateString()}</td>
                <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                <td className="text-right font-medium">{fmt(inv.totalAmount)}</td>
                <td className="text-right text-green-700 dark:text-green-300">{fmt(inv.amountPaid)}</td>
                <td className="text-right text-red-700 dark:text-red-300 font-medium">{fmt(inv.balanceDue)}</td>
                <td className="text-center">
                  <span className={`ds-badge ${statusColors[inv.status] || 'ds-badge-neutral'}`}>
                    {inv.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <div className="ds-actions flex-nowrap justify-center">
                    <button onClick={() => handleViewDetail(inv.id)} className="ds-button-ghost" aria-label={`View invoice ${inv.invoiceNumber}`} title="View"><Eye size={16} aria-hidden="true" /></button>
                    <button onClick={() => handleDownloadInvoice(inv)} className="ds-button-ghost" aria-label={`Download PDF for invoice ${inv.invoiceNumber}`} title="Download PDF"><Download size={16} aria-hidden="true" /></button>
                    {inv.status === 'DRAFT' && (
                      <button onClick={() => handleSend(inv.id)} className="ds-button-ghost" aria-label={`Send invoice ${inv.invoiceNumber}`} title="Send"><Send size={16} aria-hidden="true" /></button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID' || inv.status === 'OVERDUE') && (
                      <button onClick={() => { setSelectedInvoice(inv); setPaymentAmount(''); setShowPaymentModal(true); }} className="ds-button-ghost" aria-label={`Record payment for invoice ${inv.invoiceNumber}`} title="Record Payment"><DollarSign size={16} aria-hidden="true" /></button>
                    )}
                    {inv.status !== 'CANCELLED' && inv.status !== 'CREDITED' && (
                      <button onClick={() => { setCreditNoteForm({ invoiceId: inv.id, amount: '', reason: '' }); setShowCreditNoteModal(true); }}
                        className="ds-button-ghost" aria-label={`Issue credit note for invoice ${inv.invoiceNumber}`} title="Credit Note"><FileText size={16} aria-hidden="true" /></button>
                    )}
                    {inv.status === 'DRAFT' && (
                      <button onClick={() => handleCancel(inv.id)} className="ds-button-destructive" aria-label={`Cancel invoice ${inv.invoiceNumber}`} title="Cancel"><XCircle size={16} aria-hidden="true" /></button>
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
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-2xl" role="dialog" aria-modal="true" aria-label={`Invoice ${selectedInvoice.invoiceNumber}`}>
            <div className="ds-modal-header">
              <h2>Invoice {selectedInvoice.invoiceNumber}</h2>
              <button onClick={() => setShowDetailModal(false)} className="ds-button-ghost" aria-label="Close invoice details"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="ds-helper">Student</p>
                  <p className="font-medium">{selectedInvoice.student ? `${selectedInvoice.student.firstName} ${selectedInvoice.student.lastName}` : '—'}</p>
                  {selectedInvoice.student?.guardianName && <p className="ds-helper mt-1">Guardian: {selectedInvoice.student.guardianName}</p>}
                </div>
                <div>
                  <p className="ds-helper">Status</p>
                  <span className={`ds-badge ${statusColors[selectedInvoice.status] || 'ds-badge-neutral'}`}>
                    {selectedInvoice.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <p className="ds-helper">Issue Date</p>
                  <p className="font-medium">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="ds-helper">Due Date</p>
                  <p className="font-medium">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => handleDownloadInvoice(selectedInvoice)}
                  className="ds-button-outline"
                >
                  <Download size={16} aria-hidden="true" /> Download PDF
                </button>
              </div>

              <div className="ds-table-container" role="region" aria-label={`Line items and totals for invoice ${selectedInvoice.invoiceNumber}`} tabIndex={0}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col" className="text-right">Qty</th>
                      <th scope="col" className="text-right">Price</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedInvoice.items || []).map((item, i) => (
                      <tr key={i}>
                        <td>{item.description}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right">{fmt(item.unitPrice)}</td>
                        <td className="text-right">{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--surface-muted)]">
                    <tr>
                      <td colSpan={3} className="text-right font-medium">Subtotal</td>
                      <td className="text-right font-medium">{fmt(selectedInvoice.subtotal)}</td>
                    </tr>
                    {selectedInvoice.discount > 0 && (
                      <tr>
                        <td colSpan={3} className="text-right text-green-700 dark:text-green-300">Discount</td>
                        <td className="text-right text-green-700 dark:text-green-300">-{fmt(selectedInvoice.discount)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3} className="text-right font-bold">Total</td>
                      <td className="text-right font-bold">{fmt(selectedInvoice.totalAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="text-right text-green-700 dark:text-green-300 font-medium">Paid</td>
                      <td className="text-right text-green-700 dark:text-green-300 font-medium">{fmt(selectedInvoice.amountPaid)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="text-right text-red-700 dark:text-red-300 font-bold">Balance Due</td>
                      <td className="text-right text-red-700 dark:text-red-300 font-bold">{fmt(selectedInvoice.balanceDue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedInvoice.creditNotes && selectedInvoice.creditNotes.length > 0 && (
                <div>
                  <h3 className="mb-2">Credit Notes</h3>
                  {selectedInvoice.creditNotes.map(cn => (
                    <div key={cn.id} className="ds-surface-muted flex flex-wrap justify-between items-center gap-3 p-4 mb-2">
                      <div className="min-w-0 break-words">
                        <span className="font-mono text-sm text-purple-700 dark:text-purple-300">{cn.creditNoteNumber}</span>
                        <p className="ds-helper">{cn.reason}</p>
                      </div>
                      <span className="font-medium text-purple-700 dark:text-purple-300">{fmt(cn.amount)}</span>
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
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="Create Invoice">
            <div className="ds-modal-header">
              <h2>Create Invoice</h2>
              <button onClick={() => setShowCreateModal(false)} className="ds-button-ghost" aria-label="Close create invoice"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="ds-field">
                  <label htmlFor="invoice-create-class" className="ds-label">Class Filter</label>
                  <select
                    id="invoice-create-class"
                    value={createClassFilter}
                    onChange={e => setCreateClassFilter(e.target.value)}
                    className="ds-select"
                  >
                    <option value="">All Classes</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.gradeLevel !== undefined ? `Grade ${cls.gradeLevel} • ` : ''}{cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ds-field">
                  <label htmlFor="invoice-create-term" className="ds-label">Academic Term</label>
                  <select
                    id="invoice-create-term"
                    value={createForm.termId}
                    onChange={e => setCreateForm({ ...createForm, termId: e.target.value })}
                    className="ds-select"
                  >
                    <option value="">Select term</option>
                    {terms.map(term => (
                      <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? ' • Current' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="ds-field">
                <label htmlFor="invoice-create-student" className="ds-label">Student</label>
                <select
                  id="invoice-create-student"
                  value={createForm.studentId}
                  onChange={e => setCreateForm({ ...createForm, studentId: e.target.value })}
                  className="ds-select"
                >
                  <option value="">Select student</option>
                  {filteredStudents.map(student => (
                    <option key={student.id} value={student.id}>
                      {student.firstName} {student.lastName} • {student.admissionNumber || 'No admission #'}{student.class?.name ? ` • ${student.class.name}` : ''}
                    </option>
                  ))}
                </select>
                {filteredStudents.length === 0 && (
                  <p className="ds-helper">No students match the selected class.</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="ds-field">
                  <label htmlFor="invoice-create-due-date" className="ds-label">Due Date</label>
                  <input id="invoice-create-due-date" type="date" value={createForm.dueDate} onChange={e => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="ds-input" />
                </div>
                <div className="ds-field">
                  <label htmlFor="invoice-create-discount" className="ds-label">Discount (ZMW)</label>
                  <input id="invoice-create-discount" type="number" step="0.01" value={createForm.discount} onChange={e => setCreateForm({ ...createForm, discount: e.target.value })}
                    className="ds-input" />
                </div>
              </div>

              <div className="ds-section">
                <div className="ds-actions justify-between">
                  <h3>Line Items</h3>
                  <button onClick={addItem} className="ds-button-secondary">+ Add Item</button>
                </div>
                {createForm.items.map((item, idx) => (
                  <div key={idx} className="ds-surface-muted flex flex-wrap sm:flex-nowrap gap-2 p-4">
                    <input type="text" aria-label={`Line item ${idx + 1} description`} value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                      className="ds-input w-full sm:flex-1" placeholder="Description" />
                    <input type="number" aria-label={`Line item ${idx + 1} quantity`} value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      className="ds-input w-20" placeholder="Qty" />
                    <input type="number" step="0.01" aria-label={`Line item ${idx + 1} unit price (ZMW)`} value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                      className="ds-input w-32" placeholder="Price" />
                    {createForm.items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="ds-button-destructive" aria-label={`Remove line item ${idx + 1}`}><X size={16} aria-hidden="true" /></button>
                    )}
                  </div>
                ))}
              </div>

              <div className="ds-field">
                <label htmlFor="invoice-create-notes" className="ds-label">Notes</label>
                <textarea id="invoice-create-notes" value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} rows={2}
                  className="ds-textarea" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowCreateModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleCreateInvoice}
                className="ds-button-primary">Create Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== BULK GENERATE MODAL ======== */}
      {showBulkGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-md" role="dialog" aria-modal="true" aria-label="Generate Invoices">
            <div className="ds-modal-header">
              <h2>Generate Invoices</h2>
              <button onClick={() => setShowBulkGenerateModal(false)} className="ds-button-ghost" aria-label="Close generate invoices"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              <div className="ds-field">
                <label htmlFor="invoice-bulk-term" className="ds-label">Academic Term</label>
                <select
                  id="invoice-bulk-term"
                  value={bulkForm.termId}
                  onChange={e => setBulkForm({ ...bulkForm, termId: e.target.value })}
                  className="ds-select"
                >
                  <option value="">Select term</option>
                  {terms.map(term => (
                    <option key={term.id} value={term.id}>{term.name}{term.isCurrent ? ' • Current' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="ds-field">
                <label htmlFor="invoice-bulk-class" className="ds-label">Class</label>
                <select
                  id="invoice-bulk-class"
                  value={bulkForm.classId}
                  onChange={e => setBulkForm({ ...bulkForm, classId: e.target.value })}
                  className="ds-select"
                >
                  <option value="">All active students</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.gradeLevel !== undefined ? `Grade ${cls.gradeLevel} • ` : ''}{cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ds-surface-muted p-4 text-sm">
                Generates draft invoices for students with fee structures in the selected term and skips existing active invoices.
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowBulkGenerateModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleGenerateBulkInvoices}
                className="ds-button-primary">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== PAYMENT MODAL ======== */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-md" role="dialog" aria-modal="true" aria-label="Record Payment">
            <div className="ds-modal-header">
              <h2>Record Payment</h2>
              <button onClick={() => setShowPaymentModal(false)} className="ds-button-ghost" aria-label="Close record payment"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              <div className="ds-surface-muted p-4 text-sm">
                <p className="ds-helper">Invoice: <span className="font-mono text-[var(--text-primary)]">{selectedInvoice.invoiceNumber}</span></p>
                <p className="ds-helper">Balance Due: <span className="font-bold text-red-700 dark:text-red-300">{fmt(selectedInvoice.balanceDue)}</span></p>
              </div>
              <div className="ds-field">
                <label htmlFor="invoice-payment-amount" className="ds-label">Payment Amount (ZMW)</label>
                <input id="invoice-payment-amount" type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  max={selectedInvoice.balanceDue}
                  className="ds-input" placeholder="0.00" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowPaymentModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleRecordPayment}
                className="ds-button-primary">Record Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== CREDIT NOTE MODAL ======== */}
      {showCreditNoteModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="ds-modal w-full max-w-md" role="dialog" aria-modal="true" aria-label="Issue Credit Note">
            <div className="ds-modal-header">
              <h2>Issue Credit Note</h2>
              <button onClick={() => setShowCreditNoteModal(false)} className="ds-button-ghost" aria-label="Close issue credit note"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="ds-modal-body space-y-4">
              <div className="ds-field">
                <label htmlFor="invoice-credit-amount" className="ds-label">Amount (ZMW)</label>
                <input id="invoice-credit-amount" type="number" step="0.01" value={creditNoteForm.amount} onChange={e => setCreditNoteForm({ ...creditNoteForm, amount: e.target.value })}
                  className="ds-input" />
              </div>
              <div className="ds-field">
                <label htmlFor="invoice-credit-reason" className="ds-label">Reason</label>
                <textarea id="invoice-credit-reason" value={creditNoteForm.reason} onChange={e => setCreditNoteForm({ ...creditNoteForm, reason: e.target.value })} rows={3}
                  className="ds-textarea" />
              </div>
            </div>
            <div className="ds-modal-footer">
              <button onClick={() => setShowCreditNoteModal(false)}
                className="ds-button-outline">Cancel</button>
              <button onClick={handleCreateCreditNote}
                className="ds-button-primary">Issue Credit Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
