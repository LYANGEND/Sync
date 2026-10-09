import { ReactNode, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Bell, RefreshCw } from 'lucide-react';
import api from '../../utils/api';
import ExportDropdown from '../../components/ExportDropdown';
import { financialApi, Refund } from '../../services/accountingService';
import { fmt, fmtWhole, formatMethod, formatPaymentDate, plural, ProgressBar } from './financeFormat';

type AgeingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

// Shape of GET /payments/reports. Every figure comes from the same per-student balances as Payments and Reminders.
interface TermReport {
    summary: {
        billed: number;
        collected: number;
        paymentsCount: number;
        owed: number;
        debtorCount: number;
        overdueAmount: number;
        overdueCount: number;
        credit: number;
        creditCount: number;
        studentsBilled: number;
        settledRate: number;
    };
    weekly: { week: number; weekStart: string; amount: number; payments: number; cumulative: number }[];
    paymentMethods: { method: string; count: number; amount: number }[];
    classCollection: { className: string; students: number; billed: number; settled: number; owed: number; debtors: number; rate: number }[];
    ageing: { bucket: AgeingBucket; amount: number; students: number }[];
    debtors: {
        studentId: string;
        name: string;
        admissionNumber: string;
        className: string;
        billed: number;
        paid: number;
        balance: number;
        earliestDueDate: string | null;
        daysOverdue: number;
        bucket: AgeingBucket;
        guardianName?: string | null;
        guardianPhone?: string | null;
        guardianEmail?: string | null;
    }[];
    generatedAt: string;
}

interface LedgerSnapshot {
    income: number;
    expenses: number;
    cashIn: number;
    cashOut: number;
    refunds: Refund[];
}

interface AcademicTerm {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
}

interface FinanceReportsProps {
    academicTerm: AcademicTerm;
    onOpenReminders?: () => void;
}

const AGEING: Record<AgeingBucket, { label: string; tone: string }> = {
    current: { label: 'Not yet due', tone: 'bg-slate-300 dark:bg-slate-500' },
    '1-30': { label: '1-30 days late', tone: 'bg-amber-400' },
    '31-60': { label: '31-60 days late', tone: 'bg-orange-500' },
    '61-90': { label: '61-90 days late', tone: 'bg-red-500' },
    '90+': { label: 'Over 90 days late', tone: 'bg-red-700' },
};

