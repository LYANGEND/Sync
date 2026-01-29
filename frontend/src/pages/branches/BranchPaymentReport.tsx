import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, TrendingUp, Users, Calendar, Download } from 'lucide-react';
import api from '../../utils/api';

interface BranchPaymentSummary {
    branchId: string;
    branchName: string;
    branchCode: string;
    summary: {
        totalCollected: number;
        totalPayments: number;
        outstanding: number;
        totalStudents: number;
        fullyPaid: number;
        partiallyPaid: number;
        notPaid: number;
    };
    byMethod: Array<{
        method: string;
        total: number;
        count: number;
    }>;
    dailyBreakdown: Array<{
        date: string;
        total: number;
        count: number;
    }>;
    monthlyTrend: Array<{
        month: string;
        total: number;
        count: number;
    }>;
}

const BranchPaymentReport = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [data, setData] = useState<BranchPaymentSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        fetchData();
    }, [id, startDate, endDate]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const response = await api.get(`/branches/${id}/financial-summary`, { params });
            setData(response.data);
        } catch (error) {
            console.error('Error fetching branch payment data:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportReport = () => {
        if (!data) return;
        
        const csvContent = [
            ['Branch Payment Report'],
            ['Branch', data.branchName],
            ['Code', data.branchCode],
            ['Period', startDate && endDate ? `${startDate} to ${endDate}` : 'All Time'],
            [''],
            ['Summary'],
            ['Total Collected', `ZMW ${data.summary.totalCollected.toLocaleString()}`],
            ['Total Payments', data.summary.totalPayments],
            ['Outstanding', `ZMW ${data.summary.outstanding.toLocaleString()}`],
            ['Total Students', data.summary.totalStudents],
            ['Fully Paid', data.summary.fullyPaid],
            ['Partially Paid', data.summary.partiallyPaid],
            ['Not Paid', data.summary.notPaid],
            [''],
            ['By Payment Method'],
            ['Method', 'Amount', 'Count'],
            ...data.byMethod.map(m => [m.method, m.total, m.count]),
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `branch-payment-report-${data.branchCode}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-6">
                <div className="text-center text-gray-500">Failed to load branch payment data</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/branches/${id}`)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {data.branchName} - Payment Report
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400">Branch Code: {data.branchCode}</p>
                    </div>
                </div>
                <button
                    onClick={exportReport}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                    <Download size={18} />
                    Export CSV
                </button>
            </div>

            {/* Date Filter */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar size={18} className="text-gray-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Date:</span>
                    </div>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                    {(startDate || endDate) && (
                        <button
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Total Collected</span>
                        <DollarSign size={20} className="text-green-600" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        ZMW {data.summary.totalCollected.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        {data.summary.totalPayments} payments
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Outstanding</span>
                        <TrendingUp size={20} className="text-orange-600" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        ZMW {data.summary.outstanding.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        Pending collection
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Total Students</span>
                        <Users size={20} className="text-blue-600" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {data.summary.totalStudents}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        Active students
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">Payment Status</span>
                        <Users size={20} className="text-purple-600" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-green-600">Fully Paid:</span>
                            <span className="font-semibold">{data.summary.fullyPaid}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-yellow-600">Partial:</span>
                            <span className="font-semibold">{data.summary.partiallyPaid}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-red-600">Not Paid:</span>
                            <span className="font-semibold">{data.summary.notPaid}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Payment Methods Breakdown</h3>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {data.byMethod.map((method) => {
                            const percentage = data.summary.totalCollected > 0
                                ? ((method.total / data.summary.totalCollected) * 100).toFixed(1)
                                : '0';
                            
                            return (
                                <div key={method.method} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                        {method.method.replace('_', ' ')}
                                    </div>
                                    <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                                        ZMW {method.total.toLocaleString()}
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">{method.count} payments</span>
                                        <span className="text-blue-600 font-medium">{percentage}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Monthly Trend */}
            {data.monthlyTrend.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                    <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Monthly Trend (Last 6 Months)</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {data.monthlyTrend.map((month) => (
                                <div key={month.month} className="flex items-center justify-between">
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                                        {new Date(month.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                    </span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-gray-500">{month.count} payments</span>
                                        <span className="text-lg font-bold text-gray-900 dark:text-white">
                                            ZMW {month.total.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Recent Daily Activity */}
            {data.dailyBreakdown.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                    <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Daily Activity</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {data.dailyBreakdown.map((day) => (
                                <div key={day.date} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                                    <span className="text-gray-700 dark:text-gray-300">
                                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-gray-500">{day.count} payments</span>
                                        <span className="font-semibold text-gray-900 dark:text-white">
                                            ZMW {day.total.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchPaymentReport;
