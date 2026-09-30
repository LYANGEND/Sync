import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  WalletCards,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsDashboard } from '../../services/analyticsService';

export type AnalyticsPeriod = 30 | 90 | 180;

interface DashboardAnalyticsProps {
  analytics: AnalyticsDashboard | null;
  loading: boolean;
  unavailable: boolean;
  periodDays: AnalyticsPeriod;
  dataPeriodDays: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  onRetry: () => void | Promise<void>;
}

interface TrendPoint {
  week: string;
  amount: number;
  average: number;
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
}

interface AnalyticsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipEntry[];
}

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
];

const CHART_COLORS = {
  primary: 'var(--primary-color, #0047AB)',
  secondary: 'var(--secondary-color, #475569)',
  border: 'var(--border-color, #E5E7EB)',
  text: 'var(--text-secondary, #6B7280)',
};

const currencyFormatter = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
  currencyDisplay: 'code',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullCurrencyFormatter = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
  currencyDisplay: 'code',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-ZM', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat('en-ZM', {
  maximumFractionDigits: 0,
});

const toFiniteNumber = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const safeNumber = (value: unknown) => toFiniteNumber(value) ?? 0;

const parseWeek = (week: string) => {
  const parsed = new Date(`${week}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatWeek = (week: string) => {
  const parsed = parseWeek(week);
  return parsed
    ? new Intl.DateTimeFormat('en-ZM', { day: 'numeric', month: 'short' }).format(parsed)
    : week;
};

const formatUpdatedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently updated';

  return `Updated ${new Intl.DateTimeFormat('en-ZM', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)}`;
};

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return prefersReducedMotion;
};

const AnalyticsTooltip = ({ active, label, payload }: AnalyticsTooltipProps) => {
  if (!active || !payload?.length || label === undefined || label === null) return null;

  const collected = safeNumber(payload.find(item => item.dataKey === 'amount')?.value);
  const average = safeNumber(payload.find(item => item.dataKey === 'average')?.value);
  const formattedLabel = formatWeek(String(label));

  return (
    <div className="pointer-events-none rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/95">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Week of {formattedLabel}</p>
      <dl className="mt-1.5 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-5">
          <dt className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            Collections
          </dt>
          <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">{fullCurrencyFormatter.format(collected)}</dd>
        </div>
        <div className="flex items-center justify-between gap-5">
          <dt className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="size-2 rounded-full bg-slate-400" aria-hidden="true" />
            3-week average
          </dt>
          <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">{fullCurrencyFormatter.format(average)}</dd>
        </div>
      </dl>
    </div>
  );
};

const DashboardAnalytics = ({
  analytics,
  loading,
  unavailable,
  periodDays,
  dataPeriodDays,
  onPeriodChange,
  onRetry,
}: DashboardAnalyticsProps) => {
  const instanceId = useId().replace(/:/g, '');
  const titleId = `dashboard-analytics-title-${instanceId}`;
  const chartTitleId = `dashboard-analytics-chart-title-${instanceId}`;
  const chartDescriptionId = `dashboard-analytics-chart-description-${instanceId}`;
  const gradientId = `dashboard-collections-fill-${instanceId}`;
  const periodSelectId = `dashboard-analytics-period-${instanceId}`;
  const prefersReducedMotion = usePrefersReducedMotion();

  const trendData = useMemo<TrendPoint[]>(() => {
    const rawTrend = analytics?.revenue?.weeklyTrend;
    if (!Array.isArray(rawTrend)) return [];

    const totalsByWeek = new Map<string, number>();
    rawTrend.forEach(point => {
      const amount = toFiniteNumber(point?.amount);
      if (!point?.week || !parseWeek(point.week) || amount === null) return;
      totalsByWeek.set(point.week, (totalsByWeek.get(point.week) ?? 0) + amount);
    });

    const points = Array.from(totalsByWeek, ([week, amount]) => ({ week, amount }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return points.map((point, index) => {
      const window = points.slice(Math.max(0, index - 2), index + 1);
      const average = window.reduce((sum, current) => sum + current.amount, 0) / window.length;

      return {
        ...point,
        average: Math.round(average * 100) / 100,
      };
    });
  }, [analytics]);

  if (loading && !analytics) {
    return (
      <section
        className="overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-800"
        aria-label="Loading school analytics"
        aria-busy="true"
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-4 sm:px-5 dark:border-slate-700">
          <div className="size-10 animate-pulse rounded-xl bg-gray-200 motion-reduce:animate-none dark:bg-slate-700" />
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-slate-700" />
            <div className="h-3 w-40 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-slate-700/60" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 p-4 sm:p-5">
              <div className="size-8 animate-pulse rounded-lg bg-gray-100 motion-reduce:animate-none dark:bg-slate-700/60" />
              <div className="h-7 w-24 max-w-full animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-slate-700" />
              <div className="h-3 w-20 max-w-full animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-slate-700/60" />
            </div>
          ))}
        </div>
        <div className="mx-4 mb-5 h-64 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none sm:mx-5 dark:bg-slate-700/60" />
      </section>
    );
  }

  if (!analytics) {
    return (
      <section
        className="flex min-h-56 items-center justify-center rounded-[20px] border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-600 dark:bg-slate-800"
        role="alert"
        aria-labelledby={titleId}
      >
        <div className="max-w-sm">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-50 text-primary dark:bg-blue-950/40">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <h2 id={titleId} className="mt-3 text-base font-semibold text-gray-900 dark:text-white">Analytics unavailable</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">The dashboard is still available. Try loading the analytics again.</p>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="mx-auto mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none dark:focus-visible:ring-offset-slate-800"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </section>
    );
  }

  const riskTotals = (Array.isArray(analytics.risk?.byLevel) ? analytics.risk.byLevel : [])
    .reduce<Record<string, number>>((totals, risk) => {
      const level = typeof risk?.level === 'string' ? risk.level.toUpperCase() : 'UNKNOWN';
      totals[level] = (totals[level] ?? 0) + safeNumber(risk?.count);
      return totals;
    }, {});

  const totalRevenue = safeNumber(analytics.revenue?.totalRevenue);
  const transactionCount = safeNumber(analytics.revenue?.transactionCount);
  const averagePayment = transactionCount > 0 ? totalRevenue / transactionCount : 0;
  const attendanceRate = Math.min(100, Math.max(0, safeNumber(analytics.attendance?.rate)));
  const highRiskStudents = (riskTotals.HIGH ?? 0) + (riskTotals.CRITICAL ?? 0);
  const periodLabel = PERIOD_OPTIONS.find(option => option.value === dataPeriodDays)?.label ?? `Last ${dataPeriodDays} days`;
  const chartSummary = trendData.length > 0
    ? `${trendData.length} reported weeks, ranging from ${fullCurrencyFormatter.format(Math.min(...trendData.map(point => point.amount)))} to ${fullCurrencyFormatter.format(Math.max(...trendData.map(point => point.amount)))}.`
    : 'No weekly collection data is available for this period.';

  const metrics = [
    {
      label: 'Collections',
      value: currencyFormatter.format(totalRevenue),
      note: `${integerFormatter.format(transactionCount)} completed payments`,
      Icon: WalletCards,
      iconClass: 'bg-blue-50 text-primary dark:bg-blue-950/40 dark:text-blue-300',
      accentClass: 'bg-primary',
      border: '',
    },
    {
      label: 'Payments',
      value: numberFormatter.format(transactionCount),
      note: `${currencyFormatter.format(averagePayment)} average`,
      Icon: CreditCard,
      iconClass: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
      accentClass: 'bg-accent',
      border: 'border-l border-gray-200 dark:border-slate-700',
    },
    {
      label: 'Attendance',
      value: `${attendanceRate.toFixed(1)}%`,
      note: `${integerFormatter.format(safeNumber(analytics.attendance?.present))} present · ${integerFormatter.format(safeNumber(analytics.attendance?.late))} late`,
      Icon: UserCheck,
      iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      accentClass: 'bg-emerald-500',
      border: 'border-t border-gray-200 md:border-l md:border-t-0 dark:border-slate-700',
    },
    {
      label: 'High-risk students',
      value: numberFormatter.format(highRiskStudents),
      note: `${integerFormatter.format(riskTotals.CRITICAL ?? 0)} critical · ${integerFormatter.format(riskTotals.HIGH ?? 0)} high`,
      Icon: ShieldAlert,
      iconClass: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
      accentClass: 'bg-red-500',
      border: 'border-l border-t border-gray-200 md:border-t-0 dark:border-slate-700',
    },
  ];

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-800"
      aria-labelledby={titleId}
      aria-busy={loading}
    >
      <header className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary dark:bg-blue-950/40 dark:text-blue-300">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-white">Analytics</h2>
              {loading && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary dark:text-blue-300" role="status">
                  <RefreshCw className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Updating
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-600 dark:text-gray-300">
              <Clock3 className="size-3 shrink-0" aria-hidden="true" />
              {formatUpdatedAt(analytics.generatedAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={periodSelectId} className="sr-only">Analytics period</label>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <select
              id={periodSelectId}
              value={periodDays}
              onChange={event => onPeriodChange(Number(event.target.value) as AnalyticsPeriod)}
              disabled={loading}
              className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3 pr-9 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none sm:w-auto dark:border-slate-600 dark:bg-slate-900/50 dark:text-gray-200 dark:hover:border-slate-500"
            >
              {PERIOD_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          </div>
          <Link
            to="/analytics"
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none dark:text-blue-300 dark:hover:bg-blue-950/40 dark:focus-visible:ring-offset-slate-800"
          >
            Details
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {unavailable && (
        <div className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-amber-900/60 dark:bg-amber-950/30" role="status">
          <p className="text-amber-900 dark:text-amber-200">
            Could not refresh. Showing the last loaded {dataPeriodDays}-day view.
          </p>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-lg px-2 font-semibold text-amber-900 transition-colors duration-150 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 motion-reduce:transition-none sm:min-h-9 sm:self-auto dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4">
        {metrics.map(metric => (
          <div key={metric.label} className={`relative min-w-0 overflow-hidden px-4 py-4 sm:px-5 ${metric.border}`}>
            <span className={`absolute inset-x-0 top-0 h-0.5 ${metric.accentClass}`} aria-hidden="true" />
            <div className="mb-3 flex items-center gap-2">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${metric.iconClass}`}>
                <metric.Icon className="size-4" aria-hidden="true" />
              </span>
              <p className="truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{metric.label}</p>
            </div>
            <p className="truncate text-xl font-bold tracking-tight tabular-nums text-gray-950 sm:text-2xl dark:text-white" title={metric.value}>{metric.value}</p>
            <p className="mt-1 truncate text-xs leading-5 text-gray-500 dark:text-gray-400" title={metric.note}>{metric.note}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 px-3 pb-5 pt-4 sm:px-5 dark:border-slate-700">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={chartTitleId} className="text-sm font-semibold text-gray-900 dark:text-white">Weekly collections</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-slate-700 dark:text-gray-300">
                {trendData.length} {trendData.length === 1 ? 'week' : 'weeks'}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-gray-600 dark:text-gray-300">Actual revenue compared with the three-week rolling trend</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-300" aria-label="Chart legend">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-primary" aria-hidden="true" />Collections</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-slate-400" aria-hidden="true" />3-week average</span>
          </div>
        </div>

        {trendData.length > 0 ? (
          <>
            <figure aria-labelledby={chartTitleId} aria-describedby={chartDescriptionId}>
              <figcaption id={chartDescriptionId} className="sr-only">
                {periodLabel}. {chartSummary} Use the chart data disclosure below for exact values.
              </figcaption>
              <div className="h-64 w-full text-gray-500 sm:h-72 lg:h-80 dark:text-gray-400">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 10, right: 8, left: -4, bottom: 0 }} accessibilityLayer>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.015} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 4" vertical={false} />
                    <XAxis
                      dataKey="week"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                      tickFormatter={formatWeek}
                      minTickGap={28}
                      interval="preserveStartEnd"
                      padding={{ left: 8, right: 8 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                      tickFormatter={value => numberFormatter.format(safeNumber(value))}
                      width={50}
                      allowDecimals={false}
                    />
                    <Tooltip content={<AnalyticsTooltip />} cursor={{ stroke: CHART_COLORS.border, strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Collections"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2.5}
                      fill={`url(#${gradientId})`}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF', fill: CHART_COLORS.primary }}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={650}
                    />
                    <Line
                      type="monotone"
                      dataKey="average"
                      name="3-week average"
                      stroke={CHART_COLORS.secondary}
                      strokeWidth={1.75}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={650}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </figure>

            <details className="group mt-2 rounded-lg">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none [&::-webkit-details-marker]:hidden dark:text-gray-300 dark:hover:bg-slate-700 dark:hover:text-white">
                View chart data
                <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <p className="mb-2 px-2 text-xs text-gray-500 sm:hidden dark:text-gray-400">Swipe horizontally to see all columns.</p>
              <div className="mt-1 overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
                <table className="w-full min-w-[440px] text-left text-xs">
                  <caption className="sr-only">Weekly collections and rolling average for {periodLabel.toLowerCase()}</caption>
                  <thead className="bg-gray-50 text-gray-700 dark:bg-slate-700 dark:text-gray-200">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Week</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Collections</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">3-week average</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-gray-700 dark:divide-slate-700 dark:text-gray-200">
                    {trendData.map(point => (
                      <tr key={point.week} className="transition-colors duration-150 hover:bg-gray-50 motion-reduce:transition-none dark:hover:bg-slate-700/50">
                        <td className="px-3 py-2">{formatWeek(point.week)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fullCurrencyFormatter.format(point.amount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fullCurrencyFormatter.format(point.average)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <div className="grid h-64 place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center dark:border-slate-600 dark:bg-slate-900/30">
            <div className="max-w-sm">
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-white text-gray-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                <BarChart3 className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-100">No collection trend yet</p>
              <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">Completed payments in this period will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default DashboardAnalytics;
