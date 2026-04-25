import React, { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell,
} from 'recharts';
import {
    AlertTriangle, Calendar, CreditCard, RefreshCw, ShieldAlert,
    TrendingUp, Wallet, PieChart as PieChartIcon,
} from 'lucide-react';
import api from '../../utils/api';
import { financialApi, invoiceApi, Refund } from '../../services/accountingService';

const COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

interface FinancialReportData {
    monthlyRevenue: number[];
    paymentMethods: { method: string; count: number; amount: number }[];
    classCollection: { className: string; totalDue: number; totalCollected: number; percentage: number }[];
}

interface IncomeStatementSnapshot {
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
}

interface CashFlowSnapshot {
    totalInflows: number;
    totalOutflows: number;
    netCashFlow: number;
}

interface ReceivableItem {
    studentId: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    totalDue: number;
    totalPaid: number;
    balance: number;
    ageDays: number;
    bucket: string;
    guardianPhone?: string;
    guardianEmail?: string;
}

interface InvoiceSummary {
    totalInvoiced?: number;
    totalCollected?: number;
    totalOutstanding?: number;
    totalOverdue?: number;
}

interface DashboardData {
    paymentReport: FinancialReportData;
    income: IncomeStatementSnapshot;
    cashFlow: CashFlowSnapshot;
    receivables: ReceivableItem[];
    invoiceSummary: InvoiceSummary;
    refunds: Refund[];
}

const emptyData: DashboardData = {
    paymentReport: {
        monthlyRevenue: new Array(12).fill(0),
        paymentMethods: [],
        classCollection: [],
    },
    income: {
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
    },
    cashFlow: {
        totalInflows: 0,
        totalOutflows: 0,
        netCashFlow: 0,
    },
    receivables: [],
    invoiceSummary: {},
    refunds: [],
};

