import { useId, type ComponentType, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  GraduationCap,
  Landmark,
  ReceiptText,
  School,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AnalyticsDashboard,
  AttendanceAnalytics,
  RevenueAnalytics,
  SchoolHealth,
} from '../../services/analyticsService';

const COLORS = {
  primary: 'var(--primary-color, #0047AB)',
  secondary: 'var(--secondary-color, #475569)',
  accent: 'var(--accent-color, #FF9933)',
  green: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
  slate: '#64748B',
  grid: 'var(--border-color, #E5E7EB)',
  text: 'var(--text-secondary, #6B7280)',
};

const METHOD_COLORS = [COLORS.primary, COLORS.accent, COLORS.green, COLORS.slate, '#0D9488'];

const compactNumber = new Intl.NumberFormat('en-ZM', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const wholeNumber = new Intl.NumberFormat('en-ZM', { maximumFractionDigits: 0 });

const compactCurrency = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
  currencyDisplay: 'code',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullCurrency = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
  currencyDisplay: 'code',
  maximumFractionDigits: 0,
});

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: string) => {
  const normalized = value.length === 7 ? `${value}-01` : value;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: string) => {
  const parsed = parseDate(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat('en-ZM', {
    day: value.length === 7 ? undefined : 'numeric',
    month: 'short',
  }).format(parsed);
};

const normalizeLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase();

interface TooltipEntry {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipEntry[];
  currencyKeys?: string[];
  percentKeys?: string[];
}

const ChartTooltip = ({
  active,
  label,
  payload,
  currencyKeys = [],
  percentKeys = [],
}: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="pointer-events-none min-w-44 rounded-xl border border-gray-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/95">
      {label !== undefined && label !== null && (
        <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">{formatDate(String(label))}</p>
      )}
      <dl className="space-y-1.5 text-xs">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? index);
          const numericValue = safeNumber(entry.value);
          const formattedValue = currencyKeys.includes(key)
            ? fullCurrency.format(numericValue)
            : percentKeys.includes(key)
              ? `${numericValue.toFixed(1)}%`
              : wholeNumber.format(numericValue);

          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-5">
              <dt className="flex items-center gap-1.5 capitalize text-gray-600 dark:text-gray-300">
                <span className="size-2 rounded-full" style={{ backgroundColor: entry.color ?? COLORS.primary }} aria-hidden="true" />
                {String(entry.name ?? key).replaceAll('_', ' ')}
              </dt>
              <dd className="font-semibold tabular-nums text-gray-950 dark:text-white">{formattedValue}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
};

interface MetricCardProps {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
  detail: string;
  tone?: 'blue' | 'green' | 'orange' | 'red' | 'slate';
}

const metricTones = {
  blue: {
    icon: 'bg-blue-50 text-primary dark:bg-blue-950/40 dark:text-blue-300',
    accent: 'bg-primary',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    accent: 'bg-emerald-500',
  },
  orange: {
    icon: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
    accent: 'bg-accent',
  },
  red: {
    icon: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
    accent: 'bg-red-500',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
    accent: 'bg-slate-500',
  },
};

const MetricCard = ({ icon: Icon, label, value, detail, tone = 'blue' }: MetricCardProps) => {
  const palette = metricTones[tone];

  return (
    <article className="relative overflow-hidden rounded-[18px] border border-gray-200 bg-white p-4 shadow-[0_8px_26px_-22px_rgba(15,23,42,0.24)] sm:p-5 dark:border-slate-700 dark:bg-slate-800">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${palette.accent}`} aria-hidden="true" />
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${palette.icon}`}>
          <Icon className="size-[18px]" aria-hidden={true} />
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className="mt-4 truncate text-2xl font-bold tracking-tight tabular-nums text-gray-950 dark:text-white" title={value}>{value}</p>
      <p className="mt-1 truncate text-xs leading-5 text-gray-600 dark:text-gray-300" title={detail}>{detail}</p>
    </article>
  );
};

interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

const SectionCard = ({ title, description, action, children, className = '' }: SectionCardProps) => (
  <section className={`overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_8px_32px_-24px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-800 ${className}`}>
    <header className="flex flex-col gap-2 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-700">
      <div>
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-gray-600 dark:text-gray-300">{description}</p>}
      </div>
      {action}
    </header>
    <div className="p-4 sm:p-5">{children}</div>
  </section>
);

