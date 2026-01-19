import { useState, useEffect } from 'react';
import {
    FileText,
    Download,
    Send,
    RefreshCw,
    Search,
    Filter,
    Eye,
    DollarSign,
    Calendar,
    CheckCircle,
    Clock,
    AlertTriangle,
} from 'lucide-react';

interface Invoice {
    id: string;
    invoiceNumber: string;
    tenant: { name: string; slug: string; email: string };
    invoiceType: string;
    status: string;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    currency: string;
    issueDate: string;
    dueDate: string;
    paidDate: string | null;
    remindersSent: number;
    lastReminderAt: string | null;
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        amount: number;
    }>;
}

const API_URL = 'http://localhost:3000';

const InvoiceManagement = () => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        status: '',
        search: '',
        tenantId: '',
    });
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);

    const token = localStorage.getItem('platform_token');

    useEffect(() => {
        fetchInvoices();
    }, [filters]);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.search) params.append('search', filters.search);
            if (filters.tenantId) params.append('tenantId', filters.tenantId);

            const response = await fetch(`${API_URL}/api/platform/finance/invoices?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setInvoices(data.invoices);
            }
        } catch (error) {
            console.error('Failed to fetch invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const downloadInvoicePDF = async (invoiceId: string, invoiceNumber: string) => {
        try {
            const response = await fetch(`${API_URL}/api/platform/finance/invoices/${invoiceId}/pdf`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `invoice-${invoiceNumber}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Failed to download PDF:', error);
        }
    };

    const sendReminder = async (invoiceId: string) => {
        if (!confirm('Send payment reminder to this school?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/finance/invoices/${invoiceId}/reminder`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                alert('Reminder sent successfully');
                fetchInvoices();
            }
        } catch (error) {
            console.error('Failed to send reminder:', error);
        }
    };

    const bulkGenerateInvoices = async () => {
        if (!confirm('Generate invoices for all completed payments without invoices?')) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/finance/invoices/bulk-generate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                alert(data.message);
                fetchInvoices();
            }
        } catch (error) {
            console.error('Failed to bulk generate invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PAID':
                return 'bg-green-100 text-green-700';
            case 'SENT':
                return 'bg-blue-100 text-blue-700';
            case 'OVERDUE':
                return 'bg-red-100 text-red-700';
            case 'CANCELLED':
                return 'bg-gray-100 text-gray-700';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'PAID':
                return <CheckCircle className="w-4 h-4" />;
            case 'SENT':
                return <Clock className="w-4 h-4" />;
            case 'OVERDUE':
                return <AlertTriangle className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-7 h-7 text-blue-600" />
                        Invoice Management
                    </h2>
                    <p className="text-slate-600 mt-1">Generate, track, and manage invoices</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={bulkGenerateInvoices}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Bulk Generate
                    </button>
                    <button
                        onClick={fetchInvoices}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by invoice # or school..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Statuses</option>
                        <option value="DRAFT">Draft</option>
                        <option value="SENT">Sent</option>
                        <option value="PAID">Paid</option>
                        <option value="OVERDUE">Overdue</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">School</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Issue Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Due Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Balance</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                                        Loading invoices...
                                    </td>
                                </tr>
                            ) : invoices.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                                        No invoices found
                                    </td>
                                </tr>
                            ) : (
                                invoices.map((invoice) => (
                                    <tr key={invoice.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                                            {invoice.invoiceNumber}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <div className="font-medium text-slate-900">{invoice.tenant.name}</div>
                                            <div className="text-xs text-slate-500">{invoice.tenant.email}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${getStatusColor(invoice.status)}`}>
                                                {getStatusIcon(invoice.status)}
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(invoice.issueDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(invoice.dueDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                                            {invoice.currency} {invoice.totalAmount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`font-medium ${invoice.balanceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {invoice.currency} {invoice.balanceAmount.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setSelectedInvoice(invoice);
                                                        setShowInvoiceModal(true);
                                                    }}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    title="View Details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => downloadInvoicePDF(invoice.id, invoice.invoiceNumber)}
                                                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                                    title="Download PDF"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                {invoice.status !== 'PAID' && (
                                                    <button
                                                        onClick={() => sendReminder(invoice.id)}
                                                        className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg"
                                                        title="Send Reminder"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Invoice Details Modal */}
            {showInvoiceModal && selectedInvoice && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
                            <h3 className="text-lg font-semibold text-slate-900">
                                Invoice {selectedInvoice.invoiceNumber}
                            </h3>
                            <button
                                onClick={() => setShowInvoiceModal(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                ×
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Invoice Header */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <h4 className="text-sm font-medium text-slate-600 mb-2">Bill To</h4>
                                    <div className="text-sm">
                                        <div className="font-medium text-slate-900">{selectedInvoice.tenant.name}</div>
                                        <div className="text-slate-600">{selectedInvoice.tenant.email}</div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-slate-600 mb-2">Invoice Details</h4>
                                    <div className="text-sm space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Issue Date:</span>
                                            <span className="font-medium">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Due Date:</span>
                                            <span className="font-medium">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</span>
                                        </div>
                                        {selectedInvoice.paidDate && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Paid Date:</span>
                                                <span className="font-medium text-green-600">
                                                    {new Date(selectedInvoice.paidDate).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Invoice Items */}
                            <div>
                                <h4 className="text-sm font-medium text-slate-600 mb-3">Items</h4>
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Description</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Qty</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Unit Price</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {selectedInvoice.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3 text-sm text-slate-900">{item.description}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600 text-right">{item.quantity}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600 text-right">
                                                    {selectedInvoice.currency} {item.unitPrice.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-900 text-right font-medium">
                                                    {selectedInvoice.currency} {item.amount.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Totals */}
                            <div className="border-t pt-4">
                                <div className="space-y-2 max-w-xs ml-auto">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Subtotal:</span>
                                        <span className="font-medium">{selectedInvoice.currency} {selectedInvoice.subtotal.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Tax:</span>
                                        <span className="font-medium">{selectedInvoice.currency} {selectedInvoice.taxAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Discount:</span>
                                        <span className="font-medium">{selectedInvoice.currency} {selectedInvoice.discountAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold border-t pt-2">
                                        <span>Total:</span>
                                        <span>{selectedInvoice.currency} {selectedInvoice.totalAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Paid:</span>
                                        <span className="font-medium text-green-600">{selectedInvoice.currency} {selectedInvoice.paidAmount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold">
                                        <span>Balance:</span>
                                        <span className={selectedInvoice.balanceAmount > 0 ? 'text-red-600' : 'text-green-600'}>
                                            {selectedInvoice.currency} {selectedInvoice.balanceAmount.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 border-t pt-4">
                                <button
                                    onClick={() => downloadInvoicePDF(selectedInvoice.id, selectedInvoice.invoiceNumber)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Download PDF
                                </button>
                                {selectedInvoice.status !== 'PAID' && (
                                    <button
                                        onClick={() => {
                                            sendReminder(selectedInvoice.id);
                                            setShowInvoiceModal(false);
                                        }}
                                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                                    >
                                        <Send className="w-4 h-4" />
                                        Send Reminder
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoiceManagement;