const FinanceReports = () => {
    const [data, setData] = useState<DashboardData>(emptyData);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const [paymentReport, income, cashFlow, receivables, invoiceSummary, refunds] = await Promise.allSettled([
                api.get('/payments/reports'),
                financialApi.getIncomeStatement(),
                financialApi.getCashFlow(),
                financialApi.getAgedReceivables(),
                invoiceApi.getSummary(),
                financialApi.getRefunds(),
            ]);

            setData({
                paymentReport: paymentReport.status === 'fulfilled'
                    ? {
                        monthlyRevenue: paymentReport.value.data?.monthlyRevenue || new Array(12).fill(0),
                        paymentMethods: paymentReport.value.data?.paymentMethods || [],
                        classCollection: paymentReport.value.data?.classCollection || [],
                    }
                    : emptyData.paymentReport,
                income: income.status === 'fulfilled'
                    ? {
                        totalIncome: income.value.data?.totalIncome || 0,
                        totalExpenses: income.value.data?.totalExpenses || 0,
                        netIncome: income.value.data?.netIncome || 0,
                    }
                    : emptyData.income,
                cashFlow: cashFlow.status === 'fulfilled'
                    ? {
                        totalInflows: cashFlow.value.data?.inflows?.totalInflow ?? cashFlow.value.data?.totalInflows ?? 0,
                        totalOutflows: cashFlow.value.data?.outflows?.totalOutflow ?? cashFlow.value.data?.totalOutflows ?? 0,
                        netCashFlow: cashFlow.value.data?.netCashFlow ?? 0,
                    }
                    : emptyData.cashFlow,
                receivables: receivables.status === 'fulfilled'
                    ? (receivables.value.data?.receivables || receivables.value.data || [])
                    : [],
                invoiceSummary: invoiceSummary.status === 'fulfilled'
                    ? (invoiceSummary.value.data || {})
                    : {},
                refunds: refunds.status === 'fulfilled'
                    ? (Array.isArray(refunds.value.data) ? refunds.value.data : (refunds.value.data?.refunds || []))
                    : [],
            });
        } catch (error) {
            console.error('Failed to fetch financial reports', error);
            setData(emptyData);
        } finally {
            setLoading(false);
        }
    };

    const fmt = (amount: number) => `K${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pct = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueData = data.paymentReport.monthlyRevenue.map((amount, index) => ({
        name: months[index],
        revenue: amount,
    }));

    const methodData = data.paymentReport.paymentMethods.map((m) => ({
        name: m.method.replace(/_/g, ' '),
        value: m.amount,
        count: m.count,
    }));

    const totalRevenue = data.paymentReport.monthlyRevenue.reduce((sum, amount) => sum + amount, 0);
    const totalInvoiced = data.invoiceSummary.totalInvoiced || 0;
    const totalCollected = data.invoiceSummary.totalCollected || totalRevenue;
    const outstanding = data.invoiceSummary.totalOutstanding || data.receivables.reduce((sum, item) => sum + item.balance, 0);
    const overdue = data.invoiceSummary.totalOverdue || data.receivables.filter(item => item.ageDays > 30).reduce((sum, item) => sum + item.balance, 0);
    const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;
    const refundExposure = data.refunds.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const pendingRefunds = data.refunds.filter(refund => refund.status === 'PENDING');

    const bucketOrder = ['0-30', '30-60', '60-90', '90+'];
    const receivableBuckets = bucketOrder.map(bucket => {
        const matches = data.receivables.filter(item => item.bucket === bucket);
        return {
            bucket,
            balance: matches.reduce((sum, item) => sum + item.balance, 0),
            students: matches.length,
        };
    });

    const topDebtors = [...data.receivables]
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 6);

    const riskClasses = [...data.paymentReport.classCollection]
        .sort((a, b) => a.percentage - b.percentage)
        .slice(0, 5);

    const refundByStatus = ['PENDING', 'APPROVED', 'PROCESSED'].map(status => ({
        status,
        count: data.refunds.filter(refund => refund.status === status).length,
        amount: data.refunds
            .filter(refund => refund.status === status)
            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0),
    }));

    if (loading) return <div className="p-8 text-center text-gray-600 dark:text-gray-400">Loading analytics...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Finance Management Pack</h2>
                    <p className="text-sm text-slate-500 dark:text-gray-400">Collections, arrears, cash health, and reporting exceptions in one view.</p>
                </div>
                <button
                    onClick={fetchReport}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh pack
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                    {
                        label: 'Collected Revenue (YTD)',
                        value: fmt(totalRevenue),
                        detail: `${data.paymentReport.paymentMethods.reduce((sum, item) => sum + item.count, 0)} payment(s) posted`,
                        icon: TrendingUp,
                        tone: 'text-blue-600 dark:text-blue-400',
                        bg: 'bg-blue-50 dark:bg-blue-900/20',
                    },
                    {
                        label: 'Total Invoiced',
                        value: fmt(totalInvoiced),
                        detail: `Collection rate ${pct(collectionRate)}`,
                        icon: CreditCard,
                        tone: 'text-emerald-600 dark:text-emerald-400',
                        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                    },
                    {
                        label: 'Outstanding Fees',
                        value: fmt(outstanding),
                        detail: `${topDebtors.length} key debtor(s) highlighted`,
                        icon: ShieldAlert,
                        tone: 'text-amber-600 dark:text-amber-400',
                        bg: 'bg-amber-50 dark:bg-amber-900/20',
                    },
                    {
                        label: 'Overdue Exposure',
                        value: fmt(overdue),
                        detail: `${receivableBuckets.find(bucket => bucket.bucket === '90+')?.students || 0} account(s) in 90+ days`,
                        icon: AlertTriangle,
                        tone: 'text-red-600 dark:text-red-400',
                        bg: 'bg-red-50 dark:bg-red-900/20',
                    },
                    {
                        label: 'Net Surplus / Deficit',
                        value: fmt(data.income.netIncome),
                        detail: `Income ${fmt(data.income.totalIncome)} vs expenses ${fmt(data.income.totalExpenses)}`,
                        icon: Wallet,
                        tone: data.income.netIncome >= 0 ? 'text-violet-600 dark:text-violet-400' : 'text-orange-600 dark:text-orange-400',
                        bg: data.income.netIncome >= 0 ? 'bg-violet-50 dark:bg-violet-900/20' : 'bg-orange-50 dark:bg-orange-900/20',
                    },
                    {
                        label: 'Refund Pipeline',
                        value: fmt(refundExposure),
                        detail: `${pendingRefunds.length} refund(s) pending approval`,
                        icon: Calendar,
                        tone: 'text-slate-700 dark:text-slate-200',
                        bg: 'bg-slate-100 dark:bg-slate-800',
                    },
                ].map(card => (
                    <div key={card.label} className={`rounded-xl border border-slate-200 p-5 shadow-sm dark:border-slate-700 ${card.bg}`}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm text-slate-500 dark:text-gray-400">{card.label}</p>
                                <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.value}</p>
                                <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">{card.detail}</p>
                            </div>
                            <card.icon className={`h-5 w-5 ${card.tone}`} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 xl:col-span-2">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            Monthly Revenue ({new Date().getFullYear()})
                        </h3>
                        <span className="text-sm text-slate-500 dark:text-gray-400">YTD {fmt(totalRevenue)}</span>
                    </div>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `K${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip
                                    formatter={(value: number) => [`ZMW ${value.toLocaleString()}`, 'Revenue']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
                            <PieChartIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            Payment Mix
                        </h3>
                        <span className="text-sm text-slate-500 dark:text-gray-400">{methodData.length} channel(s)</span>
                    </div>
                    <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={methodData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={5} dataKey="value">
                                    {methodData.map((entry, index) => (
                                        <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => [`ZMW ${value.toLocaleString()}`, 'Amount']} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-3">
                        {methodData.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-gray-400">No payment channel data yet.</p>
                        ) : methodData.map((method, index) => {
                            const share = totalRevenue > 0 ? (method.value / totalRevenue) * 100 : 0;
                            return (
                                <div key={method.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-700/50">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                        <span className="font-medium text-slate-700 dark:text-gray-200">{method.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-slate-800 dark:text-white">{fmt(method.value)}</p>
                                        <p className="text-xs text-slate-500 dark:text-gray-400">{method.count} txn • {pct(share)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Collections Health</h3>
                        <span className="text-sm text-slate-500 dark:text-gray-400">Cash and accrual snapshot</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                            <p className="text-sm text-slate-500 dark:text-gray-400">Collected</p>
                            <p className="mt-1 text-xl font-bold text-emerald-600">{fmt(totalCollected)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                            <p className="text-sm text-slate-500 dark:text-gray-400">Collection Rate</p>
                            <p className="mt-1 text-xl font-bold text-blue-600">{pct(collectionRate)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                            <p className="text-sm text-slate-500 dark:text-gray-400">Cash Inflow</p>
                            <p className="mt-1 text-xl font-bold text-emerald-600">{fmt(data.cashFlow.totalInflows)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                            <p className="text-sm text-slate-500 dark:text-gray-400">Cash Outflow</p>
                            <p className="mt-1 text-xl font-bold text-red-600">{fmt(data.cashFlow.totalOutflows)}</p>
                        </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700/30">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-600 dark:text-gray-300">Net cash position</span>
                            <span className={`text-lg font-bold ${data.cashFlow.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(data.cashFlow.netCashFlow)}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                            Use this with the income statement to track timing gaps between earned revenue and received cash.
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Refund Control Watch</h3>
                        <span className="text-sm text-slate-500 dark:text-gray-400">Approval pipeline</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {refundByStatus.map(item => (
                            <div key={item.status} className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                                <p className="text-sm text-slate-500 dark:text-gray-400">{item.status}</p>
                                <p className="mt-1 text-xl font-bold text-slate-800 dark:text-white">{item.count}</p>
                                <p className="text-xs text-slate-500 dark:text-gray-400">{fmt(item.amount)}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Control note</p>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                            Pending refunds should be reviewed daily to prevent unapproved credits from aging in the ledger.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Aged Receivables</h3>
                        <span className="text-sm text-slate-500 dark:text-gray-400">By aging bucket</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {receivableBuckets.map(bucket => (
                            <div key={bucket.bucket} className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                                <p className="text-sm text-slate-500 dark:text-gray-400">{bucket.bucket} days</p>
                                <p className="mt-1 text-xl font-bold text-slate-800 dark:text-white">{fmt(bucket.balance)}</p>
                                <p className="text-xs text-slate-500 dark:text-gray-400">{bucket.students} student(s)</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                            <p className="text-sm font-medium text-slate-700 dark:text-gray-200">Highest-risk debtor accounts</p>
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                            {topDebtors.length === 0 ? (
                                <p className="px-4 py-6 text-sm text-slate-500 dark:text-gray-400">No outstanding debtor balances.</p>
                            ) : topDebtors.map(debtor => (
                                <div key={debtor.studentId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                    <div>
                                        <p className="font-medium text-slate-800 dark:text-white">{debtor.studentName}</p>
                                        <p className="text-xs text-slate-500 dark:text-gray-400">{debtor.className} • {debtor.bucket} days • {debtor.guardianPhone || debtor.guardianEmail || 'No contact'}</p>
                                    </div>
                                    <span className="font-semibold text-red-600">{fmt(debtor.balance)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Collection Rate per Class</h3>
                        <span className="text-sm text-slate-500 dark:text-gray-400">Weakest classes first</span>
                    </div>
                    <div className="space-y-4">
                        {riskClasses.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-gray-400">No class collection performance yet.</p>
                        ) : riskClasses.map((cls) => (
                            <div key={cls.className} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium text-slate-700 dark:text-gray-200">{cls.className}</span>
                                    <span className="text-slate-500 dark:text-gray-400">
                                        {cls.percentage}% ({cls.totalCollected.toLocaleString()} / {cls.totalDue.toLocaleString()})
                                    </span>
                                </div>
                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${cls.percentage >= 80 ? 'bg-emerald-500' : cls.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(cls.percentage, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">Follow-up priority</p>
                        <p className="mt-1 text-xs text-red-600 dark:text-red-200">
                            Focus debt collection and bursar review on classes below 50% collection to reduce overdue spillover into future terms.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinanceReports;