const rateTone = (rate: number) => (rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500');
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const amount = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Section = ({ title, story, action, children }: { title: string; story: string; action?: ReactNode; children: ReactNode }) => (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{story}</p>
            </div>
            {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
        {children}
    </section>
);

const Figure = ({ label, value, detail, tone = 'text-slate-900 dark:text-white', children }: { label: string; value: string; detail: string; tone?: string; children?: ReactNode }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm text-slate-500 dark:text-gray-400">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
        {children}
        <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">{detail}</p>
    </div>
);

const EmptyNote = ({ children }: { children: ReactNode }) => (
    <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-gray-400">{children}</p>
);

const FinanceReports = ({ academicTerm, onOpenReminders }: FinanceReportsProps) => {
    const [report, setReport] = useState<TermReport | null>(null);
    const [ledger, setLedger] = useState<LedgerSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        fetchReport();
    }, [academicTerm.id]);

    const fetchReport = async () => {
        setLoading(true);
        const termParams = {
            academicTermId: academicTerm.id,
            startDate: academicTerm.startDate,
            endDate: academicTerm.endDate,
        };
        const [termReport, income, cashFlow, refunds] = await Promise.allSettled([
            api.get('/payments/reports', { params: { academicTermId: academicTerm.id } }),
            financialApi.getIncomeStatement(termParams),
            financialApi.getCashFlow(termParams),
            financialApi.getRefunds(termParams),
        ]);

        setLoadFailed(termReport.status !== 'fulfilled');
        setReport(termReport.status === 'fulfilled' ? termReport.value.data : null);
        setLedger(income.status === 'fulfilled' || cashFlow.status === 'fulfilled'
            ? {
                income: income.status === 'fulfilled' ? Number(income.value.data?.totalIncome || 0) : 0,
                expenses: income.status === 'fulfilled' ? Number(income.value.data?.totalExpenses || 0) : 0,
                cashIn: cashFlow.status === 'fulfilled' ? Number(cashFlow.value.data?.inflows?.totalInflow ?? cashFlow.value.data?.totalInflows ?? 0) : 0,
                cashOut: cashFlow.status === 'fulfilled' ? Number(cashFlow.value.data?.outflows?.totalOutflow ?? cashFlow.value.data?.totalOutflows ?? 0) : 0,
                refunds: refunds.status === 'fulfilled'
                    ? (Array.isArray(refunds.value.data) ? refunds.value.data : (refunds.value.data?.refunds || []))
                    : [],
            }
            : null);
        setLoading(false);
    };

    const termRange = `${formatPaymentDate(academicTerm.startDate)} to ${formatPaymentDate(academicTerm.endDate)}`;

    const header = (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Term report</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                    {academicTerm.name} · {termRange}
                    {report && ` · as of ${formatPaymentDate(report.generatedAt)}`}
                </p>
            </div>
            <button
                onClick={fetchReport}
                disabled={loading}
                className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-surface-hover disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 md:self-auto"
            >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
            </button>
        </div>
    );

    if (loading && !report) {
        return (
            <div className="space-y-6" aria-busy="true">
                {header}
                <div className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
                </div>
                <div className="h-80 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="space-y-6">
                {header}
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>{loadFailed ? 'The term report could not be loaded. Check your connection and refresh.' : 'No report data for this term.'}</p>
                </div>
            </div>
        );
    }

    const { summary, weekly, paymentMethods, classCollection, ageing, debtors } = report;
    const asOf = formatPaymentDate(report.generatedAt);

    // The story at the top: what came in, what is still owed, and who paid ahead.
    const storyLines = summary.billed === 0
        ? [`No fees have been billed for ${academicTerm.name} yet. Assign fee structures to students to start tracking collections.`]
        : [
            `By ${asOf}, ${fmtWhole(summary.collected)} has come in from ${plural(summary.paymentsCount, 'payment')} against ${fmtWhole(summary.billed)} billed to ${plural(summary.studentsBilled, 'student')}.`,
            summary.debtorCount === 0
                ? 'Every billed student is fully paid.'
                : `${plural(summary.debtorCount, 'student')} still ${summary.debtorCount === 1 ? 'owes' : 'owe'} ${fmtWhole(summary.owed)}${summary.overdueCount > 0
                    ? `; ${summary.overdueCount} of them ${summary.overdueCount === 1 ? 'is' : 'are'} past the due date.`
                    : ', none of it past due yet.'}`,
            summary.creditCount > 0
                ? `${plural(summary.creditCount, 'student')} paid ahead, holding ${fmtWhole(summary.credit)} in credit. That is why collections are higher than billed minus owed.`
                : '',
        ].filter(Boolean);

    const bestWeek = weekly.reduce<TermReport['weekly'][number] | null>((best, week) => (week.amount > (best?.amount || 0) ? week : best), null);
    const chartData = weekly.map(week => ({ ...week, label: `Wk ${week.week}` }));
    const methodsTotal = paymentMethods.reduce((sum, method) => sum + method.amount, 0);

    const weakestClass = classCollection.find(cls => cls.billed > 0);
    const settledClasses = classCollection.filter(cls => cls.billed > 0 && cls.owed === 0).length;
    const classStory = !weakestClass
        ? 'No class has fees billed this term.'
        : weakestClass.owed === 0
            ? (classCollection.length === 1 ? 'The only billed class is fully settled.' : `All ${classCollection.length} classes are fully settled.`)
            : `${weakestClass.className} is furthest behind at ${weakestClass.rate}% settled, with ${fmtWhole(weakestClass.owed)} outstanding. ${settledClasses} of ${classCollection.length} ${classCollection.length === 1 ? 'class is' : 'classes are'} fully settled.`;

    const oldestDebtor = debtors[0];
    const debtStory = debtors.length === 0
        ? 'Nothing is owed for this term.'
        : `${fmtWhole(summary.overdueAmount)} of the ${fmtWhole(summary.owed)} owed is past its due date.${oldestDebtor && oldestDebtor.daysOverdue > 0
            ? ` The oldest balance is ${plural(oldestDebtor.daysOverdue, 'day')} late. Start with the students at the top of the list.`
            : ''}`;

    const noContact = debtors.filter(d => !d.guardianPhone && !d.guardianEmail).length;

    const exportRows = debtors.map(d => ({
        name: d.name,
        admissionNumber: d.admissionNumber,
        className: d.className,
        dueDate: d.earliestDueDate ? formatPaymentDate(d.earliestDueDate) : '',
        daysOverdue: d.daysOverdue,
        guardian: d.guardianName || '',
        phone: d.guardianPhone || '',
        email: d.guardianEmail || '',
        billed: d.billed,
        paid: d.paid,
        balance: d.balance,
    }));

    const pendingRefunds = ledger?.refunds.filter(r => r.status === 'PENDING') || [];
    const processedRefunds = ledger?.refunds.filter(r => r.status === 'PROCESSED') || [];
    const sumRefunds = (list: Refund[]) => list.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const netSurplus = ledger ? ledger.income - ledger.expenses : 0;
    const netCash = ledger ? ledger.cashIn - ledger.cashOut : 0;

    return (
        <div className="space-y-6 animate-fade-in">
            {header}

            {/* The story of the term in plain words */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Where the term stands</p>
                <div className="mt-2 space-y-1 text-base leading-relaxed text-slate-700 dark:text-gray-200">
                    {storyLines.map(line => <p key={line}>{line}</p>)}
                </div>
            </section>

            {summary.billed > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Figure
                        label="Billed this term"
                        value={fmtWhole(summary.billed)}
                        detail={`Fees assigned to ${plural(summary.studentsBilled, 'student')}`}
                    />
                    <Figure
                        label="Collected"
                        value={fmtWhole(summary.collected)}
                        detail={summary.credit > 0
                            ? `${plural(summary.paymentsCount, 'payment')} · includes ${fmtWhole(summary.credit)} paid ahead`
                            : plural(summary.paymentsCount, 'payment')}
                    />
                    <Figure
                        label="Still owed"
                        value={fmtWhole(summary.owed)}
                        tone={summary.owed > 0 ? 'text-slate-900 dark:text-white' : 'text-green-600 dark:text-green-400'}
                        detail={`${summary.settledRate}% of billing settled · ${plural(summary.debtorCount, 'student')} owing`}
                    >
                        <ProgressBar value={summary.settledRate} label="Share of billing settled" tone={rateTone(summary.settledRate)} />
                    </Figure>
                    <Figure
                        label="Past due"
                        value={fmtWhole(summary.overdueAmount)}
                        tone={summary.overdueAmount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}
                        detail={summary.overdueCount > 0
                            ? `${plural(summary.overdueCount, 'student')} past their due date`
                            : 'No balance is past its due date'}
                    />
                </div>
            )}

            {/* How money came in */}
            <Section
                title="How money came in"
                story={bestWeek
                    ? `The busiest week was week ${bestWeek.week} (from ${shortDate(bestWeek.weekStart)}), with ${fmtWhole(bestWeek.amount)} from ${plural(bestWeek.payments, 'payment')}.`
                    : 'No payments have been recorded for this term yet.'}
            >
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-gray-300">Collected per week of term (ZMW)</p>
                        {bestWeek ? (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                                        <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis
                                            width={44}
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`)}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                                            formatter={(value, _name, item) => [`${fmt(Number(value ?? 0))} · ${plural(item?.payload?.payments || 0, 'payment')}`, 'Collected']}
                                            labelFormatter={(_label, payload) => {
                                                const week = payload?.[0]?.payload;
                                                return week ? `Week ${week.week}, from ${shortDate(week.weekStart)} · running total ${fmtWhole(week.cumulative)}` : '';
                                            }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="amount" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <EmptyNote>Payments recorded against this term will appear here week by week.</EmptyNote>
                        )}
                    </div>

                    <div>
                        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-gray-300">By payment method</p>
                        {paymentMethods.length === 0 ? (
                            <EmptyNote>No payments yet.</EmptyNote>
                        ) : (
                            <ul className="space-y-4">
                                {paymentMethods.map(method => {
                                    const share = methodsTotal > 0 ? Math.round((method.amount / methodsTotal) * 100) : 0;
                                    return (
                                        <li key={method.method}>
                                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                                <span className="font-medium text-slate-700 dark:text-gray-200">{formatMethod(method.method)}</span>
                                                <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{fmtWhole(method.amount)}</span>
                                            </div>
                                            <ProgressBar value={share} label={`${formatMethod(method.method)} share of collections`} tone="bg-primary" className="mt-2" />
                                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{share}% of collections · {plural(method.count, 'payment')}</p>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </Section>

            {/* Which classes are behind */}
            <Section title="Which classes are behind" story={classStory}>
                {classCollection.length === 0 ? (
                    <EmptyNote>Once fees are assigned, each class's progress shows here, weakest first.</EmptyNote>
                ) : (
                    <div className="-mx-5 overflow-x-auto sm:mx-0">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-gray-400">
                                    <th className="px-5 py-2 sm:pl-0">Class</th>
                                    <th className="px-3 py-2 text-right">Students</th>
                                    <th className="px-3 py-2 text-right">Billed (ZMW)</th>
                                    <th className="px-3 py-2 w-48">Settled</th>
                                    <th className="px-3 py-2 text-right">Still owed (ZMW)</th>
                                    <th className="px-5 py-2 text-right sm:pr-0">Owing</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {classCollection.map(cls => (
                                    <tr key={cls.className}>
                                        <td className="px-5 py-3 font-medium text-slate-800 dark:text-white sm:pl-0">{cls.className}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-gray-300">{cls.students}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-gray-300">{amount(cls.billed)}</td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-3">
                                                <ProgressBar value={cls.rate} label={`${cls.className} settled`} tone={rateTone(cls.rate)} className="flex-1" />
                                                <span className="w-10 text-right tabular-nums text-slate-600 dark:text-gray-300">{cls.rate}%</span>
                                            </div>
                                        </td>
                                        <td className={`px-3 py-3 text-right font-semibold tabular-nums ${cls.owed > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-500'}`}>{amount(cls.owed)}</td>
                                        <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-gray-300 sm:pr-0">{cls.debtors} of {cls.students}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* How overdue is the debt */}
            <Section
                title="How overdue is the debt"
                story={debtStory}
                action={debtors.length > 0 && (
                    <>
                        <ExportDropdown
                            data={exportRows}
                            filename={`debtors-${academicTerm.name.replace(/\s+/g, '-').toLowerCase()}`}
                            columns={[
                                { key: 'name', header: 'Student' },
                                { key: 'admissionNumber', header: 'Admission No.' },
                                { key: 'className', header: 'Class' },
                                { key: 'dueDate', header: 'Due date' },
                                { key: 'daysOverdue', header: 'Days late' },
                                { key: 'guardian', header: 'Guardian' },
                                { key: 'phone', header: 'Phone' },
                                { key: 'email', header: 'Email' },
                                { key: 'billed', header: 'Billed (ZMW)' },
                                { key: 'paid', header: 'Paid (ZMW)' },
                                { key: 'balance', header: 'Owed (ZMW)' },
                            ]}
                        />
                        {onOpenReminders && (
                            <button
                                onClick={onOpenReminders}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
                            >
                                <Bell className="h-4 w-4" />
                                Send reminders
                            </button>
                        )}
                    </>
                )}
            >
                {debtors.length === 0 ? (
                    <EmptyNote>{summary.billed > 0 ? 'Every billed student is fully paid.' : 'Nothing has been billed yet.'}</EmptyNote>
                ) : (
                    <>
                        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" role="img" aria-label="Owed amount split by how late it is">
                            {ageing.filter(b => b.amount > 0).map(b => (
                                <div key={b.bucket} className={AGEING[b.bucket].tone} style={{ width: `${(b.amount / summary.owed) * 100}%` }} title={`${AGEING[b.bucket].label}: ${fmtWhole(b.amount)}`} />
                            ))}
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                            {ageing.map(b => (
                                <div key={b.bucket} className={`rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40 ${b.amount === 0 ? 'opacity-60' : ''}`}>
                                    <dt className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGEING[b.bucket].tone}`} />
                                        {AGEING[b.bucket].label}
                                    </dt>
                                    <dd className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-white">{fmtWhole(b.amount)}</dd>
                                    <dd className="text-xs text-slate-500 dark:text-gray-400">{plural(b.students, 'student')}</dd>
                                </div>
                            ))}
                        </dl>

                        {noContact > 0 && (
                            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                {plural(noContact, 'student')} owing {noContact === 1 ? 'has' : 'have'} no guardian phone or email, so reminders cannot reach them.
                            </p>
                        )}

                        <div className="-mx-5 mt-4 overflow-x-auto sm:mx-0">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-gray-400">
                                        <th className="px-5 py-2 sm:pl-0">Student</th>
                                        <th className="px-3 py-2">Due</th>
                                        <th className="px-3 py-2">Guardian</th>
                                        <th className="px-3 py-2 text-right">Paid (ZMW)</th>
                                        <th className="px-5 py-2 text-right sm:pr-0">Owed (ZMW)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {debtors.map(d => (
                                        <tr key={d.studentId}>
                                            <td className="px-5 py-3 sm:pl-0">
                                                <p className="font-medium text-slate-800 dark:text-white">{d.name}</p>
                                                <p className="text-xs text-slate-500 dark:text-gray-400">{d.admissionNumber} · {d.className}</p>
                                            </td>
                                            <td className="px-3 py-3">
                                                <p className="text-slate-700 dark:text-gray-200">{d.earliestDueDate ? formatPaymentDate(d.earliestDueDate) : 'No due date'}</p>
                                                <p className={`text-xs ${d.daysOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-gray-400'}`}>
                                                    {d.daysOverdue > 0 ? `${plural(d.daysOverdue, 'day')} late` : 'Not yet due'}
                                                </p>
                                            </td>
                                            <td className="px-3 py-3">
                                                {d.guardianPhone || d.guardianEmail ? (
                                                    <>
                                                        <p className="text-slate-700 dark:text-gray-200">{d.guardianName || 'Guardian'}</p>
                                                        <p className="text-xs text-slate-500 dark:text-gray-400">{d.guardianPhone || d.guardianEmail}</p>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-amber-700 dark:text-amber-300">No contact on file</p>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-gray-300">{amount(d.paid)}</td>
                                            <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white sm:pr-0">{amount(d.balance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Section>

            {/* Books for the term */}
            <Section
                title="Books for the term"
                story="From the general ledger for the term dates. Surplus counts income when it is earned; cash shows money that actually moved in and out of the accounts."
            >
                {!ledger ? (
                    <EmptyNote>Ledger figures are not available right now. Refresh to try again.</EmptyNote>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/40">
                            <p className="text-sm text-slate-500 dark:text-gray-400">{netSurplus >= 0 ? 'Surplus' : 'Deficit'}</p>
                            <p className={`mt-1 text-xl font-semibold tabular-nums ${netSurplus >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>{fmtWhole(Math.abs(netSurplus))}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Income {fmtWhole(ledger.income)} · expenses {fmtWhole(ledger.expenses)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/40">
                            <p className="text-sm text-slate-500 dark:text-gray-400">Net cash {netCash >= 0 ? 'in' : 'out'}</p>
                            <p className={`mt-1 text-xl font-semibold tabular-nums ${netCash >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>{fmtWhole(Math.abs(netCash))}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">In {fmtWhole(ledger.cashIn)} · out {fmtWhole(ledger.cashOut)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/40">
                            <p className="text-sm text-slate-500 dark:text-gray-400">Refunds</p>
                            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{fmtWhole(sumRefunds(processedRefunds))} paid out</p>
                            <p className={`mt-1 text-xs ${pendingRefunds.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-gray-400'}`}>
                                {pendingRefunds.length > 0
                                    ? `${plural(pendingRefunds.length, 'refund')} (${fmtWhole(sumRefunds(pendingRefunds))}) waiting for approval`
                                    : 'No refunds waiting for approval'}
                            </p>
                        </div>
                    </div>
                )}
            </Section>
        </div>
    );
};

export default FinanceReports;