const EmptyChart = ({ title, description }: { title: string; description: string }) => (
  <div className="grid min-h-60 place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center dark:border-slate-600 dark:bg-slate-900/30">
    <div className="max-w-sm">
      <span className="mx-auto grid size-10 place-items-center rounded-xl bg-white text-gray-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
        <TrendingUp className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{description}</p>
    </div>
  </div>
);

const ChartFigure = ({ label, description, children }: { label: string; description: string; children: ReactNode }) => (
  <figure aria-label={label}>
    <figcaption className="sr-only">{description}</figcaption>
    {children}
  </figure>
);

export const OverviewPanel = ({
  dashboard,
  health,
  periodDays,
}: {
  dashboard: AnalyticsDashboard;
  health: SchoolHealth | null;
  periodDays: number;
}) => {
  const instanceId = useId().replace(/:/g, '');
  const gradientId = `analytics-overview-revenue-${instanceId}`;
  const weeklyTrend = [...(dashboard.revenue.weeklyTrend ?? [])]
    .filter(point => point.week && Number.isFinite(Number(point.amount)))
    .sort((a, b) => a.week.localeCompare(b.week));
  const classes = [...(dashboard.enrollment.byGrade ?? [])]
    .sort((a, b) => a.gradeLevel - b.gradeLevel)
    .slice(0, 12);
  const subjects = [...(dashboard.academic.subjectPerformance ?? [])]
    .sort((a, b) => a.average - b.average)
    .slice(0, 10);
  const highRisk = (dashboard.risk.byLevel ?? [])
    .filter(item => ['HIGH', 'CRITICAL'].includes(item.level?.toUpperCase()))
    .reduce((sum, item) => sum + safeNumber(item.count), 0);
  const presentAndLate = safeNumber(dashboard.attendance.present) + safeNumber(dashboard.attendance.late);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Enrollment" value={wholeNumber.format(safeNumber(dashboard.enrollment.total))} detail={`${classes.length} classes reporting`} tone="blue" />
        <MetricCard icon={WalletCards} label="Collections" value={compactCurrency.format(safeNumber(dashboard.revenue.totalRevenue))} detail={`${wholeNumber.format(safeNumber(dashboard.revenue.transactionCount))} completed payments`} tone="green" />
        <MetricCard icon={UserCheck} label="Attendance" value={`${safeNumber(dashboard.attendance.rate).toFixed(1)}%`} detail={`${wholeNumber.format(presentAndLate)} present or late`} tone="orange" />
        <MetricCard icon={GraduationCap} label="Academic average" value={`${safeNumber(dashboard.academic.averageScore).toFixed(1)}%`} detail={`${safeNumber(dashboard.academic.passRate).toFixed(0)}% pass rate`} tone={dashboard.academic.passRate >= 60 ? 'blue' : 'red'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <SectionCard
          title="Collection momentum"
          description={`Completed payment revenue over the last ${periodDays} days`}
          action={<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-primary dark:bg-blue-950/40 dark:text-blue-300">{weeklyTrend.length} weeks</span>}
        >
          {weeklyTrend.length > 0 ? (
            <ChartFigure label="Collection momentum chart" description="Weekly completed payment revenue for the selected reporting period.">
              <div className="h-72 w-full lg:h-80">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <ComposedChart data={weeklyTrend} margin={{ top: 12, right: 8, left: -4, bottom: 0 }} accessibilityLayer>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.015} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="week" tickFormatter={formatDate} axisLine={false} tickLine={false} minTickGap={28} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis tickFormatter={value => compactNumber.format(safeNumber(value))} axisLine={false} tickLine={false} width={48} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip currencyKeys={['amount']} />} cursor={{ stroke: COLORS.grid }} />
                    <Area type="monotone" dataKey="amount" name="Collections" stroke={COLORS.primary} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartFigure>
          ) : (
            <EmptyChart title="No collection trend yet" description="Completed payments in this period will appear here." />
          )}
        </SectionCard>

        <SectionCard title="Student risk signals" description="Students currently flagged by risk level">
          {dashboard.risk.total > 0 ? (
            <div className="space-y-3">
              {(dashboard.risk.byLevel ?? []).map(item => {
                const level = item.level?.toUpperCase() ?? 'UNKNOWN';
                const palette = level === 'CRITICAL'
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                  : level === 'HIGH'
                    ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300'
                    : level === 'MEDIUM'
                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300';

                return (
                  <div key={level} className={`flex items-center justify-between rounded-xl border px-3.5 py-3 ${palette}`}>
                    <span className="text-xs font-semibold capitalize">{normalizeLabel(level)}</span>
                    <span className="text-lg font-bold tabular-nums">{wholeNumber.format(safeNumber(item.count))}</span>
                  </div>
                );
              })}
              <div className="mt-4 rounded-xl bg-slate-900 px-4 py-4 text-white dark:bg-slate-950">
                <p className="text-xs font-medium text-slate-300">Needs priority review</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{wholeNumber.format(highRisk)}</p>
                <p className="mt-1 text-xs text-slate-400">High and critical risk students</p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-60 place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-8 text-emerald-500" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No students flagged</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">No active risk assessments require review.</p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Enrollment by class" description="Current student distribution across classes">
          {classes.length > 0 ? (
            <ChartFigure label="Enrollment by class chart" description="Horizontal bars compare the number of enrolled students in each class.">
              <div style={{ height: Math.max(260, classes.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <BarChart data={classes} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }} accessibilityLayer>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 4" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis type="category" dataKey="className" width={88} axisLine={false} tickLine={false} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                    <Bar dataKey="students" name="Students" fill={COLORS.primary} radius={[0, 6, 6, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartFigure>
          ) : (
            <EmptyChart title="No enrollment data" description="Class enrollment will appear when students are assigned to classes." />
          )}
        </SectionCard>

        <SectionCard title="Subjects needing attention" description="Lowest average scores appear first">
          {subjects.length > 0 ? (
            <ChartFigure label="Subject performance chart" description="Horizontal bars compare average subject scores for the active academic term.">
              <div style={{ height: Math.max(260, subjects.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <BarChart data={subjects} layout="vertical" margin={{ top: 4, right: 16, left: 14, bottom: 0 }} accessibilityLayer>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 4" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis type="category" dataKey="subject" width={92} axisLine={false} tickLine={false} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <ReferenceLine x={50} stroke={COLORS.amber} strokeDasharray="4 4" />
                    <Tooltip content={<ChartTooltip percentKeys={['average']} />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                    <Bar dataKey="average" name="Average" fill={COLORS.accent} radius={[0, 6, 6, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartFigure>
          ) : (
            <EmptyChart title="No assessment results yet" description="Subject performance will appear after results are recorded for the active term." />
          )}
        </SectionCard>
      </div>

      {health && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={CircleDollarSign} label="Fee collection" value={`${safeNumber(health.metrics.feeCollectionRate).toFixed(0)}%`} detail="Current collection rate" tone="green" />
          <MetricCard icon={GraduationCap} label="Teachers" value={wholeNumber.format(safeNumber(health.metrics.activeTeachers))} detail={`${safeNumber(health.metrics.studentTeacherRatio).toFixed(0)}:1 student ratio`} tone="blue" />
          <MetricCard icon={School} label="Classes" value={wholeNumber.format(safeNumber(health.metrics.totalClasses))} detail={health.metrics.currentTerm || 'Current term'} tone="slate" />
          <MetricCard icon={ShieldAlert} label="Priority risk" value={wholeNumber.format(safeNumber(health.metrics.atRiskStudents))} detail="High and critical students" tone="red" />
        </div>
      )}
    </div>
  );
};

export const RevenuePanel = ({ revenue, periodDays }: { revenue: RevenueAnalytics; periodDays: number }) => {
  const instanceId = useId().replace(/:/g, '');
  const gradientId = `analytics-revenue-fill-${instanceId}`;
  const chartData = [...(revenue.chartData ?? [])]
    .filter(point => point.date && Number.isFinite(Number(point.amount)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const methods = (revenue.methodDistribution ?? []).filter(method => safeNumber(method.amount) > 0);
  const averagePayment = safeNumber(revenue.summary.averagePayment);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Landmark} label="Collected" value={compactCurrency.format(safeNumber(revenue.summary.totalCollected))} detail={`Last ${periodDays} days`} tone="green" />
        <MetricCard icon={ReceiptText} label="Transactions" value={wholeNumber.format(safeNumber(revenue.summary.totalTransactions))} detail="Completed payments" tone="blue" />
        <MetricCard icon={CreditCard} label="Average payment" value={compactCurrency.format(averagePayment)} detail="Per completed transaction" tone="orange" />
        <MetricCard icon={WalletCards} label="Payment methods" value={wholeNumber.format(methods.length)} detail="Methods used in this period" tone="slate" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <SectionCard title="Revenue trend" description="Completed payment value and transaction volume">
          {chartData.length > 0 ? (
            <ChartFigure label="Revenue trend chart" description="Revenue amounts are shown as an area with transaction counts shown as a dashed line.">
              <div className="h-80 w-full lg:h-[360px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <ComposedChart data={chartData} margin={{ top: 12, right: 4, left: -4, bottom: 0 }} accessibilityLayer>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={COLORS.green} stopOpacity={0.015} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis yAxisId="amount" tickFormatter={value => compactNumber.format(safeNumber(value))} axisLine={false} tickLine={false} width={48} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis yAxisId="count" orientation="right" allowDecimals={false} axisLine={false} tickLine={false} width={32} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip currencyKeys={['amount']} />} cursor={{ stroke: COLORS.grid }} />
                    <Area yAxisId="amount" type="monotone" dataKey="amount" name="Revenue" stroke={COLORS.green} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }} />
                    <Line yAxisId="count" type="monotone" dataKey="count" name="Payments" stroke={COLORS.secondary} strokeWidth={1.75} strokeDasharray="5 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartFigure>
          ) : (
            <EmptyChart title="No completed payments" description="Revenue activity will appear when completed payments are recorded in this period." />
          )}
        </SectionCard>

        <SectionCard title="Payment mix" description="Collection value by payment method">
          {methods.length > 0 ? (
            <div>
              <ChartFigure label="Payment method distribution" description="A donut chart shows the share of collected value by payment method.">
                <div className="mx-auto h-56 max-w-xs">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                    <PieChart accessibilityLayer>
                      <Pie data={methods} dataKey="amount" nameKey="method" cx="50%" cy="50%" innerRadius={58} outerRadius={86} paddingAngle={3} stroke="none">
                        {methods.map((method, index) => <Cell key={method.method} fill={METHOD_COLORS[index % METHOD_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip currencyKeys={['amount']} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartFigure>
              <div className="mt-2 space-y-2.5">
                {methods.map((method, index) => (
                  <div key={method.method} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-200">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: METHOD_COLORS[index % METHOD_COLORS.length] }} aria-hidden="true" />
                      <span className="truncate capitalize">{normalizeLabel(method.method)}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-gray-950 dark:text-white">{safeNumber(method.percentage).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart title="No payment mix yet" description="Payment-method distribution will appear once collections are recorded." />
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export const AttendancePanel = ({ attendance }: { attendance: AttendanceAnalytics }) => {
  const dailyTrend = [...(attendance.dailyTrend ?? [])]
    .filter(point => point.date && Number.isFinite(Number(point.rate)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byClass = [...(attendance.byClass ?? [])]
    .filter(item => item.className)
    .sort((a, b) => a.attendanceRate - b.attendanceRate)
    .slice(0, 14);
  const totalRecords = byClass.reduce((sum, item) => sum + safeNumber(item.totalRecords), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={UserCheck} label="Attendance rate" value={`${safeNumber(attendance.overallRate).toFixed(1)}%`} detail="Present and late records" tone={attendance.overallRate >= 85 ? 'green' : 'orange'} />
        <MetricCard icon={Users} label="Students tracked" value={wholeNumber.format(safeNumber(attendance.totalStudentsTracked))} detail="In the active term" tone="blue" />
        <MetricCard icon={AlertTriangle} label="Open alerts" value={wholeNumber.format(safeNumber(attendance.alertsCount))} detail="Unresolved attendance alerts" tone={attendance.alertsCount > 0 ? 'red' : 'green'} />
        <MetricCard icon={Activity} label="Records" value={compactNumber.format(totalRecords)} detail={`${byClass.length} classes reporting`} tone="slate" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard title="30-day attendance trend" description="Daily school-wide attendance rate">
          {dailyTrend.length > 0 ? (
            <ChartFigure label="Attendance trend chart" description="Daily attendance rates are compared with the 85 percent target line.">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <LineChart data={dailyTrend} margin={{ top: 12, right: 12, left: -4, bottom: 0 }} accessibilityLayer>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} width={42} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <ReferenceLine y={85} stroke={COLORS.amber} strokeDasharray="5 4" label={{ value: '85% target', fill: COLORS.amber, fontSize: 10, position: 'insideTopRight' }} />
                    <Tooltip content={<ChartTooltip percentKeys={['rate']} />} cursor={{ stroke: COLORS.grid }} />
                    <Line type="monotone" dataKey="rate" name="Attendance" stroke={COLORS.primary} strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartFigure>
          ) : (
            <EmptyChart title="No recent attendance trend" description="Daily rates will appear as attendance registers are completed." />
          )}
        </SectionCard>

        <SectionCard title="Class attendance" description="Lowest attendance rates appear first">
          {byClass.length > 0 ? (
            <ChartFigure label="Class attendance chart" description="Horizontal bars compare attendance rates by class for the active term.">
              <div style={{ height: Math.max(320, byClass.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <BarChart data={byClass} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }} accessibilityLayer>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 4" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <YAxis type="category" dataKey="className" width={86} axisLine={false} tickLine={false} tick={{ fill: COLORS.text, fontSize: 11 }} />
                    <ReferenceLine x={85} stroke={COLORS.amber} strokeDasharray="4 4" />
                    <Tooltip content={<ChartTooltip percentKeys={['attendanceRate']} />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                    <Bar dataKey="attendanceRate" name="Attendance rate" fill={COLORS.primary} radius={[0, 6, 6, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartFigure>
          ) : (
            <EmptyChart title="No class attendance data" description="Class comparisons will appear when registers are recorded for the active term." />
          )}
        </SectionCard>
      </div>
    </div>
  );
};

const cleanInsight = (insight: string) => insight.replace(/^[^A-Za-z0-9]+/, '').trim();

export const HealthPanel = ({ health }: { health: SchoolHealth }) => {
  const collectionRate = safeNumber(health.metrics.feeCollectionRate);
  const attendanceRate = safeNumber(health.metrics.weeklyAttendanceRate);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Active students" value={wholeNumber.format(safeNumber(health.metrics.activeStudents))} detail={`${wholeNumber.format(safeNumber(health.metrics.activeTeachers))} active teachers`} tone="blue" />
        <MetricCard icon={GraduationCap} label="Student–teacher" value={`${safeNumber(health.metrics.studentTeacherRatio).toFixed(0)}:1`} detail="Current staffing ratio" tone={health.metrics.studentTeacherRatio <= 40 ? 'green' : 'orange'} />
        <MetricCard icon={CircleDollarSign} label="Fee collection" value={`${collectionRate.toFixed(0)}%`} detail="Current fee collection rate" tone={collectionRate >= 75 ? 'green' : collectionRate >= 50 ? 'orange' : 'red'} />
        <MetricCard icon={Activity} label="Weekly attendance" value={`${attendanceRate.toFixed(0)}%`} detail="Current weekly rate" tone={attendanceRate >= 85 ? 'green' : 'orange'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <SectionCard title="Operational health" description="Current school-wide performance indicators">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">Fee collection</span>
                <span className="font-bold tabular-nums text-gray-950 dark:text-white">{collectionRate.toFixed(0)}%</span>
              </div>
              <progress className="h-2.5 w-full overflow-hidden rounded-full accent-emerald-600" max={100} value={Math.min(100, Math.max(0, collectionRate))}>{collectionRate}%</progress>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">Weekly attendance</span>
                <span className="font-bold tabular-nums text-gray-950 dark:text-white">{attendanceRate.toFixed(0)}%</span>
              </div>
              <progress className="h-2.5 w-full overflow-hidden rounded-full accent-primary" max={100} value={Math.min(100, Math.max(0, attendanceRate))}>{attendanceRate}%</progress>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-gray-200 pt-5 sm:grid-cols-3 dark:border-slate-700">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-900/40">
                <BookOpen className="size-5 text-primary dark:text-blue-300" aria-hidden="true" />
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-950 dark:text-white">{wholeNumber.format(safeNumber(health.metrics.totalClasses))}</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Active classes</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-900/40">
                <ShieldAlert className="size-5 text-red-600 dark:text-red-300" aria-hidden="true" />
                <p className="mt-3 text-2xl font-bold tabular-nums text-gray-950 dark:text-white">{wholeNumber.format(safeNumber(health.metrics.atRiskStudents))}</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Priority risk</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-900/40">
                <Clock3 className="size-5 text-orange-600 dark:text-orange-300" aria-hidden="true" />
                <p className="mt-3 truncate text-base font-bold text-gray-950 dark:text-white" title={health.metrics.currentTerm}>{health.metrics.currentTerm || 'N/A'}</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Current term</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Recommended attention" description="Actionable signals from current school data">
          {health.insights.length > 0 ? (
            <ul className="space-y-3">
              {health.insights.map((insight, index) => {
                const warning = insight.includes('⚠') || insight.includes('🔴') || insight.includes('🟡') || /urgent|needed|review|consider/i.test(insight);
                const Icon = warning ? AlertTriangle : CheckCircle2;
                const palette = warning
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100';

                return (
                  <li key={`${index}-${insight.slice(0, 20)}`} className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-6 ${palette}`}>
                    <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
                    <span>{cleanInsight(insight)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid min-h-52 place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-8 text-emerald-500" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No urgent insights</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Current indicators do not require immediate action.</p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
