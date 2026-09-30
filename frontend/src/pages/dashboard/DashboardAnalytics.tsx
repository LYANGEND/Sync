import { useMemo } from 'react';
import { ArrowUpRight, BarChart3, ChevronDown } from 'lucide-react';
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

interface DashboardAnalyticsProps {
  analytics: AnalyticsDashboard | null;
  loading: boolean;
  unavailable: boolean;
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
  label?: string;
  payload?: TooltipEntry[];
}

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

const formatWeek = (week: string) => {
  const parsed = new Date(`${week}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? week
    : new Intl.DateTimeFormat('en-ZM', { day: 'numeric', month: 'short' }).format(parsed);
};

const AnalyticsTooltip = ({ active, label, payload }: AnalyticsTooltipProps) => {
  if (!active || !payload?.length || !label) return null;

  const collected = Number(payload.find(item => item.dataKey === 'amount')?.value ?? 0);
  const average = Number(payload.find(item => item.dataKey === 'average')?.value ?? 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-slate-600 dark:bg-slate-800">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Week of {formatWeek(label)}</p>
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

const DashboardAnalytics = ({ analytics, loading, unavailable }: DashboardAnalyticsProps) => {
  const trendData = useMemo<TrendPoint[]>(() => {
    if (!analytics) return [];

    return [...analytics.revenue.weeklyTrend]
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((point, index, points) => {
        const window = points.slice(Math.max(0, index - 2), index + 1);
        const average = window.reduce((sum, current) => sum + current.amount, 0) / window.length;

        return {
          ...point,
          average: Math.round(average * 100) / 100,
        };
      });
  }, [analytics]);

  if (loading) {
    return (
      <section
        className="overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-800"
        aria-label="Loading school analytics"
        aria-busy="true"
      >
        <div className="border-b border-gray-200 px-5 py-4 dark:border-slate-700">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 px-5 py-4">
              <div className="h-7 w-24 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-slate-700" />
              <div className="h-3 w-20 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-slate-700/60" />
            </div>
          ))}
        </div>
        <div className="mx-5 mb-5 h-64 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-slate-700/60" />
      </section>
    );
  }

  if (unavailable || !analytics) {
    return (
      <section className="flex min-h-40 items-center justify-center rounded-[20px] border border-dashed border-gray-300 bg-white p-6 text-center dark:border-slate-600 dark:bg-slate-800">
        <div>
          <BarChart3 className="mx-auto size-7 text-gray-400 dark:text-gray-500" aria-hidden="true" />
          <h2 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Analytics unavailable</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Pull down to refresh and try again.</p>
        </div>
      </section>
    );
  }

  const highRiskStudents = analytics.risk.byLevel.reduce((total, risk) => {
    return ['HIGH', 'CRITICAL'].includes(risk.level.toUpperCase()) ? total + risk.count : total;
  }, 0);

  const metrics = [
    {
      label: 'Collections',
      value: currencyFormatter.format(analytics.revenue.totalRevenue),
      note: 'Last 90 days',
      border: '',
    },
    {
      label: 'Payments',
      value: numberFormatter.format(analytics.revenue.transactionCount),
      note: 'Completed transactions',
      border: 'border-l border-gray-200 dark:border-slate-700',
    },
    {
      label: 'Attendance',
      value: `${analytics.attendance.rate.toFixed(1)}%`,
      note: 'Last 90 days',
      border: 'border-t border-gray-200 lg:border-l lg:border-t-0 dark:border-slate-700',
    },
    {
      label: 'High-risk students',
      value: numberFormatter.format(highRiskStudents),
      note: 'High and critical flags',
      border: 'border-l border-t border-gray-200 lg:border-t-0 dark:border-slate-700',
    },
  ];

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-800"
      aria-labelledby="dashboard-analytics-title"
    >
      <header className="flex min-h-14 items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-slate-700">
        <div>
          <h2 id="dashboard-analytics-title" className="text-sm font-semibold text-gray-900 dark:text-white">Analytics</h2>
          <p className="text-xs text-gray-600 dark:text-gray-300">School performance at a glance</p>
        </div>
        <Link
          to="/analytics"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary transition-opacity duration-150 hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none dark:focus-visible:ring-offset-slate-800"
        >
          View details
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4">
        {metrics.map(metric => (
          <div key={metric.label} className={`min-w-0 px-4 py-4 sm:px-5 ${metric.border}`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="truncate text-xl font-bold tracking-tight tabular-nums text-gray-900 sm:text-2xl dark:text-white">{metric.value}</p>
            </div>
            <p className="mt-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">{metric.label}</p>
            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{metric.note}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 px-2 pb-5 pt-4 sm:px-5 dark:border-slate-700">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2 sm:px-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Weekly collections</h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">Actual revenue compared with the rolling trend</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300" aria-label="Chart legend">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-primary" aria-hidden="true" />Collections</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-slate-400" aria-hidden="true" />3-week average</span>
          </div>
        </div>

        {trendData.length > 0 ? (
          <>
            <div className="h-64 w-full text-gray-500 sm:h-72 dark:text-gray-400" role="img" aria-label="Weekly collection revenue and three-week rolling average line chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
                  <defs>
                    <linearGradient id="dashboardCollectionsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary-color)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--primary-color)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="week"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    tickFormatter={formatWeek}
                    minTickGap={28}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    tickFormatter={value => numberFormatter.format(Number(value))}
                    width={48}
                  />
                  <Tooltip content={<AnalyticsTooltip />} cursor={{ stroke: 'var(--border-color)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Collections"
                    stroke="var(--primary-color)"
                    strokeWidth={2.5}
                    fill="url(#dashboardCollectionsFill)"
                    activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--primary-color)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="average"
                    name="3-week average"
                    stroke="var(--secondary-color)"
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <details className="group mx-2 mt-2 rounded-lg sm:mx-0">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none dark:text-gray-300 dark:hover:bg-slate-700 dark:hover:text-white">
                View chart data
                <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="mt-1 overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="bg-gray-50 text-gray-700 dark:bg-slate-700 dark:text-gray-200">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Week</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Collections</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">3-week average</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-gray-700 dark:divide-slate-700 dark:text-gray-200">
                    {trendData.map(point => (
                      <tr key={point.week}>
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
          <div className="grid h-64 place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center dark:border-slate-600 dark:bg-slate-900/30">
            <div>
              <BarChart3 className="mx-auto size-7 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-100">No collection trend yet</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Completed payments will appear here.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default DashboardAnalytics;
