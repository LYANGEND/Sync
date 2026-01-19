import { useState, useEffect } from 'react';
import {
    TrendingUp,
    DollarSign,
    AlertTriangle,
    CheckCircle,
    Download,
    RefreshCw,
    Calendar,
    FileText,
    BarChart3,
} from 'lucide-react';

interface ReconciliationDashboard {
    invoiceSummary: Record<string, {
        count: number;
        totalAmount: number;
        paidAmount: number;
        balanceAmount: number;
    }>;
    paymentSummary: Record<string, {
        count: number;
        totalAmount: number;
    }>;
    overdueInvoices: Array<{
        id: string;
        invoiceNumber: string;
        tenant: { name: string; email: string };
        totalAmount: number;
        balanceAmount: number;
        dueDate: string;
    }>;
    missingPayments: Array<{
        id: string;
        tenant: { name: string };
        expectedAmount: number;
        severity: string;
        reason: string;
        detectedAt: string;
    }>;
}

interface Reconciliation {
    id: string;
    periodStart: string;
    periodEnd: string;
    tenant: { name: string } | null;
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    totalOverdue: number;
    invoiceCount: number;
    paidInvoiceCount: number;
    overdueInvoiceCount: number;
    status: string;
    completedAt: string;
}

const API_URL = 'http://localhost:3000';

const RevenueReconciliation = () => {
    const [dashboard, setDashboard] = useState<ReconciliationDashboard | null>(null);
    const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(1)).toISOString().split('T')[0], // First day of month
        endDate: new Date().toISOString().split('T')[0], // Today
    });
    const [showRunModal, setShowRunModal] = useState(false);

    const token = localStorage.getItem('platform_token');

    useEffect(() => {
        fetchDashboard();
        fetchReconciliationHistory();
    }, []);

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
            });

            const response = await fetch(`${API_URL}/api/platform/finance/reconciliation/dashboard?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setDashboard(data);
            }
        } catch (error) {
            console.error('Failed to fetch reconciliation dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchReconciliationHistory = async () => {
        try {
            const response = await fetch(`${API_URL}/api/platform/finance/reconciliation/history`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setReconciliations(data.reconciliations);
            }
        } catch (error) {
            console.error('Failed to fetch reconciliation history:', error);
        }
    };

    const runReconciliation = async () => {
        if (!confirm('Run reconciliation for the selected period?')) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/finance/reconciliation/run`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    periodStart: dateRange.startDate,
                    periodEnd: dateRange.endDate,
                }),
            });

            if (response.ok) {
                alert('Reconciliation completed successfully');
                setShowRunModal(false);
                fetchDashboard();
                fetchReconciliationHistory();
            }
        } catch (error) {
            console.error('Failed to run reconciliation:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportFinancialReport = async () => {
        try {
            const params = new URLSearchParams({
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
            });

            const response = await fetch(`${API_URL}/api/platform/finance/reconciliation/export?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `financial-report-${dateRange.startDate}-${dateRange.endDate}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Failed to export report:', error);
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'HIGH':
                return 'bg-red-100 text-red-700';
            case 'MEDIUM':
                return 'bg-orange-100 text-orange-700';
            case 'LOW':
                return 'bg-yellow-100 text-yellow-700';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-7 h-7 text-blue-600" />
                        Revenue Reconciliation
                    </h2>
                    <p className="text-slate-600 mt-1">Match payments with invoices and identify discrepancies</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={exportFinancialReport}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Export Report
                    </button>
                    <button
                        onClick={() => setShowRunModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <BarChart3 className="w-4 h-4" />
                        Run Reconciliation
                    </button>
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">Period:</span>
                    </div>
                    <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        onClick={fetchDashboard}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Apply
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {dashboard && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Total Invoiced</p>
                                <p className="text-2xl font-bold text-slate-900 mt-2">
                                    ZMW {Object.values(dashboard.invoiceSummary).reduce((sum, s) => sum + s.totalAmount, 0).toFixed(2)}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                                <FileText className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Total Paid</p>
                                <p className="text-2xl font-bold text-green-600 mt-2">
                                    ZMW {Object.values(dashboard.invoiceSummary).reduce((sum, s) => sum + s.paidAmount, 0).toFixed(2)}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Outstanding</p>
                                <p className="text-2xl font-bold text-orange-600 mt-2">
                                    ZMW {Object.values(dashboard.invoiceSummary).reduce((sum, s) => sum + s.balanceAmount, 0).toFixed(2)}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                                <DollarSign className="w-6 h-6 text-orange-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Overdue Invoices</p>
                                <p className="text-2xl font-bold text-red-600 mt-2">
                                    {dashboard.overdueInvoices.length}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Overdue Invoices */}
            {dashboard && dashboard.overdueInvoices.length > 0 && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-6 py-4 border-b bg-red-50">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            Overdue Invoices ({dashboard.overdueInvoices.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Invoice #</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">School</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Due Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Total</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {dashboard.overdueInvoices.map((invoice) => (
                                    <tr key={invoice.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{invoice.invoiceNumber}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <div className="font-medium text-slate-900">{invoice.tenant.name}</div>
                                            <div className="text-xs text-slate-500">{invoice.tenant.email}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-red-600">
                                            {new Date(invoice.dueDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-900">
                                            ZMW {invoice.totalAmount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-red-600">
                                            ZMW {invoice.balanceAmount.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Missing Payments */}
            {dashboard && dashboard.missingPayments.length > 0 && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-6 py-4 border-b bg-orange-50">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-600" />
                            Missing Payment Alerts ({dashboard.missingPayments.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">School</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Reason</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Expected Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Severity</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Detected</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {dashboard.missingPayments.map((alert) => (
                                    <tr key={alert.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{alert.tenant.name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{alert.reason}</td>
                                        <td className="px-6 py-4 text-sm text-slate-900">
                                            ZMW {alert.expectedAmount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                                                {alert.severity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(alert.detectedAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Reconciliation History */}
            <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b bg-slate-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Reconciliation History
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Period</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Invoiced</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Paid</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Outstanding</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Overdue</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Invoices</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Completed</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reconciliations.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                                        No reconciliation history found
                                    </td>
                                </tr>
                            ) : (
                                reconciliations.map((rec) => (
                                    <tr key={rec.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm text-slate-900">
                                            {new Date(rec.periodStart).toLocaleDateString()} - {new Date(rec.periodEnd).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-900">
                                            ZMW {rec.totalInvoiced.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-green-600 font-medium">
                                            ZMW {rec.totalPaid.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-orange-600 font-medium">
                                            ZMW {rec.totalOutstanding.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-red-600 font-medium">
                                            ZMW {rec.totalOverdue.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {rec.paidInvoiceCount}/{rec.invoiceCount}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(rec.completedAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Run Reconciliation Modal */}
            {showRunModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-md">
                        <div className="px-6 py-4 border-b">
                            <h3 className="text-lg font-semibold text-slate-900">Run Reconciliation</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600">
                                This will analyze all invoices and payments for the selected period and generate a reconciliation report.
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={dateRange.startDate}
                                        onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={dateRange.endDate}
                                        onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowRunModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={runReconciliation}
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {loading ? 'Running...' : 'Run Reconciliation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RevenueReconciliation;
